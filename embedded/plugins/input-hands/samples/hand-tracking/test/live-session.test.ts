import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveSession, type Dependencies, type Estimator } from '../src/live/session.ts';
import { DEFAULT_SETTINGS, type ProcessedFrame, type LiveFrame } from '../src/live/contracts.ts';
import { Track, stream, video, bitmap, deferred, inference, flush } from './live-helpers.ts';
function harness() {
  const view=video(),track=new Track(), pending=deferred<ProcessedFrame>();
  let now=1000,id=0,estimates=0,disposals=0;const scheduled=new Map<number,FrameRequestCallback>();
  const received:LiveFrame[]=[],errors:string[]=[];
  const estimator:Estimator={initialize:async()=>({delegate:'CPU',fallback:null}),estimate:async image=>{estimates++;image.close();return pending.promise;},dispose:async()=>{disposals++;}};
  const dependencies:Dependencies={media:{getUserMedia:async()=>stream(track),enumerateDevices:async()=>[]},estimator:()=>estimator,bitmap:async()=>bitmap().value,
    request:callback=>{scheduled.set(++id,callback);return id;},cancel:handle=>{scheduled.delete(handle);},now:()=>now};
  const session=new LiveSession(view,{status(){},frame:frame=>received.push(frame),clear(){},event(){},camera(){},error:message=>errors.push(message)},dependencies);
  const step=(mediaTime:number,clock=now+20)=>{now=clock;view.currentTime=mediaTime;const [handle,callback]=scheduled.entries().next().value!;scheduled.delete(handle);callback(now);};
  return{session,track,view,pending,dependencies,received,errors,scheduled,step,get estimates(){return estimates;},get disposals(){return disposals;}};
}
test('live scheduling has one in-flight frame and counts skipped arrivals without queueing',async()=>{
  const h=harness();await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});
  h.step(0.1);await flush();assert.equal(h.estimates,1);
  h.step(0.2);h.step(0.3);assert.equal(h.estimates,1);assert.equal(h.session.snapshot().skipped,2);
  const output=bitmap();h.pending.resolve({...inference(),bitmap:output.value});await flush();
  assert.equal(h.received.length,1);assert.equal(h.received[0].sourceId,'camera');assert.equal(h.received[0].providerId,'mediapipe-hand-landmarker');assert.equal(h.received[0].timing.mediaTimeMs,100);assert.equal(output.state.closes,1);
  await h.session.stop();assert.equal(h.track.stops,1);assert.equal(h.disposals,1);assert.equal(h.scheduled.size,0);
});
test('a completed inference after Stop cannot repopulate the view and its returned bitmap is closed',async()=>{
  const h=harness();await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});h.step(0.1);await flush();
  await h.session.stop();const late=bitmap();h.pending.resolve({...inference(),bitmap:late.value});await flush();
  assert.equal(h.received.length,0);assert.equal(late.state.closes,1);assert.equal(h.session.snapshot().activeTracks,0);
});
test('a bitmap created after Stop is closed without transfer to an estimator',async()=>{
  const h=harness(),pending=deferred<ImageBitmap>();h.dependencies.bitmap=()=>pending.promise;
  await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});h.step(0.1);await h.session.stop();
  const late=bitmap();pending.resolve(late.value);await flush();assert.equal(h.estimates,0);assert.equal(late.state.closes,1);
});
test('inference failure stops capture, removes scheduling and reports an explicit error',async()=>{
  const h=harness();await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});h.step(0.1);await flush();
  h.pending.reject(new Error('WASM failure'));await flush();assert.equal(h.track.stops,1);assert.equal(h.scheduled.size,0);assert.equal(h.session.snapshot().state,'error');assert.match(h.errors[0],/WASM failure/);
});
test('camera denial closes an initialized estimator without attempting a fallback source',async()=>{
  const h=harness();let requests=0;h.dependencies.media.getUserMedia=async()=>{requests++;throw new DOMException('Denied','NotAllowedError');};
  await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});assert.equal(h.disposals,1);assert.equal(requests,1);assert.match(h.errors[0],/permission denied/i);
});
test('a stalled video stream is stopped instead of retaining an old pose indefinitely',async()=>{
  const h=harness();await h.session.start('explicit','http://localhost/','model',{...DEFAULT_SETTINGS});h.step(0.1);await flush();
  h.step(0.1,5000);assert.equal(h.track.stops,1);assert.equal(h.session.snapshot().state,'error');assert.match(h.errors[0],/stalled/);
  h.pending.resolve({...inference(),bitmap:bitmap().value});await flush();
});

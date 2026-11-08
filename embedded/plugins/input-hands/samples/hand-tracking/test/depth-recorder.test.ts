import test from 'node:test';import assert from 'node:assert/strict';
import { DepthRecorder, type DepthRecorderDependencies } from '../src/live/recording/depth-recorder.ts';
import { compressPacket, decodeDepthFrame, type DepthClip } from '../src/live/recording/depth-format.ts';
import { depthInput, depthMetadata, waitIdle } from './depth-recording-helpers.ts';import { plane } from './reconstruction-helpers.ts';import { deferred } from './live-helpers.ts';
function setup(encode:DepthRecorderDependencies['encode']=compressPacket){
 const s={now:100,encodes:0,ready:[] as (DepthClip|null)[],deadline:null as (()=>void)|null};
 const recorder=new DepthRecorder(c=>s.ready.push(c),{now:()=>s.now,utc:()=>new Date(1793404800000+s.now).toISOString(),id:()=> 'unit-depth',encode:blob=>{s.encodes++;return encode(blob);},
 timer:fn=>{s.deadline=fn;return 0 as unknown as ReturnType<typeof setTimeout>;},clearTimer:()=>{s.deadline=null;}});return {s,recorder};
}
test('RGB-D Record is opt-in; sequence admission rejects rounded-clock pre-Record frames; busy inputs never queue',async()=>{
 const encoded=deferred<Blob>(),{s,recorder}=setup(()=>encoded.promise),p=plane(2),input=depthInput(2);
 recorder.capture(p,input);assert.equal(s.encodes,0);s.now=input.receivedPageMs;recorder.start(depthMetadata(),2);
 recorder.capture(p,input);assert.equal(s.encodes,0);assert.equal(recorder.snapshot().drops.beforeStart,1);
 const next=plane(3),inNext=depthInput(3);recorder.capture(next,inNext);recorder.capture(plane(4),depthInput(4));assert.equal(s.encodes,1);
 s.now=300;const finishing=recorder.stop();assert.equal(recorder.snapshot().state,'finishing');recorder.capture(plane(5),depthInput(5));
 encoded.resolve(await compressPacket(new Blob([next.buffer])));const clip=await finishing;assert.equal(clip?.frames.length,1);assert.equal(clip?.manifest.drops.encoderBusy,1);assert.equal(clip?.frames[0].meta.relativeMs,0);
});
test('snapshot copies packet bytes and metadata before borrowed buffers are detached or edited',async()=>{
 const {s,recorder}=setup(),p=plane(1),input=depthInput(1),expected=p.buffer.slice(0);recorder.start(depthMetadata(),0);recorder.capture(p,input);
 new Uint8Array(p.buffer).fill(0);input.sampling.radius=3;await waitIdle(recorder);s.now=300;const c=await recorder.stop();assert.ok(c);
 assert.deepEqual((await decodeDepthFrame(c.frames[0])).buffer,expected);assert.equal(c.frames[0].meta.sampling.radius,2);assert.ok(Object.isFrozen(c.frames[0].meta.sampling));
});
test('stop/clear during RGB-D encode fences late adoption and does not permit overlapping encoders',async()=>{
 const pending=deferred<Blob>(),{s,recorder}=setup(()=>pending.promise),p=plane(1);recorder.start(depthMetadata(),0);recorder.capture(p,depthInput());const finishing=recorder.stop();recorder.clear();
 assert.throws(()=>recorder.start(depthMetadata(),0),/previous clip/);pending.resolve(await compressPacket(new Blob([p.buffer])));await finishing;await waitIdle(recorder);assert.deepEqual(s.ready,[]);
 recorder.start(depthMetadata(),0);await recorder.stop();recorder.clear();
});
test('deadline and encoding errors finalize explicitly, including a zero-frame clip',async()=>{
 const {s,recorder}=setup();recorder.start(depthMetadata(),0);s.now=20100;s.deadline!();await waitIdle(recorder);await new Promise(r=>setTimeout(r,1));assert.equal(recorder.snapshot().state,'ready');assert.deepEqual(s.ready,[null]);
 const broken=setup(async()=>{throw new Error('compression fixture failure');});broken.recorder.start(depthMetadata(),0);broken.recorder.capture(plane(),depthInput());await waitIdle(broken.recorder);await new Promise(r=>setTimeout(r,1));assert.match(broken.recorder.snapshot().reason,/compression fixture failure/);assert.equal(broken.recorder.snapshot().drops.invalid,1);
});
test('invalid/mixed-source frames are counted while no-model inputs remain valid',async()=>{
 const {s,recorder}=setup();recorder.start(depthMetadata(false),0);recorder.capture(plane(),depthInput(1));assert.equal(recorder.snapshot().drops.invalid,1);
 recorder.capture(plane(2),depthInput(2,false));await waitIdle(recorder);s.now=300;const c=await recorder.stop();assert.equal(c?.frames.length,1);assert.equal(c?.frames[0].meta.observation,null);
});
test('RGB-D recorder enforces the 600-frame cap without queuing work',async()=>{
 const {s,recorder}=setup(async()=>new Blob(['bounded encoder stub']));recorder.start(depthMetadata(false),0);
 // Reuse the payload allocation; the producer's changing stamps are synchronously snapshotted.
 const p=plane();for(let i=1;i<=600;i++){p.meta.sequence=i;p.meta.nativeReceiveMs=1000+i;p.meta.nativeAlignedMs=1001+i;p.meta.nativeSendMs=1002+i;s.now=100+i;
 const input=depthInput(i,false);input.receivedPageMs=s.now;input.completedPageMs=s.now+1;recorder.capture(p,input);await waitIdle(recorder);}
 await new Promise(r=>setTimeout(r,1));assert.equal(recorder.snapshot().state,'ready');assert.equal(s.ready[0]?.frames.length,600);assert.match(recorder.snapshot().reason,/600-frame/);
});
test('render telemetry records only the first actual presentation of admitted packets, before or after compression',async()=>{
 const {s,recorder}=setup();recorder.presented(1,200);recorder.start(depthMetadata(),0);recorder.capture(plane(1),depthInput(1));recorder.presented(1,200);recorder.presented(1,300);await waitIdle(recorder);
 recorder.capture(plane(2),depthInput(2));await waitIdle(recorder);recorder.presented(2,250);recorder.presented(999,260);s.now=400;const c=await recorder.stop();assert.ok(c);
 assert.equal(c.frames[0].meta.presentedPageMs,200);assert.equal(c.frames[1].meta.presentedPageMs,250);recorder.presented(2,350);assert.equal(c.frames[1].meta.presentedPageMs,250);
});
test('RGB-D byte cap reserves the entire bounded manifest before accepting compressed frames',async()=>{
 const data=new Blob([new Uint8Array(4*1024*1024)]),{s,recorder}=setup(async()=>data);recorder.start(depthMetadata(false),0);
 for(let i=1;i<=35&&recorder.snapshot().state==='recording';i++){s.now=100+i*33;recorder.capture(plane(i),depthInput(i,false));await waitIdle(recorder);}
 await new Promise(r=>setTimeout(r,1));assert.match(recorder.snapshot().reason,/128 MiB/);assert.equal(recorder.snapshot().drops.limit,1);assert.ok(recorder.snapshot().bytes<128*1024*1024-128*1024);
});

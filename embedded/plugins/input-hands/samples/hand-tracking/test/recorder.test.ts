import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, type RecorderDependencies } from '../src/live/recording/recorder.ts';
import { LIMITS, type Clip } from '../src/live/recording/format.ts';
import { metadata, observation, image, png, settle } from './recording-helpers.ts';
import { deferred } from './live-helpers.ts';
function setup(encode: RecorderDependencies['encode'] = async () => png()) {
  const state = { now:100, encodes:0, ready:[] as (Clip|null)[], deadline:null as (()=>void)|null, clears:0, busy:5 };
  const recorder = new Recorder({ now:()=>state.now, utc:()=>new Date(1793404800000+state.now).toISOString(), id:()=> 'unit-recording',
    encode: bitmap=>{state.encodes++;return encode(bitmap);}, timer:fn=>{state.deadline=fn;return 1 as unknown as ReturnType<typeof setTimeout>;},
    clearTimer:()=>{state.clears++;state.deadline=null;}, sourceBusy:()=>state.busy },clip=>state.ready.push(clip));
  return {state,recorder};
}
async function idle(recorder: Recorder) { for(let i=0;i<100 && recorder.snapshot().inFlight;i++) await settle(); assert.equal(recorder.snapshot().inFlight,0); }
test('recording is off by default; pre-consent and encoder-busy frames are counted, not queued', async () => {
  const encoded = deferred<Blob>(), {state,recorder} = setup(()=>encoded.promise), bitmap = image();
  recorder.capture(observation(),bitmap,5); assert.equal(state.encodes,0);
  recorder.start(metadata(),5);
  recorder.capture(observation(99),bitmap,5); assert.equal(state.encodes,0);
  recorder.capture(observation(100),bitmap,6); assert.equal(state.encodes,1,'snapshot is invoked synchronously on borrowed bitmap');
  recorder.capture(observation(101),bitmap,8); assert.equal(state.encodes,1);
  state.now=110; const stopped=recorder.stop('User stopped',9); assert.equal(recorder.snapshot().state,'finishing');
  recorder.capture(observation(109),bitmap,10); encoded.resolve(png());
  const clip = await stopped; assert.ok(clip); assert.equal(clip.frames.length,1);
  assert.deepEqual(clip.manifest.drops,{sourceBusy:4,encoderBusy:1,beforeStart:1,invalid:0,limit:0});
  assert.equal(clip.manifest.backend.delegate,'CPU'); assert.equal(clip.manifest.settings.delegate,'GPU'); assert.equal(state.clears,1);
});
test('in-flight admission fence excludes pre-consent jobs even when clocks round to the same value', async () => {
  const {state,recorder}=setup();recorder.start(metadata(),5,true);
  recorder.capture(observation(100),image(),5);assert.equal(state.encodes,0);assert.equal(recorder.snapshot().drops.beforeStart,1);
  recorder.capture(observation(101),image(),5);state.now=110;const clip=await recorder.stop();assert.equal(clip?.frames.length,1);assert.equal(clip?.frames[0].meta.observation.timing.frameReadyPageMs,101);
});
test('raw invalid frames are dropped explicitly; no-hand frames are retained', async () => {
  const {state,recorder}=setup();recorder.start(metadata(),5);
  const invalid=structuredClone(observation()); invalid.raw.landmarks[0][0].x=NaN;
  recorder.capture(invalid,image(),5); recorder.capture({...observation(),sourceId:'changed'},image(),5);
  recorder.capture(observation(105,true),image(),5); state.now=110;
  const clip=await recorder.stop(); assert.ok(clip); assert.equal(clip.frames[0].meta.observation.hands.length,0); assert.equal(clip.manifest.drops.invalid,2);
});
test('deadline finalizes even without arriving frames and samples current source busy counter', async () => {
  const {state,recorder}=setup();recorder.start(metadata(),5);state.now+=20_000;state.busy=12;state.deadline!();await idle(recorder);await settle();
  assert.equal(recorder.snapshot().state,'ready'); assert.equal(recorder.snapshot().drops.sourceBusy,7);assert.deepEqual(state.ready,[null]);assert.equal(state.clears,1);
});
test('clear during encode suppresses late publication and bounds restart to one encoder', async () => {
  const encoded=deferred<Blob>(),{state,recorder}=setup(()=>encoded.promise);recorder.start(metadata(),5);recorder.capture(observation(),image(),5);
  const finishing=recorder.stop();recorder.clear();assert.throws(()=>recorder.start(metadata(),5),/previous recording/);
  encoded.resolve(png());await finishing;await idle(recorder);assert.equal(state.ready.length,0);assert.equal(recorder.snapshot().frames,0);
  recorder.start(metadata(),5);await recorder.stop();recorder.clear();
});
test('encoding failure finalizes partial data with an explicit reason', async () => {
  const {recorder,state}=setup(async()=>{throw new Error('fixture encoder failure');});recorder.start(metadata(),5);recorder.capture(observation(),image(),5);
  await idle(recorder);await settle();assert.equal(recorder.snapshot().state,'ready');assert.match(recorder.snapshot().reason,/fixture encoder failure/);assert.equal(recorder.snapshot().drops.invalid,1);assert.deepEqual(state.ready,[null]);
});
test('600-frame hard cap finalizes with no unbounded encoder queue', async () => {
  const {state,recorder}=setup();recorder.start(metadata(),5);
  for(let i=0;i<LIMITS.frames;i++){state.now=100+i;recorder.capture(observation(state.now),image(),5);await idle(recorder);}
  await settle();assert.equal(recorder.snapshot().state,'ready');assert.equal(state.ready[0]?.frames.length,LIMITS.frames);assert.match(recorder.snapshot().reason,/600-frame/);
  recorder.capture(observation(800),image(),5);assert.equal(state.encodes,LIMITS.frames);
});
test('size cap reserves manifest space and finalizes instead of exceeding the memory budget', async () => {
  // Deliberately padded encoder stub: test byte budgeting, not PNG decoding (covered in real Chrome).
  const full = new Blob([png(),new Uint8Array(LIMITS.imageBytes-png().size)]),{state,recorder}=setup(async()=>full);recorder.start(metadata(),5);
  for(let i=0;i<40 && recorder.snapshot().state==='recording';i++){state.now=100+i;recorder.capture(observation(state.now),image(),5);await idle(recorder);}
  await settle();assert.equal(recorder.snapshot().state,'ready');assert.ok(recorder.snapshot().bytes<LIMITS.bytes-LIMITS.jsonBytes);assert.match(recorder.snapshot().reason,/128 MiB/);assert.equal(recorder.snapshot().drops.limit,1);
});

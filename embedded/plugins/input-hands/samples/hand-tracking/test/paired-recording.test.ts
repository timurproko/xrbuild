import test from 'node:test';
import assert from 'node:assert/strict';
import { PairRecorder, exportPair, importPair, pairContentHash } from '../src/live/multiview/recording.ts';
import { depthMetadata, depthInput } from './depth-recording-helpers.ts';
import { plane } from './reconstruction-helpers.ts';
import { inputFixture } from './calibration-helpers.ts';
import { compressPacket } from '../src/live/recording/depth-format.ts';
import { header, json, LIMITS } from '../src/live/recording/format.ts';
import { LEGACY_PAIRED_FORMAT } from '../src/live/legacy.ts';
const pause = () => new Promise(resolve => setTimeout(resolve, 1));
async function idle(recorder: PairRecorder) { for (let i = 0; i < 2000 && recorder.snapshot().inFlight; i++) await pause(); assert.equal(recorder.snapshot().inFlight, 0); }
function setup(infer = true, encode = compressPacket) {
  const clock = { now: 100 }, spatial = inputFixture({ rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1], translationMeters: { x: 0, y: 0, z: 0 } });
  const meta = (side: 'a' | 'b') => ({ ...depthMetadata(infer), calibration: spatial.sources[side], source: { kind: 'native-rgbd' as const, id: `rgbd:${spatial.sources[side].serial}:run-${side}`, label: 'Pair codec sample' } });
  const recorder = new PairRecorder(() => {}, { now: () => clock.now, utc: () => new Date(1793404800000 + clock.now).toISOString(), id: () => 'pair-codec', encode, timer: () => 0 as any, clearTimer: () => {} });
  const capture = (side: 'a' | 'b', sequence: number) => { const input = depthInput(sequence, infer); if (input.observation) (input.observation as any).sourceId = meta(side).source.id; clock.now = input.receivedPageMs; recorder.capture(side, plane(sequence, 1000, { meta: { runId: `run-${side}` } }), input); };
  return { recorder, meta, capture, clock };
}
async function pair() { const f = setup(); f.recorder.start(f.meta('a'), f.meta('b'), { a: 1, b: 1 }); f.capture('a', 1); f.capture('b', 1); for (let i = 2; i <= 10; i++) { f.capture('a', i); f.capture('b', i); await idle(f.recorder); } f.clock.now = 500; const clip = await f.recorder.stop(); assert.ok(clip); return { ...f, clip }; }
test('paired format round trips both original streams and retains admission/provenance fences', async () => {
  const { clip, recorder } = await pair(), copy = await importPair(exportPair(clip));
  assert.equal(clip.a.frames.length, 9); assert.equal(clip.b.frames.length, 9); assert.equal(recorder.snapshot().a.drops.beforeStart, 1);
  assert.equal(await pairContentHash(copy), await pairContentHash(clip)); assert.equal(copy.b.frames[2].meta.packetSha256, clip.b.frames[2].meta.packetSha256); assert.equal(copy.manifest.exposureSyncVerified, false); assert.ok(Object.isFrozen(copy.a.frames[0].meta));
});
test('legacy paired identity remains readable without a fusion or benchmark engine', async () => {
  const { clip } = await pair(), file = exportPair(clip), prefix = await file.slice(0, 12).arrayBuffer(), size = new DataView(prefix).getUint32(8, true), meta = JSON.parse(await file.slice(12, 12 + size).text());
  meta.format = LEGACY_PAIRED_FORMAT; const encoded = json(meta), copy = await importPair(new Blob(['XRBPAIR1', header(encoded.size), encoded, file.slice(12 + size)])); assert.equal(copy.manifest.format, 'xrbuild-paired-hand-tracking');
});
test('paired containers reject corrupt declarations, duplicate serials, clocks, counts and cancellation', async () => {
  const { clip } = await pair(), file = exportPair(clip); await assert.rejects(importPair(new Blob([file, 'x'])), /trailing/); assert.throws(() => exportPair({ ...clip, b: clip.a }), /distinct/);
  assert.throws(() => exportPair({ ...clip, b: { ...clip.b, manifest: { ...clip.b.manifest, pageTimeOriginMs: 1 } } }), /page-clock/);
  const prefix = await file.slice(0, 12).arrayBuffer(), size = new DataView(prefix).getUint32(8, true), meta = JSON.parse(await file.slice(12, 12 + size).text()); meta.frameCount = 1200; const encoded = json(meta);
  await assert.rejects(importPair(new Blob(['XRBPAIR1', header(encoded.size), encoded, file.slice(12 + size)])), /limits/); await assert.rejects(importPair(file, () => true), /cancelled/);
});
test('paired encoder ownership is bounded to two, and late callbacks do not refill a cleared recorder', async () => {
  const resolvers: ((blob: Blob) => void)[] = [], f = setup(false, () => new Promise(resolve => resolvers.push(resolve)));
  f.recorder.start(f.meta('a'), f.meta('b'), { a: 0, b: 0 }); f.capture('a', 1); f.capture('b', 1); assert.equal(f.recorder.snapshot().inFlight, 2);
  f.capture('a', 2); f.capture('b', 2); assert.equal(f.recorder.snapshot().a.drops.encoderBusy, 1); assert.equal(f.recorder.snapshot().b.drops.encoderBusy, 1);
  f.recorder.clear(); assert.throws(() => f.recorder.start(f.meta('a'), f.meta('b'), { a: 0, b: 0 })); resolvers.forEach(resolve => resolve(new Blob(['codec-budget-stub']))); await idle(f.recorder); assert.equal(f.recorder.snapshot().frames, 0);
});
test('paired frame/duration caps are shared by the two original inputs', async () => {
  const f = setup(false, async () => new Blob(['codec-budget-stub'])); f.recorder.start(f.meta('a'), f.meta('b'), { a: 0, b: 0 });
  for (let i = 1; i <= 300; i++) { f.capture('a', i); f.capture('b', i); await idle(f.recorder); } await f.recorder.stop(); assert.equal(f.recorder.snapshot().frames, 600); assert.equal(f.recorder.snapshot().state, 'ready');
  const d = setup(false, async () => new Blob(['codec-budget-stub'])); d.recorder.start(d.meta('a'), d.meta('b'), { a: 0, b: 0 }); d.capture('a', 1); d.capture('b', 1); await idle(d.recorder); d.capture('a', 607); await d.recorder.stop(); assert.equal(d.recorder.snapshot().frames, 2); assert.match(d.recorder.snapshot().reason, /20-second/);
});
test('paired byte cap is not two independent 128 MiB allocations', async () => {
  const big = new Blob([new Uint8Array(4 * 1024 * 1024)]), f = setup(false, async () => big); f.recorder.start(f.meta('a'), f.meta('b'), { a: 0, b: 0 });
  for (let i = 1; i <= 20 && f.recorder.snapshot().state === 'recording'; i++) { f.capture('a', i); f.capture('b', i); await idle(f.recorder); }
  await f.recorder.stop(); assert.ok(f.recorder.snapshot().bytes <= LIMITS.bytes); assert.ok(f.recorder.snapshot().frames < 32); assert.equal(f.recorder.snapshot().state, 'ready');
});

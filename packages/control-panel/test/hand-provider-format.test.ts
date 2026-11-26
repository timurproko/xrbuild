import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderFormat } from '../ui/hands-provider-format.js';
import { createProviderRecording } from '../ui/hands-recorder.js';
import { createHandStream } from '../ui/hands-stream.js';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { HandInput } from '../../sdk/src/hands.ts';
import { HandFrameIngress } from '../../sdk/src/hand-source.ts';
import { decodeMessage } from '../../sdk/src/protocol.ts';
import { createRequire } from 'node:module';
const THREE = createRequire(new URL('../../sdk/package.json', import.meta.url))('three');
import { HandVisual } from '../../sdk/src/hand-visual.ts';
import { PanelFrame } from '../../sdk/src/stereo.ts';
import { toSceneHand } from '../../sdk/src/scene-hands.ts';
import { Interactor } from '../../sdk/src/interaction/core/interactor.ts';
import { GrabTarget } from '../../sdk/src/interaction/core/targets.ts';
function packet(sequence = 1, capture = 1000) {
  const data = new Uint8Array(488), v = new DataView(data.buffer); data[0] = data[1] = 2; v.setUint32(4, sequence, true); v.setFloat64(8, capture + 1, true); v.setFloat64(16, capture, true); v.setFloat32(24, 60, true); data[28] = 1; data[29] = 7;
  v.setInt32(32, 7, true); data[36] = 1; data[37] = data[38] = 1;
  for (let k = 0; k < 21; k++) { const b = 44 + k * 16; v.setFloat32(b, .1 + k * .001, true); v.setFloat32(b + 4, .05, true); v.setFloat32(b + 8, .15, true); v.setFloat32(b + 12, .9, true); }
  return data;
}
const format = createProviderFormat({ decode: decodeMessage, normalize: handProfile });
function recording() {
  const raw = packet(); return { kind: 'xrbuild-hand-session', version: 1, source: { owner: 'core', id: 'simulated', version: '1' }, sessionId: '12345678-1234-1234-1234-123456789abc', epoch: 'a'.repeat(64), profile: handProfile({ offsetMm: { x: 10 }, sizeFactor: 1.2, appearance: { opacity: .6 } }), frameSpace: 'panel-metres', processing: 'provider-published', globalAdjustmentsApplied: false, clockDomain: 'windows-qpc-ms', axes: 'x-right,y-up,z-viewer', samples: [{ sequence: 1, captureTimeMs: 1000, publishTimeMs: 1001, packet: Buffer.from(raw).toString('base64') }] };
}
test('real raw recorder preserves bytes/native capabilities and freezes recording-start profile, no renderer data', () => {
  const source = recording(); const listeners = new Set<any>(), life = new Set<any>(); let completed: any;
  const producer = { recordingSource: () => source, subscribeRawFrames(fn: any) { listeners.add(fn); return () => listeners.delete(fn); }, subscribeLifecycle(fn: any) { life.add(fn); return () => life.delete(fn); } };
  const capture = createProviderRecording({ producer, format, onComplete: (d: any) => completed = d }); capture.start();
  source.profile.offsetMm.x = 70;
  const raw = packet(); for (const fn of listeners) fn({ epoch: source.epoch, sequence: 1, captureTimeMs: 1000, publishTimeMs: 1001, packet: raw });
  for (const fn of life) fn({ epoch: source.epoch, phase: 'stopped' });
  assert.equal(capture.active, false); assert.equal(completed.profile.offsetMm.x, 10); assert.deepEqual(Buffer.from(completed.samples[0].packet, 'base64'), Buffer.from(raw));
  const parsed = decodeMessage(raw.buffer) as any; assert.equal(parsed.capabilities.pinch, true); assert.equal(parsed.hands[0].grabbing, true); assert.equal(parsed.hands[0].pinch[0], true);
  capture.dispose(); assert.equal(listeners.size + life.size, 0);
});
for (const owner of ['bundled:input-hands', 'workspace:input-hands']) test(`${owner} capture completes, exports and replays with original provenance and raw packet`, async () => {
  const source = recording(); source.source = { owner, id: 'hand-tracking', version: '1' };
  let frames: any, lifecycle: any, completed: any, reason = '', callback: any, began: any, applied: any;
  const samples: any[] = [];
  const capture = createProviderRecording({ format, producer: { recordingSource: () => source,
    subscribeRawFrames(fn: any) { frames = fn; return () => {}; }, subscribeLifecycle(fn: any) { lifecycle = fn; return () => {}; } },
    onComplete(doc: any, why: string) { completed = doc; reason = why; } });
  try {
    capture.start(); frames({ epoch: source.epoch, sequence: 1, captureTimeMs: 1000, publishTimeMs: 1001, packet: packet() });
    lifecycle({ epoch: source.epoch, phase: 'retired' });
    assert.ok(completed, reason); assert.equal(capture.active, false);
    const exported = JSON.parse(JSON.stringify(completed)); format.validate(exported);
    assert.deepEqual(exported.source, source.source); assert.deepEqual(Buffer.from(exported.samples[0].packet, 'base64'), Buffer.from(packet()));
    const stop = await format.replay(exported, { now: () => 0, requestFrame: (fn: any) => { callback = fn; return 1; }, cancelFrame: () => {}, view: {
      active: false, async setProfile(p: any) { applied = p; return true; }, beginSession(value: any) { began = value; return true; }, pushFrame(value: any) { samples.push(value); return true; }, clearSession() {},
    } });
    callback(); assert.equal(samples.length, 1); assert.notEqual(began.epoch, source.epoch); assert.equal(began.mode, 'replay');
    assert.deepEqual(applied, source.profile); assert.deepEqual(samples[0].frame, decodeMessage(packet().buffer));
    stop(); await stop.done;
  } finally { capture.dispose(); }
});

test('format rejects wrong space, baked processing, credentials/paths, corrupt/native samples and bounded count/time/size', () => {
  assert.ok(format.validate(recording()));
  const mutations = [ (d: any) => d.globalAdjustmentsApplied = true, (d: any) => d.frameSpace = 'camera', (d: any) => d.token = 'secret', (d: any) => d.source.path = 'private-path', (d: any) => d.source.owner = 'embedded:input-hands', (d: any) => d.source.owner = 'bundled:../escape', (d: any) => d.profile.appearance.token = 'secret', (d: any) => d.samples[0].captureTimeMs = 1001, (d: any) => d.samples[0].packet = 'bad', (d: any) => d.samples.push(d.samples[0]), (d: any) => d.samples = Array(10001).fill(d.samples[0]), (d: any) => { const p = packet(2, 121001); d.samples.push({ sequence: 2, captureTimeMs: 121001, publishTimeMs: 121002, packet: Buffer.from(p).toString('base64') }); }, (d: any) => d.source.version = 'x'.repeat(16 * 1024 * 1024) ];
  for (const mutate of mutations) { const d = recording(); mutate(d); assert.throws(() => format.validate(d)); }
});
test('recorded nonidentity profile, not current live profile, is applied once through actual app-default SDK ingress', async () => {
  let now = 50, callback: any, cleared = 0;
  const input = new HandInput(), ingress = new HandFrameIngress(input, 'native'); ingress.profile = handProfile({ offsetMm: { x: -100 }, sizeFactor: .5 });
  const stream = createHandStream({ ingress, now: () => now, clear: () => cleared++ });
  const doc = recording();
  const stop = await format.replay(doc, { now: () => now, requestFrame: (fn: any) => { callback = fn; return 1; }, cancelFrame: () => {}, view: {
    active: false, async setProfile(p: any) { ingress.profile = p; stream.setReady(true); return true; }, beginSession: (v: any) => stream.beginSession(v), pushFrame: (v: any) => stream.pushFrame(v), clearSession: () => stream.clearSession(),
  } });
  callback(); const hands = input.sample(now); assert.equal(hands.length, 1);
  assert.ok(Math.abs(hands[0].keypoints[0][0] - .11) < 1e-6, 'one +10 mm transform, not current -100 mm or twice +10 mm');
  assert.ok(Math.abs(hands[0].keypoints[8][0] - .1196) < 1e-6, 'wrist-relative size exactly once');
  assert.equal((decodeMessage(packet().buffer) as any).hands[0].keypoints[0][0] < .101, true, 'raw bytes unadjusted');
  const appInput = new HandInput(), appIngress = new HandFrameIngress(appInput, 'native'); appIngress.profile = handProfile(doc.profile); appIngress.push('native', decodeMessage(packet().buffer) as any, now);
  assert.deepEqual(hands, appInput.sample(now), 'same defaults, capabilities, filtered points and gestures as app ingress');
  const panel = new PanelFrame(); panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, new THREE.PerspectiveCamera());
  assert.deepEqual(hands.map(h => toSceneHand(h, panel)), appInput.sample(now).map(h => toSceneHand(h, panel)));
  const visuals = [new HandVisual(), new HandVisual()];
  visuals.forEach(v => { v.applyAppearance(doc.profile.appearance); v.update(hands, panel); });
  assert.deepEqual(visuals[0].style, visuals[1].style);
  assert.deepEqual(visuals[0].children.filter((o: any) => o.isInstancedMesh).map((o: any) => Array.from(o.instanceMatrix.array)), visuals[1].children.filter((o: any) => o.isInstancedMesh).map((o: any) => Array.from(o.instanceMatrix.array)));
  visuals.forEach(v => v.traverse((o: any) => { o.geometry?.dispose(); o.material?.dispose(); }));
  stop(); await stop.done; assert.equal(stream.active, false); assert.ok(cleared > 0); assert.equal(input.sample(now).length, 0);
});
test('explicit no hands bypasses SDK grace and releases a real SDK grab without a click or retired-frame resurrection', () => {
  let now = 100, released = 0;
  const input = new HandInput(), ingress = new HandFrameIngress(input, 'native'), interaction = new Interactor(), panel = new PanelFrame();
  panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, new THREE.PerspectiveCamera());
  const stream = createHandStream({ ingress, now: () => now, clear: () => interaction.update([], 1) }); stream.setReady(true); stream.beginSession({ epoch: 'live' });
  stream.pushFrame({ epoch: 'live', sequence: 1, frame: decodeMessage(packet().buffer), capturePageMs: now });
  const hands = input.sample(now).map(h => toSceneHand(h, panel)), object = new THREE.Object3D(); object.position.copy(hands[0].pinchPoint);
  const target = interaction.add(new GrabTarget(object)); target.on(e => { if (e.type === 'end') { assert.equal(e.reason, 'lost'); released++; } });
  interaction.update(hands, 1); assert.equal(target.state.held, true);
  const empty = new Uint8Array(32); empty.set(packet().subarray(0, 32)); empty[28] = 0; new DataView(empty.buffer).setUint32(4, 2, true);
  now += 16; stream.pushFrame({ epoch: 'live', sequence: 2, frame: decodeMessage(empty.buffer), capturePageMs: now });
  assert.equal(input.sample(now).length, 0); assert.equal(target.state.held, false); assert.equal(released, 1);
  stream.clearSession(); assert.equal(stream.pushFrame({ epoch: 'live', sequence: 3, frame: decodeMessage(packet().buffer), capturePageMs: now }), false); assert.equal(target.state.held, false);
});

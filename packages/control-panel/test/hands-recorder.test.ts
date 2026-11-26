import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderRecording, RECORDING_LIMITS } from '../ui/hands-recorder.js';
function producer() {
  let raw: (event: any) => void = () => {}, lifecycle: (event: any) => void = () => {}, live = true;
  const source = { kind: 'xrbuild-hand-session', version: 1, source: { owner: 'workspace:tracker', id: 'tracker', path: 'not portable' }, sessionId: 'session', epoch: 'one', profile: { version: 1, offsetMm: { x: 1, y: 0, z: 0 }, sizeFactor: 1, appearance: {} }, frameSpace: 'panel-metres', processing: 'provider-published', globalAdjustmentsApplied: false, clockDomain: 'windows-qpc-ms', axes: 'x-right,y-up,z-viewer', token: 'not portable' };
  return { source, get stopped() { return !live; }, recordingSource: () => live ? source : null,
    subscribeRawFrames(fn: typeof raw) { raw = fn; return () => { raw = () => {}; }; },
    subscribeLifecycle(fn: typeof lifecycle) { lifecycle = fn; return () => { lifecycle = () => {}; }; },
    emit(sequence: number, captureTimeMs = sequence) { raw({ epoch: 'one', sequence, captureTimeMs, publishTimeMs: captureTimeMs + 1, packet: new Uint8Array([2, 2, sequence % 256]) }); },
    stop() { live = false; lifecycle({ epoch: 'one', phase: 'stopped' }); },
  };
}
test('provider recording observes raw owned packets, freezes the profile and excludes nonportable metadata', () => {
  const p = producer(); let doc: any, reason = '';
  const capture = createProviderRecording({ producer: p, format: { validate(value: any) { assert.equal(value.kind, 'xrbuild-hand-session'); assert.ok(value.samples.length); } }, onComplete(value: any, why: string) { doc = value; reason = why; } });
  capture.start(); p.source.profile.offsetMm.x = 20; p.emit(1); p.emit(3); p.stop();
  assert.equal(capture.active, false); assert.equal(doc.profile.offsetMm.x, 1); assert.deepEqual(doc.samples.map((v: any) => v.sequence), [1, 3]);
  assert.equal(doc.token, undefined); assert.equal(doc.source.path, undefined); assert.equal(doc.samples[0].packet, 'AgIB'); assert.match(reason, /ended/);
  capture.dispose(); p.emit(4); assert.equal(doc.samples.length, 2);
});
test('recording bounds and validator failures stop visibly without throwing through a session observer', () => {
  const p = producer(); let reason = '', doc: any;
  const capture = createProviderRecording({ producer: p, format: { validate() {} }, onComplete(value: any, why: string) { doc = value; reason = why; } });
  capture.start(); p.emit(1, 0); p.emit(2, RECORDING_LIMITS.durationMs + 1); assert.equal(capture.active, false); assert.equal(doc.samples.length, 1); assert.match(reason, /limit/); capture.dispose();
  const invalid = createProviderRecording({ producer: p, format: { validate() { throw Error('bad packet'); } }, onComplete(value: any, why: string) { doc = value; reason = why; } });
  invalid.start(); p.emit(1); assert.doesNotThrow(() => p.stop()); assert.equal(doc, null); assert.match(reason, /rejected/); invalid.dispose();
});
test('Record cannot start without an actual compatible live producer', () => {
  const p = producer(); p.stop();
  const capture = createProviderRecording({ producer: p, format: { validate() {} } });
  assert.throws(() => capture.start(), /live hand session/); capture.dispose();
});

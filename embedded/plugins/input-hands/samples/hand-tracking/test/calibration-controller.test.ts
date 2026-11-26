import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraCalibration, CALIBRATION_STORAGE } from '../src/live/multiview/viewer.ts';
import { fitSpatialCalibration, exportSpatialCalibration, importSpatialCalibration } from '../src/live/multiview/calibration.ts';
import { inputFixture } from './calibration-helpers.ts';
const store = () => { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const choices = { a: { serial: 'camera-a', profile: '640x480@30' }, b: { serial: 'camera-b', profile: '640x480@30' } };
test('source-only calibration starts only on request, without a hand model or fusion engine', async () => {
  const calls: any[] = [], port = { async start(choice: any) { calls.push(choice); }, async stop() { calls.push('stop'); } };
  const calibration = new CameraCalibration({ a: port, b: port }, store()); assert.deepEqual(calls, []);
  await calibration.start(choices); assert.equal(calls.length, 2); assert.ok(calls.slice(0, 2).every(value => value.markers && value.handInference === false));
  assert.equal(calibration.snapshot().phase, 'running'); await calibration.stop(); assert.equal(calibration.snapshot().phase, 'idle');
  await assert.rejects(calibration.start({ ...choices, b: choices.a }), /different/);
});
test('Stop cancels an outstanding calibration start and waits before releasing ownership', async () => {
  let stops = 0; const complete: (() => void)[] = [];
  const port = { start: () => new Promise<void>(resolve => complete.push(resolve)), async stop() { stops++; complete.splice(0).forEach(resolve => resolve()); } };
  const calibration = new CameraCalibration({ a: port, b: port }, store()), starting = calibration.start(choices);
  await calibration.stop(); await starting; assert.equal(calibration.snapshot().phase, 'idle'); assert.ok(stops >= 2);
});
test('calibration retains exact validated output and existing preference key, without app-profile writes', async () => {
  const storage = store(), port = { async start() {}, async stop() {} }, calibration = new CameraCalibration({ a: port, b: port }, storage);
  const result = await fitSpatialCalibration(inputFixture()), file = exportSpatialCalibration(result);
  const imported = await calibration.import(file); assert.equal(imported.inputSha256, result.inputSha256); await calibration.save();
  assert.deepEqual([...storage.values.keys()], [CALIBRATION_STORAGE]);
  const saved = await calibration.saved(); assert.equal(saved[0].inputSha256, result.inputSha256); assert.equal(saved[0].temporalAlignment, null); assert.equal(saved[0].fusionEnabled, false);
  assert.equal((await importSpatialCalibration(calibration.export())).inputSha256, result.inputSha256);
  const invalid = '{invalid'; storage.values.set(CALIBRATION_STORAGE, invalid); await assert.rejects(calibration.saved()); assert.equal(storage.getItem(CALIBRATION_STORAGE), invalid);
});

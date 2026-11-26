import assert from 'node:assert/strict';
import test from 'node:test';
import { importCalibrationDocument } from '../src/live/multiview/calibration-document.ts';
import { fitSpatialCalibration, exportSpatialCalibration, assertCurrentSources } from '../src/live/multiview/calibration.ts';
import { CameraCalibration, CALIBRATION_STORAGE } from '../src/live/multiview/viewer.ts';
import { json } from '../src/live/recording/format.ts';
import { inputFixture } from './calibration-helpers.ts';
test('scalar and legacy setup envelopes return the same validated spatial result only', async () => {
  const input = inputFixture(); input.sources.a.depthToColor.rotationColumnMajor[1] = -0;
  const result = await fitSpatialCalibration(input), scalar = exportSpatialCalibration(result);
  assert.equal((await importCalibrationDocument(scalar)).inputSha256, result.inputSha256);
  const wrapper = { format: 'xrbuild-two-view-setup', version: 1, privateEvaluationOnly: true, exposureSyncVerified: false, spatial: result, timing: null, options: {} };
  const read = await importCalibrationDocument(json(wrapper)); assert.equal(read.inputSha256, result.inputSha256); assert.ok(Object.is(read.input.sources.a.depthToColor.rotationColumnMajor[1], -0)); assert.equal((read as any).options, undefined); assert.equal(read.temporalAlignment, null); assert.equal(read.fusionEnabled, false);
  await assert.rejects(importCalibrationDocument(json({ ...wrapper, exposureSyncVerified: true })), /envelope/);
  await assert.rejects(importCalibrationDocument(new Blob(['x'.repeat(131073)])), /size/);
  const changed = structuredClone(result); changed.bToA.translationMeters.x += .1;
  await assert.rejects(importCalibrationDocument(json({ ...wrapper, spatial: changed })), /integrity/);
});
test('documented source binding rejects serial, profile, scale and extrinsics changes', async () => {
  const input = inputFixture(), result = await fitSpatialCalibration(input);
  await assertCurrentSources(result, input.sources.a, input.sources.b);
  for (const mutate of [(a: any) => a.serial = 'another-camera', (a: any) => a.depthScaleMeters *= 2, (a: any) => a.depthToColor.translationMeters[0] += .01, (a: any) => { a.color.fps = 15; a.depth.fps = 15; }]) {
    const a = structuredClone(input.sources.a); mutate(a); await assert.rejects(assertCurrentSources(result, a, input.sources.b), /changed/);
  }
});
test('inventory remains bounded to eight validated scalar records and provisional results remain export-only', async () => {
  let text: string | null = null;
  const port = { async start() {}, async stop() {} }, controller = new CameraCalibration({ a: port, b: port }, { getItem: () => text, setItem(key, value) { assert.equal(key, CALIBRATION_STORAGE); text = value; } });
  const input = inputFixture(); input.evidence.referenceUncertaintyM = null;
  await controller.import(exportSpatialCalibration(await fitSpatialCalibration(input))); await assert.rejects(controller.save(), /provisional/); assert.equal(text, null); assert.ok(controller.export().size);
  for (let n = 0; n < 10; n++) { const next = inputFixture(); next.evidence.description += String(n); await controller.import(exportSpatialCalibration(await fitSpatialCalibration(next))); await controller.save(); }
  assert.equal((await controller.saved()).length, 8);
  text = JSON.stringify({ version: 1, values: Array(9).fill('{}') }); await assert.rejects(controller.saved(), /Invalid stored/);
});

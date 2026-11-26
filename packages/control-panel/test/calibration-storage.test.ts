import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { inputFixture } from '../../../embedded/plugins/input-hands/samples/hand-tracking/test/calibration-helpers.ts';
import { fitSpatialCalibration, exportSpatialCalibration } from '../../../embedded/plugins/input-hands/samples/hand-tracking/src/live/multiview/calibration.ts';
import { calibrationStorage } from '../../../embedded/plugins/input-hands/samples/hand-tracking/calibration-storage.mjs';
const key = 'handtracking.fusion-calibrations.v1';
const parent = process.env.XRB_TEST_ROOT ?? path.resolve(REPO, '.artifacts');
async function fixture(run: (base: string, root: string, file: string) => Promise<void>) {
  await fs.mkdir(parent, { recursive: true }); const root = await fs.mkdtemp(path.join(parent, 'calibration-storage-')), port = await freePort();
  const file = path.join(root, 'config/plugins/input-hands/preferences.json'); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ version: 1, owner: 'input-hands', values: { 'handtracking.capture-preferences.v1': '{"keep":"original"}', [key]: '{"version":1,"values":[]}' } }));
  const app = createServer({ repo: REPO, workspace: root, port }); await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${port}`, root, file); } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
}
const inventory = async () => JSON.stringify({ version: 1, values: [await exportSpatialCalibration(await fitSpatialCalibration(inputFixture())).text()] });
const put = (base: string, revision: string, value: string, k = key) => fetch(base + '/api/calibration/preferences', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ revision, key: k, value }) });
test('qualified saves preserve the existing key, envelope and unrelated preferences; stale writes fail', async () => {
  await fixture(async (base, _root, file) => {
    const before = await fetch(base + '/api/calibration/preferences').then(r => r.json()), value = await inventory();
    assert.equal((await put(base, before.revision, value)).status, 200);
    const bytes = await fs.readFile(file, 'utf8'), saved = JSON.parse(bytes);
    assert.equal(saved.owner, 'input-hands'); assert.equal(saved.version, 1); assert.equal(saved.values[key], value); assert.equal(saved.values['handtracking.capture-preferences.v1'], '{"keep":"original"}');
    assert.equal((await put(base, before.revision, value)).status, 409); assert.equal(await fs.readFile(file, 'utf8'), bytes);
    assert.equal((await put(base, before.revision, '{}', 'handtracking.capture-preferences.v1')).status, 400); assert.equal(await fs.readFile(file, 'utf8'), bytes);
  });
});
test('corrupt, busy and shared-file preferences are preserved without reset or false success', async () => {
  for (const mode of ['corrupt', 'busy', 'shared']) await fixture(async (base, root, file) => {
    const before = await fetch(base + '/api/calibration/preferences').then(r => r.json()), value = await inventory();
    if (mode === 'corrupt') await fs.writeFile(file, '{not valid');
    if (mode === 'busy') await fs.writeFile(path.join(path.dirname(file), 'preferences.lock'), 'owned elsewhere');
    if (mode === 'shared') await fs.link(file, path.join(root, 'shared-preferences.json'));
    const bytes = await fs.readFile(file, 'utf8'), response = await put(base, before.revision, value);
    assert.equal(response.status, mode === 'busy' ? 409 : 400); assert.equal(await fs.readFile(file, 'utf8'), bytes);
    if (mode !== 'busy') assert.equal((await fetch(base + '/api/calibration/preferences')).status, 400);
  });
});
test('forged and provisional results cannot be saved as qualified', async () => {
  await fixture(async (base, _root, file) => {
    const before = await fetch(base + '/api/calibration/preferences').then(r => r.json()), bytes = await fs.readFile(file, 'utf8');
    const result = await fitSpatialCalibration(inputFixture()), forged = JSON.parse(await exportSpatialCalibration(result).text()); forged.bToA.translationMeters.x += .1;
    const provisionalInput = inputFixture(); provisionalInput.evidence.referenceUncertaintyM = null;
    const provisional = await exportSpatialCalibration(await fitSpatialCalibration(provisionalInput)).text();
    for (const scalar of [JSON.stringify(forged), provisional]) assert.equal((await put(base, before.revision, JSON.stringify({ version: 1, values: [scalar] }))).status, 400);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
  });
});
test('browser storage adapter only updates its snapshot after acknowledged persistence and needs explicit conflict reload', async () => {
  let revision = 'r1', text = 'old', fail = false, reads = 0;
  const storage = calibrationStorage(async (_url: string, options?: any) => {
    if (!options) { reads++; return { revision, values: { [key]: text } }; }
    const body = JSON.parse(options.body); if (fail || body.revision !== revision) throw new Error('Preferences changed; reload');
    text = body.value; revision = 'r2'; return { revision, values: { [key]: text } };
  });
  await storage.prepare(); storage.setItem(key, 'new'); assert.equal(storage.getItem(key), 'old'); await storage.flush(); assert.equal(storage.getItem(key), 'new');
  fail = true; storage.setItem(key, 'failed'); await assert.rejects(storage.flush(), /reload/); assert.equal(text, 'new'); assert.equal(storage.ready, false); assert.throws(() => storage.getItem(key), /reload/);
  fail = false; await storage.prepare(); assert.equal(reads, 2); assert.equal(storage.getItem(key), 'new');
});
test('conflicting optional calibration owners produce one unavailable reason', async () => {
  await fixture(async (base, root) => {
    const dir = path.join(root, 'plugins/calibrator'); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Calibrator', type: 'input', version: '0.1.0', exports: { 'camera-calibration': './tools.mjs' } }));
    await fs.writeFile(path.join(dir, 'tools.mjs'), 'export const unused=true;');
    const status = await fetch(base + '/api/calibration').then(r => r.json()); assert.equal(status.available, false); assert.match(status.reason, /conflict/);
  });
});

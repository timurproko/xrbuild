import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { recordingStorePlugin } from '../recording-store.mjs';
import { statePaths, userPath } from '../state-paths.mjs';
import { prepareAssets, runtimeAssets, visionAssetsPlugin } from '../prepare-assets.mjs';
import { runtimePaths, stageRuntime, verifyRuntime } from '../bridge/runtime.mjs';
import { createHandsTools } from '../hands-tools.mjs';
const API = '/api/hands/tools';
async function fixture(t: any) {
  const parent = process.env.XRB_TEST_ROOT || path.join(process.env.XRB_CORE!, '.artifacts/hand-tests'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'ownership-')), options = { core: path.join(root, 'core'), workspace: path.join(root, 'user') };
  await fs.mkdir(options.core); await fs.mkdir(options.workspace); t.after(() => fs.rm(root, { recursive: true, force: true })); return { root, options };
}
async function serve(t: any, plugins: any[]) {
  const handlers: any[] = [], server = http.createServer((req, res) => { let index = 0; const next = () => { const handler = handlers[index++]; if (handler) void handler(req, res, next); else res.writeHead(404).end(); }; next(); });
  for (const plugin of plugins) plugin.configureServer({ httpServer: server, middlewares: { use: (handler: any) => handlers.push(handler) } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  return { origin, request: (route: string, method = 'GET', body?: any, other: any = {}) => fetch(origin + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...other }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}
test('read-only recording/calibration listing creates no files and rejects product-state destinations', async t => {
  const { options } = await fixture(t), app = await serve(t, [recordingStorePlugin(options)]);
  assert.deepEqual(await (await app.request(API + '/recordings')).json(), { recordings: [] }); assert.deepEqual((await (await app.request(API + '/preferences')).json()).values, {});
  assert.deepEqual(await fs.readdir(options.workspace), []); assert.deepEqual(await fs.readdir(options.core), []);
  assert.equal(statePaths(options).configRoot, path.join(options.workspace, 'config/plugins/input-hands')); assert.equal(statePaths(options).stateRoot, path.join(options.workspace, '.xrb/hand-tracking'));
  assert.throws(() => statePaths({ core: options.core, workspace: path.join(options.core, 'embedded/subdir') }), /outside product/); assert.throws(() => userPath(options, 'configRoot', '../outside'), /Invalid/);
});
test('recording and revision-locked scalar preferences retain ownership and cross-origin protection', async t => {
  const { options } = await fixture(t), app = await serve(t, [recordingStorePlugin(options)]), createdUtc = '2025-01-01T00:00:00.000Z';
  const csv = '# xrbuild-hand-tracking-csv v1\n# ' + JSON.stringify({ createdUtc, frames: 1, durationMs: 0 }) + '\ncodec-sample\n';
  const response = await app.request(API + '/recordings', 'POST', { csv, createdUtc }); assert.equal(response.status, 201); const saved = await response.json();
  assert.equal(await (await app.request(API + '/recordings/' + saved.id)).text(), csv); assert.equal(await fs.readFile(path.join(statePaths(options).stateRoot, 'recordings', saved.id + '.csv'), 'utf8'), csv);
  assert.equal((await app.request(API + '/recordings', 'POST', { csv, createdUtc }, { Origin: 'https://foreign.example' })).status, 403);
  const initial = await (await app.request(API + '/preferences')).json(), body = { revision: initial.revision, key: 'handtracking.fusion-calibrations.v1', value: JSON.stringify({ version: 1, values: [] }) };
  assert.equal((await app.request(API + '/preferences', 'PUT', body)).status, 200); const original = await fs.readFile(userPath(options, 'configRoot', 'preferences.json'));
  assert.equal((await app.request(API + '/preferences', 'PUT', body)).status, 409); assert.deepEqual(await fs.readFile(userPath(options, 'configRoot', 'preferences.json')), original); assert.deepEqual(await fs.readdir(options.core), []);
  assert.equal((await app.request(API + '/recordings/' + saved.id, 'DELETE')).status, 200); assert.equal((await app.request(API + '/recordings/' + saved.id)).status, 404);
});
test('invalid busy and linked calibration preferences are preserved, never reset or followed', async t => {
  const { root, options } = await fixture(t), app = await serve(t, [recordingStorePlugin(options)]), file = userPath(options, 'configRoot', 'preferences.json', true);
  await fs.writeFile(file, 'invalid'); assert.equal((await app.request(API + '/preferences')).status, 400); assert.equal(await fs.readFile(file, 'utf8'), 'invalid');
  await fs.writeFile(file, JSON.stringify({ version: 1, owner: 'input-hands', values: {} })); const before = await (await app.request(API + '/preferences')).json();
  await fs.writeFile(userPath(options, 'configRoot', 'preferences.lock'), 'existing writer'); assert.equal((await app.request(API + '/preferences', 'PUT', { revision: before.revision, key: 'handtracking.tab.controls.v1', value: 'capture-tab' })).status, 409); await fs.unlink(userPath(options, 'configRoot', 'preferences.lock'));
  const folder = statePaths(options).configRoot, aside = path.join(root, 'preserved-config'), foreign = path.join(root, 'foreign'); await fs.rename(folder, aside); await fs.mkdir(foreign); await fs.writeFile(path.join(foreign, 'preferences.json'), 'foreign');
  await fs.symlink(foreign, folder, process.platform === 'win32' ? 'junction' : 'dir'); assert.equal((await app.request(API + '/preferences')).status, 400); assert.equal(await fs.readFile(path.join(foreign, 'preferences.json'), 'utf8'), 'foreign'); await fs.unlink(folder);
});
test('retained future-provider vision setup stays explicit, verifies runtime and never downloads a model', async t => {
  const { options } = await fixture(t), original = globalThis.fetch; globalThis.fetch = async () => { throw Error('Network setup is forbidden in this test'); };
  try {
    assert.equal(await runtimeAssets(options), null); const folder = await prepareAssets(options); assert.ok(folder.startsWith(path.join(options.core, 'third_party'))); assert.equal((await runtimeAssets(options))!.size, 3);
    assert.deepEqual(await fs.readdir(options.workspace), []); assert.equal(await prepareAssets(options), folder);
    const app = await serve(t, [visionAssetsPlugin(options)]); globalThis.fetch = original;
    assert.deepEqual(await (await app.request('/__handtracking/assets')).json(), { runtime: true, model: false, modelRedistributed: false }); assert.equal((await app.request('/vendor/vision/hand_landmarker.task')).status, 503);
    await fs.appendFile(path.join(folder, 'wasm/vision_wasm_module_internal.js'), 'corrupt'); await assert.rejects(prepareAssets(options), /checksum mismatch/);
  } finally { globalThis.fetch = original; }
});
test('recording contribution serves only format modules and cannot serve the old page or a capture boot', async t => {
  const { options } = await fixture(t), instance = await createHandsTools(options);
  const server = http.createServer((req, res) => { void instance.handle(req, res).then(handled => { if (!handled) res.writeHead(404).end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  assert.equal((await fetch(origin + '/hands/tools/browser.mjs')).status, 200); assert.equal((await fetch(origin + '/hands/tools/src/live/recording/archive.ts')).status, 200);
  for (const name of ['/hand-tracking/', '/hands-diagnostics/', '/hands/tools/src/main.ts', '/hands/tools/src/live/session.ts', '/hands/tools/calibration.html']) assert.equal((await fetch(origin + name)).status, 404);
  assert.deepEqual(await fs.readdir(options.workspace), []);
});
test('native calibration runtime staging verifies ownership and refuses tampering without execution', async t => {
  const { root, options } = await fixture(t), build = path.join(root, 'build'), marker = path.join(options.core, 'third_party/hand-tracking/markers/apriltag-3.4.5'), sdk = path.join(options.core, 'third_party/hand-tracking/sensor');
  await fs.mkdir(build); await fs.mkdir(marker, { recursive: true }); await fs.mkdir(sdk, { recursive: true }); await fs.writeFile(path.join(build, 'hand-tracking-rgbd.exe'), 'NONEXECUTABLE TEST DATA'); await fs.writeFile(path.join(marker, 'LICENSE.md'), 'test marker notice');
  const runtime = path.join(sdk, 'sensor.dll'), notice = path.join(sdk, 'LICENSE.txt'); await fs.writeFile(runtime, 'NONEXECUTABLE TEST DATA'); await fs.writeFile(notice, 'test sensor notice');
  const dependency = { sha256: 'a'.repeat(64), runtime, notices: [notice] }; await stageRuntime(build, options, dependency); await verifyRuntime(options);
  const installed = runtimePaths(options); assert.ok(installed.runtimeRoot.startsWith(options.workspace)); await assert.rejects(stageRuntime(build, options, dependency), /never replace/);
  await fs.appendFile(installed.executable, 'changed'); await assert.rejects(verifyRuntime(options), /hash mismatch/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { readProject } from '../src/projects.ts';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { HandMeshProcess } from '../src/hand-mesh-process.ts';
import { fileURLToPath } from 'node:url';
import { HandMeshClient } from '../../sdk/src/hand-mesh-client.ts';
import { HandInput } from '../../sdk/src/hands.ts';
import { HandVisual } from '../../sdk/src/hand-visual.ts';
import { PanelFrame } from '../../sdk/src/stereo.ts';
import { decodeMessage, type HandsMessage } from '../../sdk/src/protocol.ts';
import { handsMessage } from '../../sdk/test/fixtures.ts';

test('managed mesh gateway survives dev startup, follows None and keeps missing choices without blocking input', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  let cleanupFails = false;
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mesh-api-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const dir = path.join(workspace, 'projects/unsorted/example');
  await write(path.join(core, 'native/host/build/Release/xrb-host.exe'), 'fake host; run intercepted');
  await write(path.join(dir, 'xrb-project.json'), { name: 'Example', kind: 'app', inputs: ['hand'], entry: 'dist', scripts: { dev: 'vite' } }); await write(path.join(dir, 'dist/index.html'), '<html>example</html>');
  const plugin = path.join(workspace, 'plugins/example');
  await write(path.join(plugin, 'xrb-plugin.json'), { title: 'Example', type: 'plugin', version: '1.0.0', handMesh: { version: 1, id: 'surface', label: 'Example surface', program: 'missing-runtime.exe', args: [], settingsVersion: 1,
    settings: [{ key: 'quality', label: 'Quality', type: 'number', min: 1, max: 3, default: 2 }] } });
  // Inert regular file for discovery; neither this file nor the fake host is executed.
  await write(path.join(plugin, 'missing-runtime.exe'), 'inert not an executable');
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const port = await freePort(), app = createServer({ repo: core, workspace, port }), panel = app.panel as any;
  panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake' }], rejected: [], error: null });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { cleanupFails = false; panel.runner.s.phase = 'idle'; panel.runner.emit('state', panel.runner.state()); await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${port}/api/hands/postprocessing`;
  const get = () => fetch(url).then(r => r.json());
  const put = (body: unknown) => fetch(url, { method: 'PUT', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = await get(); assert.equal(data.choice.selected, null); assert.equal(data.plugins.length, 1);
  assert.equal(data.plugins[0].program, undefined); assert.equal(data.plugins[0].declaration.program, undefined); assert.equal(data.running, false);
  const selected = { owner: 'workspace:example', id: 'surface' };
  assert.equal((await put({ selected, values: { quality: 3 }, revision: data.revision, registryRevision: data.registryRevision })).status, 200);
  assert.equal((await put({ selected: null, revision: data.revision, registryRevision: data.registryRevision })).status, 409);
  // The runtime substitute is test-only: use the existing Node executable to run the single fake sidecar.
  const start = HandMeshProcess.start;
  t.mock.method(HandMeshProcess, 'start', function (_supervisor, _program, _args, cwd, cancelled, created) {
    return start.call(this, process.env.XRB_TEST_MESH_SUPERVISOR, process.execPath, [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], cwd, cancelled, created);
  });
  let config: any, delayedStart = false;
  panel.ensureDevInstalled = async () => {}; // No install/Vite/host: only the real fake mesh child runs.
  panel.runner.start = async (request: any) => {
    config = JSON.parse(await fs.readFile(request.hostArgs.find((v: string) => v.startsWith('--config=')).slice(9), 'utf8'));
    if (!delayedStart) {
      delayedStart = true; assert.equal(request.mode, 'dev');
      panel.runner.s = { ...panel.runner.s, phase: 'starting', projectId: 'example' }; panel.runner.emit('state', panel.runner.state());
      for (let i = 0; i < 200 && (panel.meshRun.state().phase !== 'Ready' || !panel.meshRun.state().owner); i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.match(panel.meshRun.status, /Ready/);
      // Regression: Vite/host startup can outlast three seconds AFTER a healthy child says ready.
      await new Promise(resolve => setTimeout(resolve, 3200));
      assert.match(panel.meshRun.status, /Ready/, 'processor readiness must not retire an endpoint before the app starts');
    }
    panel.runner.s = { ...panel.runner.s, phase: 'running', projectId: 'example' }; panel.runner.emit('state', panel.runner.state());
  };
  const project = (await readProject(dir, 'example', 'unsorted'))!;
  await panel.run(project, 'dev'); assert.equal(config.input, 'simulated'); assert.equal(config.handMeshRuntime.version, 1);
  const fetcher = (url: any, init: any) => fetch(url, { ...init, headers: { ...init.headers, origin: 'https://app.local' } });
  const client = new HandMeshClient(config.handMeshRuntime, fetcher as typeof fetch), input = new HandInput({ smoothing: false, prediction: false }), visual = new HandVisual(), mapping = new PanelFrame();
  t.after(() => { client.close(); visual.disposeMeshes(); });
  client.observed([1]);
  const points = decodeMessage(handsMessage([{ id: 1 }], performance.now())) as HandsMessage; input.push(points, performance.now());
  for (let i = 0; i < 100; i++) {
    input.push(points, performance.now());
    const pose = input.sample(performance.now()), meshes = client.update(pose, performance.now()); visual.updateMeshes(meshes, mapping);
    if (visual.getObjectByName('xrb-hand-mesh')?.children.length) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(visual.getObjectByName('xrb-hand-mesh')?.children.length, 1, 'saved global choice drives a real sidecar and standard SDK drawing');
  assert.deepEqual(input.sample(performance.now())[0].keypoints, points.hands[0].keypoints, 'mesh generation does not change input');
  data = await get(); const token = config.handMeshRuntime.token;
  assert.equal((await put({ selected: null, revision: data.revision, registryRevision: data.registryRevision })).status, 200);
  assert.equal(config.handMeshRuntime.token, token, 'configuration uses the same authenticated gateway');
  for (let i = 0; i < 100 && panel.meshRun.state().owner; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(panel.meshRun.state().owner, null, 'None drains the optional processor only');
  client.close(); visual.disposeMeshes();
  panel.runner.s.phase = 'idle'; panel.runner.emit('state', panel.runner.state());
  await panel.run(project, 'built'); assert.equal(config.handMeshRuntime.version, 1, 'None retains a processor-free gateway for later enablement');
  panel.runner.s.phase = 'idle'; panel.runner.emit('state', panel.runner.state());
  data = await get(); assert.equal((await put({ selected, revision: data.revision, registryRevision: data.registryRevision })).status, 200);
  await fs.unlink(path.join(plugin, 'missing-runtime.exe'));
  await panel.run(project, 'built'); assert.equal(config.handMeshRuntime.version, 1);
  assert.match((await get()).status, /Skeleton fallback/);
  assert.equal((await get()).delivery.phase, 'Failed');
  assert.deepEqual((await get()).choice.selected, selected, 'missing selected identity is preserved');
  panel.runner.s.phase = 'idle'; panel.runner.emit('state', panel.runner.state());
  await write(path.join(plugin, 'missing-runtime.exe'), 'inert discovery fixture');
  cleanupFails = true;
  panel.meshRun = { stop: async () => { if (cleanupFails) throw new Error('simulated owned cleanup failure'); } };
  await panel.stopMesh();
  await panel.run(project, 'built');
  assert.equal(config.input, 'simulated'); assert.equal(config.handMeshRuntime.version, 1, 'a processor-free gateway permits live retry without delaying input');
  assert.match((await get()).delivery.reason, /cleanup.*not verified/, 'failed optional cleanup blocks only new mesh, not input/app launch');
  cleanupFails = false; await panel.stopMesh();
});

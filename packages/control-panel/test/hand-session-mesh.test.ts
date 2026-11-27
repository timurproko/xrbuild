import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { HandMeshProcess } from '../src/hand-mesh-process.ts';
import { readProject } from '../src/projects.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
const wait = (ms = 5) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean) { for (let i = 0; i < 400; i++) { if (check()) return; await wait(); } assert.fail('Mesh session did not settle'); }

async function fixture(t: any) {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'hands-mesh-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  await fs.mkdir(workspace, { recursive: true }); await fs.mkdir(core, { recursive: true });
  const port = await freePort(), app = createServer({ repo: core, workspace, port }), panel = app.panel as any;
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${(app.server.address() as any).port}`; panel.panelUrl = origin;
  const service = panel.handSessions, deps = service.deps, productionAcquire = deps.acquire;
  let release = 0, reserved = 0;
  const children: any[] = [];
  const state = await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  deps.platform = 'win32'; deps.origin = () => origin;
  deps.prepare = async () => { const saved = await readHandsState(core, workspace); return { workerExe: path.join(root, 'xrb-provider-session.exe'), helperExe: 'fixture/acquisition.exe', runtimeName: 'simulated', config: {}, source: { owner: 'core', id: 'simulated', label: 'Synthetic', version: '1' }, profile: handProfile(), revision: saved.revision, postprocessing: structuredClone(saved.raw.postprocessing) }; };
  deps.acquire = () => () => { release++; };
  deps.reserve = async () => { reserved++; return { ticket: 'b'.repeat(64), async handoff() {}, async close() {} }; };
  deps.spawn = () => {
    const child: any = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exit = () => { if (!child.closed) { child.closed = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0); } };
    child.stdin = new Writable({ write(_d, _e, cb) { child.stdout.write('@provider {"phase":"running","url":"ws://127.0.0.1:2222/hands"}\n'); cb(); } });
    child.stdin.on('finish', child.exit); child.kill = child.exit; children.push(child); return child;
  };
  panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake' }], rejected: [], error: null });
  const call = async (action: string, body: object = {}, owner = '') => {
    const r = await fetch(origin + '/api/hands/session' + action, { method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-xrb-hands': '1', authorization: `Bearer ${owner}` }, body: JSON.stringify(body) });
    return { status: r.status, value: await r.json() };
  };
  const owner = (await call('/bootstrap', { document: crypto.randomUUID() })).value.capability;
  const start = () => call('', { provider: { owner: 'core', id: 'simulated' }, revision: state.revision, registryRevision: 'fixture' }, owner);
  t.after(async () => { children.forEach(c => c.exit()); await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { app, panel, service, deps, productionAcquire, origin, core, workspace, children, call, owner, start, get release() { return release; }, get reserved() { return reserved; } };
}

async function selectFixtureMesh(f: Awaited<ReturnType<typeof fixture>>) {
  const dir = path.join(f.workspace, 'plugins/example'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'worker.exe'), 'inert discovery fixture');
  await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Example', type: 'plugin', version: '1.0.0', handMesh: { version: 2, id: 'surface', label: 'Surface', program: 'worker.exe', args: [], settingsVersion: 1, capabilities: MESH_CAPABILITIES,
    settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 9, default: 3, changeMode: 'live' }] } }));
  const url = f.origin + '/api/hands/postprocessing', get = () => fetch(url).then(r => r.json()), selected = { owner: 'workspace:example', id: 'surface' };
  const put = async (vertices: number) => { const data = await get(); return fetch(url, { method: 'PUT', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ selected, values: { vertices }, revision: data.revision, registryRevision: data.registryRevision }) }); };
  assert.equal((await put(3)).status, 200);
  const retry = async (runId: string) => { const data = await get(); return fetch(url + '/retry', { method: 'POST', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ runId, revision: data.revision }) }); };
  return { get, put, retry };
}
async function prepareManagedFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const exe = path.join(f.core, 'native/host/build/Release/xrb-host.exe'), dir = path.join(f.workspace, 'projects/unsorted/example');
  await fs.mkdir(path.dirname(exe), { recursive: true }); await fs.writeFile(exe, 'inert host; launch intercepted');
  await fs.mkdir(path.join(dir, 'dist'), { recursive: true }); await fs.writeFile(path.join(dir, 'dist/index.html'), '<html>fixture</html>');
  await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name: 'Example', kind: 'app', inputs: ['hand'], entry: 'dist' }));
  let starts = 0;
  f.panel.runner.start = async (request: any) => {
    starts++; const config = JSON.parse(await fs.readFile(request.hostArgs.find((s: string) => s.startsWith('--config=')).slice(9), 'utf8'));
    assert.equal(config.input, 'simulated'); assert.equal(config.handMeshRuntime.version, 1);
    f.panel.runner.s = { ...f.panel.runner.s, phase: 'running', projectId: 'example' }; f.panel.runner.emit('state', f.panel.runner.state());
  };
  const project = (await readProject(dir, 'example', 'unsorted'))!;
  return { start: () => f.panel.run(project, 'built'), get starts() { return starts; } };
}
for (const direction of ['app-to-Hands', 'Hands-to-app']) for (const cleanup of ['pending', 'failed', 'cancelled']) {
  test(`${direction}: ${cleanup} old cleanup fences every new processor, not skeleton startup or live configuration`, { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
    const f = await fixture(t), controls = await selectFixtureMesh(f), managed = await prepareManagedFixture(f);
    f.deps.acquire = f.productionAcquire; // Exercise production acquisition admission and both production mesh factories.
    const original = HandMeshProcess.start; let launches = 0, oldStops = 0, fail = cleanup === 'failed', finish: () => void = () => {};
    const join = new Promise<void>(resolve => { finish = resolve; });
    const old: any = { descriptor: null, status: 'Ready', state: () => ({ phase: 'Ready' }), appStarted() {}, stop: async () => { oldStops++; if (fail) throw new Error('exact tree is not verified'); if (cleanup !== 'failed') await join; } };
    t.mock.method(HandMeshProcess, 'start', function (_s, _p, _args, cwd, cancelled, created) { launches++; return original.call(this, process.env.XRB_TEST_MESH_SUPERVISOR, process.execPath, [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], cwd, cancelled, created); });
    let retired: Promise<any> = Promise.resolve();
    try {
      if (direction === 'app-to-Hands') { f.panel.meshRun = old; retired = f.panel.stopMesh(); }
      else {
        const factory = f.deps.mesh; f.deps.mesh = () => old;
        const prior = await f.start(); assert.equal(prior.status, 200); f.deps.mesh = factory;
        retired = f.call('/stop', { sessionId: prior.value.sessionId }, f.owner);
      }
      await until(() => oldStops > 0 && !f.service.busy);
      if (cleanup === 'failed') await retired;
      assert.equal(f.panel.meshRetirement.blocked, true);
      let sessionId: string | null = null;
      if (direction === 'app-to-Hands') { const started = await f.start(); assert.equal(started.status, 200); sessionId = started.value.sessionId; assert.equal(f.service.busy, true); }
      else { await managed.start(); assert.equal(managed.starts, 1); assert.equal(f.panel.runner.busy, true); }
      const current = () => direction === 'app-to-Hands' ? f.service.meshRun : f.panel.meshRun;
      await until(() => !!current()?.state().owner && (cleanup === 'failed' ? current().state().phase === 'Failed' : current().state().phase === 'Preparing'));
      assert.equal(launches, 0, 'a new contained processor cannot bypass another consumer retirement');
      if (cleanup === 'failed') assert.match(current().state().reason, /cleanup.*not verified/);
      const runId = current().state().runId;
      assert.equal((await controls.put(9)).status, 200, 'committed values remain independent of optional cleanup');
      assert.equal((await controls.retry(runId)).status, 200);
      assert.equal(launches, 0, 'apply and retry are also fenced, not merely initial launch');
      if (cleanup === 'cancelled') {
        if (sessionId) { const stopping = f.call('/stop', { sessionId }, f.owner); await until(() => !f.service.busy); finish(); await stopping; }
        else { f.panel.runner.s.phase = 'idle'; f.panel.runner.emit('state', f.panel.runner.state()); finish(); await f.panel.stopMesh(); }
        await retired; await until(() => !f.panel.meshRetirement.blocked); assert.equal(launches, 0, 'late verified cleanup cannot revive a retired target');
      } else {
        fail = false; finish(); await retired;
        if (cleanup === 'failed') assert.equal((await controls.retry(runId)).status, 200);
        await until(() => current()?.state().phase === 'Ready' && current()?.state().owner === 'workspace:example');
        assert.equal(launches, 1); assert.equal((current() as any).stage.values.vertices, 9);
        assert.equal(direction === 'app-to-Hands' ? f.children.length : managed.starts, 1, 'mesh recovery did not restart the new input consumer');
        assert.equal(f.panel.meshRetirement.blocked, false);
      }
    } finally { fail = false; finish(); await retired; f.panel.runner.s.phase = 'idle'; f.panel.runner.emit('state', f.panel.runner.state()); }
  });
}

test('panel exit stops the managed input owner before awaiting another mesh tree verification', async t => {
  const f = await fixture(t), managed = await prepareManagedFixture(f); let fail = true, stopped = false;
  f.panel.meshRun = { stop: async () => { if (fail) throw new Error('old exact tree unknown'); } };
  await f.panel.stopMesh(); await managed.start();
  f.panel.runner.stop = async () => { stopped = true; f.panel.runner.s.phase = 'idle'; f.panel.runner.emit('state', f.panel.runner.state()); };
  const closing = f.app.close();
  try { await until(() => stopped); assert.equal(f.panel.meshRetirement.blocked, true); }
  finally { fail = false; await closing; }
});

test('Hands owns a None gateway, owner-only descriptor, and disposes it on Stop without another lease', async t => {
  const f = await fixture(t), result = await f.start(); assert.equal(result.status, 200);
  await until(() => !!f.service.meshRun?.descriptor);
  const run = f.service.meshRun, descriptor = run.descriptor;
  assert.equal(run.state().owner, null); assert.equal(f.reserved, 1);
  const own = (await f.call('/status', {}, f.owner)).value;
  assert.deepEqual(own.handMeshRuntime, descriptor); assert.equal(own.profile.profile.postprocessing, undefined);
  const foreign = (await f.call('/bootstrap')).value.capability;
  assert.equal((await f.call('/status', {}, foreign)).value.handMeshRuntime, undefined);
  const publicStatus = await fetch(f.origin + '/api/hands/postprocessing').then(r => r.text());
  assert.equal(publicStatus.includes(descriptor.token), false); assert.equal(JSON.parse(publicStatus).running, true);
  await f.call('/stop', { sessionId: result.value.sessionId }, f.owner);
  assert.equal(f.release, 1); assert.equal(f.service.meshRun, null); assert.equal(run.descriptor, null);
  assert.equal((await fetch(descriptor.url + '/connect').catch(() => null)), null);
});

for (const loss of ['crash', 'heartbeat', 'reload', 'shutdown']) test(`Hands mesh retires on ${loss}`, async t => {
  const f = await fixture(t); assert.equal((await f.start()).status, 200);
  await until(() => !!f.service.meshRun?.descriptor); const run = f.service.meshRun;
  if (loss === 'crash') f.children[0].exit();
  if (loss === 'heartbeat') { f.deps.heartbeatMs = -1; }
  if (loss === 'reload') {
    // The owning capability's tab continuity rotates only through authenticated reload bootstrap.
    const page = [...f.service.continuities.entries()].find(([, p]: any) => p.owner === f.owner);
    if (page) await f.call('/bootstrap', { continuity: page[0], document: crypto.randomUUID(), reload: true });
    else { await f.call('/stop', { sessionId: f.service.status(f.owner).sessionId }, f.owner); }
  }
  if (loss === 'shutdown') await f.service.close();
  await until(() => run.descriptor === null && !f.service.busy); assert.equal(f.release, 1);
});

test('mesh attachment allowance starts only after provider startup, not early optional readiness', async t => {
  const f = await fixture(t); let started = 0, releaseReservation: (value: any) => void = () => {};
  f.deps.reserve = () => new Promise(resolve => { releaseReservation = resolve; });
  const run = { descriptor: null, status: 'Ready', state: () => ({ phase: 'Ready' }), appStarted() { started++; }, async stop() {} };
  f.deps.mesh = () => run;
  const starting = f.start(); await until(() => f.service.meshRun === run);
  assert.equal(started, 0, 'slow acquisition cannot consume the view attachment allowance');
  releaseReservation({ ticket: 'b'.repeat(64), async handoff() {}, async close() {} });
  const result = await starting; assert.equal(result.status, 200); assert.equal(started, 1);
  await f.call('/stop', { sessionId: result.value.sessionId }, f.owner);
});

test('slow previous mesh cleanup never delays a replacement skeleton or its processor-free gateway', async t => {
  const f = await fixture(t); let finish: () => void = () => {}, created = 0, attached = 0;
  const draining = new Promise<void>(r => { finish = r; });
  f.deps.mesh = () => { const generation = ++created; return { descriptor: null, status: 'Ready', state: () => ({ phase: 'Ready' }), appStarted() { attached++; }, stop: () => generation === 1 ? draining : Promise.resolve() }; };
  const first = await f.start(); assert.equal(first.status, 200); assert.equal(created, 1);
  const stopping = f.call('/stop', { sessionId: first.value.sessionId }, f.owner);
  await until(() => !f.service.busy); assert.equal(f.release, 1);
  const second = await f.start(); assert.equal(second.status, 200); assert.equal(f.children.length, 2);
  assert.ok(f.service.meshRun, 'gateway allocation does not start a processor or wait for prior cleanup'); assert.equal(created, 2);
  assert.equal(f.service.status(f.owner).meshCleanupPending, true);
  finish(); await stopping; await until(() => created === 2);
  assert.equal(f.service.status(f.owner).sessionId, second.value.sessionId); assert.equal(attached, 2);
  await f.call('/stop', { sessionId: second.value.sessionId }, f.owner);
});

test('optional launch validation never delays skeleton, cancellation wins and cleanup failure remains retryable', async t => {
  const f = await fixture(t); let stopped = 0, fail = true, finish: () => void = () => {};
  const opening = new Promise<void>(r => { finish = r; });
  const run = { descriptor: null, status: 'Preparing', appStarted() {}, stop: async () => { stopped++; if (fail) throw new Error('owned tree not joined'); }, state: () => ({ phase: 'Preparing' }) };
  f.deps.mesh = () => { void opening.then(() => { if (!stopped) run.status = 'Ready'; }); return run; };
  const result = await f.start(); assert.equal(result.status, 200); assert.equal(f.children.length, 1); assert.equal(run.status, 'Preparing');
  await f.call('/stop', { sessionId: result.value.sessionId }, f.owner); finish(); await wait();
  assert.equal(f.release, 1, 'provider lease release is not blocked by optional mesh cleanup');
  assert.equal(f.service.status(f.owner).meshCleanupPending, true); assert.equal(run.status, 'Preparing');
  fail = false; await f.call('/recover', { sessionId: result.value.sessionId }, f.owner);
  assert.equal(f.service.status(f.owner).meshCleanupPending, false); assert.ok(stopped >= 2);
});

test('standalone Hands GET/PUT/retry configures the exact mesh owner with no managed app', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t), dir = path.join(f.workspace, 'plugins/example'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'worker.exe'), 'inert discovery fixture');
  await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Example', type: 'plugin', version: '1.0.0', handMesh: { version: 2, id: 'surface', label: 'Surface', program: 'worker.exe', args: [], settingsVersion: 1, capabilities: MESH_CAPABILITIES,
    settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 9, default: 3, changeMode: 'live' }] } }));
  const original = HandMeshProcess.start;
  t.mock.method(HandMeshProcess, 'start', function (_s, _p, _args, cwd, cancelled, created) { return original.call(this, process.env.XRB_TEST_MESH_SUPERVISOR, process.execPath, [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], cwd, cancelled, created); });
  const url = f.origin + '/api/hands/postprocessing', get = () => fetch(url).then(r => r.json());
  const put = async (selected: object | null, values = {}) => { const saved = await get(); return fetch(url, { method: 'PUT', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ selected, values, revision: saved.revision, registryRevision: saved.registryRevision }) }); };
  const selected = { owner: 'workspace:example', id: 'surface' };
  const catalog = await get(); assert.equal(catalog.plugins[0]?.available, true, JSON.stringify(catalog));
  const savedSelection = await put(selected); assert.equal(savedSelection.status, 200, await savedSelection.text()); assert.equal(f.service.meshRun, null, 'idle save never starts processing');
  const result = await f.start(); assert.equal(result.status, 200); await until(() => f.service.meshRun?.state().owner === selected.owner && f.service.meshRun.state().phase === 'Ready');
  const run: HandMeshRun = f.service.meshRun, token = run.descriptor!.token;
  assert.equal(f.panel.meshRun, null); assert.equal((await get()).delivery.runId, run.state().runId);
  assert.equal((await put(selected, { vertices: 9 })).status, 200);
  await until(() => run.state().requestedGeneration === run.state().appliedGeneration);
  assert.equal(run.descriptor!.token, token); assert.equal(f.reserved, 1);
  const retry = (runId: string) => fetch(url + '/retry', { method: 'POST', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ runId, revision: run.state().savedRevision }) });
  assert.equal((await retry('retired-run')).status, 409);
  (run as any).stage.owned.child.kill(); await until(() => run.state().phase === 'Failed');
  assert.equal((await retry(run.state().runId)).status, 200); await until(() => run.state().phase === 'Ready');
  assert.equal((await put(null)).status, 200); await until(() => run.state().owner === null && run.state().phase === 'Ready');
  assert.equal(f.reserved, 1); assert.equal(f.service.busy, true);
  assert.equal((await put(selected)).status, 200);
  await until(() => run.state().phase === 'Ready');
  await fs.unlink(path.join(dir, 'worker.exe'));
  assert.equal((await retry(run.state().runId)).status, 200, 'retry reports unavailable delivery without erasing the saved selection');
  assert.equal((await get()).delivery.phase, 'Failed');
  assert.deepEqual((await get()).choice.selected, selected);
  await f.call('/stop', { sessionId: result.value.sessionId }, f.owner); assert.equal(run.descriptor, null);
});

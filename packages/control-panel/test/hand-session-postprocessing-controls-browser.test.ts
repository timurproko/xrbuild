import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { HandMeshProcess } from '../src/hand-mesh-process.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('merged post-processing controls apply, prepare, fail/retry, select None and switch plugins on a real Hands mesh owner', { skip: !process.env.XRB_TEST_BROWSER || !process.env.XRB_TEST_MESH_SUPERVISOR, timeout: 45000 }, async t => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'hands-controls-')), core = path.resolve(import.meta.dirname, '../../..'), port = await freePort();
  for (const id of ['example', 'alternate']) {
    const dir = path.join(workspace, 'plugins', id); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'worker.exe'), 'inert discovery fixture');
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: id, type: 'plugin', version: '1.0.0', handMesh: { version: 2, id: 'surface', label: id, program: 'worker.exe', args: [], capabilities: MESH_CAPABILITIES, settingsVersion: 1, settings: [
      { key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 9, default: 3, changeMode: 'live' },
      { key: 'device', label: 'Device', type: 'select', default: 'primary', options: ['primary', 'secondary'].map(value => ({ value, label: value })), changeMode: 'reprepare' },
      { key: 'ackDelay', label: 'Acknowledgement delay', type: 'number', min: 0, max: 1500, default: 1200, changeMode: 'live' },
      { key: 'progress', label: 'Progress', type: 'boolean', default: true, changeMode: 'live' },
    ] } }));
  }
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const app = createServer({ repo: core, workspace, port }), panel = app.panel as any, service = panel.handSessions, deps = service.deps;
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const origin = new URL(app.url).origin;
  panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake' }], rejected: [], error: null });
  let providerStarts = 0, launches = 0, oldCleanupFails = true, heartbeat: ReturnType<typeof setInterval> | null = null;
  const children: any[] = [];
  deps.prepare = async () => { const saved = await readHandsState(core, workspace); return { workerExe: path.join(workspace, 'xrb-provider-session.exe'), helperExe: 'fixture/acquisition.exe', runtimeName: 'simulated', config: {}, source: { owner: 'core', id: 'simulated', label: 'Synthetic', version: '1' }, profile: saved.profile, revision: saved.revision, postprocessing: structuredClone(saved.raw.postprocessing) }; };
  deps.reserve = async () => ({ ticket: 'b'.repeat(64), async handoff() {}, async close() {} });
  deps.spawn = () => {
    providerStarts++; const child: any = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exit = () => { if (!child.closed) { child.closed = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0); } };
    child.stdin = new Writable({ write(_d, _e, callback) { child.stdout.write('@provider {"phase":"running","url":"ws://127.0.0.1:2222/hands"}\n'); callback(); } });
    child.stdin.on('finish', child.exit); child.kill = child.exit; children.push(child); return child;
  };
  const original = HandMeshProcess.start;
  t.mock.method(HandMeshProcess, 'start', function (_s, _p, _args, cwd, cancelled, created) { launches++; return original.call(this, process.env.XRB_TEST_MESH_SUPERVISOR, process.execPath, [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], cwd, cancelled, created); });
  const call = async (action: string, body: object, owner = '') => { const r = await fetch(origin + '/api/hands/session' + action, { method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-xrb-hands': '1', authorization: `Bearer ${owner}` }, body: JSON.stringify(body) }); const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value; };
  try {
    // Production app retirement and production Hands admission/factory, with fake provider transport only.
    panel.meshRun = { stop: async () => { if (oldCleanupFails) throw new Error('previous exact tree unknown'); } };
    await panel.stopMesh();
    const owner = (await call('/bootstrap', { document: crypto.randomUUID() })).capability;
    const saved = await readHandsState(core, workspace), started = await call('', { provider: { owner: 'core', id: 'simulated' }, revision: saved.revision, registryRevision: 'fixture' }, owner);
    heartbeat = setInterval(() => { void call('/heartbeat', { sessionId: started.sessionId }, owner).catch(() => {}); }, 750);
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.controlCalls=[];const realFetch=fetch;window.fetch=(url,options)=>{if(String(url).includes('/api/hands/postprocessing'))controlCalls.push({url:String(url),method:options?.method||'GET',body:options?.body?JSON.parse(options.body):null});return realFetch(url,options)};window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};` });
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await navigate(app.url + 'hands/', `document.querySelector('[data-mesh-selector]')?.options.length===3`);
      const until = async (expression: string) => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); } assert.fail(`Controls did not settle: ${expression}; ${await evaluate(`document.querySelector('[data-mesh-runtime]').textContent`)}`); };
      const choose = (value: string) => evaluate(`(()=>{const e=document.querySelector('[data-mesh-selector]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const state = (name: string) => until(`document.querySelector('#hands-postprocessing-root').dataset.meshState===${JSON.stringify(name)}`);
      const picture = async (name: string) => { if (process.env.XRB_PROOF_DIR) { await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true }); const p = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, name + '.png'), Buffer.from(p.data, 'base64')); } };
      await choose('workspace:example/surface'); await state('failed');
      assert.equal(launches, 0); assert.equal(service.busy, true); assert.equal(panel.runner.busy, false);
      assert.match(await evaluate(`document.querySelector('[data-mesh-runtime]').textContent`), /cleanup.*not verified/);
      await picture('controls-hands-shared-cleanup-failed');
      const beforeRetry = await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8'), runId = service.meshRun.state().runId;
      oldCleanupFails = false;
      await evaluate(`document.querySelector('[data-mesh-delivery-retry]').click()`); await state('applied');
      assert.equal(launches, 1); assert.equal(service.meshRun.state().runId, runId); assert.equal(await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8'), beforeRetry);
      await evaluate(`(()=>{const e=document.querySelector('[data-mesh-field="vertices"]');e.value='6';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await state('preparing'); assert.equal(service.busy, true); await picture('controls-hands-preparing'); await state('applied');
      assert.equal(service.meshRun.stage.values.vertices, 6);
      await evaluate(`(()=>{const e=document.querySelector('[data-mesh-field="device"]');e.value='secondary';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await state('preparing'); await state('applied'); assert.equal(service.meshRun.stage.values.device, 'secondary');
      service.meshRun.stage.owned.child.kill(); await state('failed');
      const writes = await evaluate(`controlCalls.filter(c=>c.method==='PUT').length`);
      await evaluate(`document.querySelector('[data-mesh-delivery-retry]').click()`); await state('applied');
      assert.equal(await evaluate(`controlCalls.filter(c=>c.method==='PUT').length`), writes);
      await choose(''); await state('applied'); assert.equal(service.meshRun.state().owner, null);
      await choose('workspace:example/surface'); await state('applied');
      const oldStage = service.meshRun.stage;
      await choose('workspace:alternate/surface'); await state('applied');
      assert.equal(service.meshRun.state().owner, 'workspace:alternate'); assert.equal(oldStage.retired, true);
      assert.equal(providerStarts, 1); assert.equal(service.busy, true); assert.equal(service.meshRun.state().runId, runId);
      assert.equal(await evaluate('captureCalls'), 0); assert.equal(service.meshRun.state().drawingGeneration, null, 'Applied does not invent viewport drawing evidence');
      const retries = await evaluate(`controlCalls.filter(c=>c.url.endsWith('/retry')).map(c=>c.body)`);
      assert.equal(retries.length, 2); assert.ok(retries.every((r: any) => r.runId === runId && typeof r.revision === 'string'));
      await picture('controls-hands-switched-applied');
      await evaluate(`dispatchEvent(new Event('pagehide'))`);
    });
    clearInterval(heartbeat); heartbeat = null; await call('/stop', { sessionId: started.sessionId }, owner);
  } finally {
    if (heartbeat) clearInterval(heartbeat); oldCleanupFails = false; children.forEach(c => c.exit()); await app.close(); await fs.rm(workspace, { recursive: true, force: true });
  }
});

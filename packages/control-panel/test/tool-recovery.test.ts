import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { recoverManagedTool, samePanelIdentity } from '../ui/tool-recovery.js';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { resolvePluginCatalog } from '../src/extension-catalog.ts';

const identity = { app: 'xrb-control-panel', instanceId: 'original', repo: '/core', workspace: '/user', projects: '/projects' };
function recoveryFixture(overrides: Record<string, any> = {}) {
  let clock = 100_000, restarted = false;
  const calls: Array<{ route: string; body?: any }> = [], messages: string[] = [], destinations: string[] = [], values = new Map<string, string>();
  const json = (body: any, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const options = {
    toolId: 'fixture', origin: 'http://127.0.0.1:5180', timeout: 2_000,
    storage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
    now: () => clock, pause: async (ms: number) => { clock += ms; },
    navigate: (url: string) => destinations.push(url), onStatus: (message: string) => messages.push(message),
    request: async (url: URL, init: any) => {
      const route = url.pathname, body = init.body ? JSON.parse(init.body) : undefined; calls.push({ route, body });
      if (overrides.handle) { const result = await overrides.handle(route, body, restarted, json); if (result) return result; }
      if (route === '/api/ping') return json({ ...identity, instanceId: restarted ? 'replacement' : 'original' });
      if (route === '/api/navigation') return json({ tools: [{ id: 'fixture', route: restarted ? '/updated/' : '/fixture/' }] });
      if (route.endsWith('/status')) return json(restarted ? { state: 'ready' } : { state: 'error', restartRequired: true });
      if (route === '/api/run') return json({ state: { phase: 'idle' } });
      if (route === '/api/jobs') return json({ jobs: [] });
      if (route === '/api/restart') { restarted = true; return json(identity); }
      if (route.endsWith('/retry')) return json({ state: 'starting' }, 202);
      throw new Error(`Unexpected request ${route}`);
    },
    ...overrides.options
  };
  return { options, calls, messages, destinations, values, json };
}

test('recovery restarts once without confirmation and returns to the registered replacement route', async () => {
  const f = recoveryFixture(); const result = await recoverManagedTool(f.options);
  assert.equal(result.state, 'ready'); assert.deepEqual(f.destinations, ['http://127.0.0.1:5180/updated/']);
  assert.deepEqual(f.calls.filter(call => call.route === '/api/restart').map(call => call.body), [{ confirm: false, ifIdle: true, expectedInstanceId: 'original' }]);
});

test('recovery never restarts queued/running work and bounds waiting', async () => {
  for (const state of ['queued', 'running']) {
    const f = recoveryFixture({ handle: (route: string, _: any, __: any, json: any) => route === '/api/jobs' ? json({ jobs: [{ state }] }) : null });
    assert.equal((await recoverManagedTool(f.options)).state, 'timeout');
    assert.equal(f.calls.some(call => call.route === '/api/restart'), false); assert.deepEqual(f.destinations, []);
    assert.ok(f.messages.some(message => message.includes('Waiting')));
  }
});

test('recovery refuses a replacement from another workspace or an untrusted tool route', async () => {
  for (const mode of ['workspace', 'route']) {
    const f = recoveryFixture({ handle: (route: string, _: any, restarted: boolean, json: any) => {
      if (mode === 'workspace' && restarted && route === '/api/ping') return json({ ...identity, instanceId: 'foreign', workspace: '/someone-else' });
      if (mode === 'route' && route === '/api/navigation') return json({ tools: [{ id: 'fixture', route: 'https://example.test/' }] });
    } });
    assert.equal((await recoverManagedTool(f.options)).state, 'blocked'); assert.deepEqual(f.destinations, []);
  }
  assert.equal(samePanelIdentity(identity, { ...identity, projects: '/other-projects' }), false);
  assert.equal(samePanelIdentity({ ...identity, repo: 'D:\\Core' }, { ...identity, repo: 'd:/core' }), true);
});

test('recovery budget survives document reload and stops persistent restart loops', async () => {
  const f = recoveryFixture({ handle: (route: string, _: any, __: any, json: any) => route.endsWith('/status') ? json({ state: 'error', restartRequired: true }) : null });
  assert.equal((await recoverManagedTool(f.options)).state, 'blocked');
  assert.equal((await recoverManagedTool(f.options)).state, 'blocked');
  assert.equal(f.calls.filter(call => call.route === '/api/restart').length, 1); assert.deepEqual(f.destinations, []);
});

test('ordinary startup failure receives a single retry, not an automatic panel restart', async () => {
  const f = recoveryFixture({ handle: (route: string, _: any, __: any, json: any) => route.endsWith('/status') ? json({ state: 'error', error: 'failed' }) : null });
  assert.equal((await recoverManagedTool(f.options)).state, 'failed');
  assert.equal(f.calls.filter(call => call.route.endsWith('/retry')).length, 1); assert.equal(f.calls.some(call => call.route === '/api/restart'), false);
});

test('invalid recovery links perform no requests and disabled storage cannot create a restart loop', async () => {
  const invalid = recoveryFixture({ options: { toolId: 'https://example.test/' } });
  assert.equal((await recoverManagedTool(invalid.options)).state, 'blocked'); assert.equal(invalid.calls.length, 0);
  const f = recoveryFixture({ options: { storage: { getItem() { throw new Error('disabled'); } } } });
  assert.equal((await recoverManagedTool(f.options)).state, 'blocked'); assert.equal(f.calls.some(call => call.route === '/api/restart'), false);
});

const parent = path.resolve(import.meta.dirname, '../../../.artifacts');
async function managedRecoveryFixture(closeDelay = 0) {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'tool-recovery-')), workspace = path.join(root, 'workspace'), plugin = path.join(workspace, 'plugins', 'fixture-tool');
  await fs.mkdir(plugin, { recursive: true });
  const catalog = await resolvePluginCatalog(workspace, REPO, true);
  const preferences = { disabled: catalog.plugins.filter(plugin => plugin.origin === 'bundled').map(plugin => plugin.key) };
  await fs.writeFile(path.join(workspace, 'xrb-plugins.json'), JSON.stringify(preferences));
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Fixture', type: 'input', version: '1.0.0', panel: { tools: [{ id: 'fixture', label: 'Fixture', route: '/fixture/', module: 'tool.mjs' }] } }));
  const module = path.join(plugin, 'tool.mjs');
  const writeModule = async (version: string) => fs.writeFile(module, `export function createWorkspaceTool(){return{handle(req,res){res.setHeader('content-type','text/html');res.end('<h1 id="fixture-ready">${version}</h1>')},async close(){await new Promise(resolve=>setTimeout(resolve,${closeDelay}))}}}`);
  await writeModule('original');
  const port = await freePort(), panel = createServer({ workspace, port });
  await panel.panel.loadInitialServices(); panel.panel.discoveryMaxAgeMs = 0;
  panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  return { root, workspace, preferences, module, writeModule, port, panel, base, cleanup: async () => { await panel.close(); await fs.rm(root, { recursive: true, force: true }); } };
}

test('unchanged managed tools survive preference refresh; real code change exposes restart-required routing', async () => {
  const f = await managedRecoveryFixture();
  try {
    assert.match(await fetch(f.base + '/fixture/').then(response => response.text()), /original/);
    await fs.writeFile(path.join(f.workspace, 'xrb-plugins.json'), JSON.stringify({ ...f.preferences, settings: { unrelated: { value: true } } }));
    await fetch(f.base + '/api/navigation');
    assert.deepEqual(await fetch(f.base + '/api/tools/fixture/status').then(response => response.json()), { state: 'ready', error: '' });
    assert.match(await fetch(f.base + '/fixture/').then(response => response.text()), /original/);
    await f.writeModule('replacement-source');
    await fetch(f.base + '/api/navigation');
    const state = await fetch(f.base + '/api/tools/fixture/status').then(response => response.json());
    assert.equal(state.restartRequired, true);
    const response = await fetch(f.base + '/fixture/', { redirect: 'manual' });
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/tool-recovery.html?tool=fixture');
    assert.equal((await fetch(f.base + '/api/tools/fixture/retry', { method: 'POST', headers: { Origin: f.base } }).then(response => response.json())).restartRequired, true);
    assert.equal((await fetch(f.base + '/api/tools/fixture/retry', { method: 'POST', headers: { Origin: 'https://example.test' } })).status, 403);
  } finally { await f.cleanup(); }
});

test('restart-required discovery also recovers a tool that has not started yet', async () => {
  const f = await managedRecoveryFixture();
  try {
    await f.writeModule('changed-before-first-navigation'); await fetch(f.base + '/api/navigation');
    const state = await fetch(f.base + '/api/tools/fixture/status').then(response => response.json());
    assert.equal(state.state, 'error'); assert.equal(state.restartRequired, true);
    const response = await fetch(f.base + '/fixture/', { redirect: 'manual' });
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/tool-recovery.html?tool=fixture');
    assert.equal(await response.text(), '', 'cold source must not execute in a restart-required process');
  } finally { await f.cleanup(); }
});

test('idle-only restart is instance-bound, cannot force preparation, and coalesces accepted requests', async () => {
  const f = await managedRecoveryFixture(); let restarts = 0, held: http.ClientRequest | undefined;
  f.panel.panel.onRestart = () => { restarts++; };
  const post = (body: any) => fetch(f.base + '/api/restart', { method: 'POST', headers: { Origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const body = { confirm: false, ifIdle: true, expectedInstanceId: f.panel.panel.instanceId };
  try {
    assert.equal((await post({ ...body, expectedInstanceId: 'foreign' })).status, 409);
    assert.equal((await post({ ...body, confirm: true })).status, 409);
    (f.panel.panel as any).pluginConsumers = 1;
    const busy = await post(body); assert.equal(busy.status, 409); assert.equal((await busy.json()).details.retryWhenIdle, true);
    (f.panel.panel as any).pluginConsumers = 0;
    const arrived = once(f.panel.server, 'request');
    const completed = new Promise<number | undefined>(resolve => {
      held = http.request(f.base + '/api/projects/new', { method: 'POST', headers: { Origin: f.base, 'content-type': 'application/json', 'content-length': '2' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      held.write('{'); held.flushHeaders();
    });
    await arrived;
    assert.equal((await post(body)).status, 409, 'in-flight writes count before their job/preparation flags exist');
    held!.end('}'); assert.equal(await completed, 400);
    assert.equal((await post(body)).status, 200); assert.equal((await post(body)).status, 200);
    assert.equal((await fetch(f.base + '/api/run/clear-log', { method: 'POST', headers: { Origin: f.base } })).status, 503);
    await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(restarts, 1);
    assert.equal(f.panel.panel.runner.state().phase, 'idle'); assert.equal(f.panel.panel.jobs.active().length, 0);
  } finally { held?.destroy(); (f.panel.panel as any).pluginConsumers = 0; await f.cleanup(); }
});

test('shutdown refuses reconnecting event streams while draining an owned tool', async () => {
  const f = await managedRecoveryFixture(150);
  try {
    assert.equal((await fetch(f.base + '/fixture/')).status, 200);
    const events = await fetch(f.base + '/api/events'), reader = events.body!.getReader(); await reader.read();
    const ending = (async () => { while (!(await reader.read()).done) {} })();
    const started = performance.now(), closed = f.panel.close();
    const reconnect = await fetch(f.base + '/api/events').catch(() => null);
    if (reconnect) { assert.equal(reconnect.status, 503); await reconnect.text(); }
    await closed; await ending; assert.ok(performance.now() - started < 1_500);
  } finally { await f.cleanup(); }
});

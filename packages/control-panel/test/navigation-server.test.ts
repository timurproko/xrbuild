import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';

const parent = path.resolve(import.meta.dirname, '../../../.artifacts');
const waitFor = async (check: () => Promise<boolean>) => {
  const until = performance.now() + 3_000;
  while (performance.now() < until) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error('timed out');
};

test('navigation API reads only the selected integration workspace and starts nothing', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'navigation-http-')), workspace = path.join(root, 'integration'), projects = path.join(root, 'projects');
  await fs.mkdir(workspace); await fs.mkdir(projects);
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'tracker', label: 'Hand tracking', url: 'http://127.0.0.1:5220/' }] }));
  await fs.writeFile(path.join(projects, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'other', label: 'Wrong workspace', url: 'http://127.0.0.1:5221/' }] }));
  const port = await freePort(), panel = createServer({ workspace, projects, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`, data = await fetch(base + '/api/navigation').then((response) => response.json());
    assert.equal(data.tools.length, 1); assert.equal(data.tools[0].id, 'tracker'); assert.equal(panel.panel.runner.state().phase, 'idle'); assert.equal(panel.panel.jobs.list().length, 0);
    await fs.writeFile(path.join(workspace, 'xrb-tools.json'), '{');
    const invalid = await fetch(base + '/api/navigation').then((response) => response.json()); assert.deepEqual(invalid.tools, []); assert.match(invalid.error, /invalid JSON/); assert.equal((await fetch(base + '/api/ping')).status, 200);
    assert.equal((await fetch(base + '/api/navigation', { method: 'POST', headers: { Origin: 'https://example.test' } })).status, 403);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('managed tool starts once on its panel route and owns only declared paths', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'managed-tool-http-')), workspace = path.join(root, 'integration');
  await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'tools', 'fixture.mjs'), `let starts=0;export async function createWorkspaceTool(){starts++;return{handle(req,res,next){if(req.url.startsWith('/managed/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({starts,path:req.url}));return;}if(req.url.startsWith('/__fixture/')){res.end('endpoint');return;}next();}}}`);
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'managed', label: 'Managed Tool', route: '/managed/', module: 'tools/fixture.mjs', endpoints: ['/__fixture/'] }] }));
  const port = await freePort(), panel = createServer({ workspace, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`, navigation = await fetch(base + '/api/navigation').then((response) => response.json());
    assert.deepEqual(navigation.tools, [{ id: 'managed', label: 'Managed Tool', route: '/managed/' }]);
    const starts = await Promise.all([fetch(base + '/managed/'), fetch(base + '/managed/')]);
    assert.deepEqual(starts.map((response) => response.status), [200, 200]);
    assert.deepEqual(await starts[0].json(), { starts: 1, path: '/managed/' });
    assert.deepEqual(await starts[1].json(), { starts: 1, path: '/managed/' });
    assert.deepEqual(await fetch(base + '/managed/').then((response) => response.json()), { starts: 1, path: '/managed/' });
    assert.equal(await fetch(base + '/__fixture/value').then((response) => response.text()), 'endpoint');
    assert.equal((await fetch(base + '/not-owned')).status, 404);
    assert.equal(panel.panel.runner.state().phase, 'idle'); assert.equal(panel.panel.jobs.list().length, 0);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('managed tool failure stays bounded and can retry without breaking the panel', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'managed-tool-error-')), workspace = path.join(root, 'integration'); await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'tools', 'broken.mjs'), `export async function createWorkspaceTool(){throw new Error('fixture failed')}`);
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'broken', label: 'Broken Tool', route: '/broken/', module: 'tools/broken.mjs' }] }));
  const port = await freePort(), panel = createServer({ workspace, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`; const failed = await fetch(base + '/broken/'); const page = await failed.text(); assert.equal(failed.status, 503);
    const state = await fetch(base + '/api/tools/broken/status').then((response) => response.json()); assert.match(state.error, /fixture failed/);
    assert.equal(failed.status, 503); assert.match(page, /role="alert"/); assert.match(page, /Retry/); assert.match(page, /design-system\.css/);
    assert.equal((await fetch(base + '/api/tools/broken/retry', { method: 'POST', headers: { Origin: 'https://example.test' } })).status, 403);
    assert.equal((await fetch(base + '/api/tools/broken/retry', { method: 'POST', headers: { Origin: base } })).status, 202);
    assert.equal((await fetch(base + '/api/ping')).status, 200);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('panel shutdown aborts an in-flight managed startup', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'managed-tool-shutdown-')), workspace = path.join(root, 'integration'); await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'tools', 'slow.mjs'), `export async function createWorkspaceTool(context){await new Promise((resolve,reject)=>{if(context.signal.aborted)return reject(new Error('cancelled'));context.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})});return{handle(){}}}`);
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'slow', label: 'Slow Tool', route: '/slow/', module: 'tools/slow.mjs' }] }));
  const port = await freePort(), panel = createServer({ workspace, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`, request = fetch(base + '/slow/');
    await waitFor(async () => (await fetch(base + '/api/tools/slow/status').then((response) => response.json())).state === 'starting');
    panel.server.closeIdleConnections(); const started = performance.now(); await panel.close(); assert.ok(performance.now() - started < 1_000);
    assert.equal((await request).status, 503);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('managed module realpath cannot escape through a workspace junction', async (t) => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'managed-tool-containment-')), workspace = path.join(root, 'integration'), outside = path.join(root, 'outside');
  await fs.mkdir(path.join(workspace, 'tools'), { recursive: true }); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'fixture.mjs'), `export async function createWorkspaceTool(){return{handle(){}}}`);
  try { await fs.symlink(outside, path.join(workspace, 'tools', 'linked'), 'junction'); } catch (error) { await fs.rm(root, { recursive: true, force: true }); t.skip(`junction unavailable: ${error}`); return; }
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'escape', label: 'Escape', route: '/escape/', module: 'tools/linked/fixture.mjs' }] }));
  const port = await freePort(), panel = createServer({ workspace, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`; assert.equal((await fetch(base + '/escape/')).status, 503);
    assert.match((await fetch(base + '/api/tools/escape/status').then((response) => response.json())).error, /escapes .*workspace/);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

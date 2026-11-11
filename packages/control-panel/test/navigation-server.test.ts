import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer, developerModeForLaunch } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { resolvePluginCatalog } from '../src/extension-catalog.ts';

// These fixtures test workspace-only navigation, not the presence/absence of shipped product tools.
async function workspaceToolsOnly(workspace: string) {
  const catalog = await resolvePluginCatalog(workspace, REPO, true);
  await fs.writeFile(path.join(workspace, 'xrb-plugins.json'), JSON.stringify({ disabled: catalog.plugins.filter(plugin => plugin.origin === 'bundled').map(plugin => plugin.key) }));
}

const parent = path.resolve(import.meta.dirname, '../../../.artifacts');
const waitFor = async (check: () => Promise<boolean>) => {
  const until = performance.now() + 3_000;
  while (performance.now() < until) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error('timed out');
};

test('developer navigation follows the explicit shortcut marker before workspace kind', () => {
  assert.equal(developerModeForLaunch('repository', 'repository'), true);
  assert.equal(developerModeForLaunch('user', 'repository'), false);
  assert.equal(developerModeForLaunch('auto', 'repository'), false);
  assert.equal(developerModeForLaunch(undefined, 'repository'), true, 'explicit repository CLI is the Dev equivalent');
  assert.equal(developerModeForLaunch(undefined, 'user'), false);
  assert.equal(developerModeForLaunch(undefined, 'explicit'), false);
});

test('only Dev navigation includes the reserved Design System entry without initializing storage', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'developer-navigation-')), repo = path.join(root, 'core'), workspace = path.join(root, 'absent');
  await fs.mkdir(repo);
  try {
    for (const developerMode of [false, true]) {
      const port = await freePort(), panel = createServer({ repo, workspace, port, developerMode });
      panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
      try {
        const data = await fetch(`http://127.0.0.1:${port}/api/navigation?developerMode=true&launch=repository`).then(response => response.json());
        const entry = data.tools.find((tool: {id: string}) => tool.id === 'design-system');
        assert.equal(!!entry, developerMode, 'browser query cannot enable the built-in entry');
        if (entry) { assert.equal(entry.label, 'Design'); assert.equal(entry.url, `http://127.0.0.1:${port}/design`); }
        assert.equal(panel.panel.jobs.list().length, 0);
        await assert.rejects(fs.stat(workspace), {code:'ENOENT'});
      } finally { await panel.close(); }
    }
  } finally { await fs.rm(root, {recursive:true,force:true}); }
});

test('navigation API reads only the selected integration workspace and starts nothing', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'navigation-http-')), workspace = path.join(root, 'integration'), projects = path.join(root, 'projects');
  await fs.mkdir(workspace); await fs.mkdir(projects); await workspaceToolsOnly(workspace);
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

test('Design short route and legacy redirect preserve queries without exposing a normal-user menu entry',async()=>{
  await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'design-route-'));
  const port=await freePort(),panel=createServer({workspace:root,port});panel.server.listen(port,'127.0.0.1');await once(panel.server,'listening');
  try{
    const base=`http://127.0.0.1:${port}`;
    for(const route of ['/design/','/design-system.html']){
      const response=await fetch(`${base}${route}?case=install-dependencies&state=partial`,{redirect:'manual'});
      assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/design?case=install-dependencies&state=partial');
    }
    const response=await fetch(base+'/design');assert.equal(response.status,200);assert.match(await response.text(),/<title>XR Build · Design<\/title>/);
    assert.equal((await fetch(base+'/design',{method:'POST',headers:{Origin:base}})).status,405);
    const navigation=await fetch(base+'/api/navigation').then(response=>response.json());assert.ok(!navigation.tools.some((tool:{id:string})=>tool.id==='design-system'));
  }finally{await panel.close();await fs.rm(root,{recursive:true,force:true});}
});

test('managed tool starts once on its panel route and owns only declared paths', async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'managed-tool-http-')), workspace = path.join(root, 'integration');
  await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
  await workspaceToolsOnly(workspace);
  await fs.writeFile(path.join(workspace, 'tools', 'fixture.mjs'), `let starts=0;export async function createWorkspaceTool(){starts++;return{handle(req,res,next){if(req.url.startsWith('/managed/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({starts,path:req.url}));return;}if(req.url.startsWith('/__fixture/')){res.end('endpoint');return;}next();}}}`);
  await fs.writeFile(path.join(workspace, 'xrb-tools.json'), JSON.stringify({ tools: [{ id: 'managed', label: 'Managed Tool', route: '/managed/', aliases: ['/old-managed/'], module: 'tools/fixture.mjs', endpoints: ['/__fixture/'] }] }));
  const port = await freePort(), panel = createServer({ workspace, port }); panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    const base = `http://127.0.0.1:${port}`, navigation = await fetch(base + '/api/navigation').then((response) => response.json());
    assert.deepEqual(navigation.tools, [{ id: 'managed', label: 'Managed Tool', route: '/managed/' }]);
    for (const [from,to] of [['/old-managed','/managed/'],['/old-managed/?source=test','/managed/?source=test'],['/old-managed/assets/example.js?x=1','/managed/assets/example.js?x=1']]) {
      const redirected=await fetch(base+from,{redirect:'manual'});assert.equal(redirected.status,302);assert.equal(redirected.headers.get('location'),to);
    }
    assert.equal((await fetch(base+'/old-managed/',{method:'HEAD',redirect:'manual'})).status,302);
    assert.equal((await fetch(base+'/old-managed/',{method:'POST',headers:{Origin:base},redirect:'manual'})).status,405);
    assert.equal((await fetch(base+'/api/tools/managed/status').then(response=>response.json())).state,'idle','aliases do not start a tool');
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
    assert.match((await fetch(base + '/api/tools/escape/status').then((response) => response.json())).error, /symbolic link or junction/);
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});

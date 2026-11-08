import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { DEFAULT_PORT, EXPLICIT_WORKSPACE_PORT, panelPort, shortcutWorkspace, workspaceDir } from '../src/env.ts';
import { checkRequest } from '../src/http.ts';
import { freePort } from '../src/host-runner.ts';
import { APP_NAME, autoRouteSelection, createServer, ensureAutoRouteTarget, launch, recoverStaleShortcutPanel, shortcutLaunchFromArgs, shortcutRecoveryPatterns, silentRestartInvocation, type PanelServer } from '../src/server.ts';
import { launchPreviewBrowser, Panel } from '../src/panel.ts';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

let repo: string;
let port: number;
let panel: PanelServer;

async function write(rel: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(path.join(repo, rel)), { recursive: true });
  await fs.writeFile(path.join(repo, rel), data);
}

/** Raw request with explicit headers (fetch would set Host and Origin itself). */
function request(method: string, urlPath: string, opts: { host?: string; origin?: string | null; body?: string | Buffer; type?: string } = {}) {
  return new Promise<{ status: number; body: string; json: any; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const headers: Record<string, string> = { host: opts.host ?? `127.0.0.1:${port}` };
    if (opts.origin !== null && (method !== 'GET' || opts.origin !== undefined)) headers.origin = opts.origin ?? `http://127.0.0.1:${port}`;
    if (opts.body !== undefined) headers['content-type'] = opts.type ?? 'application/json';
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json: any = null;
        try { json = JSON.parse(body); } catch { /* not JSON */ }
        resolve({ status: res.statusCode ?? 0, body, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

before(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-server-'));
  await write('projects/Apps/demo/xrb-project.json', JSON.stringify({ name: 'Demo', kind: 'app', entry: 'dist', platform: 'station', plugins: { station: { id: 'Demo', title: 'Demo', version: '0.1.0' } } }));
  await write('projects/Apps/demo/dist/index.html', '<h1>demo</h1>');
  await write('projects/Apps/demo/secret.txt', 'outside the entry folder');
  await write('projects/unsorted/plain/package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
  await write('projects/Tests/rig-check/xrb-project.json', JSON.stringify({ name: 'Rig check', kind: 'test', entry: '.' }));
  await write('projects/Tests/rig-check/index.html', 'rig');
  port = await freePort();
  const r = await launch({ port, open: false, workspace: repo });
  assert.equal(r.result, 'started');
  panel = r.server!;
  // Publication assertions read settled statuses; the non-blocking list has its own test.
  panel.panel.awaitPublicationStatus = true;
});

after(async () => {
  await panel.close();
});

test('launch prepares configured managed tools and their runtime before opening the browser',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'panel-tool-prepare-')),plugin=path.join(workspace,'plugins','fixture'),testPort=await freePort(),opened:string[]=[];await fs.mkdir(plugin,{recursive:true});await fs.writeFile(path.join(plugin,'xrb-plugin.json'),JSON.stringify({title:'Fixture',type:'plugin',version:'0.1.0',panel:{tools:[{id:'fixture',label:'Fixture',route:'/fixture/',module:'tool.mjs'}]}}));await fs.writeFile(path.join(plugin,'tool.mjs'),`export function createWorkspaceTool(){globalThis.__xrbFixtureRuntimeReady=true;return{handle(_req,res){res.end('ready')}}}`);
  const original=Panel.prototype.prepareManagedTools;let prepared=false;Panel.prototype.prepareManagedTools=async function(){await new Promise(resolve=>setTimeout(resolve,10));prepared=true;};let started:PanelServer|null=null;(globalThis as any).__xrbFixtureRuntimeReady=false;
  try{const result=await launch({port:testPort,open:true,workspace,browser:url=>{assert.equal(prepared,true);assert.equal((globalThis as any).__xrbFixtureRuntimeReady,true);opened.push(url);}});assert.equal(result.result,'started');started=result.server!;assert.equal(opened.length,1);assert.equal(await fetch(`http://127.0.0.1:${testPort}/fixture/`).then((response)=>response.text()),'ready');}finally{delete (globalThis as any).__xrbFixtureRuntimeReady;Panel.prototype.prepareManagedTools=original;await started?.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('managed tools share one dependency preparation at startup', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-tool-shared-'));
  const plugin = path.join(workspace, 'plugins', 'fixture'), testPort = await freePort();
  await fs.mkdir(plugin, { recursive: true });
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Fixture', type: 'plugin', version: '0.1.0', panel: { tools: [
    { id: 'first', label: 'First', route: '/first/', module: 'first.mjs' }, { id: 'second', label: 'Second', route: '/second/', module: 'second.mjs' },
  ] } }));
  await fs.writeFile(path.join(plugin, 'first.mjs'), `export function createWorkspaceTool(){return{handle(_req,res){res.end('first')}}}`);
  await fs.writeFile(path.join(plugin, 'second.mjs'), `export function createWorkspaceTool(){return{handle(_req,res){res.end('second')}}}`);
  const original = Panel.prototype.prepareManagedTools;
  let preparations = 0, started: PanelServer | null = null;
  Panel.prototype.prepareManagedTools = async () => { preparations += 1; await new Promise((resolve) => setTimeout(resolve, 10)); };
  try {
    const result = await launch({ port: testPort, open: false, workspace });
    assert.equal(result.result, 'started');
    started = result.server;
    assert.equal(preparations, 1);
    assert.equal(await fetch(`http://127.0.0.1:${testPort}/first/`).then((response) => response.text()), 'first');
    assert.equal(await fetch(`http://127.0.0.1:${testPort}/second/`).then((response) => response.text()), 'second');
  } finally {
    Panel.prototype.prepareManagedTools = original;
    await started?.close();
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('repository panels reconcile their workspace lock while explicit panels stay frozen', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-repository-workspace-'));
  try {
    assert.equal(createServer({ workspace, workspaceKind: 'repository' }).panel.bootstrapPackageLock, true);
    assert.equal(createServer({ workspace, workspaceKind: 'explicit' }).panel.bootstrapPackageLock, false);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('managed tool setup failure does not prevent panel startup', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-tool-failure-'));
  const plugin = path.join(workspace, 'plugins', 'fixture'), testPort = await freePort();
  await fs.mkdir(plugin, { recursive: true });
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Fixture', type: 'plugin', version: '0.1.0', panel: { tools: [{ id: 'fixture', label: 'Fixture', route: '/fixture/', module: 'tool.mjs' }] } }));
  const original = Panel.prototype.prepareManagedTools;
  let started: PanelServer | null = null;
  Panel.prototype.prepareManagedTools = async () => { throw new Error('workspace dependencies could not be installed'); };
  try {
    const result = await launch({ port: testPort, open: false, workspace });
    assert.equal(result.result, 'started');
    started = result.server;
    assert.equal((await fetch(`http://127.0.0.1:${testPort}/fixture/`)).status, 503);
  } finally {
    Panel.prototype.prepareManagedTools = original;
    await started?.close();
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('checkRequest: loopback Host, same-origin writes', () => {
  assert.equal(checkRequest('GET', { host: '127.0.0.1:5180' }, 5180), null);
  assert.equal(checkRequest('GET', { host: 'localhost:5180' }, 5180), null);
  assert.match(checkRequest('GET', { host: 'evil.example:5180' }, 5180)!, /not the panel/);
  assert.match(checkRequest('GET', { host: '127.0.0.1:80' }, 5180)!, /not the panel/);
  assert.equal(checkRequest('POST', { host: '127.0.0.1:5180', origin: 'http://127.0.0.1:5180' }, 5180), null);
  assert.match(checkRequest('POST', { host: '127.0.0.1:5180', origin: 'https://evil.example' }, 5180)!, /origin/);
  assert.match(checkRequest('PUT', { host: '127.0.0.1:5180' }, 5180)!, /origin/);
});

test('rejects a foreign Host and cross-origin writes over HTTP', async () => {
  assert.equal((await request('GET', '/api/ping', { host: 'rebind.example' })).status, 403);
  assert.equal((await request('POST', '/api/projects/create', { origin: 'https://evil.example', body: '{"id":"unsorted/plain"}' })).status, 403);
  assert.equal((await request('POST', '/api/projects/create', { origin: null, body: '{"id":"unsorted/plain"}' })).status, 403);
  await assert.rejects(fs.access(path.join(repo, 'projects/unsorted/plain/xrb-project.json')), 'nothing created');
});

test('browser previews use the project icon as their favicon', async () => {
  const page = await request('GET', '/preview/demo/');
  assert.equal(page.status, 200, page.body);
  assert.match(page.body, /<link rel="icon" type="image\/png" href="\.\/xrb-app-icon\.png\?v=[0-9a-f]{12}" data-xrb-app-icon>/);
  const icon = await fetch(`http://127.0.0.1:${port}/preview/demo/xrb-app-icon.png`);
  assert.equal(icon.status, 200);
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()).subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
});

test('remote-source publication endpoint is retired', async () => {
  assert.equal((await request('GET', '/api/remote-publications')).status, 404);
  assert.equal((await request('POST', '/api/remote-publications/production-web/ui-kit/publish', { body: '{}' })).status, 404);
});

test('deletes only named package ZIPs from builds', async () => {
  await write('builds/desktop/Demo App.zip', 'zip');
  const removed = await request('DELETE', '/api/packages/desktop/Demo%20App.zip');
  assert.equal(removed.status, 200, removed.body);
  await assert.rejects(fs.access(path.join(repo, 'builds/desktop/Demo App.zip')));
  assert.equal((await request('DELETE', '/api/packages/..%2Foutside.zip')).status, 404);
});

test('publication API delegates verified WebXR builds and confirms removal', async () => {
  const manifest = { name: 'Published', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' }, publication: { enabled: true, publisher: 'fixture', id: '11111111-1111-4111-8111-111111111111', slug: 'published' } };
  await write('projects/Apps/published/xrb-project.json', JSON.stringify(manifest));
  await write('projects/Apps/published/package.json', JSON.stringify({ scripts: { build: 'node build.mjs' } }));
  await write('projects/Apps/published/build.mjs', `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<h1>built automatically</h1>');`);
  await fs.mkdir(path.join(repo, 'node_modules'));
  await write('projects/Apps/published/dist/index.html', '<h1>stale</h1>');
  await write('plugins/fixture-publisher/xrb-plugin.json', JSON.stringify({ title: 'Publisher', type: 'publisher', version: '0.1.0' }));
  await write('plugins/fixture-publisher/package.json', JSON.stringify({ name: 'publisher', xrBuild: { publisher: './publisher.mjs' } }));
  await write('plugins/fixture-publisher/publisher.mjs', `import fs from 'node:fs/promises'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; const state=path.join(path.dirname(fileURLToPath(import.meta.url)),'state.json'); export const publisher={name:'fixture',origin:'https://example.test',routePrefix:'apps',validate(){return []},async status(p){const live=await fs.readFile(state,'utf8').then(JSON.parse,()=>null);const published=live?.id===p.id&&live?.slug===p.slug;return {state:published?'published':'unpublished',selectedUrl:'https://example.test/apps/'+p.slug+'/',deployedUrl:published?'https://example.test/apps/'+p.slug+'/':undefined}},async publish(o){const html=await fs.readFile(path.join(o.app,'index.html'),'utf8');if(!html.includes('data-xrb-app-icon'))throw new Error('published build has no project favicon');await fs.access(path.join(o.app,'xrb-app-icon.png'));await fs.writeFile(state,JSON.stringify(o.publication));o.log('published');return {url:'https://example.test/apps/'+o.publication.slug+'/'}},async unpublish(o){await fs.rm(state,{force:true});o.log('unpublished');return {}}};`);
  await write('plugins/publisher-two/xrb-plugin.json', JSON.stringify({ title: 'Publisher Two', type: 'publisher', version: '0.1.0' }));
  await write('plugins/publisher-two/package.json', JSON.stringify({ name: 'publisher-two', xrBuild: { publisher: './publisher.mjs' } }));
  await write('plugins/publisher-two/publisher.mjs', `import fs from 'node:fs/promises'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; const state=path.join(path.dirname(fileURLToPath(import.meta.url)),'state.json'); export const publisher={name:'fixture-two',origin:'https://second.example.test',routePrefix:'apps',validate(){return []},async status(p){const live=await fs.readFile(state,'utf8').then(JSON.parse,()=>null);const published=live?.id===p.id&&live?.slug===p.slug;return {state:published?'published':'unpublished',selectedUrl:'https://second.example.test/apps/'+p.slug+'/',deployedUrl:published?'https://second.example.test/apps/'+p.slug+'/':undefined}},async publish(o){await fs.writeFile(state,JSON.stringify(o.publication));o.log('published second');return {url:'https://second.example.test/apps/'+o.publication.slug+'/'}},async unpublish(o){await fs.rm(state,{force:true});o.log('unpublished second');return {}}};`);
  await panel.panel.loadPublishers();
  const started = await request('POST', '/api/projects/published/publish', { body: '{}' });
  assert.equal(started.status, 202);
  assert.equal(started.json.operation, 'publish');
  const published = await panel.panel.jobs.wait(panel.panel.jobs.get(started.json.id)!);
  assert.equal(published.state, 'done');
  assert.match(published.lines.join('\n'), /Building current source before publishing/);
  const publishedHtml = await fs.readFile(path.join(repo, 'projects/Apps/published/dist/index.html'), 'utf8');
  assert.match(publishedHtml, /data-xrb-app-icon/);
  assert.match(publishedHtml, /<h1>built automatically<\/h1>/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'plugins/fixture-publisher/state.json'), 'utf8')), { id: manifest.publication.id, slug: 'published' }, 'publisher plugins receive only the selected identity');
  const liveProject = (await request('GET', '/api/projects/published')).json;
  const liveMove = await request('PUT', '/api/projects/published/manifest', { body: JSON.stringify({ manifest: { ...liveProject.manifest, publication: { ...liveProject.manifest.publication, slug: 'published-moved' } }, mtimeMs: liveProject.manifestMtimeMs }) });
  assert.equal(liveMove.status, 409);
  assert.equal(liveMove.json.details.needsConfirm, 'publication-route');
  const routes = { fixture: 'published', 'fixture-two': 'published-two' };
  const selectSecond = await request('PUT', '/api/projects/published/manifest', { body: JSON.stringify({ manifest: { ...liveProject.manifest, publication: { ...liveProject.manifest.publication, publisher: 'fixture-two', slug: routes['fixture-two'], routes } }, mtimeMs: liveProject.manifestMtimeMs }) });
  assert.equal(selectSecond.status, 200, 'selecting another publisher is not a route move');
  assert.equal(selectSecond.json.manifest.publication.slug, 'published-two');
  assert.equal(selectSecond.json.publication.status.state, 'unpublished', 'the newly selected provider has its own Publish state');
  assert.equal(selectSecond.json.publicationDestinations.fixture.status.state, 'published');
  assert.equal(selectSecond.json.publicationDestinations['fixture-two'].status.state, 'unpublished');
  assert.equal(await fs.readFile(path.join(repo, 'plugins/fixture-publisher/state.json'), 'utf8').then(Boolean), true, 'the first deployment stays live');
  const preparedSecondProvider = await request('GET', '/preview/published/');
  assert.equal(preparedSecondProvider.status, 200, preparedSecondProvider.body);
  await write('projects/Apps/published/build.mjs', `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<h1>rebuilt from current source</h1>');`);
  const secondStarted = await request('POST', '/api/projects/published/publish', { body: '{}' });
  assert.equal(secondStarted.status, 202);
  await panel.panel.jobs.wait(panel.panel.jobs.get(secondStarted.json.id)!);
  assert.match(await fs.readFile(path.join(repo, 'projects/Apps/published/dist/index.html'), 'utf8'), /rebuilt from current source/, 'a valid old receipt cannot skip source changed since the prior publication');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'plugins/publisher-two/state.json'), 'utf8')), { id: manifest.publication.id, slug: 'published-two' }, 'the second provider keeps its own slug without editor route metadata');
  const secondProject = (await request('GET', '/api/projects/published')).json;
  assert.equal(secondProject.publicationDestinations.fixture.status.state, 'published');
  assert.equal(secondProject.publicationDestinations['fixture-two'].status.state, 'published', 'all simultaneous deployments are described for the Build list');
  const selectFirst = await request('PUT', '/api/projects/published/manifest', { body: JSON.stringify({ manifest: { ...secondProject.manifest, publication: { ...secondProject.manifest.publication, publisher: 'fixture', slug: secondProject.manifest.publication.routes.fixture } }, mtimeMs: secondProject.manifestMtimeMs }) });
  assert.equal(selectFirst.status, 200);
  assert.equal(selectFirst.json.manifest.publication.slug, 'published', 'switching back restores the first provider slug');
  assert.equal(selectFirst.json.publication.status.state, 'published', 'switching back restores the first provider Unpublish state');
  assert.equal((await request('POST', '/api/projects/published/unpublish', { body: '{}' })).status, 409);
  const removed = await request('POST', '/api/projects/published/unpublish', { body: '{"confirm":true}' });
  assert.equal(removed.status, 202);
  assert.equal(removed.json.operation, 'unpublish');
  await panel.panel.jobs.wait(panel.panel.jobs.get(removed.json.id)!);
  await assert.rejects(fs.access(path.join(repo, 'plugins/fixture-publisher/state.json')));
  assert.equal(await fs.readFile(path.join(repo, 'plugins/publisher-two/state.json'), 'utf8').then(Boolean), true, 'unpublishing one provider preserves the other');
  const unpublishedProject = (await request('GET', '/api/projects/published')).json;
  const freeMove = await request('PUT', '/api/projects/published/manifest', { body: JSON.stringify({ manifest: { ...unpublishedProject.manifest, publication: { ...unpublishedProject.manifest.publication, slug: 'published-moved' } }, mtimeMs: unpublishedProject.manifestMtimeMs }) });
  assert.equal(freeMove.status, 200);
  assert.equal(freeMove.json.manifest.publication.slug, 'published-moved');
  const rootMove = await request('PUT', '/api/projects/published/manifest', { body: JSON.stringify({ manifest: { ...freeMove.json.manifest, publication: { ...freeMove.json.manifest.publication, slug: '', routes: { ...freeMove.json.manifest.publication.routes, fixture: '' } } }, mtimeMs: freeMove.json.manifestMtimeMs }) });
  assert.equal(rootMove.status, 200);
  assert.equal(rootMove.json.manifest.publication.slug, '', 'an empty slug is preserved as the publisher root');
  assert.equal(rootMove.json.publication.status.selectedUrl, 'https://example.test/apps/');
  const rootStarted = await request('POST', '/api/projects/published/publish', { body: '{}' });
  assert.equal(rootStarted.status, 202);
  await panel.panel.jobs.wait(panel.panel.jobs.get(rootStarted.json.id)!);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'plugins/fixture-publisher/state.json'), 'utf8')), { id: manifest.publication.id, slug: '' });
});

test('publication actions and status ignore package targets while preserving manifest selections', async () => {
  const original = panel.panel.publishers, live = new Set<string>();
  panel.panel.publishers = { found: [{ dir: repo, publisher: {
    name: 'independent', origin: 'https://example.test', routePrefix: 'apps', validate: () => [],
    status: async p => ({ state: live.has(p.id) ? 'published' : 'unpublished', selectedUrl: '', deployedSlug: p.slug, ...(live.has(p.id) ? { deployedUrl: `https://example.test/apps/${p.slug}/` } : {}) }),
    publish: async o => { live.add(o.publication.id); return {}; },
    unpublish: async o => { live.delete(o.publication.id); return {}; },
  } }], problems: [] };
  try {
    let sequence = 0;
    for (const target of [undefined, 'host', 'webxr']) for (const platform of [undefined, 'station-fixture']) {
      const id = `independent-${++sequence}`;
      const manifest = { name: id, kind: 'app', entry: 'dist', target, platform,
        publication: { enabled: true, publisher: 'independent', id: `44444444-4444-4444-8444-44444444444${sequence}`, slug: id } };
      await write(`projects/Apps/${id}/xrb-project.json`, JSON.stringify(manifest));
      await write(`projects/Apps/${id}/dist/index.html`, '<title>Publication fixture</title>');
      assert.equal((await request('GET', `/preview/${id}/`)).status, 200, 'record a successful fixture build');
      const started = await request('POST', `/api/projects/${id}/publish`, { body: '{}' });
      assert.equal(started.status, 202, started.body);
      assert.equal((await panel.panel.jobs.wait(panel.panel.jobs.get(started.json.id)!)).state, 'done');
      const published = (await request('GET', `/api/projects/${id}`)).json;
      assert.equal(published.publication.available, true);
      assert.equal(published.publication.status.state, 'published');
      assert.equal(published.publicationDestinations.independent.status.state, 'published');
      assert.deepEqual(published.manifest, JSON.parse(JSON.stringify(manifest)), 'publish does not switch target/platform');
      assert.equal((await request('POST', `/api/projects/${id}/unpublish`, { body: '{}' })).status, 409);
      const removed = await request('POST', `/api/projects/${id}/unpublish`, { body: '{"confirm":true}' });
      assert.equal(removed.status, 202, removed.body);
      assert.equal((await panel.panel.jobs.wait(panel.panel.jobs.get(removed.json.id)!)).state, 'done');
      const unpublished = (await request('GET', `/api/projects/${id}`)).json;
      assert.equal(unpublished.publication.status.state, 'unpublished');
      assert.deepEqual(unpublished.manifest, JSON.parse(JSON.stringify(manifest)));
    }
    await write('projects/Apps/non-publishable/xrb-project.json', JSON.stringify({ name: 'Test fixture', kind: 'test', publication: { publisher: 'independent', enabled: true, id: '44444444-4444-4444-8444-444444444449', slug: 'test-fixture' } }));
    assert.equal((await request('POST', '/api/projects/non-publishable/publish', { body: '{}' })).status, 409);
  } finally {
    panel.panel.publishers = original;
    for (const id of [...Array.from({ length: 6 }, (_, i) => `independent-${i + 1}`), 'non-publishable'])
      await fs.rm(path.join(repo, 'projects/Apps', id), { recursive: true, force: true });
  }
});

test('simultaneous publication requests queue and each publishes its finalized project favicon', async () => {
  const firstManifest = { name: 'Queue First', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' }, icon: 'icon.png',
    publication: { enabled: true, publisher: 'queue-fixture', id: '22222222-2222-4222-8222-222222222221', slug: 'queue-first' } };
  const secondManifest = { name: 'Queue Second', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' }, icon: 'icon.png',
    publication: { enabled: true, publisher: 'queue-fixture', id: '22222222-2222-4222-8222-222222222222', slug: 'queue-second' } };
  for (const [folder, manifest, marker] of [['queue-first', firstManifest, 'first'], ['queue-second', secondManifest, 'second']] as const) {
    await write(`projects/Apps/${folder}/xrb-project.json`, JSON.stringify(manifest));
    await write(`projects/Apps/${folder}/package.json`, JSON.stringify({ scripts: { build: 'node build.mjs' } }));
    await write(`projects/Apps/${folder}/build.mjs`, `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<title>${marker}</title>');`);
    await write(`projects/Apps/${folder}/icon.png`, Buffer.concat([PNG, Buffer.from(marker)]));
  }
  await fs.mkdir(path.join(repo, 'node_modules'), { recursive: true });
  const preparedSecond = await request('GET', '/preview/queue-second/');
  assert.equal(preparedSecond.status, 200, preparedSecond.body);
  await write('projects/Apps/queue-second/build.mjs', `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<title>second-current</title>');`);
  const original = panel.panel.publishers;
  const order: string[] = [];
  const publishedIcons = new Map<string, Buffer>();
  let releaseFirst!: () => void;
  let reachedFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const firstReached = new Promise<void>((resolve) => (reachedFirst = resolve));
  panel.panel.publishers = { found: [{ dir: repo, publisher: {
    name: 'queue-fixture', origin: 'https://example.test', routePrefix: 'apps', validate: () => [],
    status: async (publication) => ({ state: 'unpublished' as const, selectedUrl: `https://example.test/apps/${publication.slug}/` }),
    async publish(options) {
      order.push(`${options.publication.slug}:start`);
      const html = await fs.readFile(path.join(options.app, 'index.html'), 'utf8');
      assert.match(html, /<link rel="icon" type="image\/png" href="\.\/xrb-app-icon\.png\?v=[0-9a-f]{12}" data-xrb-app-icon>/);
      if (options.publication.slug === 'queue-second') assert.match(html, /second-current/, 'a queued publish rebuilds source changed after a valid receipt');
      publishedIcons.set(options.publication.slug, await fs.readFile(path.join(options.app, 'xrb-app-icon.png')));
      if (options.publication.slug === 'queue-first') { reachedFirst(); await firstGate; }
      order.push(`${options.publication.slug}:end`);
      return { url: `https://example.test/apps/${options.publication.slug}/` };
    },
    async unpublish() { return {}; },
  } }], problems: [] };
  try {
    const first = await request('POST', '/api/projects/queue-first/publish', { body: '{}' });
    const second = await request('POST', '/api/projects/queue-second/publish', { body: '{}' });
    assert.equal(first.status, 202, first.body);
    assert.equal(second.status, 202, second.body);
    assert.equal(first.json.state, 'running');
    assert.equal(second.json.state, 'queued');
    assert.deepEqual(second.json.publication, secondManifest.publication);
    await firstReached;
    assert.equal(panel.panel.jobs.get(second.json.id)?.state, 'queued');
    releaseFirst();
    await Promise.all([first.json.id, second.json.id].map((id) => panel.panel.jobs.wait(panel.panel.jobs.get(id)!)));
    assert.deepEqual(order, ['queue-first:start', 'queue-first:end', 'queue-second:start', 'queue-second:end']);
    assert.deepEqual(publishedIcons.get('queue-first'), await fs.readFile(path.join(repo, 'projects/Apps/queue-first/icon.png')));
    assert.deepEqual(publishedIcons.get('queue-second'), await fs.readFile(path.join(repo, 'projects/Apps/queue-second/icon.png')));
  } finally {
    releaseFirst();
    panel.panel.publishers = original;
    await Promise.all(['queue-first', 'queue-second'].map((folder) => fs.rm(path.join(repo, 'projects/Apps', folder), { recursive: true, force: true })));
  }
});

test('a failed forced publication build never calls the publisher', async () => {
  const folder = 'publish-build-failure';
  const manifest = { name: 'Publish failure', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' },
    publication: { enabled: true, publisher: 'failure-fixture', id: '33333333-3333-4333-8333-333333333333', slug: 'publish-failure' } };
  await write(`projects/Apps/${folder}/xrb-project.json`, JSON.stringify(manifest));
  await write(`projects/Apps/${folder}/package.json`, JSON.stringify({ scripts: { build: 'node build.mjs' } }));
  await write(`projects/Apps/${folder}/build.mjs`, 'process.exit(3);');
  const original = panel.panel.publishers;
  let calls = 0;
  panel.panel.publishers = { found: [{ dir: repo, publisher: {
    name: 'failure-fixture', origin: 'https://example.test', routePrefix: 'apps', validate: () => [],
    status: async () => ({ state: 'unpublished' as const, selectedUrl: 'https://example.test/apps/publish-failure/' }),
    async publish() { calls += 1; return {}; }, async unpublish() { return {}; },
  } }], problems: [] };
  try {
    const started = await request('POST', `/api/projects/${folder}/publish`, { body: '{}' });
    assert.equal(started.status, 202, started.body);
    const done = await panel.panel.jobs.wait(panel.panel.jobs.get(started.json.id)!);
    assert.equal(done.state, 'failed');
    assert.match(done.error ?? '', /exit code 3/);
    assert.equal(calls, 0);
  } finally {
    panel.panel.publishers = original;
    await fs.rm(path.join(repo, 'projects/Apps', folder), { recursive: true, force: true });
  }
});

test('package setup checks tools before building, requires consent, streams logs and retries safely', async () => {
  await write('projects/Apps/setup-demo/xrb-project.json', JSON.stringify({ name: 'Setup demo', kind: 'app', target: 'webxr', platform: 'setup-fixture', entry: 'dist' }));
  await write('projects/Apps/setup-demo/dist/index.html', '<h1>ready</h1>');
  let ready = false;
  let installs = 0;
  let builds = 0;
  let fail = false;
  let remainMissing = false;
  let release: (() => void) | null = null;
  const original = panel.panel.packagers;
  panel.panel.packagers = { ...original, found: [...original.found, { dir: repo, packager: {
    name: 'setup-fixture', target: 'webxr', identityFields: [], validate: () => [],
    async setupStatus() { return ready ? { state: 'ready' as const } : { state: 'setup-required' as const, reason: 'install tools', termsUrl: 'https://example.test/terms' }; },
    async setup({ log, acceptTerms }) {
      installs += 1;
      assert.equal(acceptTerms, true);
      log('installing tools');
      if (fail) throw new Error('download failed');
      await new Promise<void>((resolve) => { release = resolve; });
      ready = !remainMissing;
      log('tools installed');
    },
    async build({ out }) {
      builds += 1;
      const file = path.join(out, 'setup-fixture.apk');
      await fs.mkdir(out, { recursive: true });
      await fs.writeFile(file, 'fixture');
      return { file, sizeBytes: 7 };
    },
  } }] };
  const root = '/api/projects/setup-demo';
  try {
    assert.equal((await request('GET', `${root}/package/setup-status`)).json.state, 'setup-required');
    assert.equal((await request('GET', `${root}`)).json.packaging.setupSupported, true);
    const fixturePackager = panel.panel.packagers.found.at(-1)!.packager;
    const originalStatus = fixturePackager.setupStatus!;
    fixturePackager.setupStatus = async () => { throw new Error('private toolchain details'); };
    assert.deepEqual((await request('GET', `${root}/package/setup-status`)).json, { state: 'unavailable', reason: 'Could not check packaging prerequisites. Try again later.' });
    assert.equal((await request('POST', `${root}/package`, { body: '{}' })).json.details.needsSetup, 'unavailable');
    fixturePackager.setupStatus = async () => ({ state: 'setup-required', termsUrl: 'http://insecure.test/terms' });
    assert.equal((await request('GET', `${root}/package/setup-status`)).json.state, 'unavailable', 'invalid terms are not offered to the panel');
    fixturePackager.setupStatus = originalStatus;
    assert.equal((await request('POST', `${root}/package`, { body: '{}' })).json.details.needsSetup, 'setup-required');
    assert.equal((await request('POST', `${root}/package-setup`, { body: '{}' })).status, 409, 'terms require explicit consent');
    assert.equal((await request('POST', `${root}/package-setup`, { body: '{"acceptTerms":"yes"}' })).status, 400);
    assert.equal(installs, 0);
    assert.equal(builds, 0);
    fail = true;
    const broken = await request('POST', `${root}/package-setup`, { body: '{"acceptTerms":true}' });
    assert.equal(broken.status, 202);
    const failed = await panel.panel.jobs.wait(panel.panel.jobs.get(broken.json.id)!);
    assert.equal(failed.state, 'failed');
    assert.match(failed.lines.join('\n'), /installing tools[\s\S]*download failed/);
    fail = false;
    remainMissing = true;
    const incomplete = await request('POST', `${root}/package-setup`, { body: '{"acceptTerms":true}' });
    assert.equal(incomplete.status, 202);
    release?.();
    assert.equal((await panel.panel.jobs.wait(panel.panel.jobs.get(incomplete.json.id)!)).state, 'failed', 'successful installer return still requires a ready status');
    assert.equal((await request('GET', `${root}/package/setup-status`)).json.state, 'setup-required');
    remainMissing = false;
    const started = await request('POST', `${root}/package-setup`, { body: '{"acceptTerms":true}' });
    assert.equal(started.status, 202);
    assert.equal((await request('GET', '/api/jobs')).json.jobs.find((j: any) => j.id === started.json.id)?.state, 'running', 'reopened panels can restore the live setup job');
    assert.equal((await request('POST', `${root}/package-setup`, { body: '{"acceptTerms":true}' })).status, 409, 'no parallel setup');
    ready = true; // Even if another caller sees ready, an active setup must exclude package builds.
    assert.equal((await request('POST', `${root}/package`, { body: '{}' })).status, 409);
    release?.();
    const completed = await panel.panel.jobs.wait(panel.panel.jobs.get(started.json.id)!);
    assert.equal(completed.state, 'done');
    assert.match(completed.lines.join('\n'), /tools installed[\s\S]*Package tools are ready/);
    assert.equal((await request('GET', `${root}/package/setup-status`)).json.state, 'ready');
    assert.equal(installs, 3);
    assert.equal(builds, 0, 'setup never packages automatically');
    const built = await request('POST', `${root}/package`, { body: '{}' });
    assert.equal(built.status, 202, built.body);
    assert.equal((await panel.panel.jobs.wait(panel.panel.jobs.get(built.json.id)!)).state, 'done');
    assert.equal(builds, 1);
    assert.equal((await request('POST', `${root}/package-setup`, { body: '{}' })).status, 409, 'ready toolchain cannot be reinstalled');
  } finally {
    release?.();
    panel.panel.packagers = original;
    await fs.rm(path.join(repo, 'projects/Apps/setup-demo'), { recursive: true, force: true });
  }
});

test('auto routing re-evaluates the selected workspace without mutating the current panel', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-auto-refresh-'));
  const home = path.join(root, 'home');
  const user = path.join(home, '.xrbuild');
  const checkout = path.join(root, 'checkout');
  const dev = path.join(checkout, '.xrbuild');
  const env = { USERPROFILE: home };
  await fs.mkdir(dev, { recursive: true });
  try {
    const ordinaryBeforeSetup = autoRouteSelection(env, checkout);
    assert.deepEqual(ordinaryBeforeSetup, { workspace: user, projects: user, port: DEFAULT_PORT, kind: 'user' });
    await fs.mkdir(user, { recursive: true });
    const ordinary = autoRouteSelection(env, checkout);
    assert.deepEqual(ordinary, ordinaryBeforeSetup);
    const repository = { workspace: dev, projects: dev, port: EXPLICIT_WORKSPACE_PORT, kind: 'repository' as const };
    let starts = 0;
    let probes = 0;
    const destination = await ensureAutoRouteTarget(
      { workspace: repository.workspace, projects: repository.projects, port: repository.port }, ordinary,
      { start: () => { starts += 1; }, probe: async () => ++probes === 1 ? { state: 'free' } : { state: 'panel', workspace: user, projects: user }, timeoutMs: 500 },
    );
    assert.equal(destination, `http://127.0.0.1:${DEFAULT_PORT}/`);
    assert.equal(starts, 1);
    assert.equal(await ensureAutoRouteTarget(
      { workspace: ordinary.workspace, projects: ordinary.projects, port: ordinary.port }, ordinary,
      { start: () => { throw new Error('must not start'); } },
    ), null);
    await assert.rejects(ensureAutoRouteTarget(
      { workspace: repository.workspace, projects: repository.projects, port: repository.port }, ordinary,
      { start: () => {}, probe: async () => ({ state: 'panel', workspace: dev, projects: dev }) },
    ), /does not serve the selected workspace/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('auto-routed document refresh redirects to the newly selected panel root', async () => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-auto-source-'));
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-auto-target-'));
  const sourcePort = await freePort();
  const targetPort = await freePort();
  const selection = { workspace: target, projects: target, port: targetPort, kind: 'user' as const };
  const started = await launch({ port: sourcePort, open: false, workspace: source, workspaceKind: 'repository',
    autoRoute: { select: () => selection, probe: async () => ({ state: 'panel', workspace: target, projects: target }), start: () => { throw new Error('already running'); } } });
  assert.equal(started.result, 'started');
  try {
    const response = await fetch(`http://127.0.0.1:${sourcePort}/`, { headers: { 'sec-fetch-dest': 'document' }, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `http://127.0.0.1:${targetPort}/`);
    assert.equal((await fetch(`http://127.0.0.1:${sourcePort}/preview/missing/`, { headers: { 'sec-fetch-dest': 'document' }, redirect: 'manual' })).status, 404, 'app previews are not auto-route navigation');
    assert.equal((await fetch(`http://127.0.0.1:${sourcePort}/api/workspace`).then((r) => r.json()) as any).path, source, 'the current server stays on its workspace');
  } finally {
    await started.server?.close();
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(target, { recursive: true, force: true });
  }
});

test('auto routes serve only the selected workspace and keep separate defaults', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-auto-live-'));
  const home = path.join(root, 'home');
  const user = path.join(home, '.xrbuild');
  const checkout = path.join(root, 'checkout');
  const dev = path.join(checkout, '.xrbuild');
  const env = { USERPROFILE: home };
  await fs.mkdir(dev, { recursive: true });
  try {
    for (const hasUser of [false, true]) {
      if (hasUser) await fs.mkdir(user, { recursive: true }); // Exists but is not initialized.
      const selected = shortcutWorkspace(env, checkout);
      assert.equal(selected, undefined);
      assert.equal(panelPort(selected, env), DEFAULT_PORT);
      assert.equal(panelPort(selected, { ...env, XRB_PANEL_PORT: '5192' }), 5192);
      const chosen = selected ?? workspaceDir(env);
      const livePort = await freePort(); // Avoid altering a real panel on 5180 or 5181.
      const opened: string[] = [];
      const started = await launch({ port: livePort, open: false, workspace: chosen });
      assert.equal(started.result, 'started');
      try {
        assert.equal((await fetch(`http://127.0.0.1:${livePort}/api/ping`).then((r) => r.json())).workspace, chosen);
        assert.equal((await fetch(`http://127.0.0.1:${livePort}/api/workspace`).then((r) => r.json())).exists, false, 'missing and empty user roots stay in workspace setup');
        const reused = await launch({ port: livePort, open: true, workspace: chosen, browser: (u) => opened.push(u) });
        assert.equal(reused.result, 'already-running');
        const refused = await launch({ port: livePort, open: true, workspace: dev, browser: (u) => opened.push(u) });
        assert.equal(refused.result, 'workspace-mismatch');
        assert.deepEqual(opened, [`http://127.0.0.1:${livePort}/`]);
        assert.equal((await fetch(`http://127.0.0.1:${livePort}/api/ping`).then((r) => r.json())).workspace, chosen);
      } finally {
        await started.server?.close();
      }
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a second start finds the running panel and only opens the browser', async () => {
  const opened: string[] = [];
  const r = await launch({ port, open: true, workspace: repo, browser: (u) => opened.push(u), shortcutRecovery: {
    marker: 'user', find: async () => { throw new Error('healthy panel must not be recovered'); },
  } });
  assert.equal(r.result, 'already-running');
  assert.deepEqual(opened, [`http://127.0.0.1:${port}/`]);
});

test('shortcut recovery replaces only a nonresponsive marked listener', async () => {
  const recoveryPort = await freePort();
  const holder = http.createServer((_req, res) => res.end('not a panel'));
  await new Promise<void>((resolve) => holder.listen(recoveryPort, '127.0.0.1', resolve));
  let found = 0, stopped = 0;
  let started: PanelServer | null = null;
  try {
    const result = await launch({
      port: recoveryPort, open: false, workspace: repo,
      shortcutRecovery: {
        marker: 'auto', timeoutMs: 500,
        find: async (p, marker) => { found += 1; assert.equal(p, recoveryPort); assert.equal(marker, 'auto'); return 4242; },
        stop: async (pid) => { stopped += 1; assert.equal(pid, 4242); await new Promise<void>((resolve, reject) => holder.close((error) => error ? reject(error) : resolve())); },
      },
    });
    assert.equal(result.result, 'started');
    started = result.server;
    assert.equal(found, 1);
    assert.equal(stopped, 1);
  } finally {
    await started?.close();
    if (holder.listening) await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('shortcut recovery leaves an unverified port owner alone', async () => {
  const recoveryPort = await freePort();
  const holder = http.createServer((_req, res) => res.end('not a panel'));
  await new Promise<void>((resolve) => holder.listen(recoveryPort, '127.0.0.1', resolve));
  let stopped = false;
  try {
    const result = await launch({ port: recoveryPort, open: false, workspace: repo, shortcutRecovery: {
      marker: 'auto', find: async () => null, stop: async () => { stopped = true; },
    } });
    assert.equal(result.result, 'port-taken');
    assert.equal(stopped, false);
    assert.equal(holder.listening, true);
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('shortcut recovery times out without starting a competing server', async () => {
  let stopped = false;
  const recovered = await recoverStaleShortcutPanel(5199, {
    marker: 'user', find: async () => 77, stop: async () => { stopped = true; },
    probe: async () => ({ state: 'other' }), timeoutMs: 15, intervalMs: 1,
  });
  assert.equal(recovered, false);
  assert.equal(stopped, true);
});

test('shortcut launch markers are explicit and validated', () => {
  assert.equal(shortcutLaunchFromArgs([]), undefined);
  assert.equal(shortcutLaunchFromArgs(['--shortcut-launch=user']), 'user');
  assert.equal(shortcutLaunchFromArgs(['--shortcut-launch=repository']), 'repository');
  assert.equal(shortcutLaunchFromArgs(['--shortcut-launch=auto']), 'auto');
  assert.deepEqual(shortcutRecoveryPatterns('user'), { marker: '(?<!\\S)--shortcut-launch=user(?!\\S)', legacy: undefined });
  assert.deepEqual(shortcutRecoveryPatterns('auto'), { marker: '(?<!\\S)--shortcut-launch=auto(?!\\S)', legacy: '(?<!\\S)--auto-workspace(?!\\S)' });
  assert.deepEqual(shortcutRecoveryPatterns('repository'), { marker: '(?<!\\S)--shortcut-launch=repository(?!\\S)', legacy: '(?<!\\S)--workspace=\\.xrbuild(?!\\S)' });
  assert.throws(() => shortcutLaunchFromArgs(['--shortcut-launch']), /requires --shortcut-launch=<mode>/);
  assert.throws(() => shortcutLaunchFromArgs(['--shortcut-launch=other']), /must be user, repository, or auto/);
  assert.throws(() => shortcutLaunchFromArgs(['--shortcut-launch=user', '--shortcut-launch=auto']), /only once/);
});

test('a second start never opens a panel running another workspace', async () => {
  const opened: string[] = [];
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-other-workspace-'));
  const r = await launch({ port, open: true, workspace: other, browser: (u) => opened.push(u), shortcutRecovery: {
    marker: 'repository', find: async () => { throw new Error('another workspace must not be recovered'); },
  } });
  assert.equal(r.result, 'workspace-mismatch');
  assert.deepEqual(opened, []);
});

test('a panel with no workspace identity is not reused', async () => {
  const otherPort = await freePort();
  const stub = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ app: APP_NAME }));
  });
  await new Promise<void>((resolve) => stub.listen(otherPort, '127.0.0.1', resolve));
  try {
    const opened: string[] = [];
    const result = await launch({ port: otherPort, open: true, workspace: repo, browser: (url) => opened.push(url) });
    assert.equal(result.result, 'workspace-mismatch');
    assert.deepEqual(opened, []);
  } finally {
    await new Promise<void>((resolve, reject) => stub.close((error) => error ? reject(error) : resolve()));
  }
});

test('different workspace panels on separate ports stay independent', async () => {
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-parallel-workspace-'));
  const otherPort = await freePort();
  const opened: string[] = [];
  let second: PanelServer | null = null;
  try {
    const started = await launch({ port: otherPort, open: true, workspace: other, browser: (u) => opened.push(u) });
    assert.equal(started.result, 'started');
    second = started.server;
    assert.equal((await request('GET', '/api/ping')).json.workspace, repo);
    assert.equal((await fetch(`http://127.0.0.1:${otherPort}/api/ping`).then((r) => r.json())).workspace, other);
    const reused = await launch({ port: otherPort, open: true, workspace: other, browser: (u) => opened.push(u) });
    assert.equal(reused.result, 'already-running');
    const mismatch = await launch({ port: otherPort, open: true, workspace: repo, browser: (u) => opened.push(u) });
    assert.equal(mismatch.result, 'workspace-mismatch');
    assert.deepEqual(opened, [`http://127.0.0.1:${otherPort}/`, `http://127.0.0.1:${otherPort}/`]);
    assert.equal((await request('GET', '/api/ping')).json.workspace, repo);
  } finally {
    await second?.close();
    await fs.rm(other, { recursive: true, force: true });
  }
});

test('lists projects and unregistered apps', async () => {
  const r = await request('GET', '/api/projects');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.projects.filter((p: any) => !p.readOnly).map((p: any) => p.id), ['demo', 'published', 'rig-check']);
  assert.ok(r.json.projects.filter((p: any) => p.readOnly).every((p: any) => p.id.startsWith('bundled:')));
  const demo = r.json.projects.find((p: any) => p.id === 'demo');
  assert.equal(demo.entryExists, true);
  assert.equal(demo.icon.custom, false);
  assert.deepEqual(r.json.unregistered, ['unsorted/plain']);
});

test('serves the icon preview page with three.js and the SDK icon modules as browser JS', async () => {
  const page = await request('GET', '/icon-preview.html');
  assert.equal(page.status, 200);
  assert.match(page.body, /"three": "\/vendor\/three\.module\.js"/);
  const three = await request('GET', '/vendor/three.module.js');
  assert.equal(three.status, 200);
  assert.match(three.body, /REVISION/);
  const stage = await request('GET', '/sdk/icon-object.js');
  assert.equal(stage.status, 200);
  assert.match(stage.body, /export class IconStage/);
  assert.doesNotMatch(stage.body, /: THREE\.Object3D\)/, 'types stripped');
  assert.equal((await request('GET', '/sdk/index.js')).status, 404, 'only the icon modules');
});

test('reports the 3D icon of a build that has icon.js, served from the preview route', async () => {
  const model = async () => (await request('GET', '/api/projects/demo')).json.icon.model;
  assert.equal(await model(), null, 'no icon.js: no model');
  await write('projects/Apps/demo/dist/icon.js', 'export default () => null;');
  try {
    assert.equal(await model(), '/preview/demo/icon.js');
    const served = await request('GET', '/preview/demo/icon.js');
    assert.equal(served.status, 200);
    assert.match(served.body, /export default/);
  } finally {
    await fs.rm(path.join(repo, 'projects/Apps/demo/dist/icon.js'));
  }
});

test('saves settings, refuses invalid ones per field and stale ones', async () => {
  const p = (await request('GET', '/api/projects/demo')).json;
  const manifest = { ...p.manifest, plugins: { station: { ...p.manifest.plugins.station, id: 'Demo App', title: 'Demo App' } } };
  const bad = await request('PUT', '/api/projects/demo/manifest', { body: JSON.stringify({ manifest: { ...manifest, plugins: { station: { ...manifest.plugins.station, version: 'v1-beta' } } }, mtimeMs: p.manifestMtimeMs }) });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.fields.map((f: any) => f.field), ['plugins.station.version']);
  const ok = await request('PUT', '/api/projects/demo/manifest', { body: JSON.stringify({ manifest, mtimeMs: p.manifestMtimeMs }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.manifest.plugins.station.id, 'Demo App');
  const stale = await request('PUT', '/api/projects/demo/manifest', { body: JSON.stringify({ manifest, mtimeMs: p.manifestMtimeMs }) });
  assert.equal(stale.status, 409);
});

test('saves multiple input methods and rejects duplicate providers', async () => {
  const p = (await request('GET', '/api/projects/demo')).json;
  const manifest = { ...p.manifest, inputs: ['mouse', 'keyboard', 'tracker', 'simulated'] };
  delete manifest.input;
  const ok = await request('PUT', '/api/projects/demo/manifest', { body: JSON.stringify({ manifest, mtimeMs: p.manifestMtimeMs }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.manifest.inputs, manifest.inputs);
  const invalid = await request('PUT', '/api/projects/demo/manifest', { body: JSON.stringify({ manifest: { ...manifest, inputs: ['mouse', 'mouse'] }, mtimeMs: ok.json.manifestMtimeMs }) });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.json.fields.map((f: any) => f.field), ['inputs']);
});

test('creates a manifest for an app folder without one', async () => {
  const r = await request('POST', '/api/projects/create', { body: JSON.stringify({ id: 'unsorted/plain' }) });
  assert.equal(r.status, 200);
  assert.equal(r.json.manifest.kind, 'app');
  assert.equal((await request('POST', '/api/projects/create', { body: JSON.stringify({ id: 'unsorted/plain' }) })).status, 400, 'only once');
});

test('serves a project entry folder for the icon studio, nothing outside it', async () => {
  const r = await request('GET', '/preview/demo/');
  assert.equal(r.status, 200);
  assert.match(r.body, /data-xrb-app-icon/);
  assert.match(r.body, /<h1>demo<\/h1>/);
  // The URL parser already folds %2e%2e segments (404: no such project); encoded backslashes
  // reach the static server, which refuses them (403). Either way nothing is served.
  for (const p of ['/preview/demo/%2e%2e/secret.txt', '/preview/demo/..%5csecret.txt', '/preview/demo/%2e%2e%5csecret.txt']) {
    const r = await request('GET', p);
    assert.ok(r.status === 403 || r.status === 404, `${p}: ${r.status}`);
    assert.notEqual(r.body, 'outside the entry folder');
  }
  assert.equal((await request('GET', '/preview/nope/')).status, 404);
});

test('icon upload: PNG only, written to the project and recorded in the manifest', async () => {
  const notPng = await request('PUT', '/api/projects/demo/icon', { body: Buffer.from('GIF89a'), type: 'image/png' });
  assert.equal(notPng.status, 400);
  const ok = await request('PUT', '/api/projects/demo/icon', { body: PNG, type: 'image/png' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.icon.custom, true);
  assert.deepEqual(await fs.readFile(path.join(repo, 'projects/Apps/demo/icon.png')), PNG);
  assert.equal(JSON.parse(await fs.readFile(path.join(repo, 'projects/Apps/demo/xrb-project.json'), 'utf8')).icon, 'icon.png');
  const get = await request('GET', '/api/projects/demo/icon');
  assert.equal(get.status, 200);

  const removed = await request('DELETE', '/api/projects/demo/icon');
  assert.equal(removed.status, 200);
  assert.equal(removed.json.icon.custom, false);
  assert.equal(removed.json.manifest.icon, undefined);
  await assert.rejects(fs.access(path.join(repo, 'projects/Apps/demo/icon.png')));
});

test('delete moves the project folder to the Recycle Bin; node_modules links never reach their target', { skip: process.platform !== 'win32' }, async () => {
  await write('projects/Tests/scratch/xrb-project.json', JSON.stringify({ name: 'Scratch', kind: 'test', entry: '.' }));
  await write('projects/Tests/scratch/index.html', 'x');
  // pnpm-style node_modules: a junction into a shared store outside the project
  const store = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-store-'));
  await fs.writeFile(path.join(store, 'keep.txt'), 'shared');
  await fs.mkdir(path.join(repo, 'projects/Tests/scratch/node_modules'), { recursive: true });
  await fs.symlink(store, path.join(repo, 'projects/Tests/scratch/node_modules/pkg'), 'junction');

  const r = await request('POST', '/api/projects/scratch/delete', { body: '{}' });
  assert.equal(r.status, 200, r.body);
  await assert.rejects(fs.access(path.join(repo, 'projects/Tests/scratch')), 'folder gone');
  assert.equal(await fs.readFile(path.join(store, 'keep.txt'), 'utf8'), 'shared', 'the store behind the link is untouched');
  const list = await request('GET', '/api/projects');
  assert.ok(!list.json.projects.some((p: any) => p.id === 'scratch'));
  assert.equal((await request('POST', '/api/projects/scratch/delete', { body: '{}' })).status, 404);

  await write('projects/Solo/only/xrb-project.json', JSON.stringify({ name: 'Only', kind: 'test', entry: '.' }));
  assert.equal((await request('POST', '/api/projects/only/delete', { body: '{}' })).status, 200);
  const afterLastDelete = await request('GET', '/api/projects');
  assert.ok(!afterLastDelete.json.layout.sections.some((section: any) => section.name.toLowerCase() === 'solo'));
});

test('archived projects are full projects under "archive/<id>"; archive and unarchive move them back to their section', async () => {
  await write('projects/Tests/old-check/xrb-project.json', JSON.stringify({ name: 'Old check', kind: 'test', entry: '.' }));
  await write('projects/Tests/old-check/index.html', 'old');
  const a = await request('POST', '/api/projects/old-check/archive', { body: '{}' });
  assert.equal(a.status, 200, a.body);
  assert.equal(a.json.id, 'archive/old-check');
  assert.equal(await fs.readFile(path.join(repo, 'projects/archive/old-check/index.html'), 'utf8'), 'old');
  await assert.rejects(fs.access(path.join(repo, 'projects/Tests/old-check')));

  const list = (await request('GET', '/api/projects')).json;
  assert.ok(!list.projects.some((p: any) => p.id === 'old-check'));
  const arch = list.archived.find((p: any) => p.id === 'archive/old-check');
  assert.equal(arch.manifest.name, 'Old check');
  assert.equal(arch.archived, true);
  assert.equal(arch.entryExists, true);

  // usable like any project: details, icon, preview, settings
  assert.equal((await request('GET', '/api/projects/archive/old-check')).status, 200);
  assert.equal((await request('GET', '/api/projects/archive/old-check/icon')).status, 200);
  const archivedPreview = (await request('GET', '/preview/archive/old-check/')).body;
  assert.match(archivedPreview, /data-xrb-app-icon/);
  assert.match(archivedPreview, /old/);
  assert.equal((await request('POST', '/api/projects/archive/old-check/archive', { body: '{}' })).status, 409, 'already archived');

  const r = await request('POST', '/api/projects/archive/old-check/unarchive', { body: '{}' });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json.id, 'old-check');
  const restoredHtml = await fs.readFile(path.join(repo, 'projects/Tests/old-check/index.html'), 'utf8');
  assert.match(restoredHtml, /data-xrb-app-icon/);
  assert.match(restoredHtml, /old/);
  assert.deepEqual((await request('GET', '/api/projects')).json.archived.filter((p: any) => !p.readOnly).map((p: any) => p.id), []);

  // never overwrite: unarchiving onto an existing project is refused
  await request('POST', '/api/projects/old-check/archive', { body: '{}' });
  await write('projects/Tests/old-check/xrb-project.json', JSON.stringify({ name: 'New check', kind: 'test', entry: '.' }));
  assert.equal((await request('POST', '/api/projects/archive/old-check/unarchive', { body: '{}' })).status, 409);
  assert.equal((await request('GET', '/api/projects')).json.projects.find((p: any) => p.id === 'old-check').manifest.name, 'New check');
});

test('Plugins Manager and Settings have stable standalone routes', async () => {
  const plugins = await request('GET', '/plugins/');
  assert.equal(plugins.status, 200, plugins.body);
  assert.match(plugins.body, /XR Build · Plugins/);
  const settingsPage = await request('GET', '/settings/');
  assert.equal(settingsPage.status, 200, settingsPage.body);
  assert.match(settingsPage.body, /XR Build · Settings/);
});

test('unknown routes are 404, bad JSON is 400', async () => {
  assert.equal((await request('GET', '/api/settings')).status, 404, 'the retired core camera settings API stays absent');
  assert.equal((await request('GET', '/api/nothing')).status, 404);
  assert.equal((await request('PUT', '/api/projects/demo/manifest', { body: '{oops' })).status, 400);
});

test('reports the workspace and creates a new project from the core template', async () => {
  const ws = await request('GET', '/api/workspace');
  assert.deepEqual(ws.json, { path: repo, integrationPath: repo, exists: true, kind: 'explicit', autoRoute: false });
  const r = await request('POST', '/api/projects/new', { body: JSON.stringify({ folder: 'globe', name: 'Globe' }) });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json.id, 'globe');
  assert.equal(r.json.manifest.name, 'Globe');
  assert.deepEqual(r.json.manifest.inputs, ['mouse']);
  assert.ok((await request('GET', '/api/projects')).json.projects.some((p: any) => p.id === 'globe'));
  assert.equal((await request('POST', '/api/projects/new', { body: JSON.stringify({ folder: 'globe' }) })).status, 409, 'never overwrites');
  assert.equal((await request('POST', '/api/projects/new', { body: JSON.stringify({ folder: '../x' }) })).status, 409);
});

test('separate project and integration roots keep project discovery out of the private workspace', async () => {
  const integration = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-split-integration-'));
  const projects = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-split-projects-'));
  const splitPort = await freePort();
  await fs.mkdir(path.join(projects, 'projects', 'Apps', 'public-app'), { recursive: true });
  await fs.writeFile(path.join(projects, 'projects', 'Apps', 'public-app', 'xrb-project.json'), JSON.stringify({ name: 'Public app', kind: 'app', entry: '.' }));
  await fs.writeFile(path.join(projects, 'package.json'), JSON.stringify({ private: true }));
  await fs.mkdir(path.join(integration, 'plugins', 'private-plugin', 'samples', 'demo'), { recursive: true });
  await fs.writeFile(path.join(integration, 'plugins', 'private-plugin', 'xrb-plugin.json'), JSON.stringify({
    title: 'Private Plugin', type: 'plugin', version: '0.1.0', panel: { samples: [{ id: 'demo', path: 'samples/demo' }] },
  }));
  await fs.writeFile(path.join(integration, 'plugins', 'private-plugin', 'samples', 'demo', 'xrb-project.json'), JSON.stringify({ name: 'Private Demo', kind: 'test' }));
  const started = await launch({ port: splitPort, open: false, workspace: integration, projects });
  assert.equal(started.result, 'started');
  try {
    const api = async (pathname: string) => {
      const response = await fetch(`http://127.0.0.1:${splitPort}${pathname}`);
      return { status: response.status, json: await response.json() as any };
    };
    assert.deepEqual((await api('/api/workspace')).json, { path: projects, integrationPath: integration, exists: true, kind: 'explicit', autoRoute: false });
    const list = await api('/api/projects');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.projects.filter((project: any) => !project.readOnly).map((project: any) => project.id), ['public-app']);
    const created = await fetch(`http://127.0.0.1:${splitPort}/api/projects/new`, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${splitPort}`, 'content-type': 'application/json' },
      body: JSON.stringify({ folder: 'split-app', name: 'Split app' }),
    });
    assert.equal(created.status, 200, await created.text());
    await fs.access(path.join(projects, 'projects', 'unsorted', 'split-app', 'xrb-project.json'));
    const imported = await fetch(`http://127.0.0.1:${splitPort}/api/plugins/manage/private-plugin/samples/demo/import`, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${splitPort}`, 'content-type': 'application/json' },
      body: JSON.stringify({ folder: 'private-demo', name: 'Private Demo Copy' }),
    });
    assert.equal(imported.status, 200, await imported.text());
    assert.equal(JSON.parse(await fs.readFile(path.join(projects, 'projects', 'plugins', 'private-demo', 'xrb-project.json'), 'utf8')).name, 'Private Demo Copy');
    await assert.rejects(fs.access(path.join(integration, 'projects')));
    assert.equal(started.server!.panel.workspace, integration);
    assert.equal(started.server!.panel.projects, projects);
  } finally {
    await started.server!.close();
    await fs.rm(integration, { recursive: true, force: true });
    await fs.rm(projects, { recursive: true, force: true });
  }
});

test('app scripts run with the core source environment only', async () => {
  await write('projects/Apps/envcheck/xrb-project.json', JSON.stringify({ name: 'Env', kind: 'app', entry: 'dist', scripts: { build: 'build' } }));
  await write('projects/Apps/envcheck/package.json', JSON.stringify({ name: 'envcheck', scripts: { build: `node -e "const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html','ok');f.writeFileSync('env.json',JSON.stringify({core:process.env.XRB_CORE,channel:process.env.XRB_DISTRIBUTION_CHANNEL,projection:process.env.XRB_CAMERA_PROJECTION}))"` } }));
  await fs.mkdir(path.join(repo, 'node_modules'), { recursive: true });  // installed: no pnpm install in the test
  const r = await request('POST', '/api/projects/envcheck/build-web', { body: '{}' });
  assert.equal(r.status, 202, r.body);
  const done = await panel.panel.jobs.wait(panel.panel.jobs.list().find((j) => j.id === r.json.id)!);
  assert.equal(done.state, 'done', done.error ?? '');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'projects/Apps/envcheck/env.json'), 'utf8')), { core: panel.panel.repo });
});

test('explicit app rebuild always runs current source and keeps the last successful receipt on failure', async () => {
  const manifest = { name: 'Force rebuild', kind: 'app', entry: 'dist', scripts: { build: 'build' }, platform: 'station',
    plugins: { station: { id: 'Force', title: 'Force', version: '1.2.3', lastPackaged: '1.2.2' } },
    publication: { enabled: true, publisher: 'fixture', id: '22222222-2222-4222-8222-222222222222', slug: 'force-rebuild' } };
  await write('projects/Apps/force-rebuild/xrb-project.json', JSON.stringify(manifest));
  const script = `node -e "const fs=require('fs');const n=+(fs.existsSync('count.txt')?fs.readFileSync('count.txt'):0)+1;fs.writeFileSync('count.txt',String(n));fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','build '+n)"`;
  await write('projects/Apps/force-rebuild/package.json', JSON.stringify({ scripts: { build: script } }));
  await fs.mkdir(path.join(repo, 'node_modules'), { recursive: true });
  for (const expected of ['1', '2']) {
    const started = await request('POST', '/api/projects/force-rebuild/rebuild-app', { body: '{}' });
    assert.equal(started.status, 202, started.body);
    assert.equal(started.json.title, 'rebuild: Force rebuild');
    const done = await panel.panel.jobs.wait(panel.panel.jobs.get(started.json.id)!);
    assert.equal(done.state, 'done', done.error ?? '');
    assert.equal(await fs.readFile(path.join(repo, 'projects/Apps/force-rebuild/count.txt'), 'utf8'), expected,
      'an explicit rebuild executes even while the previous build receipt is current');
  }
  const receiptFile = path.join(repo, '.xrb/state/builds/force-rebuild.json');
  const successfulReceipt = await fs.readFile(receiptFile, 'utf8');
  await write('projects/Apps/force-rebuild/package.json', JSON.stringify({ scripts: { build: `node -e "process.exit(7)"` } }));
  const failedStart = await request('POST', '/api/projects/force-rebuild/rebuild-app', { body: '{}' });
  assert.equal(failedStart.status, 202, failedStart.body);
  const failed = await panel.panel.jobs.wait(panel.panel.jobs.get(failedStart.json.id)!);
  assert.equal(failed.state, 'failed');
  assert.equal(await fs.readFile(receiptFile, 'utf8'), successfulReceipt, 'a failed command does not advance the successful receipt');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'projects/Apps/force-rebuild/xrb-project.json'), 'utf8')), manifest,
    'rebuilding does not publish, package or change project state');

  await write('projects/Apps/no-rebuild/xrb-project.json', JSON.stringify({ name: 'No rebuild', kind: 'app', entry: 'dist' }));
  assert.equal((await request('POST', '/api/projects/no-rebuild/rebuild-app', { body: '{}' })).status, 409);
  assert.equal((await request('POST', '/api/projects/rig-check/rebuild-app', { body: '{}' })).status, 409);
});

test('a run is refused while a selected plugin is not built in the workspace', async () => {
  await write('projects/Tests/needs-plugin/xrb-project.json', JSON.stringify({ name: 'Needs', kind: 'test', entry: '.', input: 'some-tracker' }));
  await write('projects/Tests/needs-plugin/index.html', 'x');
  const p = (await import('../src/projects.ts')).discoverProjects(repo).then((ps) => ps.find((x) => x.id === 'needs-plugin')!);
  const fake = Object.create(panel.panel, { repo: { value: repo } });  // a "core" with a built host exe
  await write('native/host/build/Release/xrb-host.exe', 'exe');
  await assert.rejects(fake.run(await p, 'built'), /plugin some-tracker is not built in the workspace: rebuild the host first/);
});

test('manages installed workspace plugins without deleting files', async () => {
  await write('plugins/input-sample/samples/demo/xrb-project.json', JSON.stringify({ name: 'Sample Demo', kind: 'test' }));
  await write('plugins/input-sample/samples/demo/package.json', JSON.stringify({ name: 'sample-demo', private: true }));
  await write('plugins/input-sample/samples/demo/src/main.js', 'source');
  await write('plugins/input-sample/xrb-plugin.json', JSON.stringify({
    title: 'Sample Input', type: 'input', version: '0.1.0', name: 'Sample', icon: 'icon.png',
    panel: { samples: [{ id: 'demo', path: 'samples/demo', description: 'Editable sample.' }], hiddenProviders: ['sample'],
      settings: [{ key: 'processor', label: 'Processor', type: 'select', default: 'cpu', options: [{ value: 'cpu', label: 'CPU' }, { value: 'gpu', label: 'GPU' }] }] },
    settings: [{ key: 'verbose', label: 'Verbose', type: 'boolean', default: false }],
  }));
  await write('plugins/input-sample/icon.png', PNG);
  const initial = await request('GET', '/api/plugins/manage');
  assert.equal(initial.status, 200, initial.body);
  const sample = initial.json.plugins.find((p: any) => p.id === 'input-sample');
  assert.equal(sample.enabled, true);
  assert.equal(sample.title, 'Sample Input');
  assert.equal(sample.type, 'input');
  assert.deepEqual(sample.samples, [{ id: 'demo', name: 'Sample Demo', kind: 'test', description: 'Editable sample.' }]);
  assert.deepEqual(sample.panelValues, { processor: 'cpu' });
  assert.deepEqual((await request('GET', '/api/plugins/manage/input-sample/settings')).json, { enabled: true, runtime: { verbose: false }, panel: { processor: 'cpu' } });
  assert.equal((await request('GET', '/api/plugins/manage/input-sample/icon')).status, 200);
  assert.equal((await request('PUT', '/api/plugins/manage/input-sample', { body: JSON.stringify({ panelSettings: { processor: 'gpu' } }) })).status, 200);
  assert.equal((await request('PUT', '/api/plugins/manage/input-sample', { body: JSON.stringify({ panelSettings: { processor: 'bad' } }) })).status, 400);
  const saved = await request('PUT', '/api/plugins/manage/input-sample', { body: JSON.stringify({ enabled: false, settings: { verbose: true } }) });
  assert.equal(saved.status, 200, saved.body);
  const result = (await request('GET', '/api/plugins/manage')).json.plugins.find((p: any) => p.id === 'input-sample');
  assert.equal(result.enabled, false);
  assert.deepEqual(result.values, { verbose: true });
  assert.deepEqual(result.panelValues, { processor: 'gpu' });
  assert.equal((await request('PUT', '/api/plugins/manage/input-sample', { body: JSON.stringify({ panelSettings: { processor: 'cpu' } }) })).status, 409);
  const imported = await request('POST', '/api/plugins/manage/input-sample/samples/demo/import', { body: JSON.stringify({ folder: 'sample-copy', name: 'Sample Copy' }) });
  assert.equal(imported.status, 200, imported.body);
  assert.equal(imported.json.id, 'sample-copy');
  const importedManifest = JSON.parse(await fs.readFile(path.join(repo, 'projects', 'plugins', 'sample-copy', 'xrb-project.json'), 'utf8'));
  assert.equal(importedManifest.name, 'Sample Copy');
  assert.equal(JSON.parse(await fs.readFile(path.join(repo, 'projects', 'plugins', 'sample-copy', 'package.json'), 'utf8')).name, 'sample-copy');
  assert.equal(await fs.readFile(path.join(repo, 'plugins', 'input-sample', 'samples', 'demo', 'src', 'main.js'), 'utf8'), 'source');
  assert.equal((await request('POST', '/api/plugins/manage/input-sample/samples/demo/import', { body: JSON.stringify({ folder: 'sample-copy', name: 'Again' }) })).status, 409);
  assert.ok((await request('GET', '/api/plugins')).json.disabled.some((p: any) => p.name === 'sample' && p.role === 'input'));
  assert.equal((await request('PUT', '/api/plugins/manage/input-sample', { body: JSON.stringify({ settings: { unknown: true } }) })).status, 400);
  assert.equal((await request('PUT', '/api/plugins/manage/unknown', { body: '{"enabled":false}' })).status, 404);
  assert.ok(await fs.stat(path.join(repo, 'plugins/input-sample/icon.png')));
});

test('plugin-declared standalone targets disappear immediately when their last enabled owner is disabled', async () => {
  // Isolate this workspace-only fixture from real bundled integrations that can declare the same target.
  const bundled = (await request('GET', '/api/plugins/manage')).json.plugins.filter((p: any) => p.origin === 'bundled' && p.enabled);
  try {
    for (const plugin of bundled) assert.equal((await request('PUT', `/api/plugins/manage/${encodeURIComponent(plugin.id)}`, { body: '{"enabled":false}' })).status, 200);
    assert.ok(!(await request('GET', '/api/plugins')).json.standaloneTargets.includes('webxr'));
    await write('plugins/publisher-browser/xrb-plugin.json', JSON.stringify({
      title: 'Browser Target', type: 'publisher', version: '0.1.0', panel: { targets: ['webxr'] },
    }));
    assert.ok((await request('GET', '/api/plugins')).json.standaloneTargets.includes('webxr'));
    const saved = await request('PUT', '/api/plugins/manage/publisher-browser', { body: JSON.stringify({ enabled: false }) });
    assert.equal(saved.status, 200, saved.body);
    assert.ok(!(await request('GET', '/api/plugins')).json.standaloneTargets.includes('webxr'));
  } finally {
    for (const plugin of bundled) assert.equal((await request('PUT', `/api/plugins/manage/${encodeURIComponent(plugin.id)}`, { body: '{"enabled":true}' })).status, 200);
  }
});

test('disabled packager-only platforms stay out of headset choices', async () => {
  await write('plugins/headset/xrb-plugin.json', JSON.stringify({ title: 'Headset', type: 'platform', version: '0.1.0' }));
  await write('plugins/headset/package.json', JSON.stringify({ xrBuild: { packager: './packager.mjs' } }));
  await write('plugins/headset/packager.mjs', `export const packager = { name: 'fixture-headset', label: 'Device Model', target: 'webxr', identityFields: [], validate: () => [], build: async () => ({ file: '', sizeBytes: 0 }) };`);
  await panel.panel.loadPackagers();
  const named = await request('GET', '/api/plugins');
  assert.equal(named.json.packagerLabels['fixture-headset'], 'Device Model');
  assert.equal((await request('GET', '/api/plugins/manage')).json.plugins.find((p: any) => p.id === 'headset').label, 'Device Model');
  const saved = await request('PUT', '/api/plugins/manage/headset', { body: JSON.stringify({ enabled: false }) });
  assert.equal(saved.status, 200, saved.body);
  const choices = await request('GET', '/api/plugins');
  assert.equal(choices.status, 200, choices.body);
  assert.ok(choices.json.disabled.some((p: any) => p.name === 'headset' && p.role === 'platform'));
  assert.ok(!choices.json.headsetPlatforms.includes('fixture-headset'));
});

test('preview browser uses the selected monitor and optional fullscreen startup', async () => {
  let launched: { executable: string; args: string[]; options: unknown } | null = null;
  let resolveScript = '';
  const execute = ((_file: string, args: string[], _options: unknown, done: (error: Error | null, stdout: string) => void) => {
    resolveScript = args.at(-1) ?? '';
    done(null, JSON.stringify({ executable: 'C:\\Browser\\browser.exe', left: 2560, top: 0, width: 1920, height: 1080 }));
  }) as any;
  const child = Object.assign(new EventEmitter(), { pid: 43210 });
  const start = ((executable: string, args: string[], options: unknown) => {
    launched = { executable, args, options };
    return child;
  }) as any;
  assert.equal(await launchPreviewBrowser('http://127.0.0.1:5181/fullscreen-preview.html', 54321, 1, false, execute, start), child);
  assert.equal(launched?.executable, 'C:\\Browser\\browser.exe');
  assert.match(launched?.args[0] ?? '', /^--user-data-dir=.*xr-build-preview-/);
  assert.deepEqual(launched?.args.slice(1), ['--no-first-run', '--new-window', '--window-position=2760,112', '--window-size=1520,856', 'http://127.0.0.1:5181/fullscreen-preview.html']);
  assert.equal((launched?.options as any).windowsHide, false);
  assert.match(resolveScript, /\$horizontal[\s\S]*ForEach-Object \{ \$_\.Bounds\.Width \}/);

  launched = null;
  await launchPreviewBrowser('http://127.0.0.1:5181/fullscreen-preview.html', 54321, 1, true, execute, start);
  assert.deepEqual(launched?.args.slice(1), ['--no-first-run', '--new-window', '--window-position=2560,0', '--window-size=1920,1080', '--kiosk', 'http://127.0.0.1:5181/fullscreen-preview.html']);
});

test('native Run reaches the host runner, while a WebXR Run must open the browser preview', async () => {
  for (const [id, target] of [['native-run', 'host'], ['browser-run', 'webxr']] as const) {
    await write(`projects/Apps/${id}/xrb-project.json`, JSON.stringify({ name: id, kind: 'app', entry: 'dist', target,
      scripts: { dev: 'dev' }, inputs: ['mouse'], display: 'desktop' }));
    await write(`projects/Apps/${id}/dist/index.html`, `<h1>${id}</h1>`);
  }
  const browser = await request('POST', '/api/projects/browser-run/run', { body: JSON.stringify({ mode: 'built' }) });
  assert.equal(browser.status, 409, browser.body);
  assert.match(browser.json.error, /WebXR headset app: open it in a browser/);
  assert.equal((await request('GET', '/preview/browser-run/')).status, 200);
  const previewRunner = panel.panel.runner;
  const originalLaunchBrowser = panel.panel.launchBrowser;
  const originalKill = (previewRunner as any).kill;
  let browserChild: any = null;
  let launched: any = null;
  panel.panel.launchBrowser = async (url, clientPort, monitor, fullscreen) => {
    launched = { url, clientPort, monitor, fullscreen };
    browserChild = Object.assign(new EventEmitter(), { pid: 43210, exitCode: null });
    return browserChild;
  };
  (previewRunner as any).kill = async (pid: number, force: boolean) => {
    assert.equal(pid, 43210);
    assert.equal(force, true);
    browserChild.exitCode = 0;
    browserChild.emit('close', 0);
  };
  try {
    assert.equal((await request('PUT', '/api/app-settings', { body: JSON.stringify({ cursor: 'ring' }) })).status, 200);
    assert.equal((await request('GET', '/api/app-settings')).json.cursor, 'ring');
    assert.equal((await request('PUT', '/api/app-settings', { body: JSON.stringify({ cursor: 'bad' }) })).status, 400);
    assert.equal((await request('GET', '/api/app-settings')).json.cursor, 'ring');
    const builtToken = 'built-preview-token-1234';
    const builtPreview = await request('POST', '/api/projects/browser-run/preview', { body: JSON.stringify({ mode: 'built', flat: true, fullscreen: true, monitor: 1, token: builtToken }) });
    assert.equal(builtPreview.status, 200, builtPreview.body);
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-camera'), 'orthographic');
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-mouse'), '1');
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-cursor'), 'ring');
    const closeScope = { route: '/preview/browser-run/', token: builtToken, session: new URL(builtPreview.json.url).searchParams.get('xrb-preview-session') };
    for (const bad of [{ ...closeScope, token: 'foreign-token-1234' }, { ...closeScope, route: '/preview/foreign/' }, { ...closeScope, session: 'old-session-123456' }])
      assert.equal((await request('POST', '/api/preview/close', { body: JSON.stringify(bad) })).status, 409);
    assert.equal((await request('POST', '/api/preview/close', { origin: 'https://foreign.test', body: JSON.stringify(closeScope) })).status, 403);
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-preview-route'), '/preview/browser-run/');
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-preview-token'), builtToken);
    assert.equal(new URL(builtPreview.json.url).searchParams.get('xrb-preview-panel'), new URL(panel.url).origin);
    const projectionPath = `/api/preview/projection?route=${encodeURIComponent('/preview/browser-run/')}&token=${builtToken}`;
    assert.equal((await request('GET', projectionPath)).json.projection, 'orthographic');
    const changedProjection = await request('POST', '/api/preview/projection', { body: JSON.stringify({ route: '/preview/browser-run/', token: builtToken, projection: 'perspective' }) });
    assert.equal(changedProjection.status, 200, changedProjection.body);
    assert.equal((await request('GET', projectionPath)).json.projection, 'perspective');
    assert.equal((await request('GET', '/api/run')).json.state.flat, false, 'the checkbox state follows the preview camera, not the original 2D launch');
    for (const projection of ['orthographic', 'perspective']) {
      const updated = await request('POST', '/api/preview/projection', { body: JSON.stringify({ route: '/preview/browser-run/', token: builtToken, projection }) });
      assert.equal(updated.status, 200, updated.body);
      assert.equal((await request('GET', projectionPath)).json.projection, projection);
      assert.equal((await request('GET', '/api/run')).json.state.flat, projection === 'orthographic');
    }
    const foreignProjection = await request('POST', '/api/preview/projection', { body: JSON.stringify({ route: '/preview/browser-run/', token: 'other-preview-token', projection: 'orthographic' }) });
    assert.equal(foreignProjection.status, 409);
    assert.equal((await request('GET', '/api/run')).json.state.flat, false, 'a foreign preview cannot change the checkbox');
    assert.equal(launched.monitor, 1);
    assert.equal(launched.fullscreen, true);
    assert.equal(new URL(launched.url).pathname, '/preview/browser-run/');
    assert.equal(launched.url, builtPreview.json.url);
    assert.equal((await request('GET', '/api/run')).json.state.phase, 'running');
    const stopped = await request('POST', '/api/preview/close', { body: JSON.stringify(closeScope) });
    assert.equal(stopped.status, 200, stopped.body);
    assert.equal(stopped.json.closed, true);
    assert.equal((await request('GET', '/api/run')).json.state.phase, 'idle');
    assert.equal((await request('POST', '/api/preview/close', { body: JSON.stringify(closeScope) })).status, 409);
    assert.equal((await request('GET', projectionPath)).status, 404);
    assert.equal((await request('POST', '/api/preview/projection', { body: JSON.stringify({ route: '/preview/browser-run/', token: builtToken, projection: 'orthographic' }) })).status, 409, 'a stopped preview cannot restore its old camera state');
    assert.equal((await request('POST', '/api/projects/browser-run/preview', { body: JSON.stringify({ mode: 'unexpected' }) })).status, 400);

    await write('projects/Apps/browser-run/xrb-project.json', JSON.stringify({ name: 'browser-run', kind: 'app', entry: 'dist', target: 'webxr', scripts: { dev: 'dev' }, inputs: ['keyboard'], display: 'desktop' }));
    const noMouse = await request('POST', '/api/projects/browser-run/preview', { body: JSON.stringify({ mode: 'built', token: 'no-mouse-preview-1234' }) });
    assert.equal(noMouse.status, 200, noMouse.body);
    assert.equal(new URL(noMouse.json.url).searchParams.get('xrb-mouse'), '0', 'deselecting Mouse disables the shared cursor on the next launch');
    assert.equal((await request('POST', '/api/preview/close', { body: JSON.stringify({ route: closeScope.route, token: 'no-mouse-preview-1234', session: new URL(noMouse.json.url).searchParams.get('xrb-preview-session') }) })).status, 409, 'windowed previews cannot close through Escape');
    await request('POST', '/api/run/stop', { body: '{}' });

    const relaunched = await request('POST', '/api/projects/browser-run/preview', { body: JSON.stringify({ mode: 'built', fullscreen: true, token: builtToken }) });
    assert.equal(relaunched.status, 200, relaunched.body);
    assert.equal((await request('POST', '/api/preview/close', { body: JSON.stringify(closeScope) })).status, 409, 'even a reused route and token cannot authorize an old page');
    await request('POST', '/api/run/stop', { body: '{}' });

    let previewed: any = null;
    const originalStartPreview = previewRunner.startPreview;
    const originalEnsureInstalled = panel.panel.ensureInstalled;
    previewRunner.startPreview = async (options, mode, launch) => {
      previewed = { ...options, mode };
      await launch('http://127.0.0.1:54321/');
    };
    panel.panel.ensureInstalled = async () => {};
    try {
      const dev = await request('POST', '/api/projects/browser-run/preview', { body: JSON.stringify({ mode: 'dev', token: 'preview-token-1234' }) });
      assert.equal(dev.status, 200, dev.body);
      assert.equal(new URL(dev.json.url).origin, 'http://127.0.0.1:54321');
      assert.equal(new URL(dev.json.url).searchParams.get('xrb-preview-route'), '/preview/browser-run/');
      assert.equal(new URL(dev.json.url).searchParams.get('xrb-preview-token'), 'preview-token-1234');
      assert.equal(new URL(dev.json.url).searchParams.get('xrb-mouse'), '0', 'dev previews respect the same input selection');
      assert.equal(new URL(dev.json.url).searchParams.get('xrb-cursor'), 'ring');
      assert.equal(previewed.projectId, 'browser-run');
      assert.equal(previewed.devScript, 'dev');
      assert.equal(previewed.mode, 'dev');
      assert.equal(new URL(launched.url).pathname, '/fullscreen-preview.html');
      assert.equal(new URL(launched.url).searchParams.get('target'), dev.json.url);
    } finally {
      previewRunner.startPreview = originalStartPreview;
      panel.panel.ensureInstalled = originalEnsureInstalled;
    }
  } finally {
    panel.panel.launchBrowser = originalLaunchBrowser;
    (previewRunner as any).kill = originalKill;
    await request('PUT', '/api/app-settings', { body: JSON.stringify({ cursor: 'ring-dot' }) });
  }

  let started: any = null;
  const runner = panel.panel.runner;
  const originalStart = runner.start;
  const originalCore = panel.panel.repo;
  await write('native/host/build/Release/xrb-host.exe', 'fixture; never executed');
  panel.panel.repo = repo; // use the scratch core so the Node-only CI lane does not need a host build
  runner.start = async (options) => { started = options; };  // no physical host launched in CI
  try {
    const native = await request('POST', '/api/projects/native-run/run', { body: JSON.stringify({ mode: 'built' }) });
    assert.equal(native.status, 200, native.body);
    assert.equal(started?.projectId, 'native-run');
    assert.equal(started?.mode, 'built');
    assert.ok(started?.hostExe.endsWith('xrb-host.exe'));
    assert.ok(started?.hostArgs.includes('--title=native-run'));
    assert.equal(started?.builtUrl, `https://app.local/index.html?xrb-panel=${encodeURIComponent(`http://127.0.0.1:${port}/`)}&xrb-mouse=1&xrb-cursor=ring-dot`,
      'panel native runs carry workspace and Mouse selection while still serving the built app at app.local');
    assert.equal(started?.mouseEnabled, true);
  } finally { runner.start = originalStart; panel.panel.repo = originalCore; }
});

test('app.local may read local catalog and preview responses without opening panel writes', async () => {
  const projects = await request('GET', '/api/projects', { origin: 'https://app.local' });
  assert.equal(projects.status, 200, projects.body);
  assert.equal(projects.headers['access-control-allow-origin'], 'https://app.local');
  const foreign = await request('GET', '/api/projects', { origin: 'https://example.test' });
  assert.equal(foreign.status, 200, foreign.body);
  assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  const projection = await request('GET', '/api/preview/projection?route=%2Fpreview%2Fmissing%2F&token=missing', { origin: 'http://localhost:54321' });
  assert.equal(projection.status, 404);
  assert.equal(projection.headers['access-control-allow-origin'], 'http://localhost:54321');
  const foreignProjection = await request('GET', '/api/preview/projection?route=%2Fpreview%2Fmissing%2F&token=missing', { origin: 'https://example.test' });
  assert.equal(foreignProjection.headers['access-control-allow-origin'], undefined);
  const unrelated = await request('GET', '/api/plugins', { origin: 'https://app.local' });
  assert.equal(unrelated.status, 200, unrelated.body);
  assert.equal(unrelated.headers['access-control-allow-origin'], undefined, 'the native app origin receives only catalog and preview reads');
  const writeFromHost = await request('POST', '/api/projects/new', { origin: 'https://app.local', body: JSON.stringify({ folder: 'blocked' }) });
  assert.equal(writeFromHost.status, 403);
});

test('restart and panel launchers create no terminal process', async () => {
  const restart = silentRestartInvocation(['server.ts', '--open', '--workspace=.xrbuild'], 'D:\\work', 'C:\\node.exe');
  assert.equal(restart.command, 'wscript.exe');
  assert.ok(restart.args[0].endsWith('restart-silent.vbs'));
  assert.deepEqual(restart.args.slice(1), ['D:\\work', 'C:\\node.exe', 'server.ts', '--workspace=.xrbuild']);
  assert.equal(restart.options.windowsHide, true);
  assert.equal(restart.options.detached, true);
  assert.equal(restart.options.stdio, 'ignore');
  const compatibility = await fs.readFile(new URL('../src/restart-silent.vbs', import.meta.url), 'utf8');
  assert.match(compatibility, /WScript\.Arguments\.Count < 2/);
  assert.match(compatibility, /shell\.CurrentDirectory = WScript\.Arguments\(0\)/);
  assert.match(compatibility, /command = QuoteArgument\(WScript\.Arguments\(1\)\)/);
  assert.match(compatibility, /shell\.Run command, 0, False/);
  assert.doesNotMatch(compatibility, /cmd(?:\.exe)?\s+\/c|powershell/i);
  const serverSource = await fs.readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /command: 'wscript\.exe'/);
  assert.match(serverSource, /args: \[RESTART_SILENT, cwd, execPath/);
  const launchers = { 'start.vbs': 'user', 'start-repo.vbs': 'repository', 'start-auto.vbs': 'auto' };
  for (const [file, marker] of Object.entries(launchers)) {
    const script = await fs.readFile(new URL(`../../../${file}`, import.meta.url), 'utf8');
    assert.match(script, /shell\.Run .*?, 0, False/);
    assert.match(script, new RegExp(`--shortcut-launch=${marker}`));
    assert.doesNotMatch(script, /cmd(?:\.exe)?\s+\/c|powershell/i);
  }
  const jobs = await fs.readFile(new URL('../src/jobs.ts', import.meta.url), 'utf8');
  assert.match(jobs, /spawn\(cmd, args, \{ \.\.\.opts, windowsHide: true/);
});

test('restart and ping identify the old panel instance before invoking restart', async () => {
  let restarted = false;
  const previous = panel.panel.onRestart;
  panel.panel.onRestart = () => { restarted = true; };
  try {
    const ping = await request('GET', '/api/ping');
    assert.equal(ping.status, 200, ping.body);
    assert.equal(ping.json.instanceId, panel.panel.instanceId);
    assert.match(ping.json.instanceId, /^[0-9a-f-]{36}$/);
    const r = await request('POST', '/api/restart', { body: '{}' });
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(r.json, { restarting: true, pid: process.pid, instanceId: panel.panel.instanceId, repo: ping.json.repo, workspace: ping.json.workspace, projects: ping.json.projects });
    assert.equal((await request('GET', '/api/panel')).status, 503, 'pending restart blocks new work');
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(restarted, true);
  } finally {
    // This mock deliberately does not replace the process; restore its shared fixture.
    panel.panel.restartPending = false;
    panel.panel.onRestart = previous;
  }
});

test('panel freshness reports server code changed after the process started', async () => {
  const p = panel.panel;
  const saved = p.startedMs;
  try {
    p.freshnessMaxAgeMs = 0;
    p.startedMs = Date.now() + 3_600_000;
    let r = await request('GET', '/api/panel');
    assert.equal(r.status, 200, r.body);
    assert.deepEqual(r.json, { pid: process.pid, startedMs: p.startedMs, outdated: false, newestSource: null });
    // A start time before every scanned file: the newest of them is named, relative to the core or the workspace
    // (here a fixture plugin this suite wrote; its files share a file-time tick, so which one is not fixed).
    p.startedMs = 0;
    r = await request('GET', '/api/panel');
    assert.equal(r.json.outdated, true);
    assert.match(r.json.newestSource, /^(plugins|packages)[\\/]/);
  } finally {
    p.startedMs = saved;
    p.freshnessMaxAgeMs = 5_000;
  }
});

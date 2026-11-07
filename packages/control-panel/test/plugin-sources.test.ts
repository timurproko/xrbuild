import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readPluginPrefs, updatePluginPrefs } from '../src/plugin-manager.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/plugin-sources-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  const write = async (relative: string, data: unknown) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof data === 'string' ? data : JSON.stringify(data)); return file; };
  for (const [owner, origin] of [['core/embedded', 'Bundled'], ['user', 'Workspace']]) {
    await write(`${owner}/plugins/shared/xrb-plugin.json`, { title: `${origin} fixture`, type: 'publisher', version: '1.0.0', config: [{ key: 'active', label: 'Active', type: 'boolean', default: false }] });
    await write(`${owner}/plugins/shared/package.json`, { name: 'fixture-plugin', type: 'module', xrBuild: { publisher: './services.mjs', packager: './services.mjs' } });
    await write(`${owner}/plugins/shared/services.mjs`, `export async function createPublisher(){ await globalThis.__sourceGate?.('${origin}'); return {name:'fixture',label:'${origin}',origin:'https://example.test',validate:()=>[],status:async()=>({state:'unpublished',selectedUrl:'',deployedSlug:'${origin}'}),publish:async()=>({}),unpublish:async()=>({})}; }
      export function createPackager(){ return {name:'fixture',label:'${origin}',identityFields:[],validate:()=>[],build:async()=>({})}; }`);
  }
  await write('user/xrb-plugins.json', { disabled: [], settings: { 'bundled:shared': { retained: true }, 'workspace:shared': { retained: false } }, panelSettings: {}, futureField: { preserve: true } });
  await fs.mkdir(path.join(workspace, 'projects'));
  const port = await freePort(), server = createServer({ repo: core, workspace, port });
  await Promise.all([server.panel.loadPublishers(), server.panel.loadPackagers()]);
  await new Promise<void>(resolve => server.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { delete (globalThis as any).__sourceGate; await server.close(); await fs.rm(root, { recursive: true, force: true }); });
  const request = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(`${server.url}${url}`, { method, headers: { origin: server.url.slice(0, -1), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const plugins = async () => (await request('GET', 'api/plugins/manage')).data.plugins;
  return { root, core, workspace, write, server, panel: server.panel, request, plugins };
}

test('origin API selects whole plugin, refreshes paired services, preserves preferences and rejects stale revisions', async t => {
  const f = await fixture(t), before = await f.plugins();
  assert.equal(before.length, 2); assert.ok(before.every((p: any) => !p.selected && !p.enabled));
  const revision = before[0].sourceRevision;
  const choose = (origin: string, rev: string) => f.request('PUT', 'api/plugins/manage/bundled%3Ashared/origin', { origin, revision: rev });
  assert.equal((await choose('bundled', revision)).status, 200);
  assert.equal(f.panel.publishers.found[0].publisher.label, 'Bundled'); assert.equal(f.panel.packagers.found[0].packager.label, 'Bundled');
  let current = await f.plugins(); assert.equal(current.find((p: any) => p.selected).origin, 'bundled');
  const saved = JSON.parse(await fs.readFile(path.join(f.workspace, 'xrb-plugins.json'), 'utf8'));
  assert.deepEqual(saved.futureField, { preserve: true }); assert.deepEqual(saved.settings, { 'bundled:shared': { retained: true }, 'workspace:shared': { retained: false } });
  assert.equal((await choose('workspace', revision)).status, 409);
  assert.equal((await choose('unknown', current[0].sourceRevision)).status, 400);
  assert.equal((await choose('workspace', current[0].sourceRevision)).status, 200);
  assert.equal(f.panel.publishers.found[0].plugin!.key, 'workspace:shared'); assert.equal(f.panel.packagers.found[0].plugin!.key, 'workspace:shared');
  await fs.unlink(path.join(f.workspace, 'plugins/shared/xrb-plugin.json'));
  current = await f.plugins(); assert.ok(current.every((p: any) => !p.selected));
  assert.equal((await choose('workspace', current[0].sourceRevision)).status, 409, 'missing selected source cannot fall back');
});

test('source refresh reserves consumers, publishes services together and refuses conflicting work', async t => {
  const f = await fixture(t), revision = (await f.plugins())[0].sourceRevision;
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  (globalThis as any).__sourceGate = async () => { entered(); await gate; };
  const selection = f.panel.selectPluginSource('bundled:shared', 'bundled', revision); await ready;
  assert.equal(f.panel.publishers.found.length, 0); assert.equal(f.panel.packagers.found.length, 0, 'new packager cannot be visible before new publisher');
  const p = {} as any;
  await assert.rejects(f.panel.packageBuild(p, {}), /changing/);
  await assert.rejects(f.panel.publish(p), /changing/);
  await assert.rejects(f.panel.run(p, 'built'), /preparation/);
  await assert.rejects(f.panel.saveRunSettings(p, {}, 'revision'), /preparation/);
  await assert.rejects(f.panel.selectPluginSource('workspace:shared', 'workspace', revision), /Stop running/);
  release(); await selection; delete (globalThis as any).__sourceGate;
  assert.equal(f.panel.publishers.found[0].publisher.label, 'Bundled'); assert.equal(f.panel.packagers.found[0].packager.label, 'Bundled');
  let finish!: () => void;
  const job = f.panel.jobs.start('web-build', null, 'active', () => new Promise<void>(resolve => { finish = resolve; }));
  await assert.rejects(f.panel.selectPluginSource('workspace:shared', 'workspace', (await f.plugins())[0].sourceRevision), /Stop running/);
  finish(); await f.panel.jobs.wait(job);
});

test('in-flight package preparation blocks source changes even before its job exists', async t => {
  const f = await fixture(t); await f.panel.selectPluginSource('bundled:shared', 'bundled', (await f.plugins())[0].sourceRevision);
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  f.panel.packagers.found[0].packager.setupStatus = async () => { entered(); await gate; return { state: 'ready' }; };
  const p = { id: 'sample', dir: path.join(f.workspace, 'projects/unsorted/sample'), manifest: { name: 'Sample', kind: 'app', platform: 'fixture' }, errors: [] } as any;
  await fs.mkdir(p.dir, { recursive: true });
  const preparation = f.panel.packageSetupStatus(p); await ready;
  await assert.rejects(f.panel.selectPluginSource('workspace:shared', 'workspace', (await f.plugins())[0].sourceRevision), /Stop running/);
  release(); await preparation;
});

test('source revisions bind service declarations and late status results cannot repopulate old-source caches', async t => {
  const f = await fixture(t);
  await f.panel.selectPluginSource('bundled:shared', 'bundled', (await f.plugins())[0].sourceRevision);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const old = f.panel.publishers.found[0].publisher;
  old.status = async () => { await gate; return { state: 'unpublished', selectedUrl: '', deployedSlug: 'old-source' }; };
  f.panel.awaitPublicationStatus = true;
  const manifest = { name: 'Demo', kind: 'app', publication: { publisher: 'fixture', id: '55555555-5555-4555-8555-555555555555', slug: 'demo' } } as any;
  const pending = f.panel.publicationOf(manifest);
  await f.panel.selectPluginSource('workspace:shared', 'workspace', (await f.plugins())[0].sourceRevision);
  release(); await pending;
  assert.equal((await f.panel.publicationOf(manifest)).status?.deployedSlug, 'Workspace');
  const revision = (await f.plugins())[0].sourceRevision, saved = await fs.readFile(path.join(f.workspace, 'xrb-plugins.json'));
  await f.write('core/embedded/plugins/shared/package.json', { name: 'changed', type: 'module', xrBuild: { publisher: './missing.mjs' } });
  await assert.rejects(f.panel.selectPluginSource('bundled:shared', 'bundled', revision), /changed/);
  assert.deepEqual(await fs.readFile(path.join(f.workspace, 'xrb-plugins.json')), saved);
});

test('failed new-source factories are unavailable rather than silently retaining the old implementation', async t => {
  const f = await fixture(t);
  await f.panel.selectPluginSource('bundled:shared', 'bundled', (await f.plugins())[0].sourceRevision);
  (globalThis as any).__sourceGate = async () => { throw new Error('fixture initialization failure'); };
  await f.panel.selectPluginSource('workspace:shared', 'workspace', (await f.plugins())[0].sourceRevision);
  assert.equal(f.panel.publishers.found.length, 0); assert.match(f.panel.publishers.problems.join(' '), /initialization failure/);
  assert.equal(f.panel.packagers.found[0].plugin!.key, 'workspace:shared');
  assert.equal((await readPluginPrefs(f.workspace)).origins!.shared, 'workspace');
});

test('automatic discovery refreshes idle preference changes, defers busy work and blocks changed module code until restart', async t => {
  const f = await fixture(t); f.panel.discoveryMaxAgeMs = 0;
  await f.plugins();
  const change = async (origin: string) => {
    const file = path.join(f.workspace, 'xrb-plugins.json'), prefs = JSON.parse(await fs.readFile(file, 'utf8'));
    prefs.origins = { shared: origin }; await fs.writeFile(file, JSON.stringify(prefs));
  };
  await change('bundled'); await f.plugins();
  assert.equal(f.panel.publishers.found[0].plugin!.key, 'bundled:shared');
  let finish!: () => void;
  const job = f.panel.jobs.start('web-build', null, 'active work', () => new Promise<void>(resolve => { finish = resolve; }));
  await change('workspace'); await f.plugins();
  assert.equal(f.panel.pluginServiceStatus().pending, true); assert.equal(f.panel.publishers.found[0].plugin!.key, 'bundled:shared');
  await assert.rejects(f.panel.publish({} as any), /discovery changed/);
  finish(); await f.panel.jobs.wait(job); await f.plugins();
  assert.equal(f.panel.pluginServiceStatus().pending, false); assert.equal(f.panel.publishers.found[0].plugin!.key, 'workspace:shared');
  const module = path.join(f.workspace, 'plugins/shared/services.mjs');
  await fs.writeFile(module, (await fs.readFile(module, 'utf8')).replaceAll("label:'Workspace'", "label:'Updated after restart'"));
  await f.plugins();
  assert.equal(f.panel.publishers.found.length, 0); assert.match(f.panel.pluginServiceStatus().problem!, /restart/);
  await assert.rejects(f.panel.publish({} as any), /restart/);
  const script = `import {discoverPublishers} from ${JSON.stringify(import.meta.resolve('../src/publishers.ts'))}; const result=await discoverPublishers(process.argv[1],process.argv[2]); console.log(result.found[0]?.publisher.label);`;
  const child = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, f.workspace, f.core]);
  assert.equal(child.stdout.trim(), 'Updated after restart');
});

test('malformed, oversized and linked preferences and foreign locks preserve existing bytes', async t => {
  const f = await fixture(t), file = path.join(f.workspace, 'xrb-plugins.json'), saved = await fs.readFile(file);
  for (const bytes of ['{do-not-echo-sensitive', 'x'.repeat(65537)]) {
    await fs.writeFile(file, bytes);
    await assert.rejects(updatePluginPrefs(f.workspace, prefs => { prefs.disabled = ['shared']; }, f.core), error => !String(error).includes('do-not-echo-sensitive'));
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
  }
  await fs.writeFile(file, saved); await fs.writeFile(`${file}.lock`, 'foreign');
  await assert.rejects(updatePluginPrefs(f.workspace, () => {}, f.core), /lock exists/);
  assert.equal(await fs.readFile(`${file}.lock`, 'utf8'), 'foreign'); await fs.unlink(`${file}.lock`);
  await fs.rename(file, `${file}.preserved`); await fs.link(`${file}.preserved`, file);
  await assert.rejects(updatePluginPrefs(f.workspace, () => {}, f.core), /link|unsafe/);
  assert.deepEqual(await fs.readFile(file), saved);
});

test('independent preference writers preserve unrelated settings without lost updates', async t => {
  const f = await fixture(t), ready = path.join(f.root, 'ready'); await fs.mkdir(ready);
  const script = `import fs from 'node:fs/promises'; import path from 'node:path'; import {updatePluginPrefs} from ${JSON.stringify(import.meta.resolve('../src/plugin-manager.ts'))};
    const [workspace,core,ready,id]=process.argv.slice(1);await fs.writeFile(path.join(ready,id),'ready');while((await fs.readdir(ready)).length<3)await new Promise(r=>setTimeout(r,10));
    for(let n=0;;n++){try{await updatePluginPrefs(workspace, async prefs=>{await new Promise(r=>setTimeout(r,40));prefs.settings[id]={value:id};},core);break;}catch(error){if(!/lock exists/.test(error.message)||n>50)throw error;await new Promise(r=>setTimeout(r,10));}}`;
  await Promise.all(['first', 'second', 'third'].map(id => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, f.workspace, f.core, ready, id], { timeout: 15000 })));
  const prefs = await readPluginPrefs(f.workspace);
  for (const id of ['first', 'second', 'third']) assert.deepEqual(prefs.settings[id], { value: id });
  assert.ok(prefs.settings['bundled:shared']);
  await assert.rejects(fs.access(path.join(f.workspace, 'xrb-plugins.json.lock')));
});

test('real plugin-source form resolves conflict and switches services without restarting panel', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t), instance = f.panel.instanceId;
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(`${f.server.url}plugins/`, `!!document.querySelector('#plugin-source-form')`);
    assert.equal(await evaluate(`document.querySelector('.plugin-enable').disabled`), true);
    for (const origin of ['bundled', 'workspace']) {
      await evaluate(`(() => { const form=document.querySelector('#plugin-source-form'); const select=form.querySelector('[name="origin"]'); select.value='${origin}'; form.requestSubmit(); })()`);
      for (let n = 0; n < 100 && f.panel.publishers.found[0]?.plugin?.origin !== origin; n++) await sleep(50);
      assert.equal(f.panel.publishers.found[0]?.plugin?.origin, origin);
      assert.equal(f.panel.packagers.found[0]?.plugin?.origin, origin);
      for (let n = 0; n < 100 && !await evaluate(`!!document.querySelector('.proj[data-plugin="${origin}:shared"][aria-current="true"]') && !document.querySelector('.plugin-enable').disabled`); n++) await sleep(50);
      assert.equal(await evaluate(`document.querySelector('.proj[data-plugin="${origin}:shared"]').getAttribute('aria-current')`), 'true');
    }
    assert.equal(f.panel.instanceId, instance);
  });
});

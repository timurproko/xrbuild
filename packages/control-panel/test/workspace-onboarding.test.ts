import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { createServer, launch } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { createProject, isWorkspace } from '../src/workspace.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

type Seed = 'missing' | 'empty' | 'uninitialized' | 'initialized';
async function fixture(t: TestContext, seed: Seed = 'missing', embedded = false, split = false) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/workspace-onboarding-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user'), projects = split ? path.join(root, 'projects-home') : workspace;
  let close = async () => {};
  t.after(async () => { await close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  for (const template of ['workspace', 'projects', 'app']) await fs.cp(path.join(REPO, 'templates', template), path.join(core, 'templates', template), { recursive: true });
  if (seed !== 'missing') await fs.mkdir(projects, { recursive: true });
  if (seed === 'uninitialized') await write(path.join(projects, 'notes.txt'), 'preserve my folder');
  if (seed === 'initialized') await fs.mkdir(path.join(projects, 'projects'));
  const source = path.join(core, 'embedded/projects/core/sample/xrb-project.json');
  if (embedded) {
    await write(source, { name: 'Embedded sample', kind: 'app', target: 'webxr', entry: 'dist' });
    await write(path.join(path.dirname(source), 'dist/index.html'), '<html><head></head><body>sample</body></html>');
  }
  // Include a configured service: discovery must not persist its default config during startup.
  const plugin = path.join(core, 'embedded/plugins/fixture');
  await write(path.join(plugin, 'xrb-plugin.json'), { title: 'Fixture', type: 'publisher', version: '0.1.0', config: [{ key: 'enabled', label: 'Enabled', type: 'boolean', default: false }] });
  await write(path.join(plugin, 'package.json'), { type: 'module', xrBuild: { publisher: './publisher.mjs' } });
  await write(path.join(plugin, 'publisher.mjs'), `export function createPublisher(context) { return { name:'fixture', label:context.config.values.enabled?'Enabled':'Default', origin:'https://example.test', validate:()=>[], status:async()=>({state:'unpublished',selectedUrl:''}), publish:async()=>({}), unpublish:async()=>({}) }; }`);
  const server = createServer({ repo: core, workspace, projects, workspaceKind: 'user', port: await freePort() });
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  close = () => server.close();
  const request = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let json: any;
    try { json = JSON.parse(text); } catch { /* document route */ }
    return { status: response.status, json, text };
  };
  return { root, core, workspace, projects, source, server, request, write };
}

async function tree(root: string) {
  const stat = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return null;
  const files: Record<string, string> = {};
  for (const relative of (await fs.readdir(root, { recursive: true })).sort()) {
    const file = path.join(root, relative), stat = await fs.lstat(file);
    files[relative] = stat.isDirectory() ? 'directory' : (await fs.readFile(file)).toString('base64');
  }
  return files;
}

const seeds: Seed[] = ['missing', 'empty', 'uninitialized', 'initialized'];
test('read-only panel/catalog routes accept uninitialized roots without initialization writes', async t => {
  for (const seed of seeds) for (const embedded of [false, true]) await t.test(`${seed}, embedded=${embedded}`, async t => {
    const f = await fixture(t, seed, embedded), before = await tree(f.projects);
    for (const route of ['/', '/plugins/', '/settings/', '/api/workspace', '/api/projects', '/api/plugins/manage', '/api/app-settings', '/api/packages', '/api/host', '/api/navigation']) {
      const response = await f.request('GET', route);
      assert.equal(response.status, 200, `${route}: ${response.text}`);
    }
    const info = (await f.request('GET', '/api/workspace')).json;
    assert.equal(info.exists, seed === 'initialized'); assert.equal(info.path, f.projects);
    const catalog = (await f.request('GET', '/api/projects')).json;
    assert.deepEqual(catalog.projects.map((project: any) => project.id), embedded ? ['bundled:sample'] : []);
    assert.deepEqual(await tree(f.projects), before);
  });
});

test('full panel launch leaves missing, empty and initialized user roots unchanged', async t => {
  for (const seed of seeds) await t.test(seed, async t => {
    const f = await fixture(t, seed, true), before = await tree(f.projects);
    const started = await launch({ repo: f.core, workspace: f.workspace, projects: f.projects, workspaceKind: 'user', port: await freePort(), open: false });
    assert.equal(started.result, 'started');
    try {
      assert.deepEqual(await tree(f.projects), before);
      const info = await (await fetch(started.server!.url + 'api/workspace')).json() as { path: string };
      assert.equal(info.path, f.projects);
    } finally { await started.server?.close(); }
  });
});

test('confirmed template creation lazily scaffolds the root and adds only the requested app', async t => {
  for (const seed of seeds) await t.test(seed, async t => {
    const f = await fixture(t, seed, true);
    const created = await f.request('POST', '/api/projects/new', { folder: 'my-project', name: 'My Project' });
    assert.equal(created.status, 200, created.text); assert.equal(created.json.manifest.name, 'My Project');
    assert.equal(await isWorkspace(f.projects), true);
    for (const file of ['package.json', 'pnpm-workspace.yaml', '.gitignore', 'jsconfig.json', 'projects/unsorted/my-project/xrb-project.json']) await fs.access(path.join(f.projects, file));
    assert.ok((await fs.stat(path.join(f.workspace, 'plugins'))).isDirectory());
    assert.deepEqual((await f.request('GET', '/api/projects')).json.projects.map((project: any) => project.id).sort(), ['bundled:sample', 'my-project']);
    await assert.rejects(fs.access(path.join(f.projects, '.git')));
    await assert.rejects(fs.access(path.join(f.projects, 'projects/unsorted/hello-xr')));
    if (seed === 'uninitialized') assert.equal(await fs.readFile(path.join(f.projects, 'notes.txt'), 'utf8'), 'preserve my folder');
    const beforeDuplicate = await tree(f.projects);
    assert.equal((await f.request('POST', '/api/projects/new', { folder: 'MY-PROJECT' })).status, 409);
    assert.deepEqual(await tree(f.projects), beforeDuplicate);
  });
});

test('lazy project creation preserves root files and does not initialize separate integrations', async t => {
  const f = await fixture(t, 'uninitialized', false, true);
  const originals = { 'package.json': '{"name":"existing-projects","private":true}', 'pnpm-workspace.yaml': 'packages:\n  - projects/*/*\n', '.gitignore': 'custom-ignore\n', 'README.md': 'my instructions\n' };
  for (const [name, bytes] of Object.entries(originals)) await f.write(path.join(f.projects, name), bytes);
  const created = await f.request('POST', '/api/projects/new', { folder: 'only-app', name: 'Only app' });
  assert.equal(created.status, 200, created.text);
  for (const [name, bytes] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(f.projects, name), 'utf8'), bytes);
  for (const name of ['plugins', 'third_party', '.git', 'projects/unsorted/hello-xr']) await assert.rejects(fs.access(path.join(f.projects, name)));
  await assert.rejects(fs.access(f.workspace));
  assert.deepEqual((await f.request('GET', '/api/projects')).json.projects.map((project: any) => project.id), ['only-app']);
});

test('invalid and colliding template requests do not initialize the selected root', async t => {
  const f = await fixture(t);
  for (const folder of ['../outside', 'bad/name', 'has spaces', 'UPPER']) {
    assert.equal((await f.request('POST', '/api/projects/new', { folder })).status, 409);
    await assert.rejects(fs.access(f.workspace));
  }
  assert.equal((await f.request('POST', '/api/projects/new', {})).status, 400);
  await assert.rejects(fs.access(f.workspace));
  await f.write(path.join(f.projects, 'projects/archive/Existing/xrb-project.json'), { name: 'Existing', kind: 'app' });
  const before = await tree(f.projects);
  assert.equal((await f.request('POST', '/api/projects/new', { folder: 'existing' })).status, 409);
  assert.deepEqual(await tree(f.projects), before);
});

test('lazy writes retain linked-root and product-source protections', async t => {
  const f = await fixture(t, 'missing', true), outside = path.join(f.root, 'outside');
  await fs.mkdir(outside); await f.write(path.join(outside, 'keep.txt'), 'preserve');
  await fs.symlink(outside, f.workspace, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.request('POST', '/api/projects/new', { folder: 'nope' })).status, 409);
  assert.deepEqual(await fs.readdir(outside), ['keep.txt']);
  const before = await fs.readFile(f.source);
  await assert.rejects(createProject(f.core, path.join(f.core, 'embedded'), 'nope', 'Nope', 'combined'), /embedded|Writable/);
  assert.deepEqual(await fs.readFile(f.source), before);
});

test('embedded settings prepare user-owned state lazily without workspace setup or starter app', async t => {
  const f = await fixture(t, 'missing', true), before = await fs.readFile(f.source);
  const project = (await f.request('GET', '/api/projects/bundled%3Asample')).json;
  await assert.rejects(fs.access(f.workspace));
  const saved = await f.request('PUT', '/api/projects/bundled%3Asample/manifest', { manifest: { ...project.manifest, name: 'My embedded sample' }, mtimeMs: project.manifestMtimeMs, revision: project.manifestRevision });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.manifest.name, 'My embedded sample');
  assert.ok((await fs.stat(path.join(f.workspace, '.xrb'))).isDirectory());
  assert.equal(await isWorkspace(f.workspace), false, 'effective embedded storage does not need project scaffold');
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'projects/unsorted/hello-xr']) await assert.rejects(fs.access(path.join(f.workspace, file)));
  assert.deepEqual(await fs.readFile(f.source), before);
  assert.equal((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.name, 'My embedded sample');
});

const until = async (evaluate: (expression: string) => Promise<any>, expression: string) => {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); }
  assert.fail(expression);
};

test('browser opens missing/empty/initialized roots and direct routes without setup or auto-creation', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await withBrowser(async ({ navigate, evaluate }) => {
    for (const seed of seeds) for (const embedded of [false, true]) {
      const f = await fixture(t, seed, embedded), before = await tree(f.projects);
      for (const [route, title] of [['', 'Apps'], ['plugins/', 'Plugins'], ['settings/', 'Settings']]) {
        await navigate(f.server.url + route, `document.querySelector('#panel-menu-button')?.textContent === '${title}'`);
        assert.equal(await evaluate(`!!document.querySelector('dialog[open], #workspace-setup')`), false);
        assert.deepEqual(await tree(f.projects), before);
      }
      await navigate(f.server.url, `document.querySelector('#panel-menu-button')?.textContent === 'Apps'`);
      assert.equal(await evaluate(`document.querySelectorAll('.proj[data-id="bundled:sample"]').length`), embedded ? 1 : 0);
      if (!embedded) {
        assert.equal(await evaluate(`document.querySelector('#empty-projects')?.textContent`), '+ New project');
        assert.equal(await evaluate(`document.querySelector('#project-content').hidden`), true);
      }
      assert.deepEqual(await tree(f.projects), before);
    }
  });
});

test('browser creates the first requested template only after confirmation and persists it across reload', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t);
  await withBrowser(async ({ navigate, evaluate, send }) => {
    await navigate(f.server.url, `!!document.querySelector('#empty-projects')`);
    for (const dismiss of ['cancel', 'escape']) {
      await evaluate(`document.querySelector('#empty-projects').click()`);
      assert.equal(await evaluate(`document.querySelector('#ask').open`), true);
      assert.equal(await evaluate(`document.activeElement.id`), 'ask-input');
      await assert.rejects(fs.access(f.workspace));
      if (dismiss === 'cancel') await evaluate(`document.querySelector('#ask-cancel').click()`);
      else { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
      await until(evaluate, `!document.querySelector('#ask').open`);
      await assert.rejects(fs.access(f.workspace));
    }
    await evaluate(`document.querySelector('#empty-projects').click();document.querySelector('#ask-input').value='My Project';document.querySelector('#ask-ok').click()`);
    await until(evaluate, `!document.querySelector('#ask').open && !!document.querySelector('.proj[data-id="my-project"][aria-current="true"]')`);
    assert.equal(await isWorkspace(f.workspace), true);
    assert.deepEqual((await f.request('GET', '/api/projects')).json.projects.map((project: any) => project.id), ['my-project']);
    await navigate(f.server.url, `!!document.querySelector('.proj[data-id="my-project"][aria-current="true"]')`);
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`), false);
    assert.equal(await evaluate(`document.querySelector('#project-content').hidden`), false);
  });
});

test('restoring Publish never initializes a missing workspace, but explicit publisher selection saves settings', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t, 'missing', true);
  f.server.panel.publishers = { found: [{ dir: f.workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [], status: async () => ({ state: 'unpublished', selectedUrl: '' }), publish: async () => ({ url: '' }), unpublish: async () => ({}) } }], problems: [] };
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(f.server.url, `!!document.querySelector('.project-workflow-tabs')`);
    await evaluate(`localStorage.setItem('panel.surface','publish')`);
    await navigate(f.server.url, `!!document.querySelector('[name="publication.publisher"]')`);
    await sleep(200);
    await assert.rejects(fs.access(f.workspace));
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`), false);
    assert.equal(await evaluate(`document.querySelector('[name="publication.publisher"]').value`), '');
    await evaluate(`const publisher=document.querySelector('[name="publication.publisher"]');publisher.value='fixture';publisher.dispatchEvent(new Event('change',{bubbles:true}))`);
    for (let i = 0; i < 100 && !(await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.publisher; i++) await sleep(50);
    assert.equal((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.publisher, 'fixture');
    await assert.rejects(fs.access(path.join(f.workspace, 'projects/unsorted/hello-xr')));
  });
});

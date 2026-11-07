import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { copyBundledProject } from '../src/embedded-projects.ts';
import { rebuildBundledProject, resolveProjectOutput, projectBuildRoot, PROJECT_BUILD_RECEIPT, PROJECT_BUILD_LOCK, projectPreviewRoute } from '../src/project-build.ts';
import { runProcess, type JobContext } from '../src/jobs.ts';
import { projectRunSettingsFile, readProjectRunSettings, saveProjectRunSettings } from '../src/project-run-settings.ts';
import { createProject, createWorkspace } from '../src/workspace.ts';
import { assertWritablePath } from '../src/project-access.ts';
import { bundledProjectDetails } from '../ui/bundled-project.js';
import type { Manifest } from '../src/projects.ts';
import { withBrowser, sleep } from './browser-fixture.ts';
import { defaultIcon } from '../../app-icon/src/icon.ts';

async function fixture(t: TestContext) {
  const artifacts = path.join(REPO, '.artifacts'); await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'project-origins-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'integration'), projects = path.join(root, 'editable');
  for (const dir of [core, workspace, projects]) await fs.mkdir(dir);
  async function write(base: string, relative: string, data: unknown) {
    const file = path.join(base, relative); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.isBuffer(data) || typeof data === 'string' ? data : JSON.stringify(data)); return file;
  }
  async function project(owner: string, section: string, id: string, extra: Partial<Manifest> = {}) {
    const dir = path.join(owner, 'projects', section, id);
    await write(dir, 'xrb-project.json', { name: id, kind: 'app', entry: 'dist', ...extra });
    await write(dir, 'dist/index.html', `<h1>${id}</h1>`);
    await write(dir, 'dist/icon.js', 'export default {};');
    return dir;
  }
  const embedded = path.join(core, 'embedded');
  const port = await freePort(), server = createServer({ repo: core, workspace, projects, port });
  await new Promise<void>(resolve => server.server.listen(port, '127.0.0.1', resolve));
  const request = async (method: string, url: string, data?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, body: data === undefined ? undefined : Buffer.isBuffer(data) ? new Uint8Array(data) : JSON.stringify(data) });
    const text = await response.text(); let json: any;
    try { json = JSON.parse(text); } catch { /* asset */ }
    return { status: response.status, text, json };
  };
  t.after(async () => { await server.close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }); });
  const bundled = async (id: string) => (await discoverProjectCatalog(core, workspace, projects)).projects.find(p => p.key === `bundled:${id}`)!.project;
  return { root, core, workspace, projects, embedded, write, project, request, panel: server.panel, url: server.url, bundled };
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const visit = async (relative = '') => {
    for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
      const next = path.join(relative, name), file = path.join(root, next), stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) files[next] = `link:${await fs.readlink(file)}`;
      else if (stat.isDirectory()) await visit(next);
      else files[next] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
    }
  };
  await visit(); return files;
}

async function cacheFixture(t: TestContext, target: 'host' | 'webxr' = 'host') {
  const f = await fixture(t), dir = await f.project(f.embedded, 'core', 'demo', { target, scripts: { build: 'build' } });
  await f.write(f.embedded, 'package.json', { name: 'embedded-fixture', private: true, packageManager: 'pnpm@9.15.9', scripts: { prepare: 'node -e "process.exit(75)"' } });
  await f.write(f.embedded, 'pnpm-workspace.yaml', "packages:\n  - 'projects/*/*'\n  - 'plugins/*'\n");
  await f.write(f.embedded, 'plugins/shared/package.json', { name: '@fixture/shared', version: '1.0.0', type: 'module', exports: './index.js' });
  await f.write(f.embedded, 'plugins/shared/index.js', 'export const text = "cached fixture";');
  await f.write(dir, 'package.json', { name: 'demo', private: true, type: 'module', scripts: { prebuild: 'node -e "process.exit(74)"', build: 'node build.mjs', postbuild: 'node -e "process.exit(76)"' }, dependencies: { '@fixture/shared': 'workspace:*' } });
  await f.write(f.embedded, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  plugins/shared: {}\n  projects/core/demo:\n    dependencies:\n      '@fixture/shared':\n        specifier: workspace:*\n        version: link:../../../plugins/shared\n");
  await f.write(dir, 'build.mjs', `import fs from 'node:fs/promises'; import {spawnSync} from 'node:child_process'; import {text} from '@fixture/shared';
    if (spawnSync('git', ['rev-parse', '--show-toplevel'], {encoding:'utf8'}).status === 0) throw new Error('Ambient repository leaked into the build snapshot');
    await fs.mkdir('dist', {recursive:true});
    await fs.writeFile('dist/index.html', '<html><head></head><body><h1>'+text+'</h1><script src="asset.js"></script></body></html>');
    await fs.writeFile('dist/asset.js', 'document.body.dataset.cached="yes";');`);
  const p = await f.bundled('demo');
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const ctx: JobContext = { line() {}, async run(_command, args, options) {
    const cwd = String(options!.cwd); calls.push({ args, cwd });
    assert.equal(String(options!.env!.XRB_CORE), f.core);
    assert.ok(cwd.startsWith(projectBuildRoot(f.core, f.workspace, p)));
    if (args.join(' ').includes(' run ')) {
      await fs.mkdir(path.join(cwd, 'dist'));
      await fs.writeFile(path.join(cwd, 'dist/index.html'), '<html><head></head><body>cached output<script src="asset.js"></script></body></html>');
      await fs.writeFile(path.join(cwd, 'dist/asset.js'), 'document.body.dataset.cached="yes";');
    } else {
      assert.match(args.join(' '), /--frozen-lockfile/); assert.match(args.join(' '), /--ignore-scripts/);
      await assert.rejects(fs.access(path.join(cwd, 'projects/core/demo/dist')), 'no packaged output is copied into a build');
    }
  } };
  return { ...f, dir, p, ctx, calls };
}

test('bundled cached builds isolate installation, publish only output and pin preview/native consumers', async t => {
  const f = await cacheFixture(t), icon = defaultIcon(16);
  await fs.writeFile(path.join(f.dir, 'icon.png'), icon);
  const before = await snapshot(f.core);
  const initial = await resolveProjectOutput(f.core, f.workspace, f.p);
  assert.equal(initial.origin, 'packaged'); await assert.rejects(fs.access(projectBuildRoot(f.core, f.workspace, f.p)));
  await fs.chmod(path.join(f.dir, 'package.json'), 0o444);
  await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  const output = await resolveProjectOutput(f.core, f.workspace, f.p);
  assert.equal(output.problem, null); assert.equal(output.origin, 'cache'); assert.ok(output.generation);
  assert.deepEqual(await fs.readFile(path.join(output.entry!, 'xrb-app-icon.png')), icon);
  assert.deepEqual(await snapshot(f.core), before);
  const page = await f.request('GET', '/preview/bundled%3Ademo/'); assert.equal(page.status, 200, page.text); assert.match(page.text, /cached output/);
  const route = projectPreviewRoute(f.p, output);
  assert.match((await f.request('GET', `${route}asset.js`)).text, /cached/);
  assert.equal((await f.request('GET', `${route}package.json`)).status, 404);
  const info = (await f.request('GET', '/api/projects/bundled%3Ademo')).json;
  assert.equal(info.build.canRebuild, true); assert.equal(info.build.origin, 'cache'); assert.equal(info.entryExists, true);
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'fake executable');
  let native: any; f.panel.runner.start = async request => { native = request; };
  await f.panel.run(f.p, 'built'); assert.equal(native.entryDir, output.entry);
  const old = await snapshot(output.entry!);
  await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  assert.notEqual((await resolveProjectOutput(f.core, f.workspace, f.p)).generation, output.generation);
  assert.deepEqual(await snapshot(output.entry!), old);
  assert.equal((await f.request('GET', route)).status, 200);
});

test('failed and stale bundled caches block automatic fallback while pinned generations and personal choices survive', async t => {
  const f = await cacheFixture(t);
  const settings = await readProjectRunSettings(f.core, f.workspace, f.p);
  await saveProjectRunSettings(f.core, f.workspace, f.p, { flat: true }, settings.revision);
  await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  const old = await resolveProjectOutput(f.core, f.workspace, f.p);
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, { line() {}, async run() { throw new Error('fixture build failed'); } }), /fixture build failed/);
  assert.equal((await f.request('GET', '/preview/bundled%3Ademo/')).status, 409);
  assert.equal((await f.request('GET', projectPreviewRoute(f.p, old))).status, 200);
  assert.equal((await readProjectRunSettings(f.core, f.workspace, f.p)).values.flat, true);
  await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  await f.write(f.core, 'packages/sdk/src/changed.ts', '// SDK update');
  assert.match((await resolveProjectOutput(f.core, f.workspace, f.p)).problem!, /inputs changed/);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/run', { mode: 'built' })).status, 409);
  assert.equal((await f.request('GET', projectPreviewRoute(f.p, old))).status, 200);
});

test('bundled build receipts, snapshots and locks reject tampering and linked destinations', async t => {
  const f = await cacheFixture(t); await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  const output = await resolveProjectOutput(f.core, f.workspace, f.p), root = projectBuildRoot(f.core, f.workspace, f.p);
  const file = path.join(root, PROJECT_BUILD_RECEIPT), original = await fs.readFile(file, 'utf8');
  for (const invalid of ['{do-not-echo', 'x'.repeat(65537), JSON.stringify({ ...JSON.parse(original), core: 'wrong' }), JSON.stringify({ ...JSON.parse(original), generation: '../escape' })]) {
    await fs.writeFile(file, invalid); const status = await resolveProjectOutput(f.core, f.workspace, f.p);
    assert.equal(status.entry, null); assert.ok(!status.problem!.includes('do-not-echo'));
    assert.equal(await fs.readFile(file, 'utf8'), invalid);
  }
  await fs.writeFile(file, original);
  await fs.writeFile(path.join(output.entry!, 'asset.js'), 'tampered');
  assert.match((await resolveProjectOutput(f.core, f.workspace, f.p)).problem!, /output is missing or changed/);
  assert.equal((await f.request('GET', `${projectPreviewRoute(f.p, output)}asset.js`)).status, 409);
  const lock = path.join(root, PROJECT_BUILD_LOCK); await fs.writeFile(lock, 'foreign builder');
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, f.ctx), /lock exists/);
  assert.equal(await fs.readFile(lock, 'utf8'), 'foreign builder'); await fs.unlink(lock);
  const other = path.join(f.root, 'other'); await fs.mkdir(other);
  const keep = `${root}-preserved`; await fs.rename(root, keep);
  await fs.symlink(other, root, process.platform === 'win32' ? 'junction' : 'dir');
  const count = f.calls.length;
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, f.ctx), /link|root|directory/);
  assert.equal(f.calls.length, count); assert.deepEqual(await fs.readdir(other), []);
});

test('bundled rebuild API reserves jobs and blocks launches/settings until completion', async t => {
  const f = await cacheFixture(t);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
  const start = f.panel.jobs.start.bind(f.panel.jobs);
  f.panel.jobs.start = (kind, id, title, body, ...rest) => start(kind, id, title, ctx => body({ ...ctx, async run(cmd, args, options) {
    entered(); await gate; await f.ctx.run(cmd, args, options);
  } }), ...rest);
  const response = await f.request('POST', '/api/projects/bundled%3Ademo/rebuild-app', {}); assert.equal(response.status, 202, response.text);
  await ready;
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/run', { mode: 'built' })).status, 409);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/rebuild-app', {})).status, 409);
  const settings = await readProjectRunSettings(f.core, f.workspace, f.p);
  await assert.rejects(f.panel.saveRunSettings(f.p, {}, settings.revision), /running/);
  release(); const job = f.panel.jobs.active().find(job => job.id === response.json.id)!; await f.panel.jobs.wait(job);
  assert.equal(job.state, 'done', job.error ?? '');
  assert.equal((await resolveProjectOutput(f.core, f.workspace, f.p)).problem, null);
});

test('real frozen pnpm workspace install and declared build execute only inside the bundled cache', { timeout: 60000 }, async t => {
  const f = await cacheFixture(t), before = await snapshot(f.core), lines: string[] = [];
  await f.write(f.workspace, 'package.json', { name: 'unrelated-user-root', private: true, scripts: { install: 'node -e "process.exit(73)"' } });
  const ctx: JobContext = { line(line) { lines.push(line); }, async run(command, args, options) {
    assert.ok(String(options?.cwd).startsWith(projectBuildRoot(f.core, f.workspace, f.p)));
    const code = await runProcess(command, args, line => lines.push(line), options);
    assert.equal(code, 0, lines.join('\n'));
  } };
  try {
    await rebuildBundledProject(f.core, f.workspace, f.p, ctx);
    const output = await resolveProjectOutput(f.core, f.workspace, f.p);
    assert.equal(output.problem, null); assert.match(await fs.readFile(path.join(output.entry!, 'index.html'), 'utf8'), /cached fixture/);
    assert.deepEqual(await snapshot(f.core), before);
    await assert.rejects(fs.access(path.join(f.projects, 'node_modules')));
    await assert.rejects(fs.access(path.join(f.workspace, 'node_modules')));
  } finally { await fs.writeFile(path.join(REPO, '.artifacts/project-cache-real-build.log'), lines.join('\n')); }
});

test('independent bundled builders cannot overlap installation or replace another writer lock', async t => {
  const f = await cacheFixture(t), ready = path.join(f.root, 'ready'); await fs.mkdir(ready);
  const script = `import fs from 'node:fs/promises'; import path from 'node:path';
    import { rebuildBundledProject } from ${JSON.stringify(import.meta.resolve('../src/project-build.ts'))};
    const [core, user, project, ready, id] = process.argv.slice(1);
    await fs.writeFile(path.join(ready, id), 'ready');
    while ((await fs.readdir(ready)).length < 3) await new Promise(r => setTimeout(r, 10));
    try { await rebuildBundledProject(core, user, JSON.parse(project), { line() {}, async run(_cmd, args, opts) {
      await new Promise(r => setTimeout(r, 250));
      if (args.join(' ').includes(' run ')) {
        await fs.mkdir(path.join(opts.cwd, 'dist'));
        await fs.writeFile(path.join(opts.cwd, 'dist/index.html'), '<html><head></head><body>concurrent</body></html>');
      }
    } }); console.log('built'); } catch(error) { if (!/lock exists/.test(error.message)) throw error; console.log('locked'); }`;
  const results = await Promise.all([1, 2, 3].map(id => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, f.core, f.workspace, JSON.stringify(f.p), ready, String(id)], { timeout: 15000 })));
  assert.equal(results.filter(result => result.stdout.trim() === 'built').length, 1);
  assert.equal((await resolveProjectOutput(f.core, f.workspace, f.p)).problem, null);
  await assert.rejects(fs.access(path.join(projectBuildRoot(f.core, f.workspace, f.p), PROJECT_BUILD_LOCK)));
});

test('unsupported package inputs fail before cache creation and changed or linked build output cannot publish', async t => {
  const f = await cacheFixture(t), root = projectBuildRoot(f.core, f.workspace, f.p);
  const packageFile = path.join(f.dir, 'package.json'), saved = await fs.readFile(packageFile);
  for (const dependency of ['file:../../../../outside', 'link:../outside', 'workspace:../../outside']) {
    await fs.writeFile(packageFile, JSON.stringify({ ...JSON.parse(saved.toString()), dependencies: { outside: dependency } }));
    await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, f.ctx), /file\/link/);
  }
  await fs.writeFile(packageFile, saved);
  await f.write(f.embedded, '.npmrc', 'registry=https://invalid.example');
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, f.ctx), /configuration/);
  await fs.unlink(path.join(f.embedded, '.npmrc'));
  const yaml = await fs.readFile(path.join(f.embedded, 'pnpm-workspace.yaml'));
  await fs.writeFile(path.join(f.embedded, 'pnpm-workspace.yaml'), "packages:\n  - '../outside/*'\n");
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, f.ctx), /canonical package globs/);
  await fs.writeFile(path.join(f.embedded, 'pnpm-workspace.yaml'), yaml);
  assert.equal(f.calls.length, 0); await assert.rejects(fs.access(root));
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, { ...f.ctx, async run(cmd, args, options) {
    await f.ctx.run(cmd, args, options);
    if (args.join(' ').includes(' run ')) await f.write(f.embedded, 'plugins/shared/index.js', 'export const text = "changed during build";');
  } }), /changed during build/);
  assert.equal((await resolveProjectOutput(f.core, f.workspace, f.p)).entry, null);
  const target = await f.write(f.root, 'external-data', 'unchanged');
  await assert.rejects(rebuildBundledProject(f.core, f.workspace, f.p, { ...f.ctx, async run(cmd, args, options) {
    await f.ctx.run(cmd, args, options);
    if (args.join(' ').includes(' run ')) await fs.link(target, path.join(String(options!.cwd), 'dist/linked.txt'));
  } }), /link/);
  assert.equal(await fs.readFile(target, 'utf8'), 'unchanged');
  assert.equal((await resolveProjectOutput(f.core, f.workspace, f.p)).entry, null);
});

test('cache identities separate archived projects, core installations and user workspaces', async t => {
  const f = await cacheFixture(t); await rebuildBundledProject(f.core, f.workspace, f.p, f.ctx);
  const original = projectBuildRoot(f.core, f.workspace, f.p), saved = await fs.readFile(path.join(original, PROJECT_BUILD_RECEIPT));
  const otherUser = path.join(f.root, 'other-user'); await fs.mkdir(otherUser);
  assert.equal((await resolveProjectOutput(f.core, otherUser, f.p)).origin, 'packaged');
  const archive = path.join(f.embedded, 'projects/archive/demo'); await fs.mkdir(path.dirname(archive)); await fs.rename(f.dir, archive);
  const archived = await f.bundled('archive/demo'), archivedRoot = projectBuildRoot(f.core, f.workspace, archived);
  assert.notEqual(archivedRoot, original);
  assert.equal((await resolveProjectOutput(f.core, f.workspace, archived)).origin, 'packaged');
  await fs.mkdir(archivedRoot, { recursive: true }); await fs.writeFile(path.join(archivedRoot, PROJECT_BUILD_RECEIPT), saved);
  assert.match((await resolveProjectOutput(f.core, f.workspace, archived)).problem!, /another source/);
  const otherCore = path.join(f.root, 'other-core'); await fs.mkdir(path.join(otherCore, 'embedded'), { recursive: true });
  assert.notEqual(projectBuildRoot(otherCore, f.workspace, archived), archivedRoot);
  assert.equal((await resolveProjectOutput(otherCore, f.workspace, archived)).entry, null);
});

test('browser rebuilds from bundled details and loads generation-pinned cached assets', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await cacheFixture(t, 'webxr'), before = await snapshot(f.core);
  let launched = '';
  f.panel.runner.startPreview = async (_request, _mode, launch) => { await launch(null); };
  f.panel.launchBrowser = async href => { launched = href; return {} as never; };
  // Exercise the actual button/job/installer/build path; no native device starts.
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(f.url, `document.querySelector('.proj[data-id="bundled:demo"]')`);
    await evaluate(`document.querySelector('.proj[data-id="bundled:demo"]').click()`);
    for (let i = 0; i < 100 && !await evaluate(`!!document.querySelector('#bundled-rebuild')`); i++) await sleep(50);
    await evaluate(`document.querySelector('#bundled-rebuild').click()`);
    for (let i = 0; i < 200 && (await resolveProjectOutput(f.core, f.workspace, f.p)).origin !== 'cache'; i++) await sleep(50);
    for (let i = 0; i < 200 && !(await resolveProjectOutput(f.core, f.workspace, f.p)).entry; i++) await sleep(50);
    const output = await resolveProjectOutput(f.core, f.workspace, f.p);
    assert.equal(output.problem, null); assert.ok(output.generation);
    for (let i = 0; i < 100 && !await evaluate(`!!document.querySelector('#bundled-run:not(:disabled)')`); i++) await sleep(50);
    await evaluate(`document.querySelector('#bundled-run').click()`);
    for (let i = 0; i < 100 && !launched; i++) await sleep(50);
    assert.ok(new URL(launched).pathname.includes(`@${output.generation}/`));
    await navigate(launched, `document.body.dataset.cached === 'yes'`);
    assert.match(await evaluate('document.body.textContent'), /cached fixture/);
    assert.deepEqual(await snapshot(f.core), before);
  });
});

test('HTTP catalog distinguishes both origins and archives without changing editable aliases or layout', async t => {
  const f = await fixture(t);
  await f.project(f.embedded, 'core', 'demo'); await f.project(f.projects, 'examples', 'demo');
  await f.project(f.embedded, 'archive', 'old'); await f.project(f.projects, 'archive', 'old');
  await f.project(f.embedded, 'unsorted', 'product-only'); await f.project(f.workspace, 'unsorted', 'integration-only');
  const response = await f.request('GET', '/api/projects'); assert.equal(response.status, 200);
  assert.deepEqual(response.json.projects.map((p: any) => p.id).sort(), ['bundled:demo', 'bundled:product-only', 'demo']);
  assert.deepEqual(response.json.archived.map((p: any) => p.id).sort(), ['archive/old', 'bundled:archive/old']);
  const product = response.json.projects.find((p: any) => p.id === 'bundled:demo');
  assert.equal(product.readOnly, true); assert.equal(product.origin, 'bundled'); assert.equal(product.section, 'core');
  assert.equal(product.icon.model, '/preview/bundled%3Ademo/icon.js');
  assert.equal(JSON.stringify(response.json.layout).includes('bundled:'), false);
  assert.equal((await f.request('GET', '/api/projects/workspace%3Ademo')).json.id, 'demo');
  assert.equal((await f.request('GET', '/api/projects/bundled%3Aarchive/old')).json.archived, true);
  assert.equal((await f.request('GET', '/api/projects/product-only')).status, 404);
  assert.equal((await f.request('GET', '/api/projects/integration-only')).status, 404);
});

test('all embedded mutations fail before jobs, services or product writes, including forged layout membership', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'demo');
  const before = await snapshot(f.core);
  for (const action of ['archive', 'unarchive', 'delete', 'open-manifest', 'open-folder', 'build-web', 'rebuild-app', 'render-icon', 'package', 'package-setup', 'publish', 'activate', 'delete-release', 'unpublish']) {
    const result = await f.request('POST', `/api/projects/bundled%3Ademo/${action}`, {});
    assert.equal(result.status, 409, `${action}: ${result.text}`);
  }
  for (const [method, action] of [['PUT', 'manifest'], ['PUT', 'icon'], ['DELETE', 'icon']])
    assert.equal((await f.request(method, `/api/projects/bundled%3Ademo/${action}`, {})).status, 409);
  assert.equal((await f.request('PUT', '/api/layout', { sections: [{ name: 'examples', items: ['bundled:demo'] }] })).status, 409);
  const p = await f.bundled('demo');
  for (const action of [() => f.panel.webBuild(p), () => f.panel.rebuildApp(p), () => f.panel.renderIcon(p)]) assert.throws(action, /read-only/);
  for (const action of [() => f.panel.deleteProject(p), () => f.panel.packageBuild(p, {}), () => f.panel.publish(p), () => f.panel.packageSetup(p, true)]) await assert.rejects(action(), /read-only/);
  assert.equal(f.panel.jobs.list().length, 0);
  assert.deepEqual(await snapshot(f.core), before);
});

test('packaged browser preview and icons are read-only, skip scripts/finalization and keep archive routes', async t => {
  const f = await fixture(t);
  const dir = await f.project(f.embedded, 'archive', 'demo', { target: 'webxr', scripts: { build: 'must-not-run', dev: 'must-not-run' }, icon: 'icon.png' });
  await f.write(dir, 'icon.png', Buffer.from('89504e470d0a1a0a', 'hex'));
  const before = await snapshot(f.core);
  const locked = path.join(dir, 'dist/index.html'); await fs.chmod(locked, 0o444);
  t.after(() => fs.chmod(locked, 0o644).catch(() => {}));
  const page = await f.request('GET', '/preview/bundled%3Aarchive/demo/');
  assert.equal(page.status, 200); assert.equal(page.text, '<h1>demo</h1>');
  assert.equal((await f.request('GET', '/preview/bundled%3Aarchive/demo/icon.js')).status, 200);
  assert.equal((await f.request('GET', '/api/projects/bundled%3Aarchive/demo/icon')).status, 200);
  const icon = await fetch(`${f.url}api/projects/bundled%3Aarchive/demo/icon`, { headers: { origin: 'https://app.local' } });
  assert.equal(icon.headers.get('access-control-allow-origin'), 'https://app.local');
  await icon.arrayBuffer();
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aarchive/demo/preview', { mode: 'dev' })).status, 409);
  let launched = '';
  f.panel.launchBrowser = async url => { launched = url; return {} as never; };
  f.panel.runner.startPreview = async (_request, _mode, launch) => { await launch(null); };
  const result = await f.request('POST', '/api/projects/bundled%3Aarchive/demo/preview', { mode: 'built' });
  assert.equal(result.status, 200, result.text);
  assert.match(launched, /preview\/bundled%3Aarchive\/demo\//);
  assert.equal(f.panel.jobs.list().length, 0);
  await assert.rejects(fs.access(path.join(f.workspace, 'build')));
  assert.deepEqual(await snapshot(f.core), before);
  await fs.chmod(locked, 0o644);
});

test('native bundled run uses packaged entry and user-owned scoped config, icons and recordings', async t => {
  const f = await fixture(t);
  const dir = await f.project(f.embedded, 'core', 'demo', { iconColor: 'red', host: { recordHands: 'recordings/hands.jsonl' } });
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'not an executable');
  const before = await snapshot(f.core);
  let run: any;
  f.panel.runner.start = async options => { run = options; };
  const result = await f.request('POST', '/api/projects/bundled%3Ademo/run', { mode: 'built' });
  assert.equal(result.status, 200, result.text);
  assert.equal(run.projectId, 'bundled:demo'); assert.equal(run.entryDir, path.join(dir, 'dist'));
  for (const prefix of ['--config=', '--icon=', '--record-hands=']) {
    const output = run.hostArgs.find((arg: string) => arg.startsWith(prefix)).slice(prefix.length);
    assert.ok(output.startsWith(path.join(f.workspace, 'build/project-state')), output);
  }
  assert.equal(f.panel.jobs.list().length, 0);
  assert.deepEqual(await snapshot(f.core), before);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/run', { mode: 'dev' })).status, 409);
  const p = await f.bundled('demo');
  await assert.rejects(f.panel.hostArgs(p, { ...p.manifest!, host: { args: ['--render-icon=icon.png'] } }), /editable copy/);
});

test('copy strips deployment, signing, machine and generated state and belongs only to the selected project root', async t => {
  const f = await fixture(t);
  const dir = await f.project(f.embedded, 'archive', 'demo', { scripts: { build: 'build', dev: 'dev' }, platform: 'station', plugins: { station: { id: 'old-id', signing: 'fixture-secret' } }, host: { recordHands: 'capture.jsonl' }, platformSettings: { 'host:station': { monitor: 4 } }, publication: { enabled: true, publisher: 'fixture', id: randomUUID(), slug: 'live' } });
  for (const name of ['.env', '.npmrc', '.git/config', 'config/signing.json', 'recordings/hands.json', 'capture.jsonl', 'builds/old.zip', 'node_modules/module.js', 'identity.key']) await f.write(dir, name, 'must not copy');
  await f.write(dir, 'src/app.js', 'export const value = 1;');
  await f.write(dir, 'assets/picture.png', Buffer.from([0, 1, 2, 255]));
  await f.write(dir, 'package.json', { name: 'old-name', scripts: { build: 'fixture-build' }, publishConfig: { registry: 'https://invalid.example' } });
  const before = await snapshot(f.core);
  const response = await f.request('POST', '/api/projects/bundled%3Aarchive/demo/copy', { folder: 'new-demo', name: 'My demo' });
  assert.equal(response.status, 201, response.text); assert.equal(response.json.id, 'new-demo'); assert.equal(response.json.readOnly, false);
  const target = path.join(f.projects, 'projects/unsorted/new-demo');
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'xrb-project.json'), 'utf8'));
  assert.deepEqual(manifest, { name: 'My demo', kind: 'app', entry: 'dist', scripts: { build: 'build', dev: 'dev' } });
  const pkg = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'new-demo'); assert.equal(pkg.private, true); assert.equal(pkg.publishConfig, undefined);
  assert.deepEqual(await fs.readFile(path.join(target, 'assets/picture.png')), Buffer.from([0, 1, 2, 255]));
  for (const name of ['.env', '.npmrc', '.git', 'config', 'recordings', 'capture.jsonl', 'builds', 'node_modules', 'identity.key', 'dist']) await assert.rejects(fs.access(path.join(target, name)), name);
  await assert.rejects(fs.access(path.join(f.workspace, 'projects')));
  assert.deepEqual(await snapshot(f.core), before);
  assert.equal((await f.request('PUT', '/api/projects/new-demo/manifest', { manifest: { ...manifest, description: 'Edited copy' }, mtimeMs: response.json.manifestMtimeMs })).status, 200);
  assert.deepEqual(await snapshot(f.core), before);
});

test('copy never replaces existing/competing destinations and rejects unsafe source trees', async t => {
  const f = await fixture(t), dir = await f.project(f.embedded, 'core', 'demo');
  const responses = await Promise.all([1, 2].map(() => f.request('POST', '/api/projects/bundled%3Ademo/copy', { folder: 'copy' })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await f.request('GET', '/preview/copy/')).status, 200);
  await fs.mkdir(path.join(f.projects, 'projects/unsorted/empty'));
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/copy', { folder: 'empty' })).status, 409);
  const alias = path.join(f.root, 'core-alias');
  await fs.symlink(f.core, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await copyBundledProject(alias, f.projects, await f.bundled('demo'), 'alias-copy'), 'alias-copy');
  await fs.unlink(alias);
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside); await f.write(outside, 'secret.json', 'not source');
  await fs.symlink(outside, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyBundledProject(f.core, f.projects, await f.bundled('demo'), 'unsafe'), /outside its owner or uses a link/);
  await assert.rejects(fs.access(path.join(f.projects, 'projects/unsorted/unsafe')));
});

test('preview and copy reject linked artifacts and writable aliases cannot reach product sources', async t => {
  const f = await fixture(t), dir = await f.project(f.embedded, 'core', 'demo');
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside); await f.write(outside, 'index.html', 'secret');
  await fs.rm(path.join(dir, 'dist'), { recursive: true });
  await fs.symlink(outside, path.join(dir, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.request('GET', '/preview/bundled%3Ademo/')).status, 403);
  const user = await f.project(f.projects, 'unsorted', 'demo');
  const productFile = await f.write(f.embedded, 'protected.png', Buffer.from('89504e470d0a1a0a', 'hex'));
  await fs.link(productFile, path.join(user, 'icon.png'));
  const protectedBytes = await fs.readFile(productFile);
  assert.equal((await f.request('PUT', '/api/projects/demo/icon', Buffer.from('89504e470d0a1a0a00000000', 'hex'))).status, 409);
  assert.deepEqual(await fs.readFile(productFile), protectedBytes);
  assert.throws(() => assertWritablePath(f.core, f.projects, path.join(user, 'icon.png')), /link/);
  assert.throws(() => createServer({ repo: f.core, workspace: f.embedded }), /outside embedded/);
  assert.throws(() => createServer({ repo: f.core, workspace: f.workspace, projects: path.join(f.embedded, 'future') }), /outside embedded/);
  await fs.symlink(f.embedded, path.join(f.projects, 'projects/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertWritablePath(f.core, f.projects, path.join(f.projects, 'projects/linked/new')), /escapes|embedded/);
  await assert.rejects(createProject(f.core, f.embedded, 'new'), /embedded/);
  await assert.rejects(createWorkspace(f.core, path.join(f.embedded, 'new')), /embedded/);
});

test('layout, archive, deletion and creation refuse writable paths aliased into product sources', async t => {
  const f = await fixture(t);
  await f.project(f.embedded, 'core', 'product'); await f.project(f.projects, 'examples', 'user');
  const layout = await f.write(f.embedded, 'xrb-panel.json', { sections: [] });
  await fs.link(layout, path.join(f.projects, 'xrb-panel.json'));
  const before = await snapshot(f.core);
  for (const action of ['archive', 'delete']) assert.equal((await f.request('POST', `/api/projects/user/${action}`, {})).status, 409);
  assert.equal((await f.request('PUT', '/api/layout', { sections: [] })).status, 409);
  await fs.unlink(path.join(f.projects, 'xrb-panel.json'));
  await fs.symlink(path.join(f.embedded, 'projects/core'), path.join(f.projects, 'projects/unsorted'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.request('PUT', '/api/layout', { sections: [] })).status, 409);
  assert.equal((await f.request('POST', '/api/projects/new', { folder: 'new' })).status, 409);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aproduct/copy', { folder: 'new' })).status, 409);
  await fs.mkdir(path.join(f.workspace, '.xrb/state'), { recursive: true });
  await fs.symlink(f.embedded, path.join(f.workspace, '.xrb/state/builds'), process.platform === 'win32' ? 'junction' : 'dir');
  const preview = await f.request('GET', '/preview/user/');
  assert.equal(preview.status, 400);
  assert.match(preview.json.error, /escapes|embedded/);
  assert.deepEqual(await snapshot(f.core), before);
  await fs.access(path.join(f.projects, 'projects/examples/user/xrb-project.json'));
});

test('personal settings inherit defaults, save only in the user workspace and require a current revision', async t => {
  const f = await fixture(t), dir = await f.project(f.embedded, 'core', 'demo');
  const p = await f.bundled('demo'), before = await snapshot(f.core);
  await fs.chmod(path.join(dir, 'xrb-project.json'), 0o444);
  const initial = (await f.request('GET', '/api/projects/bundled%3Ademo/run-settings')).json;
  assert.deepEqual(initial.overrides, {}); assert.equal(initial.values.display, 'desktop');
  await assert.rejects(fs.access(path.join(f.workspace, 'config')));
  const saved = await f.request('PUT', '/api/projects/bundled%3Ademo/run-settings', { revision: initial.revision, overrides: { inputs: ['keyboard'], flat: true, monitor: 2 } });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.values.flat, true);
  assert.equal((await f.request('PUT', '/api/projects/bundled%3Ademo/run-settings', { revision: initial.revision, overrides: {} })).status, 409);
  assert.equal((await f.request('PUT', '/api/projects/bundled%3Ademo/run-settings', { overrides: {} })).status, 400);
  const file = projectRunSettingsFile(f.core, f.workspace, p);
  await fs.access(file); await assert.rejects(fs.access(path.join(f.projects, 'config')));
  assert.deepEqual(await snapshot(f.core), before);
  // Product updates change inherited defaults without rewriting saved choices or accepting a stale editor.
  await fs.chmod(path.join(dir, 'xrb-project.json'), 0o644);
  await f.write(dir, 'xrb-project.json', { ...p.manifest, plugins: { desktop: { fullscreen: true } } });
  const defaultsChanged = (await f.request('GET', '/api/projects/bundled%3Ademo/run-settings')).json;
  assert.equal(defaultsChanged.values.fullscreen, true); assert.equal(defaultsChanged.values.monitor, 2);
  assert.equal((await f.request('DELETE', '/api/projects/bundled%3Ademo/run-settings', { revision: saved.json.revision })).status, 409);
  const reset = await f.request('DELETE', '/api/projects/bundled%3Ademo/run-settings', { revision: defaultsChanged.revision });
  assert.equal(reset.status, 200, reset.text); assert.deepEqual(reset.json.overrides, {});
  assert.equal(reset.json.values.monitor, 0); assert.equal(reset.json.values.fullscreen, true);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/copy', { folder: 'copy' })).status, 201);
  assert.equal((await f.request('GET', '/api/projects/copy/run-settings')).status, 409);
});

test('independent settings writers cannot lose an update and leave no temporary files or locks', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'demo');
  const p = await f.bundled('demo'), initial = await readProjectRunSettings(f.core, f.workspace, p);
  const source = `import { saveProjectRunSettings } from ${JSON.stringify(import.meta.resolve('../src/project-run-settings.ts'))};
    const [core, workspace, project, revision, monitor] = process.argv.slice(1);
    try { await saveProjectRunSettings(core, workspace, JSON.parse(project), {monitor: Number(monitor)}, revision); console.log('saved'); }
    catch (error) { if (error.status !== 409) throw error; console.log('conflict'); }`;
  const results = await Promise.all([1, 2, 3, 4].map(monitor => promisify(execFile)(process.execPath, ['--input-type=module', '-e', source, f.core, f.workspace, JSON.stringify(p), initial.revision, String(monitor)])));
  assert.equal(results.filter(result => result.stdout.trim() === 'saved').length, 1);
  const current = await readProjectRunSettings(f.core, f.workspace, p);
  assert.ok(current.values.monitor >= 1 && current.values.monitor <= 4);
  assert.deepEqual(await fs.readdir(path.dirname(projectRunSettingsFile(f.core, f.workspace, p))), ['run.json']);
});

test('personal settings isolate core/source/workspace identities and reject a foreign copied record', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'demo');
  const p = await f.bundled('demo'), original = await readProjectRunSettings(f.core, f.workspace, p);
  await saveProjectRunSettings(f.core, f.workspace, p, { flat: true }, original.revision);
  const other = path.join(f.root, 'other-core'); await fs.mkdir(other);
  await f.project(path.join(other, 'embedded'), 'core', 'demo');
  const q = (await discoverProjectCatalog(other, f.workspace, f.projects)).projects.find(record => record.key === 'bundled:demo')!.project;
  assert.equal((await readProjectRunSettings(other, f.workspace, q)).values.flat, false);
  const file = projectRunSettingsFile(other, f.workspace, q);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.copyFile(projectRunSettingsFile(f.core, f.workspace, p), file);
  await assert.rejects(readProjectRunSettings(other, f.workspace, q), /another source/);
  assert.equal((await readProjectRunSettings(f.core, path.join(f.root, 'new-user'), p)).values.flat, false);
});

test('unsupported overrides, malformed/oversized/linked state and foreign locks never overwrite saved bytes', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'demo');
  const p = await f.bundled('demo'), initial = await readProjectRunSettings(f.core, f.workspace, p);
  for (const overrides of [{ publication: {} }, { plugins: {} }, { host: {} }, { entry: '../outside' }, { inputs: ['none'] }, { inputs: ['mouse', 'mouse'] }, { monitor: -1 }, { monitor: 0.5 }, { fullscreen: 'yes' }, { display: '--config=x' }])
    await assert.rejects(saveProjectRunSettings(f.core, f.workspace, p, overrides, initial.revision), /unsupported field or invalid value/);
  const saved = await saveProjectRunSettings(f.core, f.workspace, p, { flat: true }, initial.revision);
  const file = projectRunSettingsFile(f.core, f.workspace, p), bytes = await fs.readFile(file);
  const lock = path.join(path.dirname(file), 'run.lock'); await fs.writeFile(lock, 'another writer');
  await assert.rejects(saveProjectRunSettings(f.core, f.workspace, p, {}, saved.revision), /writer/);
  assert.equal(await fs.readFile(lock, 'utf8'), 'another writer'); await fs.unlink(lock);
  for (const bad of [Buffer.from('{"secret":"do-not-echo"'), Buffer.alloc(8193, 'x'), Buffer.from(JSON.stringify({ ...JSON.parse(bytes.toString()), overrides: { secret: 'do-not-echo' } }))]) {
    await fs.writeFile(file, bad);
    const response = await f.request('GET', '/api/projects/bundled%3Ademo/run-settings');
    assert.equal(response.status, 409); assert.ok(!response.text.includes('do-not-echo'));
    const info = (await f.request('GET', '/api/projects/bundled%3Ademo')).json;
    assert.equal(info.runSettings, null); assert.match(info.runSettingsProblem, /invalid/);
    assert.equal((await f.request('POST', '/api/projects/bundled%3Ademo/run', { mode: 'built' })).status, 409);
    await assert.rejects(saveProjectRunSettings(f.core, f.workspace, p, {}, saved.revision), /invalid/);
    assert.deepEqual(await fs.readFile(file), bad);
  }
  await fs.unlink(file);
  const outside = await f.write(f.root, 'outside.json', bytes); await fs.link(outside, file);
  await assert.rejects(readProjectRunSettings(f.core, f.workspace, p), /linked/);
  assert.deepEqual(await fs.readFile(outside), bytes);
  await fs.unlink(file); await fs.rm(path.join(f.workspace, 'config'), { recursive: true });
  const before = await snapshot(f.core);
  await fs.symlink(f.embedded, path.join(f.workspace, 'config'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(saveProjectRunSettings(f.core, f.workspace, p, {}, initial.revision), /linked/);
  assert.deepEqual(await snapshot(f.core), before);
});

test('native and browser launches consume saved settings while per-run options remain temporary', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'native'); await f.project(f.embedded, 'core', 'web', { target: 'webxr' });
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'not executable');
  const before = await snapshot(f.core);
  for (const id of ['native', 'web']) {
    const p = await f.bundled(id), current = await readProjectRunSettings(f.core, f.workspace, p);
    await saveProjectRunSettings(f.core, f.workspace, p, { inputs: ['keyboard'], monitor: 2, fullscreen: true, flat: true }, current.revision);
  }
  let run: any; f.panel.runner.start = async options => { run = options; };
  assert.equal((await f.request('POST', '/api/projects/bundled%3Anative/run', { mode: 'built' })).status, 200);
  assert.equal(run.flat, true); assert.equal(run.mouseEnabled, false);
  const configFile = run.hostArgs.find((arg: string) => arg.startsWith('--config=')).slice('--config='.length);
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  assert.deepEqual(config.inputs, ['keyboard']); assert.equal(config.plugins.desktop.monitor, 2); assert.equal(config.plugins.desktop.fullscreen, true);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Anative/run', { mode: 'built', flat: false, monitor: 0, fullscreen: false })).status, 200);
  assert.equal(run.flat, false);
  assert.equal((await f.request('GET', '/api/projects/bundled%3Anative/run-settings')).json.values.flat, true);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Anative/run', { fullscreen: 'true' })).status, 400);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aweb/preview', { mode: 'built', monitor: -1 })).status, 400);
  let browser: any; f.panel.launchBrowser = async (url, _port, monitor, fullscreen) => { browser = { url, monitor, fullscreen }; return {} as never; };
  f.panel.runner.startPreview = async (_request, _mode, launch) => { await launch(null); };
  const preview = await f.request('POST', '/api/projects/bundled%3Aweb/preview', { mode: 'built' });
  assert.equal(preview.status, 200, preview.text); assert.equal(preview.json.monitor, 2); assert.equal(preview.json.fullscreen, true);
  assert.equal(browser.monitor, 2); assert.equal(browser.fullscreen, true);
  const query = new URL(browser.url).searchParams;
  assert.equal(query.get('xrb-camera'), 'orthographic'); assert.equal(query.get('xrb-mouse'), '0');
  assert.deepEqual(await snapshot(f.core), before);
});

test('settings updates refuse active project work and launch preparation, then release their reservation', async t => {
  const f = await fixture(t); await f.project(f.embedded, 'core', 'web', { target: 'webxr' });
  const p = await f.bundled('web'), settings = await readProjectRunSettings(f.core, f.workspace, p);
  let release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  const job = f.panel.jobs.start('web-build', p.id, 'fixture work', () => gate);
  await assert.rejects(f.panel.saveRunSettings(p, {}, settings.revision), /running/);
  release(); await f.panel.jobs.wait(job);
  let starting!: () => void; const ready = new Promise<void>(resolve => { starting = resolve; });
  gate = new Promise<void>(resolve => { release = resolve; });
  f.panel.runner.startPreview = async () => { starting(); await gate; };
  const launch = f.panel.preview(p, 'built', undefined, 'fixture-token', { clientPort: 1 }); await ready;
  await assert.rejects(f.panel.saveRunSettings(p, {}, settings.revision), /launch preparation/);
  release(); await launch;
  Object.defineProperty(f.panel.runner, 'projectId', { configurable: true, value: p.id });
  await assert.rejects(f.panel.saveRunSettings(p, {}, settings.revision), /running/);
  Reflect.deleteProperty(f.panel.runner, 'projectId');
  assert.deepEqual((await f.panel.saveRunSettings(p, {}, settings.revision)).overrides, {});
});

test('browser selects duplicate origins and copies a bundled project into editable UI without product writes', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t);
  await f.project(f.embedded, 'core', 'demo'); await f.project(f.projects, 'unsorted', 'demo');
  const before = await snapshot(f.core);
  await withBrowser(async ({ evaluate, navigate }) => {
    await navigate(f.url, `!document.body.classList.contains('workspace-pending') && document.querySelectorAll('.proj').length === 2`);
    await evaluate(`document.querySelector('.proj[data-id="bundled:demo"]').click()`);
    assert.equal(await evaluate(`!!document.querySelector('#bundled-copy') && !document.querySelector('#settings') && !document.querySelector('#build-settings')`), true);
    assert.equal(await evaluate(`document.querySelector('.proj[data-id="bundled:demo"]').draggable`), false);
    assert.equal(await evaluate(`document.querySelector('.proj[data-id="demo"]').draggable`), true);
    await evaluate(`const form = document.querySelector('#bundled-run-settings'); form.querySelector('[name="flat"]').checked = true; form.querySelector('[name="monitor"]').value = '2'; form.dispatchEvent(new Event('input', {bubbles:true})); form.requestSubmit()`);
    for (let i = 0; i < 100 && !(await f.request('GET', '/api/projects/bundled%3Ademo/run-settings')).json.values.flat; i++) await sleep(50);
    await navigate(f.url, `document.querySelector('#bundled-run-settings [name="monitor"]')?.value === '2'`);
    assert.equal(await evaluate(`document.querySelector('#bundled-run-settings [name="flat"]').checked`), true);
    await evaluate(`document.querySelector('#bundled-reset-settings').click()`);
    for (let i = 0; i < 100 && await evaluate(`document.querySelector('#bundled-run-settings [name="flat"]').checked`); i++) await sleep(50);
    assert.equal(await evaluate(`document.querySelector('#bundled-run-settings [name="monitor"]').value`), '0');
    await evaluate(`const copy = document.querySelector('#bundled-copy'); copy.querySelector('input').value = 'custom-demo'; copy.requestSubmit()`);
    for (let i = 0; i < 100 && !await evaluate(`!!document.querySelector('.proj[data-id="custom-demo"][aria-current="true"]') && !!document.querySelector('#settings')`); i++) await sleep(100);
    assert.equal(await evaluate(`!!document.querySelector('.proj[data-id="custom-demo"][aria-current="true"]') && !!document.querySelector('#settings')`), true);
    assert.equal(await evaluate(`!!document.querySelector('#bundled-copy')`), false);
    await navigate(`${f.url}preview/bundled%3Ademo/`, `document.querySelector('h1')?.textContent === 'demo'`);
    assert.equal(await evaluate(`!!document.querySelector('[data-xrb-app-icon]')`), false);
  });
  assert.deepEqual(await snapshot(f.core), before);
});

test('bundled details offer personal run settings but no source editing, publication or package forms', () => {
  const p = { id: 'bundled:demo', manifest: { name: '<Demo>', description: 'Example', target: 'webxr' }, entryExists: true, archived: true, errors: [],
    runSettings: { values: { inputs: ['mouse'], display: 'desktop', flat: true, fullscreen: false, monitor: 0, cameraView: false } } };
  const html = bundledProjectDetails(p, { icon: '/icon.png', busy: false, running: false });
  assert.match(html, /&lt;Demo&gt;/); assert.match(html, /Bundled · read-only · archived/);
  assert.match(html, /Copy to workspace/); assert.match(html, /Run in browser/);
  assert.match(html, /id="bundled-run-settings"/); assert.match(html, /Restore bundled defaults/);
  assert.doesNotMatch(html, /name="(?:display|cameraView)"/);
  assert.match(bundledProjectDetails({ ...p, manifest: { ...p.manifest, target: 'host' } }, { icon: '', busy: false, running: false }), /name="cameraView"/);
  assert.match(bundledProjectDetails({ ...p, runSettings: null, runSettingsProblem: 'Invalid saved settings' }, { icon: '', busy: false, running: false }), /id="bundled-run"[^>]*disabled/);
  assert.doesNotMatch(html, /id="(?:settings|build-settings|act-publish|act-package|open-manifest|open-studio)"/);
  assert.match(bundledProjectDetails({ ...p, entryExists: false }, { icon: '', busy: false, running: false }), /id="bundled-run"[^>]*disabled/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { setupEmbeddedServices, embeddedServiceReadiness, embeddedServiceRuntime, serviceStateRoot, SERVICE_LOCK, SERVICE_RECEIPT } from '../src/service-artifacts.ts';
import { runUpdate, UpdateFailure } from '../src/update.ts';
import type { JobContext } from '../src/jobs.ts';
import { readProject } from '../src/projects.ts';
import { fixture, git } from './helpers/update-fixture.ts';

async function components(t: TestContext) {
  const f = await fixture(t), core = f.core.checkout, user = f.workspace.checkout;
  const write = async (relative: string, value: unknown) => {
    const file = path.join(f.core.publisher, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  await write('embedded/package.json', { private: true, packageManager: 'pnpm@9.15.9' });
  await write('embedded/pnpm-workspace.yaml', "packages:\n  - 'projects/*/*'\n  - 'plugins/*'\n");
  await write('embedded/pnpm-lock.yaml', "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  plugins/demo: {}\n");
  await write('embedded/plugins/demo/xrb-plugin.json', { title: 'Demo', type: 'publisher', version: '1.0.0' });
  await write('embedded/plugins/demo/package.json', { name: 'demo', type: 'module', xrBuild: { publisher: './publisher.mjs', packager: './packager.mjs' } });
  await write('embedded/plugins/demo/packager.mjs', `import fs from 'node:fs/promises';import path from 'node:path';export const packager={name:'demo-pack',target:'webxr',standalone:true,identityFields:[],validate:()=>[],async build(o){await fs.mkdir(o.out,{recursive:true});const file=path.join(o.out,'fixture.zip');await fs.writeFile(file,'fake-package');return {file,sizeBytes:12};}};`);
  const module = (label: string) => `export const publisher={name:'demo',label:${JSON.stringify(label)},origin:'https://example.test',validate:()=>[],status:async()=>({state:'unpublished',selectedUrl:''}),publish:async()=>({}),unpublish:async()=>({})};`;
  await write('embedded/plugins/demo/publisher.mjs', module('before'));
  await f.core.publish();
  git(core, 'pull', '--ff-only');
  await fs.appendFile(path.join(user, '.git/info/exclude'), '\nbuild/\n.xrb/\n');
  let installs = 0, fail = false;
  const ctx: JobContext = { line() {}, async run() { installs++; if (fail) throw new Error('fake install failed'); } };
  const first = await setupEmbeddedServices(core, user, ctx);
  const server = createServer({ repo: core, workspace: user, port: await freePort() });
  t.after(() => server.close());
  await server.panel.loadInitialServices();
  server.panel.desktopSetup.isBusy = async () => false;
  server.panel.rebuildDeps.setupServices = (c, w, job) => setupEmbeddedServices(c, w, { ...ctx, line: job.line });
  let nativeBuilds = 0, launches = 0;
  server.panel.rebuildDeps.rebuildNative = async () => { nativeBuilds++; return {} as never; };
  server.panel.desktopSetup.deps.tools = async () => ({ cmake: 'checked', generator: 'checked' } as never);
  (server.panel as unknown as { runNative: () => Promise<void> }).runNative = async () => { launches++; };
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  const request = async (route: string, method = 'POST', body?: unknown) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const change = async () => {
    await write('embedded/plugins/demo/publisher.mjs', module('after'));
    const target = await f.core.publish();
    git(core, 'pull', '--ff-only');
    await server.panel.synchronizePluginServices(true);
    assert.equal(server.panel.pluginServiceStatus().pending, true);
    return target;
  };
  return { ...f, coreRepo: f.core, core, user, server, first, ctx, request, change, write,
    fail(value: boolean) { fail = value; }, counts: () => ({ installs, nativeBuilds, launches }) };
}

for (const origin of ['workspace', 'bundled']) for (const action of ['rebuild', 'run', 'build', 'package', 'preview']) test(`${origin} ${action} recovers changed service inputs in its own logged job without restart`, async t => {
  const f = await components(t);
  await f.change();
  assert.equal((await f.request('/api/host', 'GET')).body.componentsNeedRebuild, true);
  const project = origin === 'bundled' ? path.join(f.core, 'embedded/projects/core/demo') : path.join(f.user, 'projects/unsorted/demo');
  await fs.mkdir(path.join(project, 'dist'), { recursive: true });
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify({ name: 'Demo', kind: 'app', entry: 'dist', ...(action === 'package' || action === 'preview' ? { target: 'webxr' } : {}) }));
  await fs.writeFile(path.join(project, 'dist/index.html'), '<html><head></head><body>demo</body></html>');
  (f.server.panel as unknown as { preparePreview: () => Promise<string> }).preparePreview = async () => 'http://127.0.0.1/fixture';
  const response = await f.request(action === 'rebuild' ? '/api/host/rebuild' : `/api/projects/${origin === 'bundled' ? 'bundled%3Ademo' : 'demo'}/${action === 'build' ? 'build-web' : action}`, 'POST', { mode: 'built' });
  assert.equal(response.status, 202, JSON.stringify(response.body));
  const done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.body.id)!);
  assert.equal(done.state, 'done', done.lines.join('\n'));
  assert.equal(f.server.panel.jobs.list().length, 1);
  assert.ok(done.lines.some(line => line.includes('preparing application components')));
  assert.equal(f.server.panel.publishers.found[0]!.publisher.label, 'after');
  assert.equal(f.server.panel.pluginServiceStatus().pending, false);
  assert.notEqual((await embeddedServiceRuntime(f.core, f.user)).root, f.first.runtime);
  assert.equal((await f.request('/api/host', 'GET')).body.componentsNeedRebuild, false);
  assert.equal(f.counts().launches, action === 'run' ? 1 : 0);
  assert.equal(f.counts().nativeBuilds, action === 'rebuild' ? 1 : 0);
});

for (const [mode, preparation] of [['native', 'current'], ['native', 'services'], ['native', 'native'], ['browser', 'current'], ['browser', 'services']] as const)
test(`catalog ${mode} launch tolerates an unrelated icon build failure with ${preparation} inputs`, async t => {
  const f = await components(t);
  if (preparation === 'services') await f.change();
  if (preparation === 'native') {
    const source = path.join(f.core, 'native/host'); await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'CMakeLists.txt'), 'project(fixture)');
  }
  const broken = path.join(f.user, 'projects/unsorted/broken');
  await fs.mkdir(path.join(broken, 'src'), { recursive: true });
  await fs.writeFile(path.join(broken, 'xrb-project.json'), JSON.stringify({ name: 'Broken library app', kind: 'app', scripts: { build: 'build' } }));
  await fs.writeFile(path.join(broken, 'src/icon.ts'), 'export default () => {};');
  const launcher = path.join(f.user, 'projects/unsorted/launcher');
  await fs.mkdir(path.join(launcher, 'dist'), { recursive: true });
  await fs.writeFile(path.join(launcher, 'xrb-project.json'), JSON.stringify({ name: 'Launcher', kind: 'app', catalog: true, ...(mode === 'browser' ? { target: 'webxr' } : {}) }));
  await fs.writeFile(path.join(launcher, 'dist/index.html'), '<h1>Launcher</h1>');
  const p = await readProject(launcher, 'launcher', 'unsorted'); assert.ok(p);
  let iconAttempts = 0, previews = 0;
  const panel = f.server.panel as unknown as { executeBrowserBuild: () => Promise<void>; preparePreview: () => Promise<string> };
  panel.executeBrowserBuild = async () => { iconAttempts++; throw new Error('Unrelated app build failed'); };
  panel.preparePreview = async () => { previews++; return 'http://127.0.0.1/fixture'; };
  const result = mode === 'native' ? await f.server.panel.run(p, 'built')
    : await f.server.panel.preview(p, 'built', false, 'catalog-preview-token-1234', { clientPort: 1 });
  if (preparation !== 'current') {
    assert.ok(result && typeof result === 'object');
    const job = await f.server.panel.jobs.wait(result);
    assert.equal(job.state, 'done', job.lines.join('\n'));
    assert.match(job.lines.join('\n'), /Library icon unavailable for broken: Unrelated app build failed/);
  } else {
    const iconJob = f.server.panel.jobs.list()[0]!;
    assert.equal(iconJob.state, 'failed'); assert.match(iconJob.error!, /Unrelated app build failed/);
  }
  assert.equal(iconAttempts, 1);
  assert.equal(f.counts().launches, mode === 'native' ? 1 : 0);
  assert.equal(previews, mode === 'browser' ? 1 : 0);
  assert.equal(f.counts().nativeBuilds, preparation === 'native' ? 1 : 0);
  assert.equal(f.server.panel.jobs.list().length, 1, 'prepared launches keep the best-effort icon output in the same job');
});

test('Rebuild reloads a generation already prepared by a fresh process without installing again', async t => {
  const f = await components(t); await f.change();
  await setupEmbeddedServices(f.core, f.user, f.ctx);
  const before = f.counts().installs;
  const started = await f.request('/api/host/rebuild');
  const done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.body.id)!);
  assert.equal(done.state, 'done', done.lines.join('\n'));
  assert.equal(f.counts().installs, before);
  assert.equal(f.server.panel.publishers.found[0]!.publisher.label, 'after');
});

test('Run rebuilds missing native output before launching in the same job', async t => {
  const f = await components(t);
  const source = path.join(f.core, 'native/host'); await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'CMakeLists.txt'), 'project(fixture)');
  const project = path.join(f.user, 'projects/unsorted/demo'); await fs.mkdir(path.join(project, 'dist'), { recursive: true });
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify({ name: 'Demo', kind: 'app', entry: 'dist' }));
  await fs.writeFile(path.join(project, 'dist/index.html'), '<html><head></head><body>demo</body></html>');
  const started = await f.request('/api/projects/demo/run', 'POST', { mode: 'built' });
  assert.equal(started.status, 202);
  const done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.body.id)!);
  assert.equal(done.state, 'done', done.lines.join('\n'));
  assert.equal(f.counts().nativeBuilds, 1); assert.equal(f.counts().launches, 1);
  assert.equal(f.server.panel.jobs.list().length, 1);
  assert.ok(done.lines.some(line => line.includes('compiling the host')));
});

test('failed preparation retains output and retries without deleting old generations', async t => {
  const f = await components(t); await f.change(); f.fail(true);
  const first = await f.request('/api/host/rebuild');
  const failed = await f.server.panel.jobs.wait(f.server.panel.jobs.get(first.body.id)!);
  assert.equal(failed.state, 'failed'); assert.match(failed.lines.join('\n'), /fake install failed/);
  assert.equal(f.counts().nativeBuilds, 0);
  await fs.access(f.first.runtime);
  assert.equal((await embeddedServiceReadiness(f.core, f.user)).needsBuild, true);
  f.fail(false);
  const retry = await f.request('/api/host/rebuild');
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(retry.body.id)!)).state, 'done');
});

test('unsafe output and active setup lock fail closed in a logged job', async t => {
  const f = await components(t); await f.change();
  const root = serviceStateRoot(f.core, f.user), lock = path.join(root, SERVICE_LOCK);
  const receipt = await fs.readFile(path.join(root, SERVICE_RECEIPT), 'utf8');
  await fs.writeFile(lock, 'foreign writer');
  const before = f.counts().installs;
  const response = await f.request('/api/host/rebuild');
  assert.equal(response.status, 202);
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.body.id)!)).state, 'failed');
  assert.equal(await fs.readFile(lock, 'utf8'), 'foreign writer');
  assert.equal(await fs.readFile(path.join(root, SERVICE_RECEIPT), 'utf8'), receipt);
  await fs.unlink(lock);
  await fs.writeFile(path.join(f.first.runtime, 'plugins/demo/publisher.mjs'), 'tampered');
  const retry = await f.request('/api/host/rebuild');
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(retry.body.id)!)).state, 'failed');
  assert.equal(f.counts().installs, before);
});

test('active consumers prevent replacement and changed in-place code retains a Restart result', async t => {
  const f = await components(t);
  const plugin = path.join(f.user, 'plugins/local');
  await fs.mkdir(plugin, { recursive: true });
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Local', type: 'input', version: '1.0.0' }));
  await fs.writeFile(path.join(plugin, 'module.mjs'), 'export const value=1;');
  await f.server.panel.synchronizePluginServices(true);
  await f.change();
  const panel = f.server.panel as unknown as { pluginConsumers: number };
  panel.pluginConsumers = 1;
  const before = f.counts().installs;
  const blocked = await f.request('/api/host/rebuild');
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(blocked.body.id)!)).state, 'failed');
  assert.equal(f.counts().installs, before);
  panel.pluginConsumers = 0;
  await fs.writeFile(path.join(plugin, 'module.mjs'), 'export const value=200;');
  const started = await f.request('/api/host/rebuild');
  const done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.body.id)!);
  assert.equal(done.state, 'failed');
  assert.equal((done.result as { restart: boolean }).restart, true);
  assert.match(done.lines.at(-1)!, /[Rr]estart/);
});

test('Update refreshes services after its pull and retries failed preparation at unchanged HEAD', async t => {
  const f = await components(t), lines: string[] = [];
  await f.write('embedded/plugins/demo/publisher.mjs', "export const publisher={name:'new'};");
  const target = await f.coreRepo.publish();
  f.fail(true);
  const deps = { core: f.core, git: f.runner, rebuild: async () => [], setupServices: (c: string, w: string, ctx: JobContext) => setupEmbeddedServices(c, w, { ...f.ctx, line: ctx.line }).then(() => {}) };
  const ctx = { ...f.ctx, line: (line: string) => lines.push(line) };
  await assert.rejects(runUpdate(f.user, ctx, deps), (error: unknown) => error instanceof UpdateFailure && /Application components still need Rebuild/.test(error.result.lastLine));
  assert.equal(f.coreRepo.head(), target);
  f.fail(false); lines.length = 0;
  const result = await runUpdate(f.user, ctx, deps);
  assert.equal(result.state, 'updated');
  assert.equal((await embeddedServiceReadiness(f.core, f.user)).needsBuild, false);
  assert.match(result.lastLine, /Restart required/);
});

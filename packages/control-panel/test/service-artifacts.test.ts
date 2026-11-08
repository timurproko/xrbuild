import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { runProcess, type JobContext } from '../src/jobs.ts';
import { setupEmbeddedServices, embeddedServiceRuntime, serviceStateRoot, SERVICE_RECEIPT, SERVICE_LOCK } from '../src/service-artifacts.ts';
import { discoverPublishers } from '../src/publishers.ts';
import { resolvePluginCatalog } from '../src/extension-catalog.ts';
import { resolvePluginModule } from '../src/component-resolver.ts';
import { buildInventory } from '../src/embedded-inputs.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/service-runtime-')), core = path.join(root, 'core'), user = path.join(root, 'user'), embedded = path.join(core, 'embedded');
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (relative: string, value: unknown) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
  await write('core/embedded/package.json', { name: 'service-fixture', private: true, packageManager: 'pnpm@9.15.9' });
  await write('core/embedded/pnpm-workspace.yaml', "packages:\n  - 'projects/*/*'\n  - 'plugins/*'\n");
  await write('core/embedded/plugins/library/xrb-plugin.json', { title: 'Library', type: 'plugin', version: '1.0.0', exports: { helper: './dist/index.mjs', tool: './tool.mjs' } });
  await write('core/embedded/plugins/library/package.json', { name: '@fixture/library', type: 'module', version: '1.0.0', exports: './dist/index.mjs', scripts: { build: 'node build.mjs' } });
  await write('core/embedded/plugins/library/tool.mjs', `export function createWorkspaceTool(context){return {handle(_req,res){res.setHeader('content-type','application/json');res.end(JSON.stringify({runtime:context.runtimeRoot,owner:context.plugin.key}));}};}`);
  await write('core/embedded/plugins/library/build.mjs', `import fs from 'node:fs/promises';await fs.mkdir('dist');await fs.writeFile('dist/index.mjs','export const label="installed-public-dependency";');`);
  await write('core/embedded/plugins/publisher/xrb-plugin.json', { title: 'Publisher', type: 'publisher', version: '1.0.0', references: { helper: { plugin: 'bundled:library', export: 'helper' }, tool: { plugin: 'bundled:library', export: 'tool' } }, panel: { tools: [{ id: 'service-fixture', label: 'Service fixture', route: '/service-fixture/', module: '#tool' }] } });
  await write('core/embedded/plugins/publisher/package.json', { name: '@fixture/publisher', type: 'module', version: '1.0.0', dependencies: { '@fixture/library': 'workspace:*' }, scripts: { build: 'node build.mjs' }, xrBuild: { publisher: './dist/publisher.mjs' } });
  const module = `import {label} from '@fixture/library';export const publisher={name:'fixture',label,origin:'https://example.test',validate:()=>[],status:async()=>({state:'unpublished',selectedUrl:''}),publish:async()=>({}),unpublish:async()=>({})};`;
  await write('core/embedded/plugins/publisher/build.mjs', `import fs from 'node:fs/promises';await fs.mkdir('dist');await fs.writeFile('dist/publisher.mjs',${JSON.stringify(module)});`);
  await write('core/embedded/pnpm-lock.yaml', "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  plugins/library: {}\n  plugins/publisher:\n    dependencies:\n      '@fixture/library':\n        specifier: workspace:*\n        version: link:../library\n");
  await write('user/projects/.keep', '');
  const lines: string[] = [], ctx: JobContext = { line(line) { lines.push(line); }, async run(command, args, options) {
    assert.ok(String(options?.cwd).startsWith(path.join(user, 'build/embedded')));
    const code = await runProcess(command, args, line => lines.push(line), options); assert.equal(code, 0, lines.join('\n'));
  } };
  return { root, core, user, embedded, write, ctx };
}

test('explicit service setup activates installed dependencies/builds without product writes or discovery installs', { timeout: 60000 }, async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  const initial = await discoverPublishers(f.user, f.core); assert.equal(initial.found.length, 0);
  await assert.rejects(fs.access(serviceStateRoot(f.core, f.user)));
  await fs.chmod(path.join(f.embedded, 'package.json'), 0o444);
  const first = await setupEmbeddedServices(f.core, f.user, f.ctx);
  assert.equal((await embeddedServiceRuntime(f.core, f.user)).root, first.runtime);
  const publishers = await discoverPublishers(f.user, f.core);
  assert.deepEqual(publishers.problems, []); assert.equal(publishers.found[0].publisher.label, 'installed-public-dependency');
  assert.equal(publishers.found[0].plugin!.sourceRoot, path.join(f.embedded, 'plugins/publisher'));
  const plugin = (await resolvePluginCatalog(f.user, f.core)).selected.find(p => p.id === 'publisher')!;
  const helper = await resolvePluginModule(plugin, plugin.sourceRoot, '#helper', f.user, f.core);
  assert.ok(helper.file.startsWith(first.runtime)); assert.equal(helper.owner.id, 'library');
  assert.equal((await buildInventory(f.core)).fingerprint, before);
  await assert.rejects(fs.access(path.join(f.embedded, 'node_modules')));
  const old = (await buildInventory(path.join(first.runtime, 'plugins/publisher/dist'))).fingerprint;
  const second = await setupEmbeddedServices(f.core, f.user, f.ctx); assert.notEqual(first.runtime, second.runtime);
  assert.equal((await buildInventory(path.join(first.runtime, 'plugins/publisher/dist'))).fingerprint, old);
});

test('failed, changed, linked and foreign installed service state never falls back to product modules', { timeout: 60000 }, async t => {
  const f = await fixture(t), first = await setupEmbeddedServices(f.core, f.user, f.ctx), state = serviceStateRoot(f.core, f.user), record = path.join(state, SERVICE_RECEIPT);
  const original = await fs.readFile(record, 'utf8');
  await fs.writeFile(path.join(state, SERVICE_LOCK), 'foreign');
  await assert.rejects(embeddedServiceRuntime(f.core, f.user), /lock/);
  await assert.rejects(setupEmbeddedServices(f.core, f.user, f.ctx), /lock/);
  assert.equal(await fs.readFile(path.join(state, SERVICE_LOCK), 'utf8'), 'foreign'); await fs.unlink(path.join(state, SERVICE_LOCK));
  for (const invalid of ['{bad', 'x'.repeat(65537), JSON.stringify({ ...JSON.parse(original), core: 'foreign' }), JSON.stringify({ ...JSON.parse(original), runtime: '../escape' })]) {
    await fs.writeFile(record, invalid); assert.equal((await discoverPublishers(f.user, f.core)).found.length, 0);
  }
  await fs.writeFile(record, original);
  await fs.writeFile(path.join(first.runtime, 'plugins/publisher/dist/publisher.mjs'), 'changed');
  await assert.rejects(embeddedServiceRuntime(f.core, f.user), /changed|unsafe/);
  assert.equal((await discoverPublishers(f.user, f.core)).found.length, 0);
  await assert.rejects(setupEmbeddedServices(f.core, f.user, { line() {}, async run() { throw new Error('fixture failure'); } }), /fixture failure/);
  await assert.rejects(embeddedServiceRuntime(f.core, f.user), /failed/);
});

test('installed bundled tools use declared components without user-package installs and failed snapshots leave recovery UI available', { timeout: 60000 }, async t => {
  const f = await fixture(t), first = await setupEmbeddedServices(f.core, f.user, f.ctx);
  const server = createServer({ repo: f.core, workspace: f.user, port: await freePort() });
  let userInstalls = 0;
  server.panel.prepareManagedTools = async () => { userInstalls++; throw new Error('User/private installation must not run for a bundled tool'); };
  await server.panel.loadInitialServices(); await server.managedTools.prepareConfigured();
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  try {
    const response = await fetch(server.url + 'service-fixture/'); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { runtime: first.runtime, owner: 'bundled:publisher' }); assert.equal(userInstalls, 0);
    await fs.writeFile(path.join(serviceStateRoot(f.core, f.user), SERVICE_RECEIPT), '{malformed');
    server.panel.discoveryMaxAgeMs = 0;
    const stale = await fetch(server.url + 'service-fixture/', { redirect: 'manual' });
    assert.equal(stale.status, 303); assert.equal(stale.headers.get('location'), '/tool-recovery.html?tool=service-fixture');
    assert.equal(await stale.text(), '', 'failed snapshots never serve the previously loaded implementation');
    assert.equal((await fetch(server.url + 'api/tools/service-fixture/status').then(response => response.json())).restartRequired, true);
    assert.equal((await fetch(server.url + 'api/ping')).status, 200);
    assert.equal(userInstalls, 0);
  } finally { await server.close(); }
  const recovery = createServer({ repo: f.core, workspace: f.user, port: await freePort() });
  await recovery.panel.loadInitialServices(); // Invalid cache must not prevent the panel/recovery controls from starting.
  assert.equal(recovery.panel.pluginServiceStatus().pending, true);
  await recovery.close();
});

test('declared components reject undeclared aliases, disabled owners and traversal for both origins', async t => {
  const f = await fixture(t);
  for (const owner of ['core/embedded', 'user']) {
    await f.write(`${owner}/plugins/component/xrb-plugin.json`, { title: 'Component', type: 'plugin', version: '1.0.0', exports: { module: './module.mjs' } });
    await f.write(`${owner}/plugins/component/module.mjs`, 'export const fixture = true;');
  }
  // Resolve the explicit source, never choose a duplicate by directory order.
  await f.write('user/xrb-plugins.json', { disabled: [], settings: {}, panelSettings: {}, origins: { component: 'workspace' } });
  await f.write('core/embedded/plugins/publisher/xrb-plugin.json', { title: 'Publisher', type: 'publisher', version: '1.0.0', references: { component: { plugin: 'workspace:component', export: 'module' } } });
  const catalog = await resolvePluginCatalog(f.user, f.core), plugin = catalog.selected.find(p => p.id === 'publisher')!;
  assert.equal((await resolvePluginModule(plugin, plugin.sourceRoot, '#component', f.user, f.core)).owner.key, 'workspace:component');
  await assert.rejects(resolvePluginModule(plugin, plugin.sourceRoot, '#unknown', f.user, f.core), /not declared/);
  await assert.rejects(resolvePluginModule(plugin, plugin.sourceRoot, '../component/module.mjs', f.user, f.core), /contained/);
  await f.write('user/xrb-plugins.json', { disabled: ['workspace:component'], settings: {}, panelSettings: {}, origins: { component: 'workspace' } });
  await assert.rejects(resolvePluginModule(plugin, plugin.sourceRoot, '#component', f.user, f.core), /unavailable/);
  await f.write('user/xrb-plugins.json', { disabled: [], settings: {}, panelSettings: {}, origins: { component: 'workspace' } });
  await f.write('user/plugins/component/xrb-plugin.json', { title: 'Component', type: 'plugin', version: '1.0.0', exports: { module: './linked/module.mjs' } });
  await fs.symlink(path.join(f.embedded, 'plugins/component'), path.join(f.user, 'plugins/component/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(resolvePluginModule(plugin, plugin.sourceRoot, '#component', f.user, f.core), /symbolic|junction/);
});

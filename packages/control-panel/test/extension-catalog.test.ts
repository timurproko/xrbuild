import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { resolvedPluginBinDirs } from '../src/host-build.ts';
import { containedModule, discoverProjectCatalog, resolvePluginCatalog, withinRoot } from '../src/extension-catalog.ts';
import { discoverPackagers } from '../src/packagers.ts';
import { discoverPublishers } from '../src/publishers.ts';
import { readUserPluginConfig } from '../src/plugin-config.ts';
import { readPluginPrefs, savePluginPrefs, type PluginSetting } from '../src/plugin-manager.ts';

const fields: PluginSetting[] = [
  { key: 'enabled', label: 'Enabled', type: 'boolean', default: false },
  { key: 'destination', label: 'Destination', type: 'text', default: '' },
];
async function fixture(t: TestContext) {
  const artifacts = path.join(REPO, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'extension-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user'), embedded = path.join(core, 'embedded');
  await fs.mkdir(core); await fs.mkdir(workspace);
  async function write(root: string, rel: string, value: unknown) {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  }
  async function plugin(root: string, id: string, extra = {}) {
    await write(root, `plugins/${id}/xrb-plugin.json`, { title: id, type: 'plugin', version: '0.1.0', ...extra });
    return path.join(root, 'plugins', id);
  }
  return { root, core, workspace, embedded, write, plugin };
}
const publisher = (name: string) => `({name:'${name}',origin:'https://example.invalid',validate:()=>[],status:async()=>({state:'unpublished'}),publish:async()=>({}),unpublish:async()=>({})})`;
const packager = (name: string, standalone = false) => `({name:'${name}',standalone:${standalone},identityFields:[],validate:()=>[],build:async()=>({})})`;

test('legacy static services win over unrelated same-named factory helpers unless user configuration is declared', async t => {
  const f = await fixture(t);
  for (const [root, id] of [[f.embedded, 'legacy-product'], [f.workspace, 'legacy-user']] as const) {
    await f.plugin(root, id);
    await f.write(root, `plugins/${id}/package.json`, { type: 'module', xrBuild: { publisher: './service.mjs', packager: './service.mjs' } });
    await f.write(root, `plugins/${id}/service.mjs`, `export const publisher=${publisher(id)};export const packager=${packager(id)};export function createPublisher(){throw Error('legacy helper is not a context factory');}export function createPackager(){throw Error('legacy helper is not a context factory');}`);
  }
  const pub = await discoverPublishers(f.workspace, f.core), pack = await discoverPackagers(f.core, f.workspace);
  assert.deepEqual(pub.problems, []); assert.deepEqual(pack.problems, []);
  assert.deepEqual(pub.found.map(item => item.publisher.name).sort(), ['legacy-product', 'legacy-user']);
  assert.deepEqual(pack.found.map(item => item.packager.name).sort(), ['legacy-product', 'legacy-user']);
  for (const [root, id] of [[f.embedded, 'legacy-product'], [f.workspace, 'legacy-user']] as const) await f.plugin(root, id, { config: fields });
  const configuredPub = await discoverPublishers(f.workspace, f.core), configuredPack = await discoverPackagers(f.core, f.workspace);
  assert.equal(configuredPub.found.length, 0); assert.equal(configuredPack.found.length, 0);
  assert.match(configuredPub.problems.join(' '), /legacy helper is not a context factory/);
  assert.match(configuredPack.problems.join(' '), /legacy helper is not a context factory/);
});

test('catalog resolves equivalent schemas with distinct source, dependency and writable roots', async t => {
  const f = await fixture(t);
  await f.plugin(f.embedded, 'product'); await f.plugin(f.workspace, 'external');
  const catalog = await resolvePluginCatalog(f.workspace, f.core);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.selected.map(p => p.key), ['bundled:product', 'workspace:external']);
  const [product, external] = catalog.selected;
  assert.equal(product.meta.version, external.meta.version);
  assert.equal(product.dependencyRoot, path.join(f.core, 'third_party'));
  assert.equal(external.dependencyRoot, path.join(f.workspace, 'third_party'));
  assert.equal(product.configDir, path.join(f.workspace, 'config/plugins/product'));
  assert.equal(product.readOnly, true);
  assert.equal(external.readOnly, false);
  await assert.rejects(fs.access(product.configDir), 'catalog discovery must not initialize config');
});

test('duplicates require whole-plugin origin selection and qualified preferences survive saving', async t => {
  const f = await fixture(t);
  await f.plugin(f.embedded, 'shared'); await f.plugin(f.workspace, 'shared');
  let catalog = await resolvePluginCatalog(f.workspace, f.core);
  assert.equal(catalog.selected.length, 0);
  assert.match(catalog.problems.join('\n'), /choose an origin/);
  const prefs = { disabled: ['bundled:shared'], settings: {}, panelSettings: {}, origins: { shared: 'workspace' as const } };
  await savePluginPrefs(f.workspace, prefs);
  assert.deepEqual(await readPluginPrefs(f.workspace), prefs);
  catalog = await resolvePluginCatalog(f.workspace, f.core);
  assert.deepEqual(catalog.selected.map(p => p.key), ['workspace:shared']);
  await savePluginPrefs(f.workspace, { ...prefs, origins: { shared: 'bundled' } });
  assert.equal((await resolvePluginCatalog(f.workspace, f.core)).selected.length, 0);
  await fs.rm(path.join(f.workspace, 'plugins/shared'), { recursive: true });
  await savePluginPrefs(f.workspace, { ...prefs, disabled: [] });
  catalog = await resolvePluginCatalog(f.workspace, f.core);
  assert.equal(catalog.selected.length, 0, 'missing selected origin must not fall back');
  assert.match(catalog.problems.join('\n'), /unavailable/);
});

test('plugin identities do not inherit origin choices from object prototypes', async t => {
  const f = await fixture(t);
  await f.plugin(f.embedded, 'constructor');
  await savePluginPrefs(f.workspace, { disabled: [], settings: {}, panelSettings: {}, origins: {} });
  assert.deepEqual((await resolvePluginCatalog(f.workspace, f.core)).selected.map(plugin => plugin.key), ['bundled:constructor']);
});

test('invalid duplicate metadata cannot silently select the other copy', async t => {
  const f = await fixture(t);
  await f.plugin(f.embedded, 'shared'); await f.plugin(f.workspace, 'shared', { version: 'invalid' });
  const catalog = await resolvePluginCatalog(f.workspace, f.core);
  assert.equal(catalog.selected.length, 0);
  assert.match(catalog.problems.join('\n'), /refusing implicit fallback/);
});

test('public-only discovery and a separate project repository need no private workspace', async t => {
  const f = await fixture(t), projects = path.join(f.root, 'apps');
  await f.plugin(f.embedded, 'product');
  await f.write(f.embedded, 'projects/unsorted/demo/xrb-project.json', { name: 'Demo', kind: 'app' });
  await f.write(f.embedded, 'projects/archive/old/xrb-project.json', { name: 'Old', kind: 'test' });
  await f.write(projects, 'projects/unsorted/demo/xrb-project.json', { name: 'Demo', kind: 'app' });
  await f.write(f.workspace, 'projects/unsorted/not-selected/xrb-project.json', { name: 'Other', kind: 'app' });
  const catalog = await discoverProjectCatalog(f.core, f.workspace, projects);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.projects.map(p => p.key), ['bundled:demo', 'bundled:archive/old', 'workspace:demo']);
  assert.equal(catalog.projects[0].project.manifest?.name, catalog.projects[2].project.manifest?.name);
  assert.equal(catalog.projects[2].readOnly, false);
  const aliased = await discoverProjectCatalog(f.core, f.workspace, f.embedded);
  assert.ok(aliased.projects.every(project => project.readOnly));
  assert.match(aliased.problems.join('\n'), /outside embedded product sources/);
  const nested = path.join(f.embedded, 'new-user');
  assert.equal((await resolvePluginCatalog(nested, f.core)).selected.length, 0);
  await assert.rejects(fs.access(nested));
  const missing = path.join(f.root, 'missing');
  assert.deepEqual((await resolvePluginCatalog(missing, f.core)).selected.map(p => p.key), ['bundled:product']);
  await assert.rejects(fs.access(missing));
});

test('module containment rejects traversal, absolute paths, sibling-prefix tricks and junctions', async t => {
  const f = await fixture(t), source = await f.plugin(f.embedded, 'product');
  await f.write(source, 'src/service.mjs', 'export default {};');
  assert.equal(await containedModule(source, source, './src/service.mjs'), path.join(source, 'src/service.mjs'));
  for (const declaration of ['../other/service.mjs', '/absolute.mjs', 'C:/outside.mjs', 'src\\service.mjs']) await assert.rejects(containedModule(source, source, declaration));
  const outside = path.join(f.root, 'outside');
  await f.write(outside, 'service.mjs', 'export default {};');
  await fs.symlink(outside, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(containedModule(source, source, 'linked/service.mjs'), /symbolic link|junction/);
  assert.equal(withinRoot(source, `${source}-other/service.mjs`), false);
  await fs.symlink(outside, path.join(f.embedded, 'plugins', 'linked-plugin'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match((await resolvePluginCatalog(f.workspace, f.core)).problems.join('\n'), /linked-plugin/);
});

test('configuration initializes once, preserves user bytes/unknown fields and applies new defaults in memory', async t => {
  const f = await fixture(t);
  const first = await readUserPluginConfig(f.workspace, 'publisher', fields);
  assert.equal(first.created, true);
  assert.deepEqual(first.values, { enabled: false, destination: '' });
  const text = '{"enabled":true,"destination":"https://example.invalid","future":{"value":1}}\n';
  await fs.writeFile(first.file, text);
  const second = await readUserPluginConfig(f.workspace, 'publisher', [...fields, { key: 'port', label: 'Port', type: 'number', default: 8080 }]);
  assert.equal(second.created, false);
  assert.deepEqual(second.values, { enabled: true, destination: 'https://example.invalid', port: 8080 });
  assert.equal(await fs.readFile(first.file, 'utf8'), text);
  await assert.rejects(fs.access(f.embedded), 'defaults only belong to the selected user root');
});

test('concurrent first-run initialization publishes exactly one complete config', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 24 }, () => readUserPluginConfig(f.workspace, 'publisher', fields)));
  assert.equal(results.filter(r => r.created).length, 1);
  results.forEach(r => assert.deepEqual(r.values, { enabled: false, destination: '' }));
  assert.deepEqual(await fs.readdir(path.dirname(results[0].file)), ['config.json']);
});

test('independent processes cannot replace each other\'s first-run config', async t => {
  const f = await fixture(t), moduleUrl = new URL('../src/plugin-config.ts', import.meta.url).href;
  const code = `import {readUserPluginConfig} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await readUserPluginConfig(${JSON.stringify(f.workspace)}, 'publisher', ${JSON.stringify(fields)})));`;
  const results = await Promise.all(Array.from({ length: 6 }, async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true });
    return JSON.parse(stdout);
  }));
  assert.equal(results.filter(result => result.created).length, 1);
  results.forEach(result => assert.deepEqual(result.values, { enabled: false, destination: '' }));
  assert.deepEqual(await fs.readdir(path.dirname(results[0].file)), ['config.json']);
});

test('malformed, invalid and oversized configs fail without replacement or secret echo', async t => {
  const f = await fixture(t), first = await readUserPluginConfig(f.workspace, 'publisher', fields);
  for (const text of ['private-value-not-json', '[]', '{"enabled":"wrong"}', ' '.repeat(65537)]) {
    await fs.writeFile(first.file, text);
    await assert.rejects(readUserPluginConfig(f.workspace, 'publisher', fields), error => {
      assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /private-value-not-json/); return true;
    });
    assert.equal(await fs.readFile(first.file, 'utf8'), text);
  }
});

test('configuration rejects linked directories and files without modifying their targets', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.workspace, 'config'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readUserPluginConfig(f.workspace, 'publisher', fields), /plain directory/);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(path.join(f.workspace, 'config'));
  const config = await readUserPluginConfig(f.workspace, 'publisher', fields);
  await fs.link(config.file, path.join(outside, 'linked.json'));
  await assert.rejects(readUserPluginConfig(f.workspace, 'publisher', fields), /multiply linked/);
  assert.equal(await fs.readFile(config.file, 'utf8'), await fs.readFile(path.join(outside, 'linked.json'), 'utf8'));
  await assert.rejects(readUserPluginConfig(f.workspace, '../outside', fields), /Invalid plugin config ID/);
});

test('publisher factories use selected source and user config; conflicts disable every service copy', async t => {
  const f = await fixture(t);
  const dir = await f.plugin(f.embedded, 'web', { config: fields });
  await f.write(dir, 'package.json', { xrBuild: { publisher: './service.mjs' } });
  await f.write(dir, 'service.mjs', `export function createPublisher(context) { return {...${publisher('web')}, label:context.plugin.key + ':' + context.config.values.enabled}; }`);
  let result = await discoverPublishers(f.workspace, f.core);
  assert.deepEqual(result.problems, []);
  assert.equal(result.found[0].publisher.label, 'bundled:web:false');
  assert.equal(result.found[0].plugin?.sourceRoot, dir);
  const config = path.join(f.workspace, 'config/plugins/web/config.json');
  await fs.writeFile(config, '{"enabled":true}');
  result = await discoverPublishers(f.workspace, f.core);
  assert.equal(result.found[0].publisher.label, 'bundled:web:true');
  const external = await f.plugin(f.workspace, 'other');
  await f.write(external, 'package.json', { xrBuild: { publisher: './service.mjs' } });
  await f.write(external, 'service.mjs', `export const publisher=${publisher('web')};`);
  result = await discoverPublishers(f.workspace, f.core);
  assert.equal(result.found.length, 0);
  assert.match(result.problems.join('\n'), /conflicting publishers/);
});

test('packager factories use user config and duplicate names or standalone targets never select a first winner', async t => {
  const f = await fixture(t), dir = await f.plugin(f.embedded, 'headset', { config: fields });
  await f.write(dir, 'package.json', { xrBuild: { packager: './service.mjs' } });
  await f.write(dir, 'service.mjs', `export function createPackager(context) { return {...${packager('headset', true)}, label:context.plugin.key + ':' + context.config.values.enabled}; }`);
  let result = await discoverPackagers(f.core, f.workspace);
  assert.deepEqual(result.problems, []);
  assert.equal(result.found[0].packager.label, 'bundled:headset:false');
  for (const id of ['same', 'another']) {
    const other = await f.plugin(f.workspace, id);
    await f.write(other, 'package.json', { xrBuild: { packager: './service.mjs' } });
    await f.write(other, 'service.mjs', `export const packager=${packager(id === 'same' ? 'headset' : 'other', true)};`);
  }
  result = await discoverPackagers(f.core, f.workspace);
  assert.equal(result.found.length, 0);
  assert.match(result.problems.join('\n'), /conflicting/);
});

test('panel metadata, settings and native paths select the same origin without rewriting product source', async t => {
  const f = await fixture(t);
  for (const [root, title] of [[f.embedded, 'Product'], [f.workspace, 'External']]) {
    const dir = await f.plugin(root, 'shared', { title, settings: fields });
    await fs.mkdir(path.join(dir, 'bin'));
  }
  assert.deepEqual(await resolvedPluginBinDirs(f.core, f.workspace), []);
  await savePluginPrefs(f.workspace, { disabled: [], settings: { shared: { enabled: true } }, panelSettings: {}, origins: { shared: 'bundled' } });
  assert.deepEqual(await resolvedPluginBinDirs(f.core, f.workspace), [path.join(f.embedded, 'plugins/shared/bin')]);
  const source = path.join(f.embedded, 'plugins/shared/xrb-plugin.json'), before = await fs.readFile(source);
  const port = await freePort(), panel = createServer({ repo: f.core, workspace: f.workspace, port });
  panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  try {
    const inventory = await fetch(base + '/api/plugins/manage').then(r => r.json());
    assert.deepEqual(inventory.plugins.map((p: any) => [p.id, p.title, p.enabled]), [['bundled:shared', 'Product', true], ['workspace:shared', 'External', false]]);
    const initial = await fetch(base + '/api/plugins/manage/bundled%3Ashared/settings').then(r => r.json());
    assert.equal(initial.runtime.enabled, false, 'ambiguous legacy settings must not leak across origins');
    const response = await fetch(base + '/api/plugins/manage/bundled%3Ashared', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ settings: { enabled: true } }) });
    assert.equal(response.status, 200);
    const settings = await fetch(base + '/api/plugins/manage/bundled%3Ashared/settings').then(r => r.json());
    assert.equal(settings.runtime.enabled, true);
    assert.deepEqual((await readPluginPrefs(f.workspace)).settings, { shared: { enabled: true }, 'bundled:shared': { enabled: true } });
    assert.deepEqual(await fs.readFile(source), before);
  } finally { await panel.close(); }
});

test('embedded managed tools receive user config and cannot reuse a runtime from another origin', async t => {
  const f = await fixture(t);
  for (const root of [f.embedded, f.workspace]) {
    const dir = await f.plugin(root, 'tool', { config: fields, panel: { tools: [{ id: 'fixture', label: 'Fixture', route: '/fixture/', module: 'tool.mjs' }] } });
    await f.write(dir, 'tool.mjs', `export function createWorkspaceTool(context) { return { handle(req,res) { res.setHeader('content-type','application/json'); res.end(JSON.stringify({key:context.plugin.key,enabled:context.config.values.enabled})); } }; }`);
  }
  const prefs = { disabled: [], settings: {}, panelSettings: {}, origins: { tool: 'bundled' as const } };
  await savePluginPrefs(f.workspace, prefs);
  const port = await freePort(), panel = createServer({ repo: f.core, workspace: f.workspace, port });
  panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  try {
    const navigation = await fetch(base + '/api/navigation').then(r => r.json());
    assert.deepEqual(navigation.tools, [{ id: 'fixture', label: 'Fixture', route: '/fixture/' }]);
    await assert.rejects(fs.access(path.join(f.workspace, 'config')), 'listing must not create config');
    assert.deepEqual(await fetch(base + '/fixture/').then(r => r.json()), { key: 'bundled:tool', enabled: false });
    await savePluginPrefs(f.workspace, { ...prefs, origins: { tool: 'workspace' } });
    await fetch(base + '/api/navigation');
    const stale = await fetch(base + '/fixture/', { redirect: 'manual' });
    assert.equal(stale.status, 303); assert.equal(stale.headers.get('location'), '/tool-recovery.html?tool=fixture');
    assert.equal(await stale.text(), '', 'neither old nor newly selected tool code executes before restart');
    const status = await fetch(base + '/api/tools/fixture/status').then(r => r.json());
    assert.equal(status.restartRequired, true); assert.match(status.error, /restart the panel/);
  } finally { await panel.close(); }
});

test('escaping service declarations are rejected before importing their modules', async t => {
  const f = await fixture(t), dir = await f.plugin(f.embedded, 'bad');
  await f.write(f.embedded, 'plugins/outside.mjs', "throw new Error('must-not-execute');");
  await f.write(dir, 'package.json', { xrBuild: { publisher: '../outside.mjs', packager: '../outside.mjs' } });
  for (const result of [await discoverPublishers(f.workspace, f.core), await discoverPackagers(f.core, f.workspace)]) {
    assert.equal(result.found.length, 0);
    assert.match(result.problems.join('\n'), /contained relative path/);
    assert.doesNotMatch(result.problems.join('\n'), /must-not-execute/);
  }
});

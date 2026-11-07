import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HOST_RECEIPT, HOST_LOCK } from '../src/host-artifacts.ts';
import { REPO } from '../src/env.ts';
import { resolvePluginCatalog, pluginOwnsPath } from '../src/extension-catalog.ts';
import { savePluginPrefs } from '../src/plugin-manager.ts';
import { NATIVE_RECEIPT } from '../src/plugin-artifacts.ts';
import { hostPaths, hostCachePaths, resolvedHostPaths, nativePluginPlan, resolvedPluginCmakeVars, nativeBinaryFingerprint, resolvedPluginBinDirs, resolvedHostFreshness, rebuildHost, rebuildNativePlugins, listProviders, parseProviderList, type ProviderInfo, type ProviderList } from '../src/host-build.ts';
import { mergeProviderProbes } from '../src/native-provider-validation.ts';
import type { JobContext } from '../src/jobs.ts';
import { Panel } from '../src/panel.ts';
import { EventHub } from '../src/http.ts';
import type { Project } from '../src/projects.ts';

async function fixture(t: TestContext) {
  const artifacts = path.join(REPO, '.artifacts'); await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'native-origins-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user'), embedded = path.join(core, 'embedded');
  await fs.mkdir(core); await fs.mkdir(workspace);
  const time = Date.now() - 100_000;
  async function write(base: string, relative: string, value: unknown) {
    const file = path.join(base, relative); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
    await fs.utimes(file, time / 1000, time / 1000); return file;
  }
  async function plugin(base: string, id: string, runtime = false) {
    const dir = path.join(base, 'plugins', id);
    await write(dir, 'xrb-plugin.json', { title: id, type: 'input', version: '0.1.0' });
    await write(dir, `${runtime ? 'runtime/' : ''}CMakeLists.txt`, 'project(fixture)');
    await write(dir, `${runtime ? 'runtime/' : ''}src/plugin.cpp`, '// fixture'); return dir;
  }
  await write(core, 'native/host/CMakeLists.txt', 'project(fixture_host)');
  const calls: string[][] = [], configured = new Map<string, { source: string; output?: string }>();
  let fail = false;
  const ctx: JobContext = { line() {}, async run(_cmd, args) {
    calls.push(args);
    if (args[0] === '-S') {
      const build = args[args.indexOf('-B') + 1], output = args.find(arg => arg.startsWith('-DXRB_PLUGIN_BIN_DIR='))?.slice('-DXRB_PLUGIN_BIN_DIR='.length);
      configured.set(build, { source: args[1], output });
      await fs.mkdir(build, { recursive: true });
      await fs.writeFile(path.join(build, 'CMakeCache.txt'), `CMAKE_HOME_DIRECTORY:INTERNAL=${args[1]}\n`);
    } else if (args[0] === '--build') {
      const build = args[1], config = configured.get(build)!;
      const output = config.output ?? path.join(build, 'Release');
      await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(output, config.output ? `xrb_${path.basename(config.source)}.dll` : 'xrb-host.exe'), fail ? 'partial' : 'complete');
      if (fail) throw new Error('fixture compile failed');
    }
  } };
  return { root, core, workspace, embedded, write, plugin, calls, ctx, fail(value: boolean) { fail = value; } };
}
const desktop: ProviderInfo = { role: 'display', name: 'desktop', version: '', description: 'Window', builtin: true, path: null };
const base: ProviderList = { providers: [desktop], rejected: [], error: null };
const provider = (file: string, name = 'hands', role: ProviderInfo['role'] = 'input'): ProviderInfo => ({ role, name, path: file, builtin: false, version: '0.1.0', description: 'Fixture' });
const list = (...providers: ProviderInfo[]): ProviderList => ({ providers: [desktop, ...providers], rejected: [], error: null });

test('host rebuilds publish core-scoped immutable runtimes without changing installed sources', async t => {
  const f = await fixture(t);
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'packaged');
  await f.write(f.core, 'native/host/src/older.cpp', '// old');
  const newer = await f.write(f.core, 'native/host/src/newer.cpp', '// new');
  await fs.utimes(newer, Date.now() / 1000, Date.now() / 1000);
  const initial = await resolvedHostPaths(f.core, f.workspace);
  assert.equal(initial.rebuilt, false);
  await assert.rejects(fs.access(path.join(f.workspace, 'build')));
  const before = nativeBinaryFingerprint(f.core);
  let fresh = await rebuildHost(f.core, f.workspace, f.ctx, { coreOnly: true, cmake: 'fixture', generator: 'fixture' });
  assert.equal(fresh.exists, true); assert.equal(fresh.outdated, false); assert.equal(fresh.runtimeOrigin, 'cache');
  assert.equal(nativeBinaryFingerprint(f.core), before);
  const oldRuntime = fresh.runtimeDir, oldOutput = nativeBinaryFingerprint(oldRuntime);
  await fs.unlink(path.join(f.core, 'native/host/src/older.cpp'));
  assert.equal((await resolvedHostFreshness(f.core, f.workspace)).outdated, true, 'deleting an older source invalidates freshness');
  fresh = await rebuildHost(f.core, f.workspace, f.ctx, { coreOnly: true, cmake: 'fixture', generator: 'fixture' });
  assert.equal(fresh.outdated, false); assert.notEqual(fresh.runtimeDir, oldRuntime);
  assert.equal(nativeBinaryFingerprint(oldRuntime), oldOutput, 'already-started consumers retain an unchanged runtime');
  const other = path.join(f.root, 'other-core'); await fs.mkdir(other);
  assert.notEqual(hostCachePaths(other, f.workspace).stateRoot, hostCachePaths(f.core, f.workspace).stateRoot);
  let queried = '';
  await listProviders(f.core, f.workspace, false, async exe => { queried = exe; return base; });
  assert.equal(queried, fresh.exe);
  const hp = hostCachePaths(f.core, f.workspace);
  await f.write(hp.releaseDir, 'plugins/xrb_legacy.dll', 'legacy cache');
  fresh = await rebuildHost(f.core, f.workspace, f.ctx, { coreOnly: true, cmake: 'fixture', generator: 'fixture' });
  await assert.rejects(fs.access(path.join(fresh.runtimeDir, 'plugins')));
  const aside = (await fs.readdir(hp.stateRoot)).find(name => name.startsWith('plugins.stale-'))!;
  assert.equal(await fs.readFile(path.join(hp.stateRoot, aside, 'xrb_legacy.dll'), 'utf8'), 'legacy cache');
});

test('failed, foreign, malformed and changed host state never falls back to the installed executable', async t => {
  const f = await fixture(t);
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'packaged');
  const options = { coreOnly: true, cmake: 'fixture', generator: 'fixture' };
  const good = await rebuildHost(f.core, f.workspace, f.ctx, options);
  f.fail(true); await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options), /compile failed/);
  assert.equal((await resolvedHostFreshness(f.core, f.workspace)).exists, false);
  let queried = false;
  const invalid = await listProviders(f.core, f.workspace, false, async () => { queried = true; return base; });
  assert.equal(queried, false); assert.equal(invalid.unsafe, true);
  assert.equal(await fs.readFile(good.exe, 'utf8'), 'complete');
  assert.equal(await fs.readFile(hostPaths(f.core).exe, 'utf8'), 'packaged');
  f.fail(false); const rebuilt = await rebuildHost(f.core, f.workspace, f.ctx, options);
  const file = path.join(hostCachePaths(f.core, f.workspace).stateRoot, HOST_RECEIPT), bytes = await fs.readFile(file), receipt = JSON.parse(bytes.toString());
  for (const bad of ['{ secret-do-not-echo', 'x'.repeat(16385), JSON.stringify({ ...receipt, core: 'elsewhere' }), JSON.stringify({ ...receipt, runtime: '../escape' })]) {
    await fs.writeFile(file, bad);
    const status = await resolvedHostPaths(f.core, f.workspace);
    assert.ok(status.problem); assert.ok(!status.problem.includes('secret-do-not-echo'));
    assert.equal(await fs.readFile(file, 'utf8'), bad);
  }
  await fs.unlink(file); assert.ok((await resolvedHostPaths(f.core, f.workspace)).problem);
  await fs.writeFile(file, bytes);
  await fs.unlink(rebuilt.exe);
  assert.equal((await resolvedHostFreshness(f.core, f.workspace)).exists, false);
  assert.equal(await fs.readFile(good.exe, 'utf8'), 'complete');
  const outside = await f.write(f.root, 'shared-output', 'complete');
  await fs.link(outside, rebuilt.exe);
  assert.match((await resolvedHostPaths(f.core, f.workspace)).problem!, /link/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'complete');
  const moved = path.join(f.root, 'moved-runtime'); await fs.rename(rebuilt.runtimeDir, moved);
  await fs.symlink(moved, rebuilt.runtimeDir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.match((await resolvedHostPaths(f.core, f.workspace)).problem!, /plain directory/);
});

test('host locks survive CMake resets and source changes during compilation fail completion', async t => {
  const f = await fixture(t), options = { coreOnly: true, cmake: 'fixture', generator: 'fixture' };
  await rebuildHost(f.core, f.workspace, f.ctx, options);
  const hp = hostCachePaths(f.core, f.workspace), lock = path.join(hp.stateRoot, HOST_LOCK);
  await fs.writeFile(path.join(hp.buildDir, 'CMakeCache.txt'), 'CMAKE_HOME_DIRECTORY:INTERNAL=C:/missing-source\n');
  let checked = false;
  await rebuildHost(f.core, f.workspace, { ...f.ctx, async run(cmd, args) {
    await fs.access(lock); assert.match((await resolvedHostPaths(f.core, f.workspace)).problem!, /lock exists/);
    checked = true; await f.ctx.run(cmd, args);
  } }, options);
  assert.equal(checked, true); assert.ok((await fs.readdir(hp.stateRoot)).some(name => name.startsWith('b.moved-')));
  await assert.rejects(fs.access(lock));
  await assert.rejects(rebuildHost(f.core, f.workspace, { ...f.ctx, async run(cmd, args) {
    await f.ctx.run(cmd, args);
    if (args[0] === '--build') await f.write(f.core, 'native/host/src/added.cpp', '// changed during build');
  } }, options), /changed during rebuild/);
  assert.match((await resolvedHostPaths(f.core, f.workspace)).problem!, /incomplete, failed/);
  await assert.rejects(fs.access(lock));
});

test('host cache refuses linked roots, hard-linked outputs and foreign locks without executing commands', async t => {
  const f = await fixture(t), options = { coreOnly: true, cmake: 'fixture', generator: 'fixture' };
  const hp = hostCachePaths(f.core, f.workspace), outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.workspace, 'build'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options), /plain directory/);
  assert.deepEqual(await fs.readdir(outside), []); assert.equal(f.calls.length, 0);
  await fs.unlink(path.join(f.workspace, 'build')); await fs.mkdir(hp.stateRoot, { recursive: true });
  const lock = path.join(hp.stateRoot, HOST_LOCK); await fs.writeFile(lock, 'foreign writer');
  await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options), /lock exists/);
  assert.equal(await fs.readFile(lock, 'utf8'), 'foreign writer'); await fs.unlink(lock);
  const data = await f.write(outside, 'data', 'unchanged'); await fs.mkdir(hp.buildDir);
  await fs.link(data, path.join(hp.buildDir, 'shared'));
  await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options), /hard link/);
  assert.equal(await fs.readFile(data, 'utf8'), 'unchanged'); assert.equal(f.calls.length, 0);
  await assert.rejects(rebuildHost(f.core, path.join(f.core, 'native'), f.ctx, options), /outside product/);
  await fs.unlink(path.join(hp.buildDir, 'shared'));
  await fs.symlink(outside, path.join(f.core, 'native/plugin-sdk'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options), /source path contains/);
  assert.equal(f.calls.length, 0);
});

test('independent host builders serialize before invoking their toolchains', async t => {
  const f = await fixture(t), ready = path.join(f.root, 'ready'); await fs.mkdir(ready);
  const script = `import fs from 'node:fs/promises'; import path from 'node:path';
    import { rebuildHost } from ${JSON.stringify(import.meta.resolve('../src/host-build.ts'))};
    const [core, user, ready, id] = process.argv.slice(1);
    await fs.writeFile(path.join(ready, id), 'ready');
    while ((await fs.readdir(ready)).length < 3) await new Promise(r => setTimeout(r, 10));
    try {
      await rebuildHost(core, user, { line() {}, async run(_cmd, args) {
        const build = args[0] === '-S' ? args[args.indexOf('-B') + 1] : args[1];
        await fs.mkdir(path.join(build, 'Release'), {recursive:true});
        await new Promise(r => setTimeout(r, 300));
        if (args[0] === '--build') await fs.writeFile(path.join(build, 'Release/xrb-host.exe'), 'complete');
      } }, {coreOnly:true, cmake:'fixture', generator:'fixture'}); console.log('built');
    } catch(error) { if (!/lock exists/.test(error.message)) throw error; console.log('locked'); }`;
  const results = await Promise.all([1, 2, 3].map(id => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, f.core, f.workspace, ready, String(id)], { timeout: 15000 })));
  assert.equal(results.filter(result => result.stdout.trim() === 'built').length, 1);
  assert.equal((await resolvedHostPaths(f.core, f.workspace)).rebuilt, true);
  await assert.rejects(fs.access(path.join(hostCachePaths(f.core, f.workspace).stateRoot, HOST_LOCK)));
});

test('native run, package and icon jobs use the same published host runtime', async t => {
  const f = await fixture(t), options = { coreOnly: true, cmake: 'fixture', generator: 'fixture' };
  const fresh = await rebuildHost(f.core, f.workspace, f.ctx, options);
  const panel = new Panel(f.core, f.workspace, new EventHub());
  const p: Project = { id: 'demo', dir: path.join(f.workspace, 'projects/unsorted/demo'), section: 'unsorted', manifest: { name: 'Demo', kind: 'app', entry: '.', icon: 'icon.png' }, errors: [], manifestMtimeMs: 0 };
  await f.write(p.dir, 'xrb-project.json', p.manifest); await f.write(p.dir, 'index.html', '<html><head></head><body>fixture</body></html>');
  // Valid tiny image, only user-owned output may be finalized.
  const { defaultIcon } = await import('../../app-icon/src/icon.ts');
  await fs.writeFile(path.join(p.dir, 'icon.png'), defaultIcon(16));
  let exe = '', iconArgs: string[] = [], packaged = '';
  panel.runner.start = async request => { exe = request.hostExe; };
  await panel.run(p, 'built'); assert.equal(exe, fresh.exe);
  const start = panel.jobs.start.bind(panel.jobs);
  panel.jobs.start = (kind, id, title, body, ...rest) => start(kind, id, title, ctx => body({ ...ctx, async run(_cmd, args) { iconArgs = args; } }), ...rest);
  const icon = panel.renderIcon(p); await panel.jobs.wait(icon);
  assert.equal(icon.state, 'done', icon.error ?? ''); assert.equal(iconArgs[iconArgs.indexOf('--runtime') + 1], fresh.runtimeDir);
  panel.packagers = { problems: [], found: [{ dir: f.core, packager: { name: 'fixture-package', standalone: true, identityFields: [], validate: () => [], async build(input) {
    packaged = input.runtimeDir;
    // A separate CLI builder cannot mutate the runtime already handed to this consumer.
    await rebuildHost(f.core, f.workspace, f.ctx, options);
    assert.equal(await fs.readFile(path.join(input.runtimeDir, 'xrb-host.exe'), 'utf8'), 'complete');
    return { file: 'fixture.zip', sizeBytes: 0 };
  } } }] };
  const job = await panel.packageBuild(p, {}); await panel.jobs.wait(job);
  assert.equal(job.state, 'done', job.error ?? '');
  assert.notEqual(packaged, fresh.runtimeDir); assert.match(packaged, /package-inputs/);
  assert.equal(await fs.readFile(path.join(packaged, 'xrb-host.exe'), 'utf8'), await fs.readFile(fresh.exe, 'utf8'));
  assert.notEqual((await resolvedHostPaths(f.core, f.workspace)).releaseDir, packaged);
  f.fail(true); await assert.rejects(rebuildHost(f.core, f.workspace, f.ctx, options));
  await assert.rejects(panel.run(p, 'built'), /incomplete, failed/);
  await assert.rejects(panel.packageBuild(p, {}), /incomplete, failed/);
  const badIcon = panel.renderIcon(p); await panel.jobs.wait(badIcon);
  assert.equal(badIcon.state, 'failed'); assert.match(badIcon.error!, /incomplete, failed/);
  const productIcon = await f.write(f.core, 'embedded/icon.png', 'preserve product icon');
  await fs.unlink(path.join(p.dir, 'icon.png')); await fs.link(productIcon, path.join(p.dir, 'icon.png'));
  assert.throws(() => panel.renderIcon({ ...p, manifest: { ...p.manifest!, icon: undefined } }), /link/);
  assert.equal(await fs.readFile(productIcon, 'utf8'), 'preserve product icon');
});

test('native plan keeps workspace layout and builds embedded sources into a core-scoped writable cache', async t => {
  const f = await fixture(t);
  const product = await f.plugin(f.embedded, 'product'), external = await f.plugin(f.workspace, 'external', true);
  const plan = await nativePluginPlan(f.core, f.workspace);
  assert.deepEqual(plan.problems, []);
  const bundled = plan.projects.find(p => p.plugin.origin === 'bundled')!, user = plan.projects.find(p => p.plugin.origin === 'workspace')!;
  assert.equal(bundled.sourceDir, product);
  assert.ok(bundled.buildDir.startsWith(path.join(f.workspace, 'build/native')));
  assert.ok(bundled.outputDir.startsWith(path.join(f.workspace, 'build/native')));
  assert.equal(user.buildDir, path.join(external, 'runtime/build'));
  assert.equal(user.outputDir, path.join(external, 'bin'));
  const slash = (value: string) => value.split(path.sep).join('/');
  assert.ok(resolvedPluginCmakeVars(f.core, bundled).includes(`-DXRB_THIRD_PARTY=${slash(path.join(f.core, 'third_party'))}`));
  assert.ok(resolvedPluginCmakeVars(f.core, user).includes(`-DXRB_THIRD_PARTY=${slash(path.join(f.workspace, 'third_party'))}`));
  await assert.rejects(fs.access(path.join(f.workspace, 'build')), 'planning is read-only');
});

test('plugins-only build leaves product sources unchanged and freshness/run paths use its successful cache', async t => {
  const f = await fixture(t), product = await f.plugin(f.embedded, 'product');
  await f.write(product, 'bin/xrb_product.dll', 'packaged');
  const before = await fs.readdir(product);
  await rebuildHost(f.core, f.workspace, f.ctx, { pluginsOnly: true, cmake: 'fixture-cmake', generator: 'fixture-generator' });
  assert.deepEqual(await fs.readdir(product), before);
  assert.equal(await fs.readFile(path.join(product, 'bin/xrb_product.dll'), 'utf8'), 'packaged');
  assert.ok(f.calls.every(args => !args.includes(path.join(f.core, 'native/host'))));
  const catalog = await resolvePluginCatalog(f.workspace, f.core), plugin = catalog.selected[0];
  assert.equal(plugin.nativeRebuilt, true);
  assert.equal(plugin.nativeProblem, null);
  assert.deepEqual(await resolvedPluginBinDirs(f.core, f.workspace), [plugin.binaryRoot]);
  assert.equal(pluginOwnsPath(plugin, path.join(plugin.binaryRoot, 'xrb_product.dll')), true);
  const fresh = await resolvedHostFreshness(f.core, f.workspace);
  assert.equal(fresh.plugins[0].built, true);
  assert.equal(fresh.plugins[0].outdated, false);
  const later = Date.now() / 1000 + 10;
  await fs.utimes(path.join(product, 'src/plugin.cpp'), later, later);
  assert.equal((await resolvedHostFreshness(f.core, f.workspace)).plugins[0].outdated, true);
});

test('failed rebuild and mismatched receipts cannot activate partial output or fall back to packaged DLLs', async t => {
  const f = await fixture(t), product = await f.plugin(f.embedded, 'product');
  await f.write(product, 'bin/xrb_product.dll', 'packaged');
  await rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture');
  f.fail(true);
  await assert.rejects(rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture'), /compile failed/);
  assert.deepEqual(await resolvedPluginBinDirs(f.core, f.workspace), []);
  let plugin = (await resolvePluginCatalog(f.workspace, f.core)).selected[0];
  assert.match(plugin.nativeProblem!, /incomplete, failed/);
  assert.equal((await resolvedHostFreshness(f.core, f.workspace)).plugins[0].built, false);
  await assert.rejects(fs.access(path.join(plugin.nativeStateRoot, '.xrb-native-build.lock')));
  f.fail(false); await rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture');
  plugin = (await resolvePluginCatalog(f.workspace, f.core)).selected[0];
  assert.equal(plugin.nativeProblem, null);
  await fs.writeFile(path.join(plugin.nativeStateRoot, NATIVE_RECEIPT), JSON.stringify({ version: 1, status: 'complete', core: 'wrong', source: plugin.sourceRoot }));
  assert.deepEqual(await resolvedPluginBinDirs(f.core, f.workspace), []);
});

test('build selection never combines duplicate origins; core-only skips optional plugins and private state', async t => {
  const f = await fixture(t);
  await f.plugin(f.embedded, 'shared'); await f.plugin(f.workspace, 'shared');
  await assert.rejects(rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture'), /choose an origin/);
  assert.equal(f.calls.length, 0);
  const result = await rebuildHost(f.core, f.workspace, f.ctx, { coreOnly: true, cmake: 'cmake', generator: 'fixture' });
  assert.equal(result.exists, true); assert.deepEqual(result.plugins, []);
  assert.ok(result.runtimeDir.startsWith(path.join(f.workspace, 'build/native')));
  await assert.rejects(fs.access(path.join(f.core, 'native/host/build')));
  await savePluginPrefs(f.workspace, { disabled: [], settings: {}, panelSettings: {}, origins: { shared: 'workspace' } });
  assert.deepEqual((await nativePluginPlan(f.core, f.workspace)).projects.map(p => p.plugin.key), ['workspace:shared']);
  await savePluginPrefs(f.workspace, { disabled: ['workspace:shared'], settings: {}, panelSettings: {}, origins: { shared: 'workspace' } });
  assert.equal((await nativePluginPlan(f.core, f.workspace)).projects.length, 0);
  assert.equal((await nativePluginPlan(f.core, f.workspace, true)).projects.length, 1);
});

test('native output junctions and existing build locks refuse commands without touching their targets', async t => {
  const f = await fixture(t); await f.plugin(f.embedded, 'product');
  const plugin = (await resolvePluginCatalog(f.workspace, f.core)).selected[0], outside = path.join(f.root, 'outside');
  await fs.mkdir(outside); await fs.mkdir(path.dirname(plugin.nativeStateRoot), { recursive: true });
  await fs.symlink(outside, plugin.nativeStateRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture'), /plain directory/);
  assert.deepEqual(await fs.readdir(outside), []); assert.equal(f.calls.length, 0);
  await fs.unlink(plugin.nativeStateRoot); await fs.mkdir(plugin.nativeStateRoot);
  await fs.writeFile(path.join(plugin.nativeStateRoot, '.xrb-native-build.lock'), 'other builder');
  await assert.rejects(rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture'), /build lock exists/);
  assert.equal(f.calls.length, 0);
  assert.equal(await fs.readFile(path.join(plugin.nativeStateRoot, '.xrb-native-build.lock'), 'utf8'), 'other builder');
});

test('isolated native queries detect duplicate claims and keep only safe roots for launch and packaging', async t => {
  const f = await fixture(t), one = await f.plugin(f.embedded, 'one'), two = await f.plugin(f.workspace, 'two');
  const a = await f.write(one, 'bin/xrb_one.dll', 'a'), b = await f.write(two, 'bin/xrb_two.dll', 'b');
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'query fixture');
  const probes: string[][] = [];
  const query = async (_exe: string, bins: string[]) => { probes.push(bins); return bins.length ? list(provider(bins[0] === path.dirname(a) ? a : b)) : base; };
  let result = await listProviders(f.core, f.workspace, false, query);
  assert.ok(probes.every(bins => bins.length <= 1), 'combined host scans must not conceal collisions');
  assert.deepEqual(result.providers, [desktop]); assert.deepEqual(result.pluginBins, []);
  assert.match(result.problems!.join('\n'), /Conflicting native provider input:hands/);
  await savePluginPrefs(f.workspace, { disabled: ['two'], settings: {}, panelSettings: {} });
  result = await listProviders(f.core, f.workspace, false, query);
  assert.deepEqual(result.pluginBins, [path.dirname(a)]);
  assert.deepEqual(result.providers.map(p => p.name), ['desktop', 'hands']);
});

test('native merge rejects built-in identities, cross-role package aliases, rejected DLLs and escaping paths', async t => {
  const f = await fixture(t), a = await f.write(f.workspace, 'a/xrb_one.dll', 'a'), b = await f.write(f.workspace, 'b/xrb_two.dll', 'b');
  const binA = path.dirname(a), binB = path.dirname(b);
  for (const probes of [
    [{ bin: binA, list: list(provider(a, 'desktop')) }],
    [{ bin: binA, list: list(provider(a, 'shared', 'input')) }, { bin: binB, list: list(provider(b, 'shared', 'display')) }],
    [{ bin: binA, list: { ...list(provider(a)), rejected: [{ path: a, reason: 'another input plugin is already named hands' }] } }],
    [{ bin: binA, list: list(provider(b)) }],
  ]) {
    const result = mergeProviderProbes(base, probes);
    assert.deepEqual(result.providers, [desktop]); assert.deepEqual(result.pluginBins, []); assert.ok(result.problems!.length);
  }
  const unsafe = mergeProviderProbes(list(provider(a)), []);
  assert.equal(unsafe.unsafe, true); assert.deepEqual(unsafe.pluginBins, []);
  const valid = mergeProviderProbes(base, [{ bin: binA, list: list(provider(a)) }, { bin: binB, list: list(provider(b, 'station', 'platform')) }]);
  assert.deepEqual(valid.pluginBins, [binA, binB]);
});

test('query fingerprints detect removal of an older DLL and reject binary junctions', async t => {
  const f = await fixture(t), a = await f.write(f.workspace, 'bin/xrb_a.dll', 'a');
  const b = await f.write(f.workspace, 'bin/xrb_b.dll', 'b');
  await fs.utimes(b, Date.now() / 1000, Date.now() / 1000);
  const root = path.dirname(a), before = nativeBinaryFingerprint(root);
  await fs.unlink(a);
  assert.notEqual(nativeBinaryFingerprint(root), before);
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => nativeBinaryFingerprint(root), /refuses a link/);
});

test('workspace cache resets preserve the independent build lock and core binding', async t => {
  const f = await fixture(t), source = await f.plugin(f.workspace, 'external');
  await rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture');
  await fs.writeFile(path.join(source, 'build/CMakeCache.txt'), `CMAKE_HOME_DIRECTORY:INTERNAL=${path.join(f.root, 'old-source')}\n`);
  await rebuildNativePlugins(f.core, f.workspace, f.ctx, 'cmake', 'fixture');
  assert.ok((await fs.readdir(source)).some(name => name.startsWith('build.moved-')));
  let plugin = (await resolvePluginCatalog(f.workspace, f.core)).selected[0];
  assert.equal(plugin.nativeProblem, null);
  await assert.rejects(fs.access(path.join(plugin.nativeStateRoot, '.xrb-native-build.lock')));
  const otherCore = path.join(f.root, 'other-core'); await fs.mkdir(otherCore);
  plugin = (await resolvePluginCatalog(f.workspace, otherCore)).selected[0];
  assert.match(plugin.nativeProblem!, /another source/);
  assert.deepEqual(await resolvedPluginBinDirs(otherCore, f.workspace), []);
});

test('native run preparation and rebuild jobs exclude each other before native execution', async t => {
  const f = await fixture(t), panel = new Panel(f.core, f.workspace, new EventHub());
  const project: Project = { id: 'demo', dir: path.join(f.workspace, 'projects/unsorted/demo'), section: 'unsorted', manifest: { name: 'Demo', kind: 'app', entry: '.' }, errors: [], manifestMtimeMs: 0 };
  await f.write(project.dir, 'index.html', 'fixture');
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'not an executable');
  let release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  const rebuild = panel.jobs.start('host-rebuild', null, 'fixture rebuild', () => gate);
  await assert.rejects(panel.run(project, 'built'), /wait for the native rebuild/);
  release(); await panel.jobs.wait(rebuild);
  gate = new Promise<void>(resolve => { release = resolve; });
  let starting!: () => void;
  const ready = new Promise<void>(resolve => { starting = resolve; });
  panel.hostArgs = async () => [];
  panel.runner.start = async () => { starting(); await gate; };
  const run = panel.run(project, 'built'); await ready;
  await assert.rejects(panel.route('POST', ['host', 'rebuild'], {} as never, {} as never), /starting host/);
  release(); await run;
  await panel.run(project, 'built'); // Preparation reservation must be released after completion.
});

test('host-local plugins are blocked before any query and malformed native records are refused', async t => {
  const f = await fixture(t);
  await f.write(f.core, 'native/host/build/Release/xrb-host.exe', 'query fixture');
  await f.write(f.core, 'native/host/build/Release/plugins/xrb_old.dll', 'old');
  let queried = false;
  const result = await listProviders(f.core, f.workspace, false, async () => { queried = true; return base; });
  assert.equal(queried, false); assert.equal(result.unsafe, true);
  await rebuildHost(f.core, f.workspace, f.ctx, { coreOnly: true, cmake: 'cmake', generator: 'fixture' });
  assert.equal(await fs.readFile(path.join(hostPaths(f.core).releaseDir, 'plugins/xrb_old.dll'), 'utf8'), 'old', 'installed product output is never moved or deleted');
  queried = false;
  assert.equal((await listProviders(f.core, f.workspace, false, async () => { queried = true; return base; })).error, null);
  assert.equal(queried, true, 'managed discovery now uses the clean cached host');
  for (const plugins of [[{ ...desktop, role: 'unknown' }], [{ ...desktop, name: '../escape' }], [{ ...desktop, path: 'not-null' }]])
    assert.throws(() => parseProviderList(`@plugins ${JSON.stringify({ plugins, rejected: [] })}`), /invalid native provider/);
  assert.throws(() => parseProviderList('@plugins {"plugins":{}}'), /arrays/);
});

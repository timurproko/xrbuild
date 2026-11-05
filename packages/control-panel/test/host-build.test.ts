import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cachedSourceDir, hostFreshness, parseProviderList, PLUGIN_BUILD_SUCCESS, pluginBinDirs, pluginCmakeVars, recordPluginBuildSuccess } from '../src/host-build.ts';

async function layout() {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-hostbuild-'));
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-hostbuild-ws-'));
  const w = async (rel: string, t: string, ms?: number) => {
    const f = rel.startsWith('ws:') ? path.join(ws, rel.slice(3)) : path.join(repo, rel);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, t);
    if (ms) await fs.utimes(f, ms / 1000, ms / 1000);
  };
  return { repo, ws, w };
}

test('freshness: missing, outdated, up to date, and a build that did not relink', async () => {
  const { repo, ws, w } = await layout();
  const t = Date.now() - 100_000;
  await w('native/host/src/main.cpp', 'x', t);
  await w('native/plugin-sdk/include/xrb_plugin.h', 'x', t);
  assert.equal(hostFreshness(repo, ws).exists, false);
  assert.equal(hostFreshness(repo, ws).outdated, true);

  await w('native/host/build/Release/xrb-host.exe', 'exe', t + 10_000);
  assert.equal(hostFreshness(repo, ws).outdated, false);

  await w('native/host/src/main.cpp', 'y', t + 20_000);
  const f = hostFreshness(repo, ws);
  assert.equal(f.outdated, true);
  assert.equal(f.newestSource, path.join('native', 'host', 'src', 'main.cpp'));

  // The build ran after the change but left the exe as it was.
  await w('native/host/build/xrb-host.dir/Release/xrb-host.tlog/xrb-host.lastbuildstate', 'stamp', t + 30_000);
  assert.equal(hostFreshness(repo, ws).outdated, false);

  // A later build failed (link refused while the host ran): its stamp does not count.
  await w('native/host/src/main.cpp', 'z', t + 40_000);
  await w('native/host/build/xrb-host.dir/Release/xrb-host.tlog/xrb-host.lastbuildstate', 'stamp', t + 50_000);
  await w('native/host/build/xrb-host.dir/Release/xrb-host.tlog/unsuccessfulbuild', '', t + 50_000);
  assert.equal(hostFreshness(repo, ws).outdated, true, 'the exe is still older than main.cpp');
});

test('freshness: a workspace plugin without a build, or with newer sources, makes the host outdated', async () => {
  const { repo, ws, w } = await layout();
  const t = Date.now() - 100_000;
  await w('native/host/src/main.cpp', 'x', t);
  await w('native/host/build/Release/xrb-host.exe', 'exe', t + 10_000);
  await w('ws:plugins/input-test/xrb-plugin.json', '{}', t);
  await w('ws:plugins/input-test/CMakeLists.txt', 'x', t);
  await w('ws:plugins/input-test/src/plugin.cpp', 'x', t);
  await w('ws:plugins/notes/readme.txt', 'not a plugin', t + 90_000);
  await w('plugins/core-plugin/CMakeLists.txt', 'a plugin left in the core is not built', t);
  await w('ws:plugins/platform-test/xrb-plugin.json', '{}', t);
  await w('ws:plugins/platform-test/runtime/CMakeLists.txt', 'x', t);
  await w('ws:plugins/platform-test/runtime/build/Release/xrb_platform_test.dll', 'dll', t + 10_000);
  let f = hostFreshness(repo, ws);
  assert.deepEqual(f.plugins.map((p) => [p.dir, p.built, p.outdated]), [['input-test', false, true], ['platform-test/runtime', true, false]]);
  assert.equal(f.outdated, true);

  await w('ws:plugins/input-test/build/Release/xrb_input_test.dll', 'dll', t + 10_000);
  await w(`ws:plugins/input-test/build/${PLUGIN_BUILD_SUCCESS}`, 'success', t + 15_000);
  assert.equal(hostFreshness(repo, ws).outdated, false);

  await w('ws:plugins/input-test/src/plugin.cpp', 'y', t + 20_000);
  f = hostFreshness(repo, ws);
  assert.equal(f.outdated, true, 'a failed build does not advance the successful-build record');
  assert.equal(f.newestSource, path.join('plugins', 'input-test', 'src', 'plugin.cpp'));

  // A successful no-relink build advances the panel record while preserving the older DLL.
  await recordPluginBuildSuccess(path.join(ws, 'plugins', 'input-test', 'build'));
  assert.equal(hostFreshness(repo, ws).outdated, false);

  // The record can never replace the required plugin library itself.
  await fs.rm(path.join(ws, 'plugins', 'input-test', 'build', 'Release', 'xrb_input_test.dll'));
  f = hostFreshness(repo, ws);
  assert.equal(f.plugins[0].built, false);
  assert.equal(f.outdated, true);
});

test('plugins left next to the host by an older build make it outdated', async () => {
  const { repo, ws, w } = await layout();
  const t = Date.now() - 100_000;
  await w('native/host/src/main.cpp', 'x', t);
  await w('native/host/build/Release/xrb-host.exe', 'exe', t + 10_000);
  assert.equal(hostFreshness(repo, ws).outdated, false);
  await w('native/host/build/Release/plugins/tracker/xrb_input_tracker.dll', 'dll', t + 10_000);
  const f = hostFreshness(repo, ws);
  assert.deepEqual(f.staleHostPlugins, ['tracker']);
  assert.equal(f.outdated, true);
});

test('workspace plugins are configured with the core SDK and install into their own bin', async () => {
  const vars = pluginCmakeVars('C:/core', 'D:/ws', 'input-test');
  assert.deepEqual(vars, ['-DXRB_PLUGIN_SDK=C:/core/native/plugin-sdk', '-DXRB_THIRD_PARTY=D:/ws/third_party', '-DXRB_CORE_THIRD_PARTY=C:/core/third_party', '-DXRB_PLUGIN_BIN_DIR=D:/ws/plugins/input-test/bin']);
  const { ws, w } = await layout();
  await w('ws:plugins/input-test/xrb-plugin.json', '{}');
  await w('ws:plugins/input-test/bin/xrb_input_test.dll', 'dll');
  await w('ws:plugins/legacy-output/bin/xrb_legacy.dll', 'dll');
  await w('ws:plugins/not-built/CMakeLists.txt', 'x');
  assert.deepEqual(pluginBinDirs(ws), [path.join(ws, 'plugins', 'input-test', 'bin')], 'one --plugin-dir per built plugin');
});

test('reads the source folder a CMake cache was made for', async () => {
  const { repo, ws, w } = await layout();
  assert.equal(await cachedSourceDir(path.join(repo, 'build')), null);
  await w('build/CMakeCache.txt', '# cache\nCMAKE_HOME_DIRECTORY:INTERNAL=D:/Git/xr-build/native/host\nOTHER:BOOL=ON\n');
  assert.equal(await cachedSourceDir(path.join(repo, 'build')), 'D:/Git/xr-build/native/host');
});

test('reads the providers from the @plugins line among log lines', () => {
  const out = [
    '    0.000 [plugins] input tracker 1.0.0 (ABI 1.0) from C:/x/plugins/tracker/xrb_input_tracker.dll',
    '@plugins {"abi":"1.0","plugins":[{"role":"display","name":"desktop","version":"","description":"a window","builtin":true,"path":null},' +
      '{"role":"input","name":"tracker","version":"1.0.0","description":"hands","builtin":false,"path":"C:/x"}],"rejected":[{"path":"C:/old.dll","reason":"plugin ABI 99.0"}]}',
  ].join('\r\n');
  const l = parseProviderList(out);
  assert.equal(l.error, null);
  assert.deepEqual(l.providers.map((p) => `${p.role}:${p.name}:${p.builtin}`), ['display:desktop:true', 'input:tracker:false']);
  assert.equal(l.rejected[0].reason, 'plugin ABI 99.0');
  assert.match(parseProviderList('no such line').error!, /no @plugins line/);
});

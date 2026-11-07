// Explicit Windows compiler smoke test; intentionally outside the ordinary *.test.ts fast suite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REPO } from '../src/env.ts';
import { findCmake, nativeBinaryFingerprint, rebuildHost, resolvedHostFreshness, resolvedPluginBinDirs, visualStudioGenerator } from '../src/host-build.ts';
import { runProcess, type JobContext } from '../src/jobs.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('real native compiler builds cached host and both origins against selected SDK/dependencies without product writes', { skip: process.platform !== 'win32', timeout: 240_000 }, async t => {
  const artifacts = path.join(REPO, '.artifacts'); await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'native-compiler-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user');
  async function write(file: string, text: string) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); }
  await write(path.join(core, 'native/plugin-sdk/include/fixture-sdk.h'), '#define FIXTURE_SDK 7\n');
  await fs.copyFile(path.join(REPO, 'native/plugin-sdk/include/xrb_plugin.h'), path.join(core, 'native/plugin-sdk/include/xrb_plugin.h'));
  await write(path.join(core, 'third_party/fixture-core.h'), '#define FIXTURE_CORE 11\n');
  await write(path.join(core, 'third_party/fixture-plugin.h'), '#define FIXTURE_PLUGIN 1\n');
  await write(path.join(workspace, 'third_party/fixture-plugin.h'), '#define FIXTURE_PLUGIN 2\n');
  const cmakeSource = `cmake_minimum_required(VERSION 3.20)
project(native_fixture LANGUAGES CXX)
add_library(xrb_fixture SHARED src/plugin.cpp)
target_include_directories(xrb_fixture PRIVATE "\${XRB_PLUGIN_SDK}/include" "\${XRB_THIRD_PARTY}" "\${XRB_CORE_THIRD_PARTY}")
set_target_properties(xrb_fixture PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE "\${XRB_PLUGIN_BIN_DIR}")
`;
  const sources: string[] = [];
  for (const [owner, id, dependency] of [[path.join(core, 'embedded'), 'product', 1], [workspace, 'external', 2]] as const) {
    const source = path.join(owner, 'plugins', id); sources.push(source);
    await write(path.join(source, 'xrb-plugin.json'), JSON.stringify({ title: id, type: 'input', version: '0.1.0', settings: [{ key: 'gain', label: 'Gain', type: 'number', min: 0, max: 10, default: 1 }] }));
    await write(path.join(source, 'CMakeLists.txt'), cmakeSource);
    await write(path.join(source, 'src/plugin.cpp'), `#include "fixture-sdk.h"\n#include "xrb_plugin.h"\n#include "fixture-core.h"\n#include "fixture-plugin.h"\nstatic_assert(XRB_ABI_MAJOR == 1 && sizeof(XrbPluginInfo) >= 200);\nstatic_assert(FIXTURE_SDK == 7 && FIXTURE_CORE == 11 && FIXTURE_PLUGIN == ${dependency});\nextern "C" __declspec(dllexport) int fixture_value() { return FIXTURE_SDK; }\n`);
  }
  await write(path.join(core, 'native/host/CMakeLists.txt'), `cmake_minimum_required(VERSION 3.20)
project(host_fixture LANGUAGES CXX)
add_executable(xrb-host src/host.cpp)
target_include_directories(xrb-host PRIVATE "\${XRB_ROOT}/native/plugin-sdk/include" "\${XRB_ROOT}/third_party")
`);
  await write(path.join(core, 'native/host/src/host.cpp'), String.raw`#include "fixture-sdk.h"
#include "fixture-core.h"
#include <iostream>
#include <string>
static_assert(FIXTURE_SDK == 7 && FIXTURE_CORE == 11);
int main(int argc, char** argv) {
  if (argc < 2) return 0;
  std::string bin;
  for (int i=1;i<argc;i++) { std::string arg(argv[i]); if(arg.find("--plugin-dir=")==0) bin=arg.substr(13); }
  std::cout << "@plugins {\"abi\":\"1.0\",\"plugins\":[{\"role\":\"display\",\"name\":\"desktop\",\"version\":\"\",\"description\":\"fixture\",\"builtin\":true,\"path\":null}";
  // Isolated synthetic provider probe only; no device/DLL activation.
  if (!bin.empty()) {
    std::string file=bin+"/xrb_fixture.dll", escaped;
    for(char c:file) { if(c=='\\' || c=='"') escaped+='\\'; escaped+=c; }
    std::string name=bin.find("external")!=std::string::npos?"external":"product";
    std::cout << ",{\"role\":\"input\",\"name\":\"" << name << "\",\"version\":\"1.0.0\",\"description\":\"synthetic probe\",\"builtin\":false,\"path\":\"" << escaped << "\"}";
  }
  std::cout << "],\"rejected\":[]}" << std::endl;
  return 0;
}
`);
  await fs.chmod(path.join(core, 'native/host/CMakeLists.txt'), 0o444);
  const coreBefore = nativeBinaryFingerprint(core);
  const before = await fs.readdir(sources[0]);
  const cmake = findCmake(); assert.ok(cmake, 'native smoke test requires the documented CMake/Visual Studio toolchain');
  const lines: string[] = [];
  const ctx: JobContext = { line(text) { lines.push(text); }, async run(command, args, options) {
    const code = await runProcess(command, args, text => lines.push(text), options);
    assert.equal(code, 0, lines.slice(-40).join('\n'));
  } };
  try {
    await rebuildHost(core, workspace, ctx, { cmake, generator: visualStudioGenerator(cmake) });
    const bins = await resolvedPluginBinDirs(core, workspace);
    assert.equal(bins.length, 2);
    assert.ok(bins[0].startsWith(path.join(workspace, 'build/native')));
    assert.equal(bins[1], path.join(sources[1], 'bin'));
    for (const bin of bins) assert.ok((await fs.stat(path.join(bin, 'xrb_fixture.dll'))).size > 0);
    assert.deepEqual(await fs.readdir(sources[0]), before);
    await assert.rejects(fs.access(path.join(core, 'native/host/build')));
    const fresh = await resolvedHostFreshness(core, workspace);
    assert.equal(fresh.runtimeOrigin, 'cache'); assert.equal(fresh.exists, true); assert.equal(fresh.outdated, false);
    assert.equal(nativeBinaryFingerprint(core), coreBefore);
    await ctx.run(fresh.exe, []);
    assert.equal(fresh.plugins.length, 2);
    assert.ok(fresh.plugins.every(plugin => plugin.built && !plugin.outdated));
    if (process.env.XRB_TEST_BROWSER) {
      // Real browser/API/persistence path using the compiled synthetic probe, not a device integration.
      const project = path.join(core, 'embedded/projects/core/options');
      await write(path.join(project, 'xrb-project.json'), JSON.stringify({ name: 'Provider options', kind: 'app', entry: 'dist', inputs: ['product'] }));
      await write(path.join(project, 'dist/index.html'), '<html><head></head><body>fixture</body></html>');
      const server = createServer({ repo: core, workspace, port: await freePort() });
      await server.panel.loadInitialServices();
      await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
      const product = nativeBinaryFingerprint(core);
      try {
        await withBrowser(async ({ navigate, evaluate }) => {
          await navigate(server.url, `!!document.querySelector('[name="provider.product.gain.override"]')`);
          await evaluate(`(() => { const toggle=document.querySelector('[name="provider.product.gain.override"]'); toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));const value=document.querySelector('[name="provider.product.gain"]');value.value='7';value.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#bundled-run-settings').requestSubmit(); })()`);
          let saved;
          for (let i=0;i<100;i++) { saved=await fetch(server.url+'api/projects/bundled%3Aoptions/run-settings').then(response=>response.json()); if(saved.overrides?.providerSettings?.product?.values.gain===7)break; await sleep(50); }
          assert.equal(saved.overrides.providerSettings.product.values.gain, 7);
          await navigate(server.url, `document.querySelector('[name="provider.product.gain"]')?.value === '7'`);
          assert.equal(await evaluate(`document.querySelector('[name="provider.product.gain.override"]').checked`), true);
          await evaluate(`document.querySelector('#bundled-cache-review').click()`);
          for(let i=0;i<100&&!await evaluate(`document.querySelector('#bundled-cache-content').textContent.includes('No obsolete')`);i++)await sleep(50);
          assert.match(await evaluate(`document.querySelector('#bundled-cache-content').textContent`), /No obsolete/);
        });
        assert.equal(nativeBinaryFingerprint(core), product);
      } finally { await server.close(); }
    }
  } finally { await fs.writeFile(path.join(artifacts, 'native-compiler-smoke.log'), lines.join('\n')); }
});

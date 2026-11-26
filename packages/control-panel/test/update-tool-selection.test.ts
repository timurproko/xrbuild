import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import { probeDesktopTools } from '../src/desktop-setup.ts';
import { findCmake, nativePluginPlan } from '../src/host-build.ts';
import { rebuildForUpdate } from '../src/update-rebuild.ts';
import type { JobContext } from '../src/jobs.ts';

test('scoped workspace builds retain the embedded-product storage boundary', async t => {
  const core = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'update-scope-'));
  t.after(() => fs.rm(core, { recursive: true, force: true }));
  const workspace = path.join(core, 'embedded/user'); await fs.mkdir(workspace, { recursive: true });
  const plan = await nativePluginPlan(core, workspace, false, 'workspace');
  assert.deepEqual(plan.projects, []); assert.match(plan.problems.join('; '), /outside embedded/);
});

// Fake executable files and synchronous probe output; configure/build are intercepted, never executed.
test('Update host and plugin builds reuse the checked bundled CMake despite competing PATH installations', { skip: process.platform !== 'win32' }, async t => {
  // Configure commands use canonical paths, not a possible 8.3 TEMP alias.
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'update-tools-')));
  const beforeEnv = { PATH: process.env.PATH, ProgramW6432: process.env.ProgramW6432 };
  t.after(async () => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    for (const [key, value] of Object.entries(beforeEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const write = async (relative: string, text: string) => {
    const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text);
    await fs.utimes(file, (Date.now() - 100000) / 1000, (Date.now() - 100000) / 1000); return file;
  };
  const old = await write('old/cmake.exe', 'fake CMake 3.20, no current generator');
  const wrong = await write('wrong/cmake.exe', 'fake CMake 4, no supported generator');
  const install = 'tools/Microsoft Visual Studio/2022/BuildTools';
  const good = await write(`${install}/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe`, 'fake supported CMake');
  await write(`${install}/VC/Tools/MSVC/14.0/bin/Hostx64/x64/cl.exe`, 'fake compiler');
  process.env.PATH = [path.dirname(old), path.dirname(wrong)].join(path.delimiter);
  process.env.ProgramW6432 = path.join(root, 'tools');
  const probes: string[] = [];
  let compatible = true;
  t.mock.method(childProcess, 'execFileSync', ((file: string, args: string[]) => {
    probes.push(file);
    if (file === old) return 'cmake version 3.20.0';
    if (file === wrong) return args[0] === '--version' ? 'cmake version 4.0.0' : 'Unix Makefiles = unsupported';
    if (file === good && compatible) return args[0] === '--version' ? 'cmake version 3.30.0' : '* Visual Studio 17 2022 = supported';
    return '[]'; // No installed-system tool or installer is executed by this fixture.
  }) as typeof childProcess.execFileSync);
  syncBuiltinESMExports();
  assert.equal(findCmake(), old, 'the previous recipe would accept the incompatible first executable');
  const checked = await probeDesktopTools();
  assert.equal(checked.cmake, good); assert.equal(checked.generator, 'Visual Studio 17 2022');
  assert.ok(probes.includes(old) && probes.includes(wrong) && probes.includes(good));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user');
  await fs.mkdir(workspace);
  await write('core/native/host/CMakeLists.txt', 'project(fixture_host)');
  await write('user/plugins/fixture/xrb-plugin.json', JSON.stringify({ title: 'Fixture', type: 'input', version: '1.0.0' }));
  await write('user/plugins/fixture/CMakeLists.txt', 'project(fixture_plugin)');
  const calls: Array<{ command: string; args: string[] }> = [], outputs = new Map<string, string>();
  const ctx: JobContext = { line() {}, async run(command, args) {
    calls.push({ command, args }); assert.equal(command, good);
    if (args[0] === '-S') {
      assert.equal(args[args.indexOf('-G') + 1], checked.generator);
      const build = args[args.indexOf('-B') + 1]!;
      outputs.set(build, args.find(arg => arg.startsWith('-DXRB_PLUGIN_BIN_DIR='))?.slice('-DXRB_PLUGIN_BIN_DIR='.length) ?? path.join(build, 'Release'));
      await fs.mkdir(build, { recursive: true }); await fs.writeFile(path.join(build, 'CMakeCache.txt'), `CMAKE_HOME_DIRECTORY:INTERNAL=${args[1]}\n`);
    } else if (args[0] === '--build') {
      const output = outputs.get(args[1]!)!; await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(output, output.endsWith('Release') ? 'xrb-host.exe' : 'xrb_fixture.dll'), 'synthetic binary');
    }
  } };
  assert.deepEqual(await rebuildForUpdate(core, workspace, ctx), ['xrb-host', 'fixture']);
  assert.ok(calls.some(call => call.args.includes(path.join(core, 'native/host'))));
  assert.ok(calls.some(call => call.args.includes(path.join(workspace, 'plugins/fixture'))));
  calls.length = 0;
  assert.deepEqual(await rebuildForUpdate(core, workspace, ctx), ['fixture']);
  assert.ok(calls.every(call => !call.args.includes(path.join(core, 'native/host'))), 'host-current retry still uses validated tools for plugins');
  await write('core/embedded/plugins/bundled/xrb-plugin.json', JSON.stringify({ title: 'Bundled', type: 'input', version: '1.0.0' }));
  await write('core/embedded/plugins/bundled/CMakeLists.txt', 'project(bundled_plugin)');
  await fs.writeFile(path.join(workspace, 'plugins/fixture/xrb-plugin.json'), '{invalid refused workspace source');
  calls.length = 0;
  assert.deepEqual(await rebuildForUpdate(core, workspace, ctx, 'core'), ['bundled']);
  assert.ok(calls.some(call => call.args.includes(path.join(core, 'embedded/plugins/bundled'))));
  assert.ok(calls.every(call => !call.args.some(arg => arg.startsWith(path.join(workspace, 'plugins')))), 'core scope never consumes refused workspace plugin source');
  compatible = false; calls.length = 0;
  await assert.rejects(rebuildForUpdate(core, workspace, ctx), /Desktop build tools are not ready/);
  assert.equal(calls.length, 0, 'no unvalidated fallback when the supported installation disappears');
});

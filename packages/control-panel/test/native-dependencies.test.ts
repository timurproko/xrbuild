import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { installNativeDependencies, nativeDependencyPaths, nativeDependencyRoot, nativeDependencyStatus } from '../src/native-dependencies.ts';
import { nativeBinaryFingerprint } from '../src/plugin-artifacts.ts';
import { rebuildHost } from '../src/host-build.ts';
import type { JobContext } from '../src/jobs.ts';

const header = 'synthetic pinned native header';
const headerHash = createHash('sha256').update(header).digest('hex');
async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/native-dependencies-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (file: string, value: string | object) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  await write(path.join(core, 'tools/fetch-deps/deps.lock.json'), { 'archive:cef': 'a'.repeat(64), 'nlohmann/nlohmann/json.hpp': headerHash });
  await write(path.join(core, 'tools/fetch-deps/sources.mjs'), '// synthetic public sources');
  await write(path.join(core, 'tools/fetch-deps/fetch-deps.mjs'), '// synthetic fetch command');
  await write(path.join(core, 'native/host/CMakeLists.txt'), '# synthetic host');
  await write(path.join(core, 'native/host/src/main.cpp'), '// synthetic host source');
  let calls = 0, generation = '';
  const lines: string[] = [];
  const ctx: JobContext = { line: text => lines.push(text), async run(command, args) {
    assert.equal(command, process.execPath); assert.equal(args[0], path.join(core, 'tools/fetch-deps/fetch-deps.mjs'));
    assert.equal(args.length, 2); assert.ok(args[1].startsWith('--output='));
    generation = args[1].slice('--output='.length); calls++;
    assert.ok(generation.startsWith(nativeDependencyPaths(core, workspace).root + path.sep));
    assert.deepEqual(await fs.readdir(generation), []);
    for (const file of ['cmake/FindCEF.cmake', 'include/cef_version.h', 'Release/libcef.dll', 'Release/libcef.lib']) await write(path.join(generation, 'cef', file), 'synthetic CEF file');
    await write(path.join(generation, 'cef/.fetched-sha256'), 'a'.repeat(64));
    await write(path.join(generation, 'nlohmann/nlohmann/json.hpp'), header);
  } };
  return { root, core, workspace, write, ctx, lines, calls: () => calls, generation: () => generation };
}

test('native-library checks are read-only and explicit setup publishes only verified user-owned generations', async t => {
  const f = await fixture(t), before = nativeBinaryFingerprint(f.core);
  const absent = await nativeDependencyStatus(f.core, f.workspace);
  assert.equal(absent.ready, false); assert.equal(absent.blocked, false);
  await assert.rejects(fs.access(f.workspace));
  assert.equal(await nativeDependencyRoot(f.core, f.workspace), path.join(f.core, 'third_party'));
  await installNativeDependencies(f.core, f.workspace, f.ctx);
  const ready = await nativeDependencyStatus(f.core, f.workspace);
  assert.equal(ready.ready, true); assert.equal(ready.root, f.generation());
  assert.equal(await nativeDependencyRoot(f.core, f.workspace), f.generation());
  assert.equal(nativeBinaryFingerprint(f.core), before);
  await installNativeDependencies(f.core, f.workspace, f.ctx); assert.equal(f.calls(), 1);
});

test('failed downloads and hash failures never publish a dependency receipt or alter product inputs', async t => {
  const f = await fixture(t), before = nativeBinaryFingerprint(f.core), receipt = nativeDependencyPaths(f.core, f.workspace).receipt;
  await assert.rejects(installNativeDependencies(f.core, f.workspace, { line() {}, async run() { throw new Error('download failed'); } }), /download failed/);
  await assert.rejects(fs.access(receipt));
  const corrupt: JobContext = { line() {}, async run(command, args, options) { await f.ctx.run(command, args, options); await f.write(path.join(f.generation(), 'nlohmann/nlohmann/json.hpp'), 'wrong bytes'); } };
  await assert.rejects(installNativeDependencies(f.core, f.workspace, corrupt), /hash mismatch/);
  await assert.rejects(fs.access(receipt)); assert.equal(nativeBinaryFingerprint(f.core), before);
  const retained = await fs.readdir(nativeDependencyPaths(f.core, f.workspace).root);
  assert.equal(retained.filter(name => name.startsWith('n-')).length, 2, 'failed generations are preserved');
});

test('unsafe, changed and foreign dependency state is blocked without falling back or replacement', async t => {
  const f = await fixture(t); await installNativeDependencies(f.core, f.workspace, f.ctx);
  const p = nativeDependencyPaths(f.core, f.workspace), saved = await fs.readFile(p.receipt);
  await f.write(path.join(f.generation(), 'unexpected.txt'), 'preserve');
  assert.equal((await nativeDependencyStatus(f.core, f.workspace)).blocked, true);
  await assert.rejects(nativeDependencyRoot(f.core, f.workspace), /changed/);
  await assert.rejects(installNativeDependencies(f.core, f.workspace, f.ctx), /changed/);
  assert.deepEqual(await fs.readFile(p.receipt), saved);
  await f.write(p.receipt, { version: 1, core: 'another-owner', revision: 'a'.repeat(64), generation: '../escape', output: 'a'.repeat(64) });
  assert.equal((await nativeDependencyStatus(f.core, f.workspace)).blocked, true);
  await assert.rejects(nativeDependencyRoot(f.core, f.workspace), /Foreign|invalid/);
  await f.write(p.receipt, '{do-not-echo-user-data');
  const malformed = await nativeDependencyStatus(f.core, f.workspace);
  assert.equal(malformed.blocked, true); assert.doesNotMatch(malformed.problem!, /do-not-echo-user-data/);
  assert.equal(await fs.readFile(p.receipt, 'utf8'), '{do-not-echo-user-data');
});

test('new pins allow a fresh generation while preserving the old one; linked roots remain refused', async t => {
  const f = await fixture(t); await installNativeDependencies(f.core, f.workspace, f.ctx);
  const old = f.generation();
  await f.write(path.join(f.core, 'tools/fetch-deps/sources.mjs'), '// revised synthetic source descriptor');
  const stale = await nativeDependencyStatus(f.core, f.workspace); assert.equal(stale.ready, false); assert.equal(stale.blocked, false);
  await installNativeDependencies(f.core, f.workspace, f.ctx); assert.notEqual(f.generation(), old); await fs.access(old);
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  const linked = path.join(f.root, 'linked'); await fs.symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installNativeDependencies(f.core, linked, f.ctx), /link|plain/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('managed core builds receive cached native inputs and never configure product dependencies', async t => {
  const f = await fixture(t); await installNativeDependencies(f.core, f.workspace, f.ctx);
  const before = nativeBinaryFingerprint(f.core), commands: string[][] = [];
  await rebuildHost(f.core, f.workspace, { line() {}, async run(_command, args) {
    commands.push(args);
    if (args[0] === '--build') await f.write(path.join(args[1], 'Release/xrb-host.exe'), 'synthetic immutable host');
  } }, { cmake: 'synthetic-cmake', generator: 'synthetic-generator', coreOnly: true });
  const configure = commands.find(args => args.includes('-S'))!;
  assert.ok(configure.includes(`-DXRB_THIRD_PARTY=${f.generation().split(path.sep).join('/')}`));
  assert.equal(nativeBinaryFingerprint(f.core), before);
});

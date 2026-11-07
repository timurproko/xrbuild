import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { stagePackagerInputs } from '../src/package-staging.ts';
import { stageDesktopPackage } from '../../desktop-package/src/packager.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/adapter-staging-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (file: string, value: unknown) => { const target = path.join(root, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, typeof value === 'string' ? value : JSON.stringify(value)); return target; };
  for (const file of ['xrb-host.exe', 'libcef.dll', 'testpages/test.html', 'test-plugins/test.dll', 'host-tests.exe', '.env', '.git/config', 'plugins/unused/unused.dll']) await write(`runtime/${file}`, file);
  await write('app/index.html', '<html>Public app</html>');
  await write('plugin/tracker.dll', 'DLL'); await write('plugin/data/model.bin', 'MODEL'); await write('plugin/secret.key', 'DO NOT SHIP');
  await write('plugin/xrb-runtime.json', { version: 1, files: ['tracker.dll', 'data/model.bin'] });
  const selection = { input: 'tracker', inputs: ['tracker'], display: 'desktop', platform: '' };
  const options = { app: path.join(root, 'app'), runtimeDir: path.join(root, 'runtime'), pluginDirs: { tracker: path.join(root, 'plugin') }, plugins: ['tracker'], selection,
    projectName: 'Fixture', identity: { id: 'fixture', title: 'Fixture', version: '1.0.0' }, config: { ...selection, plugins: {} }, out: path.join(root, 'out'), workDir: path.join(root, 'work'), log() {} };
  return { root, options, write };
}

test('every adapter receives checked selected inputs, and desktop restaging retains explicitly inventoried assets', async t => {
  const f = await fixture(t), staged = await stagePackagerInputs({ ...f.options, originalSource: 'DO NOT FORWARD' } as any, path.join(f.root, 'staged'));
  assert.notEqual(staged.app, f.options.app); assert.notEqual(staged.runtimeDir, f.options.runtimeDir);
  assert.equal((staged as any).originalSource, undefined);
  assert.deepEqual((await fs.readdir(staged.runtimeDir)).sort(), ['libcef.dll', 'xrb-host.exe']);
  assert.equal(await fs.readFile(path.join(staged.pluginDirs!.tracker, 'data/model.bin'), 'utf8'), 'MODEL');
  await assert.rejects(fs.access(path.join(staged.pluginDirs!.tracker, 'secret.key')));
  const out = path.join(f.root, 'desktop'); await stageDesktopPackage(staged, out);
  assert.equal(await fs.readFile(path.join(out, 'plugins/tracker/data/model.bin'), 'utf8'), 'MODEL');
  await assert.rejects(fs.access(path.join(out, 'plugins/unused')));
});

test('WebXR adapters get app-only snapshots and static project metadata is explicitly omitted, not shipped', async t => {
  const f = await fixture(t);
  await f.write('app/xrb-project.json', { name: 'Static', kind: 'app', entry: '.' });
  await f.write('app/package.json', { name: 'static', private: true });
  const options = { ...f.options, runtimeDir: '', pluginDirs: {}, plugins: [], config: undefined };
  await assert.rejects(stagePackagerInputs(options, path.join(f.root, 'strict')), /forbidden/);
  const result = await stagePackagerInputs(options, path.join(f.root, 'static'), true);
  assert.equal(result.runtimeDir, ''); assert.equal('pluginDirs' in result, false); assert.equal(result.config, undefined);
  assert.deepEqual(await fs.readdir(result.app), ['index.html']);
  await assert.rejects(stagePackagerInputs({ ...options, plugins: ['tracker'] }, path.join(f.root, 'invalid')), /WebXR/);
  await f.write('app/.env', 'private state');
  await assert.rejects(stagePackagerInputs(options, path.join(f.root, 'unsafe'), true), /forbidden/);
});

test('adapter output aliases, linked destinations and private/machine identities fail before snapshot creation', async t => {
  const f = await fixture(t), folder = path.join(f.root, 'staged');
  for (const identity of [{ ...f.options.identity, signing: 'secret' }, { ...f.options.identity, id: 'C:\\machine\\id' }]) {
    await assert.rejects(stagePackagerInputs({ ...f.options, identity }, folder), /identity/); await assert.rejects(fs.access(folder));
  }
  await assert.rejects(stagePackagerInputs({ ...f.options, out: f.options.app }, folder), /overlap/);
  const external = path.join(f.root, 'external'); await fs.mkdir(external);
  const linked = path.join(f.root, 'linked-out'); await fs.symlink(external, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stagePackagerInputs({ ...f.options, out: linked }, folder), /unlinked/);
  assert.deepEqual(await fs.readdir(external), []);
});

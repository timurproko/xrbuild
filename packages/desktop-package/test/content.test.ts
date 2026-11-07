import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { packager, stageDesktopPackage } from '../src/packager.ts';
import { portableHostConfig, RUNTIME_MANIFEST } from '../../control-panel/src/package-content.ts';

const REPO = path.resolve(import.meta.dirname, '../../..');
async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/package-content-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (relative: string, data: unknown) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof data === 'string' ? data : JSON.stringify(data)); return file; };
  const runtime = path.join(root, 'runtime'), app = path.join(root, 'app'), plugin = path.join(root, 'tracker'), stage = path.join(root, 'stage');
  for (const file of ['xrb-host.exe', 'libcef.dll', 'libEGL.dll', 'resources.pak', 'locales/en-US.pak', 'LICENSE.txt']) await write(`runtime/${file}`, file);
  for (const file of ['host-tests.exe', 'xrb-host.pdb', 'xrb-host.map', 'testpages/index.html', 'test-plugins/test.dll', '.git/config', '.env', 'xrb-app.json', 'plugin-secret.key', 'plugins/unused/unused.dll', 'build/CMakeCache.txt']) await write(`runtime/${file}`, 'DO NOT SHIP');
  await write('app/index.html', '<html>Public app</html>'); await write('app/assets/app.js', 'console.log("public app")');
  await write('tracker/tracker.dll', 'selected'); await write('tracker/dependency.dll', 'dependency'); await write('tracker/LICENSE.txt', 'license');
  await write('tracker/model/data.bin', 'model'); await write('tracker/source.cpp', 'private source'); await write('tracker/credentials.json', 'private settings');
  const selection = { input: 'tracker', inputs: ['tracker'], display: 'desktop', platform: '' };
  const options = { app, runtimeDir: runtime, pluginDirs: { tracker: plugin }, plugins: ['tracker'], selection,
    projectName: 'Portable Demo', identity: { id: 'portable-demo', title: 'Portable Demo', version: '1.2.3' },
    config: { ...selection, plugins: { tracker: { quality: 'high' }, unselected: { password: 'DO NOT SHIP' } } },
    out: path.join(root, 'out'), workDir: path.join(root, 'work'), log(_msg: string) {} };
  return { root, runtime, app, plugin, stage, options, write };
}
async function files(root: string, relative = ''): Promise<string[]> {
  const result: string[] = [];
  for (const name of await fs.readdir(path.join(root, relative))) {
    const next = relative ? `${relative}/${name}` : name;
    if ((await fs.lstat(path.join(root, next))).isDirectory()) result.push(...await files(root, next)); else result.push(next);
  }
  return result.sort();
}

test('desktop runtime allowlist excludes source/history/tests/credentials and undeclared plugin assets', async t => {
  const f = await fixture(t); await stageDesktopPackage(f.options, f.stage);
  assert.deepEqual(await files(f.stage), ['LICENSE.txt', 'README.txt', 'app/assets/app.js', 'app/index.html', 'libEGL.dll', 'libcef.dll', 'locales/en-US.pak', 'package.json', 'plugins/tracker/LICENSE.txt', 'plugins/tracker/dependency.dll', 'plugins/tracker/tracker.dll', 'resources.pak', 'xrb-app.json', 'xrb-host.exe'].sort());
  const config = JSON.parse(await fs.readFile(path.join(f.stage, 'xrb-app.json'), 'utf8'));
  assert.deepEqual(config.plugins, { tracker: { quality: 'high' } });
  assert.ok((await fs.stat(path.join(f.stage, 'xrb-host.exe'))).nlink === 1);
});

test('explicit bounded plugin inventories permit audited non-DLL assets but never paths/state/secrets', async t => {
  const f = await fixture(t);
  const declaration = path.join(f.plugin, RUNTIME_MANIFEST);
  const allowed = { version: 1, files: ['tracker.dll', 'dependency.dll', 'model/data.bin', 'LICENSE.txt'] };
  await fs.writeFile(declaration, JSON.stringify(allowed));
  await stageDesktopPackage(f.options, f.stage);
  assert.equal(await fs.readFile(path.join(f.stage, 'plugins/tracker/model/data.bin'), 'utf8'), 'model');
  assert.ok(!(await files(f.stage)).some(file => file.endsWith(RUNTIME_MANIFEST)));
  for (const names of [['../runtime/xrb-host.exe'], ['/outside'], ['model\\data.bin'], ['tracker.dll', 'TRACKER.dll'], ['tracker.dll', 'credentials.json'], ['tracker.dll', '.git/config'], ['tracker.dll', 'source.cpp'], ['tracker.dll', 'model/missing.bin']]) {
    await fs.writeFile(declaration, JSON.stringify({ ...allowed, files: names }));
    await assert.rejects(stageDesktopPackage(f.options, `${f.stage}-invalid`));
    await assert.rejects(fs.access(`${f.stage}-invalid`));
  }
  await fs.writeFile(declaration, 'x'.repeat(65537));
  await assert.rejects(stageDesktopPackage(f.options, `${f.stage}-invalid`), /inventory/);
});

test('built app source/config/credential content is rejected rather than silently shipped', async t => {
  const f = await fixture(t);
  for (const relative of ['.env', 'package.json', 'pnpm-lock.yaml', 'src/source.js', 'assets/secret.key', 'assets/app.js.map', 'build.mjs', 'xrb-project.json', 'node_modules/dependency/index.js']) {
    const bad = await f.write(`app/${relative}`, 'DO NOT SHIP');
    await assert.rejects(stageDesktopPackage(f.options, f.stage));
    await assert.rejects(fs.access(f.stage)); await fs.unlink(bad);
    // Remove only the empty directories made by this iteration, never user data.
    let parent = path.dirname(bad);
    while (parent !== f.app && !(await fs.readdir(parent)).length) { await fs.rmdir(parent); parent = path.dirname(parent); }
  }
});

test('staging refuses links, input/output aliases, traversal identities and existing destination data', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.stage); await fs.writeFile(path.join(f.stage, 'keep.txt'), 'keep');
  await assert.rejects(stageDesktopPackage(f.options, f.stage), /EEXIST/);
  assert.equal(await fs.readFile(path.join(f.stage, 'keep.txt'), 'utf8'), 'keep');
  await assert.rejects(stageDesktopPackage(f.options, f.app), /overlap/);
  await assert.rejects(stageDesktopPackage(f.options, path.join(f.runtime, 'output')), /overlap/);
  await assert.rejects(stageDesktopPackage({ ...f.options, plugins: ['../escape'] }, `${f.stage}-new`), /selected providers/);
  const target = await f.write('outside.txt', 'untouched');
  await fs.link(target, path.join(f.app, 'linked.txt'));
  await assert.rejects(stageDesktopPackage(f.options, `${f.stage}-new`), /unlinked/);
  await fs.unlink(path.join(f.app, 'linked.txt'));
  const junction = path.join(f.root, 'junction'); await fs.symlink(f.runtime, junction, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stageDesktopPackage({ ...f.options, runtimeDir: junction }, `${f.stage}-new`), /unlinked/);
  await fs.symlink(f.runtime, path.join(f.root, 'output-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stageDesktopPackage(f.options, path.join(f.root, 'output-link/new')), /unlinked/);
  assert.equal(await fs.readFile(target, 'utf8'), 'untouched');
});

test('portable config keeps only selected providers and refuses secrets, raw options and machine paths', async t => {
  const f = await fixture(t);
  for (const data of [{ token: 'secret' }, { recordHands: 'capture.bin' }, { args: ['--anything'] }, { resource: 'C:\\private\\data' }, { nested: { password: 'secret' } }]) {
    const config = { ...f.options.config, plugins: { tracker: data } };
    assert.throws(() => portableHostConfig({ ...f.options, config }), /private|machine-local/);
  }
  assert.throws(() => portableHostConfig({ ...f.options, config: { ...f.options.config, display: 'other' } }), /disagrees/);
  assert.throws(() => portableHostConfig({ ...f.options, plugins: ['tracker', 'unused'] }), /selected providers/);
});

test('input changes during staging fail instead of completing a mixed snapshot', async t => {
  const f = await fixture(t), copy = fs.copyFile;
  fs.copyFile = async (source, target, ...rest) => {
    await copy(source, target, ...rest);
    if (String(source) === path.join(f.app, 'index.html')) await fs.writeFile(String(source), 'changed');
  };
  try { await assert.rejects(stageDesktopPackage(f.options, f.stage), /changed/); }
  finally { fs.copyFile = copy; }
});

test('actual desktop ZIP has only distributable entries and existing versions are never overwritten', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const f = await fixture(t), before = await files(f.runtime), result = await packager.build(f.options);
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const inspect = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead(${quote(result.file)}); try { @($z.Entries | ForEach-Object { $_.FullName.Replace('\\','/') }) | ConvertTo-Json -Compress } finally { $z.Dispose() }`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', inspect], { windowsHide: true });
  const entries: string[] = JSON.parse(stdout), content = entries.join('\n');
  assert.ok(entries.includes('xrb-host.exe')); assert.ok(entries.includes('plugins/tracker/tracker.dll'));
  assert.doesNotMatch(content, /testpages|test-plugins|host-tests|\.git|\.env|secret|credential|source\.cpp|\.pdb|\.map|unused|xrb-runtime/);
  const hash = createHash('sha256').update(await fs.readFile(result.file)).digest('hex');
  await assert.rejects(packager.build(f.options), /EEXIST/);
  assert.equal(createHash('sha256').update(await fs.readFile(result.file)).digest('hex'), hash);
  assert.deepEqual(await files(f.runtime), before);
  assert.equal((await fs.lstat(result.file)).nlink, 1);
});

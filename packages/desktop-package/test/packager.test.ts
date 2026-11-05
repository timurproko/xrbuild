import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { packager, stageDesktopPackage } from '../src/packager.ts';

test('desktop is the standalone host packager', () => {
  assert.equal(packager.name, 'desktop-package');
  assert.equal(packager.target, 'host');
  assert.equal(packager.standalone, true);
  assert.deepEqual(packager.validate({ id: 'Demo', title: 'Demo', version: '0.1.0' }), []);
});

test('stages a runnable host, app, config, icon and only selected plugins', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-package-'));
  const runtime = path.join(root, 'runtime'), app = path.join(root, 'dist'), plugin = path.join(root, 'tracker-bin');
  await fs.mkdir(path.join(runtime, 'plugins', 'old'), { recursive: true });
  await fs.mkdir(app, { recursive: true });
  await fs.mkdir(plugin, { recursive: true });
  await fs.writeFile(path.join(runtime, 'xrb-host.exe'), 'host');
  await fs.writeFile(path.join(runtime, 'libcef.dll'), 'cef');
  await fs.writeFile(path.join(runtime, 'xrb-host.pdb'), 'symbols');
  await fs.writeFile(path.join(runtime, 'plugins', 'old', 'old.dll'), 'old');
  await fs.writeFile(path.join(app, 'index.html'), 'app');
  await fs.writeFile(path.join(plugin, 'tracker.dll'), 'tracker');
  const icon = path.join(root, 'icon.png'); await fs.writeFile(icon, 'icon');
  const out = path.join(root, 'stage');
  const config = { inputs: ['tracker'], input: 'tracker', display: 'desktop', platform: '', plugins: { tracker: { quality: 'high' } } };
  await stageDesktopPackage({
    app, runtimeDir: runtime, pluginDirs: { tracker: plugin }, plugins: ['tracker'], selection: config,
    projectName: 'Demo App', identity: { id: 'Demo App', title: 'Demo App', version: '0.1.0' }, config,
    icon, out: path.join(root, 'builds', 'desktop'), workDir: path.join(root, 'build', 'desktop'), log() {},
  }, out);
  assert.equal(await fs.readFile(path.join(out, 'xrb-host.exe'), 'utf8'), 'host');
  assert.equal(await fs.readFile(path.join(out, 'app', 'index.html'), 'utf8'), 'app');
  assert.equal(await fs.readFile(path.join(out, 'plugins', 'tracker', 'tracker.dll'), 'utf8'), 'tracker');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out, 'xrb-app.json'), 'utf8')), config);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out, 'package.json'), 'utf8')), { id: 'Demo App', title: 'Demo App', version: '0.1.0', executable: 'xrb-host.exe' });
  await assert.rejects(fs.access(path.join(out, 'plugins', 'old', 'old.dll')));
  await assert.rejects(fs.access(path.join(out, 'xrb-host.pdb')));
});

test('build creates a versioned ZIP', { skip: process.platform !== 'win32' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-archive-'));
  const runtime = path.join(root, 'runtime'), app = path.join(root, 'app');
  await fs.mkdir(runtime, { recursive: true }); await fs.mkdir(app, { recursive: true });
  await fs.writeFile(path.join(runtime, 'xrb-host.exe'), 'host'); await fs.writeFile(path.join(app, 'index.html'), 'app');
  const result = await packager.build({
    app, runtimeDir: runtime, plugins: [], selection: { input: 'none', inputs: [], display: 'desktop', platform: '' },
    projectName: 'Archive Demo', identity: { id: 'Archive Demo', title: 'Archive Demo', version: '1.2.3' },
    config: { input: 'none', inputs: [], display: 'desktop', platform: '', plugins: {} },
    out: path.join(root, 'builds', 'desktop'), workDir: path.join(root, 'build', 'desktop'), log() {},
  });
  assert.equal(path.basename(result.file), 'Archive Demo-1.2.3.zip');
  assert.ok(result.sizeBytes > 0);
});

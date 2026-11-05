import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pluginBinDirs } from '../src/host-build.ts';
import { Panel } from '../src/panel.ts';
import { effectiveSettings, pluginFolders, pluginIcon, pluginMeta, readPluginPrefs, savePluginPrefs, validateSettings } from '../src/plugin-manager.ts';

test('workspace plugins: preferences, metadata, safe icons and settings', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-plugin-manager-'));
  try {
    const dir = path.join(workspace, 'plugins', 'input-tracker');
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.mkdir(path.join(dir, 'samples', 'demo'), { recursive: true });
    await fs.writeFile(path.join(dir, 'samples', 'demo', 'xrb-project.json'), JSON.stringify({ name: 'Tracker Demo', kind: 'test' }));
    assert.deepEqual(pluginFolders(workspace), [], 'artifact-only folders are not plugins');
    assert.deepEqual((await readPluginPrefs(workspace)).disabled, []);
    assert.deepEqual(pluginBinDirs(workspace), [], 'artifact-only binaries are not loaded');

    await fs.writeFile(path.join(dir, 'icon.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({
      title: 'Tracker', type: 'input', version: '0.1.0', name: 'Legacy tracker', icon: 'icon.png', glyph: '👋', screenName: 'Stereo Panel', displayMode: '3D',
      panel: { targets: ['webxr'], settingsDescription: 'Choose how tracker settings apply.', providerNames: { legacy: 'canonical-input' }, hiddenProviders: ['legacy'],
        samples: [{ id: 'demo', path: 'samples/demo', description: 'Editable tracker example.' }],
        settings: [
          { key: 'processor', section: 'Tracking', label: 'Processor', type: 'select', default: 'cpu', options: [{ value: 'cpu', label: 'CPU' }, { value: 'gpu', label: 'GPU' }] },
          { key: 'threshold', section: 'Tracking', label: 'Threshold', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
        ] },
      settings: [{ key: 'debugImages', section: 'Provider', label: 'Debug images', type: 'boolean', default: false }],
    }));
    const meta = await pluginMeta(workspace, 'input-tracker');
    assert.equal(meta.title, 'Tracker');
    assert.equal(meta.type, 'input');
    assert.equal(meta.version, '0.1.0');
    assert.deepEqual(pluginFolders(workspace), ['input-tracker']);
    assert.deepEqual(pluginBinDirs(workspace), [path.join(dir, 'bin')]);
    assert.equal(meta.name, 'Legacy tracker');
    assert.equal(meta.screenName, 'Stereo Panel');
    assert.equal(meta.displayMode, '3D');
    assert.equal(meta.glyph, '👋');
    assert.deepEqual(meta.panelTargets, ['webxr']);
    assert.equal(meta.settingsDescription, 'Choose how tracker settings apply.');
    assert.deepEqual(meta.panelProviderNames, { legacy: 'canonical-input' });
    assert.deepEqual(meta.panelHiddenProviders, ['legacy']);
    assert.deepEqual(meta.panelSamples?.map(({ id, name, kind, description }) => ({ id, name, kind, description })),
      [{ id: 'demo', name: 'Tracker Demo', kind: 'test', description: 'Editable tracker example.' }]);
    assert.equal(await pluginIcon(workspace, 'input-tracker'), await fs.realpath(path.join(dir, 'icon.png')));
    assert.deepEqual(effectiveSettings(meta.settings!, {}), { debugImages: false });
    assert.deepEqual(effectiveSettings(meta.panelSettings!, {}), { processor: 'cpu', threshold: 0.5 });
    assert.deepEqual(validateSettings(meta.settings!, { debugImages: true }), { debugImages: true });
    assert.deepEqual(validateSettings(meta.panelSettings!, { processor: 'gpu', threshold: 0.75 }), { processor: 'gpu', threshold: 0.75 });
    assert.throws(() => validateSettings(meta.settings!, { unexpected: true }), /invalid setting/);
    assert.throws(() => validateSettings(meta.settings!, { debugImages: 'yes' }), /invalid setting/);
    assert.throws(() => validateSettings(meta.panelSettings!, { processor: 'neural' }), /invalid setting/);
    assert.throws(() => validateSettings(meta.panelSettings!, { threshold: 2 }), /invalid setting/);
    await savePluginPrefs(workspace, { disabled: ['input-tracker'], settings: { 'input-tracker': { debugImages: true } }, panelSettings: { 'input-tracker': { processor: 'gpu' } } });
    const preferences = await readPluginPrefs(workspace);
    assert.deepEqual(preferences.disabled, ['input-tracker']);
    assert.deepEqual(preferences.panelSettings, { 'input-tracker': { processor: 'gpu' } });
    assert.deepEqual(pluginBinDirs(workspace, (await readPluginPrefs(workspace)).disabled), []);

    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', icon: '../outside.png' }));
    assert.equal(await pluginIcon(workspace, 'input-tracker'), null);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ type: 'input', version: '0.1.0' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /requires title/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: '', type: 'command', version: '0.1.0' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /invalid plugin title/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'command', version: '0.1.0' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /invalid plugin type/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /requires version/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '1.0' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /invalid plugin version/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', glyph: 'two' }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /glyph must be one bounded visible character/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { targets: ['host'] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /panel.targets/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { settingsDescription: '' } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /panel.settingsDescription/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { providerNames: { tracker: '../bad' } } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /panel.providerNames/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { hiddenProviders: ['bad/provider'] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /panel.hiddenProviders/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { hiddenProviders: ['legacy', 'legacy'] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /panel.hiddenProviders/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { settings: [{ key: 'mode', label: 'Mode', type: 'select', options: [] }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /1–32 options/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', settings: [{ key: 'rate', label: 'Rate', type: 'number', min: 10, max: 1 }] }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /invalid limits/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', settings: [{ key: 'same', label: 'One', type: 'text' }], panel: { settings: [{ key: 'same', label: 'Two', type: 'text' }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /keys must be distinct/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { samples: [{ id: 'missing', path: 'samples/missing' }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /does not exist/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { samples: [{ id: 'demo', path: '../outside' }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /sample path/);
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { samples: [{ id: 'demo', path: 'samples/demo' }, { id: 'demo', path: 'samples/demo' }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /sample IDs/);
    await fs.mkdir(path.join(dir, 'samples', 'bad'));
    await fs.writeFile(path.join(dir, 'samples', 'bad', 'xrb-project.json'), '{}');
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Tracker', type: 'input', version: '0.1.0', panel: { samples: [{ id: 'bad', path: 'samples/bad' }] } }));
    await assert.rejects(pluginMeta(workspace, 'input-tracker'), /invalid xrb-project.json/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('hidden implementation components do not become separate manager rows', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-hidden-plugin-'));
  try {
    const dir = path.join(workspace, 'plugins', 'publisher-component'); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Internal Publisher', type: 'publisher', version: '0.1.0', hidden: true }));
    const panel = new Panel(workspace, workspace, { send() {} } as ConstructorParameters<typeof Panel>[2]);
    assert.deepEqual(await panel.managedPlugins(), []);
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});

test('disabled selections fall back at runtime without rewriting the project manifest', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-disabled-fallback-'));
  const id = `fallback-${path.basename(workspace)}`;
  const manifest = { name: 'Fallback', kind: 'app' as const, display: 'stereo-panel', platform: 'station',
    inputs: ['mouse', 'keyboard', 'tracker'], plugins: { desktop: { monitor: 1 } } };
  try {
    await savePluginPrefs(workspace, { disabled: ['display-stereo-panel', 'input-tracker', 'platform-station'], settings: {}, panelSettings: {} });
    const panel = new Panel(workspace, workspace, { send() {} } as ConstructorParameters<typeof Panel>[2]);
    const args = await panel.hostArgs({ id, dir: workspace, manifest } as Parameters<Panel['hostArgs']>[0], manifest,
      { fullscreen: false, monitor: 1 });
    const config = JSON.parse(await fs.readFile(args[0].slice('--config='.length), 'utf8'));
    assert.deepEqual({ display: config.display, platform: config.platform, inputs: config.inputs, monitor: config.plugins.desktop.monitor },
      { display: 'desktop', platform: '', inputs: ['mouse', 'keyboard'], monitor: 0 });
    assert.equal(manifest.display, 'stereo-panel');
    assert.equal(manifest.platform, 'station');
  } finally {
    await fs.rm(path.join(os.tmpdir(), 'xrb-runs', `${id}.json`), { force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('packager-only plugin uses a short name and package metadata, without a native provider', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-packager-manager-'));
  try {
    const pluginDir = path.join(workspace, 'plugins', 'platform-station'), dir = path.join(pluginDir, 'packager');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, 'xrb-plugin.json'), JSON.stringify({ title: 'Station', type: 'platform', version: '0.1.0' }));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      version: '0.1.0', description: 'Builds station packages', xrBuild: { packager: './packager.ts' },
    }));
    const panel = new Panel(workspace, workspace, { send() {} } as ConstructorParameters<typeof Panel>[2]);
    const [plugin] = await panel.managedPlugins();
    assert.equal(plugin.name, 'station');
    assert.equal(plugin.title, 'Station');
    assert.equal(plugin.type, 'platform');
    assert.equal(plugin.description, 'Builds station packages');
    assert.equal(plugin.version, '0.1.0');
    assert.equal(plugin.packager, true);
    assert.deepEqual(plugin.providers, []);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

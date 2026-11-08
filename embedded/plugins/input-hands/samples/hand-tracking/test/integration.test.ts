import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is required');
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plugin = path.resolve(project, '../..');
const workspace = path.resolve(plugin, '../..');
const moduleAt = (name: string) => import(pathToFileURL(path.join(core, `packages/control-panel/src/${name}.ts`)).href);

test('diagnostic manifest and native settings use the existing panel contracts', async t => {
  const { validateManifest } = await moduleAt('projects');
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'xrb-project.json'), 'utf8'));
  assert.deepEqual(validateManifest(manifest, project), []);
  assert.equal(manifest.kind, 'app');
  assert.equal(manifest.name, 'Hands');
  assert.deepEqual(manifest.inputs, ['mouse', 'keyboard']);
  try { await fs.access(path.join(plugin, 'xrb-plugin.json')); } catch { t.skip('Imported copies have no source-plugin settings'); return; }
  const { pluginMeta, validateSettings, effectiveSettings } = await moduleAt('plugin-manager');
  const meta = await pluginMeta(workspace, 'input-hands');
  assert.equal(meta.title, 'Hands');
  assert.equal(meta.glyph, '👋');
  assert.deepEqual(validateSettings(meta.settings, { scenario: 'motion', hands: 2, hz: 60 }), { scenario: 'motion', hands: 2, hz: 60 });
  assert.deepEqual(validateSettings(meta.panelSettings, { delegate: 'GPU', detection: 0.7, recordingLimit: 45, recordingAutoCapture: false }), { delegate: 'GPU', detection: 0.7, recordingLimit: 45, recordingAutoCapture: false });
  assert.deepEqual(effectiveSettings(meta.panelSettings), { delegate: 'CPU', detection: 0.5, presence: 0.5, tracking: 0.5, recordingLimit: 120, recordingAutoCapture: true });
  assert.deepEqual(meta.panelHiddenProviders, ['hand-tracking']);
  assert.equal(meta.type, 'input');
  assert.equal(meta.panelSamples[0].id, 'hand-tracking');
});
test('built provider is discoverable, disabled selection falls back, and enable restores it', async t => {
  const dll = path.join(plugin, 'bin/xrb_input_hand_tracking.dll');
  try { await fs.access(dll); } catch { t.skip('Build native plugin to exercise binary discovery'); return; }
  const { listProviders } = await moduleAt('host-build');
  const { Panel } = await moduleAt('panel');
  const { EventHub } = await moduleAt('http');
  const testRoot=process.env.XRB_TEST_ROOT||path.join(core,'.artifacts/hand-tests');
  await fs.mkdir(testRoot, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(testRoot, 'integration-'));
  try {
    const pluginDir = path.join(scratch, 'plugins/input-hands'), bin = path.join(pluginDir, 'bin'); await fs.mkdir(bin, { recursive: true });
    const sampleDir = path.join(pluginDir, 'samples/hand-tracking'); await fs.mkdir(sampleDir, { recursive: true });
    await fs.copyFile(path.join(plugin, 'xrb-plugin.json'), path.join(pluginDir, 'xrb-plugin.json'));
    await fs.copyFile(path.join(project, 'xrb-project.json'), path.join(sampleDir, 'xrb-project.json'));
    await fs.copyFile(dll, path.join(bin, 'xrb_input_hand_tracking.dll'));
    const panel = new Panel(core, scratch, new EventHub());
    const manifest = { name: 'Synthetic', kind: 'test', display: 'desktop', inputs: ['mouse', 'keyboard', 'hand-tracking'] };
    const catalog = await listProviders(core, scratch);
    if (catalog.error === 'xrb-host.exe is not built') { t.skip('Build the native host to exercise binary discovery'); return; }
    assert.ok(catalog.providers.some((p: { name: string; role: string }) => p.name === 'hand-tracking' && p.role === 'input'));
    await fs.writeFile(path.join(scratch, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
    assert.ok(!(await listProviders(core, scratch)).providers.some((p: { name: string }) => p.name === 'hand-tracking'));
    const disabled = await panel.effectiveSelection(manifest);
    assert.deepEqual(disabled.inputs, ['mouse', 'keyboard']); assert.equal(disabled.input, 'none');
    assert.deepEqual(manifest.inputs, ['mouse', 'keyboard', 'hand-tracking'], 'saved choice retained');
    await fs.writeFile(path.join(scratch, 'xrb-plugins.json'), JSON.stringify({ disabled: [], settings: {} }));
    assert.ok((await panel.effectiveSelection(manifest)).inputs.includes('hand-tracking'));
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
});

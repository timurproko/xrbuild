import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareHandSession } from '../src/hand-session-selection.ts';
import { discoverHandProviders } from '../src/hand-providers.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { updatePluginPrefs } from '../src/plugin-manager.ts';
import type { ProviderList } from '../src/host-build.ts';

test('session preparation snapshots selected owner/settings/profile without an app or source substitution', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-session-select-')));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const runtime = path.join(core, 'native/host/build/Release');
  for (const name of ['xrb-host.exe', 'xrb-provider-session.exe', 'xrb-acquisition.exe']) await write(path.join(runtime, name), 'fake executable, never started');
  const plugin = path.join(workspace, 'plugins/example'), dll = path.join(plugin, 'bin/xrb_live.dll');
  await write(path.join(plugin, 'xrb-plugin.json'), { title: 'Example source', type: 'input', version: '1.0.0',
    settings: [{ key: 'gain', type: 'number', label: 'Gain', default: 1 }], handProviders: [{ version: 1, id: 'live', runtimeName: 'live', transport: 'native', purpose: 'tracked' }] });
  await write(dll, 'test metadata only');
  const inventory: ProviderList = { error: null, rejected: [], providers: [
    { role: 'input', name: 'simulated', builtin: true, version: '1', path: null, description: 'metadata' },
    { role: 'input', name: 'live', builtin: false, version: '1.0', path: dll, description: 'metadata' },
  ] };
  const probe = async () => inventory;
  try {
    await updatePluginPrefs(workspace, prefs => { prefs.settings.example = { gain: 2 }; }, core);
    let state = await readHandsState(core, workspace), registry = await discoverHandProviders(core, workspace, probe);
    assert.equal(state.exists, false);
    // A dirty Synthetic picker cannot pin the otherwise inferred real source as a side effect.
    await assert.rejects(prepareHandSession(core, workspace, { provider: { owner: 'core', id: 'simulated' }, revision: state.revision, registryRevision: registry.revision }, probe), /Save the selected provider/);
    assert.equal((await readHandsState(core, workspace)).exists, false);
    const selected = await prepareHandSession(core, workspace, { provider: { owner: 'workspace:example', id: 'live' }, revision: state.revision, registryRevision: registry.revision }, probe);
    assert.equal(selected.runtimeName, 'live'); assert.equal(selected.pluginPath, dll); assert.equal(selected.config.gain, 2);
    assert.equal(selected.config.xrb.debugImages, false); assert.equal(selected.config.xrb.dataDir, workspace);
    assert.equal(selected.source.version, '1.0'); assert.equal(selected.profile.sizeFactor, 1);
    state = await readHandsState(core, workspace); assert.deepEqual(state.provider, { owner: 'workspace:example', id: 'live' });
    const bytes = await fs.readFile(path.join(workspace, 'config/hands/profile.json'));
    registry = await discoverHandProviders(core, workspace, probe);
    await assert.rejects(prepareHandSession(core, workspace, { provider: state.provider!, revision: 'stale', registryRevision: registry.revision }, probe), /changed/);
    await fs.rm(path.join(runtime, 'xrb-provider-session.exe'));
    await assert.rejects(prepareHandSession(core, workspace, { provider: state.provider!, revision: state.revision, registryRevision: registry.revision }, probe), /Rebuild the host/);
    assert.deepEqual(await fs.readFile(path.join(workspace, 'config/hands/profile.json')), bytes);
    state = await saveHandsState(core, workspace, { owner: 'core', id: 'webxr' }, state.revision);
    registry = await discoverHandProviders(core, workspace, probe);
    await assert.rejects(prepareHandSession(core, workspace, { provider: state.provider!, revision: state.revision, registryRevision: registry.revision }, probe), /WebXR requires/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

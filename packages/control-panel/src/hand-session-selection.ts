// Preparation only: snapshots neutral selected-provider settings without opening a device.
import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverHandProviders, sameHandProvider, type HandProviderKey } from './hand-providers.ts';
import { readHandsState, prepareHandInput, selectedHandProvider } from './hands-state.ts';
import { listProviders } from './host-build.ts';
import { resolvedHostPaths } from './host-artifacts.ts';
import { pluginOwnsPath, pluginPreferenceValues, resolvePluginCatalog } from './extension-catalog.ts';
import { effectiveSettings } from './plugin-manager.ts';
import { nativeBinaryFingerprint } from './plugin-artifacts.ts';

export interface SessionSelectionRequest { provider: HandProviderKey; revision: string; registryRevision: string }
export async function prepareHandSession(core: string, workspace: string, expected: SessionSelectionRequest, probe = listProviders) {
  const registry = await discoverHandProviders(core, workspace, probe);
  const before = await readHandsState(core, workspace);
  if (registry.revision !== expected.registryRevision || before.revision !== expected.revision) throw new Error('Hands source/profile changed; reload before Start');
  const selected = selectedHandProvider(before, registry, 'native');
  if (!selected.key || !sameHandProvider(selected.key, expected.provider)) throw new Error('Save the selected provider before Start');
  const row = registry.providers.find(item => sameHandProvider(item, expected.provider));
  if (!row?.available) throw new Error(row?.reason ?? 'The selected hand provider is unavailable');
  if (row.transport !== 'native') throw new Error('Standalone Hands sessions require a native provider; WebXR requires its explicit app XR session');
  const resolved = await prepareHandInput(core, workspace, registry, ['hand'], 'native');
  if (!resolved.source || !sameHandProvider(resolved.source, expected.provider)) throw new Error('Save the selected provider before Start');
  const state = await readHandsState(core, workspace);
  if (before.exists && state.revision !== before.revision) throw new Error('Hands profile changed during preparation; reload before Start');
  const runtime = await resolvedHostPaths(core, workspace);
  if (runtime.problem) throw new Error(runtime.problem);
  const workerExe = path.join(runtime.releaseDir, 'xrb-provider-session.exe');
  const helperExe = path.join(runtime.releaseDir, 'xrb-acquisition.exe');
  for (const file of [workerExe, helperExe]) {
    const stat = await fs.lstat(file).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('The provider-session runtime is missing or unsafe. Rebuild the host before Start.');
    nativeBinaryFingerprint(file);
  }
  const catalog = await resolvePluginCatalog(workspace, core, true), native = await probe(core, workspace, false);
  if (native.unsafe || native.error) throw new Error(native.error ?? 'Native provider discovery is unsafe');
  let pluginPath: string | undefined, pluginDir = runtime.releaseDir, settings: Record<string, unknown> = {}, version = '';
  if (row.owner !== 'core') {
    const owner = catalog.selected.find(item => item.key === row.owner);
    const matches = native.providers.filter(item => !item.builtin && item.role === 'input' && item.name === row.runtimeName && item.path && owner && pluginOwnsPath(owner, item.path));
    if (!owner || matches.length !== 1) throw new Error('Selected input binary identity changed; reload before Start');
    pluginPath = matches[0].path!; nativeBinaryFingerprint(pluginPath);
    pluginDir = path.dirname(pluginPath); version = matches[0].version;
    settings = effectiveSettings(owner.meta.settings ?? [], pluginPreferenceValues(owner, catalog.prefs));
  }
  return {
    source: { owner: row.owner, id: row.id, label: row.label, version },
    runtimeName: row.runtimeName!, pluginPath, workerExe, helperExe, revision: state.revision, profile: state.profile,
    config: { ...settings, xrb: { pluginDir, exeDir: runtime.releaseDir, dataDir: workspace, debugImages: false } },
  };
}

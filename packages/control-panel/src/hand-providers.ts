import { createHash } from 'node:crypto';
import type { HandProviderDeclaration } from './hand-provider-contract.ts';
import { listProviders, type ProviderList } from './host-build.ts';
import { pluginEnabled, pluginOwnsPath, resolvePluginCatalog, type PluginCatalog } from './extension-catalog.ts';

export interface HandProviderKey { owner: string; id: string }
export interface HandProvider extends HandProviderKey {
  label: string;
  transport: 'native' | 'webxr';
  runtimeName?: string;
  purpose: 'tracked' | 'synthetic' | 'replay';
  available: boolean;
  reason: string;
  aliases: string[];
}
export interface HandRegistry { providers: HandProvider[]; revision: string; problems: string[] }
export const handProviderKey = (key: HandProviderKey) => `${key.owner}/${key.id}`;
export const sameHandProvider = (a: HandProviderKey | null, b: HandProviderKey | null) => a === null || b === null ? a === b : a.owner === b.owner && a.id === b.id;

/** Pure catalog adaptation. Probes query metadata only; no input_create/start is called. */
export function handRegistry(catalog: PluginCatalog, native: ProviderList): HandRegistry {
  const providers: HandProvider[] = [];
  for (const [id, label, purpose] of [['simulated', 'Synthetic (core)', 'synthetic'], ['replay', 'Replay (core)', 'replay']] as const) {
    const installed = !native.unsafe && native.providers.some(p => p.builtin && p.role === 'input' && p.name === id);
    providers.push({ owner: 'core', id, label, transport: 'native', runtimeName: id, purpose, available: installed,
      reason: installed ? id === 'replay' ? 'Recording required in provider configuration; checked at launch' : 'Not started; device availability checked at launch' : native.error ?? 'Native provider is not installed', aliases: [id] });
  }
  providers.push({ owner: 'core', id: 'webxr', label: 'WebXR hands', transport: 'webxr', purpose: 'tracked', available: true,
    reason: 'Requires a supported browser and explicit XR session', aliases: [] });
  for (const plugin of catalog.plugins) {
    const selected = catalog.selected.some(p => p.key === plugin.key), enabled = pluginEnabled(plugin, catalog.prefs);
    const owned = native.providers.filter(p => !p.builtin && p.path && pluginOwnsPath(plugin, p.path));
    const declarations: HandProviderDeclaration[] = plugin.meta.handProviders ?? owned.filter(p => p.role === 'input').map(p => ({ version: 1 as const, id: p.name, transport: 'native' as const, runtimeName: p.name, purpose: 'tracked' as const }));
    for (const declaration of declarations) {
      const matches = owned.filter(p => p.name === declaration.runtimeName && p.role === 'input');
      const available = selected && enabled && !plugin.nativeProblem && !native.unsafe && matches.length === 1;
      const reason = !enabled ? 'Provider is disabled' : !selected ? 'Provider origin is ambiguous or not selected' : plugin.nativeProblem
        ?? (native.unsafe ? native.error ?? 'Native discovery is unsafe' : matches.length !== 1 ? 'Input binary is missing, rejected or not owned by this provider' : 'Not started; device availability checked at launch');
      providers.push({ owner: plugin.key, id: declaration.id, label: declaration.label ?? plugin.meta.title ?? declaration.id,
        transport: 'native', runtimeName: declaration.runtimeName, purpose: declaration.purpose, available, reason,
        aliases: [declaration.runtimeName, ...(plugin.meta.panelProviderNames?.[declaration.runtimeName] ? [plugin.meta.panelProviderNames[declaration.runtimeName]] : [])] });
    }
  }
  const problems = [...catalog.problems, ...native.problems ?? []];
  return { providers, problems, revision: createHash('sha256').update(JSON.stringify([providers, problems])).digest('hex') };
}
export async function discoverHandProviders(core: string, workspace: string, probe = listProviders): Promise<HandRegistry> {
  const [catalog, native] = await Promise.all([resolvePluginCatalog(workspace, core, true), probe(core, workspace, true)]);
  return handRegistry(catalog, native);
}

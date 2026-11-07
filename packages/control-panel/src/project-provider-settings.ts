// Advanced personal choices are schema-bound scalar runtime settings, never arbitrary plugin config.
import { createHash } from 'node:crypto';
import { listProviders, type ProviderList } from './host-build.ts';
import { resolvePluginCatalog, pluginOwnsPath, pluginPreferenceValues } from './extension-catalog.ts';
import { effectiveSettings, validateSettings, type PluginSetting, type SettingValue } from './plugin-manager.ts';
import { selectionOf, type Project } from './projects.ts';

export interface ProviderRunOverride { owner: string; schema: string; values: Record<string, SettingValue> }
export interface ProviderRunSchema { provider: string; owner: string; schema: string; label: string; fields: PluginSetting[]; defaults: Record<string, SettingValue>; values: Record<string, SettingValue> }
export interface ProviderSettingsOptions { probe?: (core: string, workspace: string) => Promise<ProviderList> }
export const privateRunField = (key: string) => /secret|token|password|credential|record|file|path|certificate|signing|private.?key|api.?key|url|directory|args/i.test(key);
export function selectedRunProviders(p: Project, values: { inputs?: string[]; display?: string }): Set<string> {
  const selection = selectionOf({ ...p.manifest!, ...(values.inputs ? { inputs: values.inputs } : {}), ...(values.display ? { display: values.display } : {}) });
  return new Set([...(selection.inputs ?? []), selection.display, selection.platform].filter(Boolean));
}
export async function providerRunSchemas(core: string, workspace: string, p: Project, values: { inputs?: string[]; display?: string }, options: ProviderSettingsOptions = {}): Promise<ProviderRunSchema[]> {
  if (p.manifest?.target === 'webxr') return [];
  const [catalog, providers] = await Promise.all([resolvePluginCatalog(workspace, core), (options.probe ?? listProviders)(core, workspace)]);
  if (providers.unsafe) return [];
  const selected = selectedRunProviders(p, values), schemas: ProviderRunSchema[] = [];
  for (const provider of providers.providers) {
    if (provider.builtin || !provider.path || !selected.has(provider.name)) continue;
    const owners = catalog.selected.filter(plugin => pluginOwnsPath(plugin, provider.path!));
    if (owners.length !== 1) continue;
    const owner = owners[0], fields = (owner.meta.settings ?? []).filter(field => !privateRunField(field.key) && (field.type === 'boolean' || field.type === 'number' || field.type === 'select' && field.options?.every(option => /^[a-zA-Z0-9_. -]{1,80}$/.test(option.value))));
    if (!fields.length) continue;
    const defaults = effectiveSettings(fields, pluginPreferenceValues(owner, catalog.prefs));
    const manifestValues = p.manifest?.plugins?.[provider.name];
    if (manifestValues && typeof manifestValues === 'object') {
      const known = Object.fromEntries(Object.entries(manifestValues).filter(([key]) => fields.some(field => field.key === key)));
      Object.assign(defaults, validateSettings(fields, known));
    }
    const schema = createHash('sha256').update(JSON.stringify([owner.key, owner.sourceRoot, fields])).digest('hex');
    schemas.push({ provider: provider.name, owner: owner.key, schema, label: owner.meta.title ?? provider.name, fields, defaults, values: { ...defaults } });
  }
  return schemas;
}
export function applyProviderRunOverrides(overrides: Record<string, ProviderRunOverride> | undefined, schemas: ProviderRunSchema[], selected: Set<string>): void {
  for (const [provider, record] of Object.entries(overrides ?? {})) {
    if (!selected.has(provider)) continue; // Retain inactive choices, never apply them to another run selection.
    const schema = schemas.find(schema => schema.provider === provider);
    if (!schema || schema.owner !== record.owner || schema.schema !== record.schema) throw new Error('Personal provider settings no longer match their selected source/schema');
    Object.assign(schema.values, validateSettings(schema.fields, record.values));
  }
}

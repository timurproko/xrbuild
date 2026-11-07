import path from 'node:path';
import { realpathSync } from 'node:fs';
import type { ProviderInfo, ProviderList } from './host-build.ts';

/** Strictly validate native query data before using names as package keys or paths as binary roots. */
export function providerQuery(value: unknown): ProviderList {
  if (!value || typeof value !== 'object') throw new Error('invalid native provider query');
  const raw = value as { plugins?: unknown; rejected?: unknown };
  if (!Array.isArray(raw.plugins) || !Array.isArray(raw.rejected)) throw new Error('native provider query requires plugins and rejected arrays');
  const providers = raw.plugins.map((entry): ProviderInfo => {
    const p = entry as ProviderInfo;
    if (!p || !['input', 'display', 'platform'].includes(p.role) || typeof p.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(p.name)
      || typeof p.version !== 'string' || typeof p.description !== 'string' || typeof p.builtin !== 'boolean'
      || (p.builtin ? p.path !== null : typeof p.path !== 'string' || !path.isAbsolute(p.path))) throw new Error('invalid native provider record');
    return { role: p.role, name: p.name, version: p.version, description: p.description, builtin: p.builtin, path: p.path };
  });
  const rejected = raw.rejected.map(entry => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.reason !== 'string') throw new Error('invalid native rejection record');
    return { path: entry.path as string, reason: entry.reason as string };
  });
  return { providers, rejected, error: null };
}

export interface ProviderProbe { bin: string; list: ProviderList }
/** Probe roots separately so the host's first-wins registry cannot hide a duplicate from the panel. */
export function mergeProviderProbes(base: ProviderList, probes: ProviderProbe[]): ProviderList {
  if (base.error) return { ...base, pluginBins: [] };
  if (base.rejected.length || base.providers.some(p => !p.builtin)) return {
    providers: [], rejected: base.rejected, pluginBins: [], unsafe: true, error: 'Host-local plugins must be removed or preserved aside before managed provider discovery',
  };
  const blocked = new Set<string>(), problems: string[] = [], rejected = [...base.rejected];
  const candidates: Array<{ bin: string; provider: ProviderInfo }> = [];
  const reserved = new Set(base.providers.map(p => p.name.toLowerCase()));
  for (const { bin, list } of probes) {
    rejected.push(...list.rejected);
    if (list.error || list.rejected.length) {
      blocked.add(bin); problems.push(`${bin}: ${list.error ?? 'native DLLs were rejected; the entire plugin is unavailable'}`); continue;
    }
    const external = list.providers.filter(p => !p.builtin);
    if (!external.length) { blocked.add(bin); problems.push(`${bin}: no native providers found`); continue; }
    for (const provider of external) {
      try {
        const root = realpathSync.native(bin), file = realpathSync.native(provider.path!);
        const relative = path.relative(root, file);
        if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('provider DLL escapes its selected binary root');
        if (reserved.has(provider.name.toLowerCase())) throw new Error(`provider identity ${provider.name} is reserved by the host`);
        candidates.push({ bin, provider: { ...provider, path: file } });
      } catch (error) { blocked.add(bin); problems.push(`${bin}: ${(error as Error).message}`); }
    }
  }
  const roles = new Map<string, typeof candidates>(), names = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const { bin, provider } = candidate, role = `${provider.role}:${provider.name}`;
    roles.set(role, [...(roles.get(role) ?? []), candidate]);
    const packageName = provider.name.toLowerCase();
    names.set(packageName, new Set([...(names.get(packageName) ?? []), bin]));
  }
  for (const [role, claims] of roles) if (claims.length > 1) {
    claims.forEach(claim => blocked.add(claim.bin)); problems.push(`Conflicting native provider ${role}; all claiming plugins are unavailable`);
  }
  // Package pluginDirs uses names, not role/name tuples: two roots cannot share a package key.
  for (const [name, bins] of names) if (bins.size > 1) {
    bins.forEach(bin => blocked.add(bin)); problems.push(`Conflicting native package identity ${name}; all claiming plugins are unavailable`);
  }
  return { providers: [...base.providers, ...candidates.filter(c => !blocked.has(c.bin)).map(c => c.provider)], rejected,
    pluginBins: probes.map(p => p.bin).filter(bin => !blocked.has(bin)), blockedBins: [...blocked], problems, error: null };
}

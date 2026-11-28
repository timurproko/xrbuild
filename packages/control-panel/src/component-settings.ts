import { isDeepStrictEqual } from 'node:util';
import { discoverProjectCatalog } from './extension-catalog.ts';
import type { Manifest } from './projects.ts';
import { componentMetadataErrors, resolveComponentGroups, type ComponentGroup } from '../../sdk/src/component-settings.ts';

async function projectLibraries(core: string, workspace: string, projects: string) {
  const catalog = await discoverProjectCatalog(core, workspace, projects);
  return new Map(catalog.projects.flatMap(record => {
    const m = record.project.manifest;
    return m && !record.project.errors.length ? [[record.key, m] as const] : [];
  }));
}

export async function projectComponentGroups(core: string, workspace: string, projects: string, manifest: Manifest): Promise<ComponentGroup[]> {
  if (!Object.keys(manifest.componentLibraries ?? {}).length) return [];
  return resolveComponentGroups(manifest, await projectLibraries(core, workspace, projects));
}

export async function projectComponentErrors(core: string, workspace: string, projects: string, manifest: Manifest, previous?: Manifest | null) {
  const errors = componentMetadataErrors(manifest);
  if (errors.length || !manifest.componentLibraries && !manifest.componentSettings) return errors;
  const libraries = await projectLibraries(core, workspace, projects);
  const groups = resolveComponentGroups(manifest, libraries);
  // A missing/archived library must not lock unrelated edits. Only the complete,
  // unchanged reference and saved values are preserved; new choices still need a declaration.
  const unchangedUnavailable = (id: string) => !libraries.get(id)?.componentLibrary && !!previous?.componentLibraries?.[id]
    && isDeepStrictEqual(manifest.componentLibraries?.[id], previous.componentLibraries[id])
    && isDeepStrictEqual(manifest.componentSettings?.[id], previous.componentSettings?.[id]);
  for (const [id, values] of Object.entries(manifest.componentSettings ?? {})) {
    if (unchangedUnavailable(id)) continue;
    const group = groups.find(g => g.id === id);
    for (const [name, value] of Object.entries(values)) {
      if (!group?.parameters[name]?.options.some(o => o.value === value)) errors.push({ field: `componentSettings.${id}.${name}`, message: 'Choose a declared component value' });
    }
  }
  for (const [id, reference] of Object.entries(manifest.componentLibraries ?? {})) {
    if (unchangedUnavailable(id)) continue;
    if (!libraries.get(id)?.componentLibrary) {
      errors.push({ field: `componentLibraries.${id}`, message: 'Choose an available component library' });
      continue;
    }
    const group = groups.find(g => g.id === id);
    for (const [name, value] of Object.entries(reference.defaults ?? {})) {
      if (!group?.parameters[name]?.options.some(o => o.value === value)) errors.push({ field: `componentLibraries.${id}.defaults.${name}`, message: 'Choose a declared component default' });
    }
  }
  return errors;
}

import { discoverProjectCatalog } from './extension-catalog.ts';
import type { Manifest } from './projects.ts';
import { componentMetadataErrors, resolveComponentGroups, type ComponentGroup } from '../../sdk/src/component-settings.ts';

export async function projectComponentGroups(core: string, workspace: string, projects: string, manifest: Manifest): Promise<ComponentGroup[]> {
  if (!Object.keys(manifest.componentLibraries ?? {}).length) return [];
  const catalog = await discoverProjectCatalog(core, workspace, projects);
  return resolveComponentGroups(manifest, new Map(catalog.projects.flatMap(record => {
    const m = record.project.manifest;
    return m && !record.project.errors.length ? [[record.key, m] as const] : [];
  })));
}

export async function projectComponentErrors(core: string, workspace: string, projects: string, manifest: Manifest) {
  const errors = componentMetadataErrors(manifest);
  if (errors.length) return errors;
  const groups = await projectComponentGroups(core, workspace, projects, manifest);
  for (const [id, values] of Object.entries(manifest.componentSettings ?? {})) {
    const group = groups.find(g => g.id === id);
    for (const [name, value] of Object.entries(values)) {
      if (!group?.parameters[name]?.options.some(o => o.value === value)) errors.push({ field: `componentSettings.${id}.${name}`, message: 'Choose a declared component value' });
    }
  }
  for (const [id, reference] of Object.entries(manifest.componentLibraries ?? {})) {
    const group = groups.find(g => g.id === id);
    for (const [name, value] of Object.entries(reference.defaults ?? {})) {
      if (!group?.parameters[name]?.options.some(o => o.value === value)) errors.push({ field: `componentLibraries.${id}.defaults.${name}`, message: 'Choose a declared component default' });
    }
  }
  return errors;
}

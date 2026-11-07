import path from 'node:path';
import { containedModule, resolvePluginCatalog, withinRoot, type PluginCatalog, type ResolvedPlugin } from './extension-catalog.ts';
import { serviceModuleFile } from './service-artifacts.ts';

/** '#alias' is the only cross-owner form. Ordinary module paths cannot traverse into siblings. */
export async function resolvePluginModule(plugin: ResolvedPlugin, from: string, declaration: string, workspace: string, core?: string, catalog?: PluginCatalog) {
  let owner = plugin, base = from, module = declaration;
  if (declaration.startsWith('#')) {
    const alias = declaration.slice(1);
    if (!Object.hasOwn(plugin.meta.references ?? {}, alias)) throw new Error('Component reference is not declared by this plugin');
    const reference = plugin.meta.references![alias];
    const inventory = catalog ?? await resolvePluginCatalog(workspace, core);
    const target = inventory.selected.find(candidate => candidate.key === reference.plugin);
    if (!target || !Object.hasOwn(target.meta.exports ?? {}, reference.export)) throw new Error('Referenced component is unavailable or not exported by its selected owner');
    owner = target; base = target.sourceRoot; module = target.meta.exports![reference.export];
  }
  if (path.isAbsolute(module) || module.includes('\\') || module.includes(':') || module.includes('\0') || module.split('/').includes('..')) throw new Error('Extension module must be a contained relative path');
  const source = path.resolve(base, module);
  if (!withinRoot(owner.sourceRoot, source) || !withinRoot(owner.sourceRoot, base)) throw new Error('Component module escapes its declared owner');
  const selected = await serviceModuleFile(owner, source, workspace, core);
  const runtimeOwner = selected.runtimeRoot ? path.join(selected.runtimeRoot, path.relative(owner.workspaceRoot, owner.sourceRoot)) : owner.sourceRoot;
  const runtimeBase = selected.runtimeRoot ? path.join(selected.runtimeRoot, path.relative(owner.workspaceRoot, base)) : base;
  const file = await containedModule(runtimeOwner, runtimeBase, module);
  return { file, owner, runtimeRoot: selected.runtimeRoot };
}

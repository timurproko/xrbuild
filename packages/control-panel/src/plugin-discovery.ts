import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolvePluginCatalog, pluginEnabled, pluginPackageDirs, containedPath } from './extension-catalog.ts';
import { pluginPrefsRevision } from './plugin-manager.ts';
import { metadataText } from './embedded-inputs.ts';
import { embeddedServiceRuntime } from './service-artifacts.ts';

export interface DiscoverySnapshot { revision: string; code: Map<string, string>; roots: string[]; problem: string | null }
export async function pluginDiscoverySnapshot(core: string, workspace: string): Promise<DiscoverySnapshot> {
  const catalog = await resolvePluginCatalog(workspace, core, true), hash = createHash('sha256'), code = new Map<string, string>();
  hash.update(await pluginPrefsRevision(workspace)); hash.update(JSON.stringify(catalog.problems));
  let needsRuntime = false;
  for (const plugin of catalog.plugins) {
    hash.update(JSON.stringify([plugin.key, plugin.sourceRoot, plugin.meta]));
    for (const dir of await pluginPackageDirs(plugin)) {
      const file = await containedPath(plugin.sourceRoot, path.relative(plugin.sourceRoot, path.join(dir, 'package.json')).split(path.sep).join('/')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (!file) continue;
      const text = await metadataText(file); hash.update(text);
      if (plugin.origin === 'bundled' && catalog.selected.some(item => item.key === plugin.key) && pluginEnabled(plugin, catalog.prefs)) {
        let pkg: any; try { pkg = JSON.parse(text); } catch { continue; }
        needsRuntime ||= !!(pkg.xrBuild?.packager || pkg.xrBuild?.publisher || pkg.xrBuild?.publishers);
      }
    }
    if (catalog.selected.some(item => item.key === plugin.key) && pluginEnabled(plugin, catalog.prefs)
      && (plugin.origin === 'bundled' && plugin.meta.panelTools?.length || Object.values(plugin.meta.references ?? {}).some(reference => reference.plugin.startsWith('bundled:')))) needsRuntime = true;
  }
  let runtime: string | null = null, problem: string | null = null;
  if (needsRuntime) {
    try { runtime = (await embeddedServiceRuntime(core, workspace)).root; hash.update(runtime ?? 'packaged'); }
    catch (error) { problem = (error as Error).message; hash.update(`unavailable:${problem}`); }
  }
  const roots: string[] = [];
  const omit = new Set(['.git', '.xrbuild', '.artifacts', 'node_modules', 'bin', 'build', 'builds', 'third_party', 'logs', 'recordings']);
  for (const plugin of catalog.selected.filter(plugin => pluginEnabled(plugin, catalog.prefs))) {
    const root = plugin.origin === 'bundled' && runtime ? path.join(runtime, path.relative(plugin.workspaceRoot, plugin.sourceRoot)) : plugin.sourceRoot;
    roots.push(root);
    const visit = async (dir: string) => {
      for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (omit.has(entry.name.toLowerCase())) continue;
        const file = path.join(dir, entry.name), stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) throw new Error('Plugin discovery source contains a symbolic link or junction');
        if (stat.isDirectory()) await visit(file);
        else if (stat.isFile() && (/\.(?:mjs|js|cjs|ts)$/.test(entry.name) || ['xrb-plugin.json', 'package.json'].includes(entry.name))) {
          if (stat.nlink !== 1) throw new Error('Plugin discovery source contains a hard link');
          const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
          if (entry.name === 'package.json') {
            try { const pkg = JSON.parse(await metadataText(file)); code.set(`${file}\0dependencies`, JSON.stringify([pkg.type, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.imports, pkg.exports])); } catch { /* Discovery reports malformed declarations. */ }
          } else if (entry.name !== 'xrb-plugin.json') code.set(file, stamp);
          hash.update(`${file}\0${stamp}\0`);
        }
      }
    };
    await visit(root);
  }
  return { revision: hash.digest('hex'), code, roots, problem };
}

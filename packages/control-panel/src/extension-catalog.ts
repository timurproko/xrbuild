// Shared, read-only identities and containment for product and selected-workspace extensions.
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pluginMeta, readPluginPrefs, type PluginMeta, type PluginPrefs } from './plugin-manager.ts';
import { discoverAll, type Project } from './projects.ts';
import { nativeArtifacts, type NativeArtifacts } from './plugin-artifacts.ts';

export type ExtensionOrigin = 'bundled' | 'workspace';
export interface ResolvedPlugin extends NativeArtifacts {
  key: string;
  id: string;
  origin: ExtensionOrigin;
  workspaceRoot: string;
  sourceRoot: string;
  installRoot: string;
  dependencyRoot: string;
  binaryRoot: string;
  configDir: string;
  readOnly: boolean;
  legacyPreferences: boolean;
  meta: PluginMeta;
}
export interface PluginCatalog {
  plugins: ResolvedPlugin[];
  selected: ResolvedPlugin[];
  problems: string[];
  prefs: PluginPrefs;
}
export interface CatalogProject {
  key: string;
  origin: ExtensionOrigin;
  workspaceRoot: string;
  readOnly: boolean;
  project: Project;
}
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export function withinRoot(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Existing regular file/directory within this owner, with no symlink/junction traversal. */
export async function containedPath(root: string, relative: string): Promise<string> {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[a-z]:/i.test(relative) || relative.includes('\\')) throw new Error('Extension path must be relative');
  const segments = relative.split('/');
  if (segments.some(segment => !segment || segment === '..' || segment.includes(':') || segment.includes('\0'))) throw new Error('Extension path escapes its owner');
  const base = await fs.realpath(root);
  let current = root;
  for (const segment of segments) {
    if (segment === '.') continue;
    current = path.join(current, segment);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Extension path uses a symbolic link or junction');
  }
  const real = await fs.realpath(current);
  if (!withinRoot(base, real)) throw new Error('Extension path escapes its owner');
  return real;
}
export async function containedModule(root: string, from: string, declaration: string): Promise<string> {
  // Reject traversal in the declaration itself, even when normalization would land inside the owner.
  if (path.isAbsolute(declaration) || declaration.includes('\\') || declaration.split('/').includes('..') || declaration.includes(':')) throw new Error('Extension module must be a contained relative path');
  const relative = path.relative(root, path.resolve(from, declaration)).split(path.sep).join('/');
  const file = await containedPath(root, relative);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Extension module must be a regular unlinked file');
  return file;
}
async function plainRoot(root: string): Promise<string | null> {
  const stat = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Extension root must be a plain directory: ${root}`);
  return fs.realpath(root);
}
async function futurePath(file: string): Promise<string> {
  const absolute = path.resolve(file);
  try { return await fs.realpath(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(absolute) === absolute) throw error;
    return path.join(await futurePath(path.dirname(absolute)), path.basename(absolute));
  }
}
function roots(core: string | undefined, workspace: string): Array<{ origin: ExtensionOrigin; root: string }> {
  return [...(core ? [{ origin: 'bundled' as const, root: path.join(core, 'embedded') }] : []), { origin: 'workspace', root: workspace }];
}

/** No source wins by directory order. An explicit preference selects the entire plugin record. */
export async function resolvePluginCatalog(workspace: string, core?: string, includeDisabled = false, preferences?: PluginPrefs): Promise<PluginCatalog> {
  const prefs = preferences ?? await readPluginPrefs(workspace), plugins: ResolvedPlugin[] = [], problems: string[] = [];
  const seenRoots = new Set<string>(), invalid = new Set<string>();
  let embeddedRoot: string | null = null;
  for (const { origin, root } of roots(core, workspace)) {
    try {
      const workspaceRoot = await plainRoot(root);
      if (!workspaceRoot) continue;
      if (origin === 'bundled') {
        embeddedRoot = workspaceRoot;
        if (withinRoot(embeddedRoot, await futurePath(workspace))) return { plugins: [], selected: [], prefs, problems: ['The user workspace must be outside embedded product sources'] };
      }
      if ((origin === 'workspace' && embeddedRoot && withinRoot(embeddedRoot, workspaceRoot)) || seenRoots.has(workspaceRoot)) {
        plugins.length = 0;
        problems.push('The user workspace must be outside embedded product sources');
        break;
      }
      seenRoots.add(workspaceRoot);
      const pluginRoot = await containedPath(workspaceRoot, 'plugins').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (!pluginRoot) continue;
      for (const entry of (await fs.readdir(pluginRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!ID.test(entry.name) || !entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const id = entry.name, key = `${origin}:${id}`;
        try {
          const sourceRoot = await containedPath(workspaceRoot, `plugins/${id}`);
          const manifest = await containedPath(sourceRoot, 'xrb-plugin.json').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
          if (!manifest) continue;
          const meta = await pluginMeta(workspaceRoot, id);
          const artifacts = await nativeArtifacts(core ?? workspace, workspace, sourceRoot, origin);
          plugins.push({ ...artifacts, id, key, origin, workspaceRoot, sourceRoot, installRoot: workspaceRoot,
            dependencyRoot: path.join(origin === 'bundled' ? core! : workspaceRoot, 'third_party'),
            configDir: path.resolve(workspace, 'config', 'plugins', id), readOnly: origin === 'bundled', legacyPreferences: false, meta });
        } catch (error) { invalid.add(id.toLowerCase()); problems.push(`${key}: ${(error as Error).message}`); }
      }
    } catch (error) { problems.push(`${origin}: ${(error as Error).message}`); }
  }
  const selected: ResolvedPlugin[] = [];
  const groups = new Map<string, ResolvedPlugin[]>();
  for (const plugin of plugins) {
    const id = plugin.id.toLowerCase();
    groups.set(id, [...(groups.get(id) ?? []), plugin]);
  }
  for (const [id, candidates] of groups) {
    for (const candidate of candidates) candidate.legacyPreferences = candidates.length === 1 && !invalid.has(id);
    if (invalid.has(id)) { problems.push(`${id}: another instance is invalid; refusing implicit fallback`); continue; }
    const origin = Object.hasOwn(prefs.origins ?? {}, id) ? prefs.origins![id] : undefined;
    const choices = origin ? candidates.filter(candidate => candidate.origin === origin) : candidates;
    if (choices.length !== 1) {
      problems.push(`${id}: ${origin ? `selected origin ${origin} is unavailable or ambiguous` : 'choose an origin for conflicting plugins'} (${candidates.map(p => p.key).join(', ')})`);
      continue;
    }
    const plugin = choices[0];
    if (includeDisabled || pluginEnabled(plugin, prefs)) selected.push(plugin);
  }
  return { plugins, selected, problems, prefs };
}

export function pluginOwnsPath(plugin: ResolvedPlugin, file: string): boolean {
  try { const real = realpathSync.native(file); return withinRoot(plugin.sourceRoot, real) || !plugin.nativeProblem && withinRoot(plugin.binaryRoot, real); }
  catch { const absolute = path.resolve(file); return withinRoot(plugin.sourceRoot, absolute) || !plugin.nativeProblem && withinRoot(plugin.binaryRoot, absolute); }
}
export function pluginEnabled(plugin: ResolvedPlugin, prefs: PluginPrefs): boolean {
  return !prefs.disabled.includes(plugin.id) && !prefs.disabled.includes(plugin.key);
}
export function pluginByReference(catalog: PluginCatalog, reference: string): ResolvedPlugin | null {
  const qualified = catalog.plugins.find(plugin => plugin.key === reference);
  if (qualified) return qualified;
  const matches = catalog.plugins.filter(plugin => plugin.id === reference);
  return matches.length === 1 ? matches[0] : catalog.selected.find(plugin => plugin.id === reference) ?? null;
}
export function pluginPreferenceValues(plugin: ResolvedPlugin, prefs: PluginPrefs, kind: 'settings' | 'panelSettings' = 'settings') {
  return prefs[kind][plugin.key] ?? (plugin.legacyPreferences ? prefs[kind][plugin.id] : undefined);
}

/** Package declarations belonging to one selected plugin; never scan linked child packages. */
export async function pluginPackageDirs(plugin: ResolvedPlugin): Promise<string[]> {
  const children = await fs.readdir(plugin.sourceRoot, { withFileTypes: true });
  return [plugin.sourceRoot, ...children.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== 'node_modules').map(entry => path.join(plugin.sourceRoot, entry.name))];
}

/** Qualified project identities do not replace legacy IDs in existing editable-workspace APIs. */
export async function discoverProjectCatalog(core: string, workspace: string, projects = workspace): Promise<{ projects: CatalogProject[]; problems: string[] }> {
  const found: CatalogProject[] = [], problems: string[] = [];
  if (withinRoot(await futurePath(path.join(core, 'embedded')), await futurePath(projects)))
    return { projects: [], problems: ['Editable projects must be outside embedded product sources'] };
  let embeddedRoot: string | null = null;
  for (const { origin, root } of roots(core, projects)) {
    try {
      const workspaceRoot = await plainRoot(root);
      if (!workspaceRoot) continue;
      if (origin === 'bundled') embeddedRoot = workspaceRoot;
      if (origin === 'workspace' && embeddedRoot && withinRoot(embeddedRoot, workspaceRoot)) throw new Error('Editable projects must be outside embedded product sources');
      const projectRoot = await containedPath(workspaceRoot, 'projects').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (!projectRoot) continue;
      for (const project of await discoverAll(workspaceRoot)) {
        try {
          await containedPath(workspaceRoot, path.relative(workspaceRoot, path.join(project.dir, 'xrb-project.json')).split(path.sep).join('/'));
          const key = `${origin}:${project.id}`, readOnly = origin === 'bundled';
          found.push({ key, origin, workspaceRoot, readOnly, project: { ...project, id: readOnly ? key : project.id, key, origin, readOnly } });
        } catch (error) { problems.push(`${origin}:${project.id}: ${(error as Error).message}`); }
      }
    } catch (error) { problems.push(`${origin}: ${(error as Error).message}`); }
  }
  return { projects: found, problems };
}

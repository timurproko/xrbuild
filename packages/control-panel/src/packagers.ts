// Packager plugins (design D5): how a platform turns a built app into a package for its stations.
// The panel knows no platform: a packager is any package in the core (packages/*) or in the user's
// workspace (plugins/*, plugins/*/*) whose package.json names its module in
// "xrBuild": { "packager": "./src/packager.ts" }. Without one the panel still builds and runs every
// project and shows packaging as unavailable.
import { existsSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { containedModule, containedPath, pluginPackageDirs, resolvePluginCatalog, type ResolvedPlugin } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import { pluginServiceContext, type PluginServiceContext } from './plugin-service.ts';

/** One identity field the packager needs per project (stored in the manifest's `plugins.<platform>` section). */
export interface IdentityField {
  key: string;
  label: string;
  /** 'version': dotted numbers, raised after each package; 'text': free text */
  kind: 'text' | 'version';
  required: boolean;
  /** cannot change once the project was packaged (e.g. the id stations know the app by) */
  fixed?: boolean;
  /** Hide a generated field from the project form (it remains in the manifest). */
  hidden?: boolean;
  /** Optional title-to-ID rule supplied by the packager, not the panel. */
  deriveStyle?: 'filename' | 'package';
  prefix?: string;
  hint?: string;
}

export interface IdentityError {
  /** the identity key, e.g. "id" */
  field: string;
  message: string;
}

/**
 * What a project is built for: `host` = xrb-host on a display, with display, input and platform providers;
 * `webxr` = a standalone headset running the app in its browser engine through WebXR (no host, no providers).
 */
export type BuildTarget = 'host' | 'webxr';
export const BUILD_TARGETS: readonly BuildTarget[] = ['host', 'webxr'];

/** Which provider runs each role (the project's selection). */
export interface RoleSelection {
  /** Legacy first host input; packaged hosts use inputs when present. */
  input: string;
  inputs?: string[];
  display: string;
  /** "" when the app runs standalone */
  platform: string;
}

export interface PackagerBuildOptions {
  /** built web app (index.html at its root) */
  app: string;
  /** xrb-host build output: the exe and CEF ("" for a `webxr` packager: a headset package carries no host) */
  runtimeDir: string;
  /**
   * Where each selected plugin's built files are: plugin name -> folder (a workspace plugin's bin/).
   * Ship each into the package's plugins/<name>/. Unset (an older caller): `<runtimeDir>/plugins/<name>`.
   */
  pluginDirs?: Record<string, string>;
  /** plugin names to ship (the selected ones that are plugins, not built-ins); empty for a `webxr` packager */
  plugins: string[];
  selection: RoleSelection;
  /** Project display name, available for package metadata defaults. */
  projectName: string;
  /** the manifest's `plugins.<platform>` section: the declared identity fields, version included */
  identity: Record<string, string>;
  /** Complete effective host configuration; unset for a `webxr` package. */
  config?: RoleSelection & { plugins: Record<string, unknown> };
  /** Canonical published app route for a configured WebXR app; a launcher package should open this URL. */
  launchUrl?: string;
  /** PNG icon; a default one when absent */
  icon?: string;
  iconColor?: string;
  /** Output folder for this package channel, for example `builds/cx`. */
  out: string;
  /** Staging folder for this package channel, for example `build/cx`. */
  workDir: string;
  log(msg: string): void;
}

export interface PackagerSetupStatus {
  state: 'ready' | 'setup-required' | 'unavailable';
  reason?: string;
  /** HTTPS terms to acknowledge explicitly before installing third-party tools. */
  termsUrl?: string;
}

/** Untrusted plugin status is checked before it reaches the browser or the build gate. */
export function validSetupStatus(value: unknown): value is PackagerSetupStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<PackagerSetupStatus>;
  if (!['ready', 'setup-required', 'unavailable'].includes(status.state ?? '')) return false;
  if (status.reason !== undefined && (typeof status.reason !== 'string' || status.reason.length > 500)) return false;
  if (status.termsUrl !== undefined) {
    if (status.state !== 'setup-required' || typeof status.termsUrl !== 'string') return false;
    try {
      const url = new URL(status.termsUrl);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
    } catch { return false; }
  }
  return true;
}

export interface PackagerBuildResult {
  /** the package file */
  file: string;
  sizeBytes: number;
}

export interface Packager {
  /** platform name, as projects select it (e.g. "station") */
  name: string;
  /** Optional display-only plugin label; never persisted as a project/platform identity. */
  label?: string;
  /** the target its packages run on; unset: `host` (it ships xrb-host and the selected plugins) */
  target?: BuildTarget;
  /** Packages the target's standalone choice without adding another Platform option. */
  standalone?: boolean;
  identityFields: IdentityField[];
  validate(identity: Record<string, unknown>): IdentityError[];
  build(o: PackagerBuildOptions): Promise<PackagerBuildResult>;
  /** Read-only check; never installs tools or generates signing keys. Required when setup is exposed. */
  setupStatus?(): Promise<PackagerSetupStatus>;
  /** Explicit opt-in tool installation. Must be idempotent and keep secrets out of log output. */
  setup?(o: { log(msg: string): void; acceptTerms: boolean }): Promise<void>;
  /** reproduces the station's install in a folder, for local testing */
  install?(file: string, dir: string): Promise<{ files: number }>;
}

export interface FoundPackager {
  packager: Packager;
  /** folder of the package.json that declared it */
  dir: string;
  plugin?: ResolvedPlugin;
}

export interface PackagerDiscovery {
  found: FoundPackager[];
  /** declared packagers that failed to load: shown, never fatal */
  problems: string[];
}

/** The folder of one plugin to ship (PackagerBuildOptions.pluginDirs, with its default). */
export function pluginDirOf(o: Pick<PackagerBuildOptions, 'runtimeDir' | 'pluginDirs'>, name: string): string {
  return o.pluginDirs?.[name] ?? path.join(o.runtimeDir, 'plugins', name);
}

function isPackager(p: unknown): p is Packager {
  const o = p as Partial<Packager> | null;
  return !!o && typeof o.name === 'string' && !!o.name && (o.label === undefined || (typeof o.label === 'string' && !!o.label.trim() && o.label.length <= 80))
    && Array.isArray(o.identityFields) && typeof o.validate === 'function' && typeof o.build === 'function'
    && (o.target === undefined || BUILD_TARGETS.includes(o.target)) && (o.standalone === undefined || typeof o.standalone === 'boolean')
    && ((o.setup === undefined && o.setupStatus === undefined) || (typeof o.setup === 'function' && typeof o.setupStatus === 'function'));
}

/** The target a packager builds for (`host` when it declares none). */
export function targetOf(p: Packager): BuildTarget {
  return p.target ?? 'host';
}

/** Finds and loads every declared packager. A module exports the contract as `packager` (or default). */
export async function discoverPackagers(repo: string, workspace: string): Promise<PackagerDiscovery> {
  const catalog = await resolvePluginCatalog(workspace, repo);
  const found: FoundPackager[] = [], problems = [...catalog.problems];
  const packages = path.join(repo, 'packages');
  const coreDirs = existsSync(packages) ? readdirSync(packages, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== 'node_modules').map(entry => path.join(packages, entry.name)) : [];
  const candidates: Array<{ dir: string; plugin?: ResolvedPlugin }> = [
    ...coreDirs.map(dir => ({ dir })),
    ...(await Promise.all(catalog.selected.map(async plugin => (await pluginPackageDirs(plugin)).map(dir => ({ dir, plugin }))))).flat(),
  ];
  const conflicts = new Set<string>(), standaloneConflicts = new Set<BuildTarget>();
  for (const { dir, plugin } of candidates) {
    let decl: unknown;
    try {
      decl = (JSON.parse(await fs.readFile(await containedPath(dir, 'package.json'), 'utf8')) as { xrBuild?: { packager?: unknown } }).xrBuild?.packager;
    } catch {
      continue;  // no package.json
    }
    if (decl === undefined) continue;
    const where = plugin ? `${plugin.origin}:${path.relative(plugin.workspaceRoot, dir)}` : path.relative(repo, dir);
    if (typeof decl !== 'string') {
      problems.push(`${where}: xrBuild.packager must be a module path`);
      continue;
    }
    try {
      const resolved = plugin ? await resolvePluginModule(plugin, dir, decl, workspace, repo, catalog) : { file: await containedModule(dir, dir, decl), runtimeRoot: null };
      const file = resolved.file;
      const mod = (await import(pathToFileURL(file).href)) as { packager?: unknown; default?: unknown; createPackager?: (context: PluginServiceContext) => unknown };
      if (plugin?.meta.config !== undefined && typeof mod.createPackager !== 'function') throw new Error('a packager with user config must export createPackager(context)');
      const legacy = mod.packager ?? mod.default;
      const useFactory = plugin?.meta.config !== undefined || legacy === undefined;
      if (useFactory && typeof mod.createPackager === 'function' && !plugin) throw new Error('a packager factory must belong to a plugin');
      const p = useFactory && typeof mod.createPackager === 'function' ? await mod.createPackager(await pluginServiceContext(plugin!, workspace, repo, resolved.runtimeRoot)) : legacy;
      if (!isPackager(p)) throw new Error(`the module does not export a packager (name, identityFields, validate, build; target ${BUILD_TARGETS.join(' or ')} when set)`);
      found.push({ packager: p, dir, ...(plugin ? { plugin } : {}) });
    } catch (e) {
      problems.push(`${where}: ${(e as Error).message}`);
    }
  }
  for (const { packager } of found) {
    if (found.filter(item => item.packager.name === packager.name).length > 1) conflicts.add(packager.name);
    if (packager.standalone && found.filter(item => item.packager.standalone && targetOf(item.packager) === targetOf(packager)).length > 1) standaloneConflicts.add(targetOf(packager));
  }
  for (const name of conflicts) problems.push(`conflicting packagers named "${name}": all implementations are unavailable`);
  for (const target of standaloneConflicts) problems.push(`conflicting standalone ${target} packagers: all implementations are unavailable`);
  return { found: found.filter(item => !conflicts.has(item.packager.name) && !(item.packager.standalone && standaloneConflicts.has(targetOf(item.packager)))), problems };
}

/** The packager for a platform; null when the project runs standalone or no plugin packages for it. */
export function packagerFor(d: PackagerDiscovery, platform: string): FoundPackager | null {
  return platform ? (d.found.find((f) => f.packager.name === platform) ?? null) : null;
}

/** Platform names a project of `target` can select (the packagers building for that target). */
export function platformsFor(d: PackagerDiscovery, target: BuildTarget): string[] {
  return d.found.filter((f) => !f.packager.standalone && targetOf(f.packager) === target).map((f) => f.packager.name);
}

// Project convention: a project is a folder holding an xrb-project.json manifest, in a section folder of the
// workspace's projects/ (projects/<section>/<project>; projects/unsorted/ for none), or archived in
// projects/archive/<project>. There is no central registry; the folders are the list and the sections.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ICON_COLORS, ICON_SHAPES, isIconColor, isIconShape, type IconColor, type IconShape } from '../../app-icon/src/icon.ts';
import { BUILD_TARGETS, type BuildTarget, type RoleSelection } from './packagers.ts';
import { publicationProblems, type PublicationConfig } from './publication.ts';

export const MANIFEST = 'xrb-project.json';
export type ProjectKind = 'app' | 'test';

export interface Manifest {
  name: string;
  /** Optional launcher card copy; empty omits the description. */
  description?: string;
  kind: ProjectKind;
  /** folder served to the host, relative to the project: a build output or a static page folder */
  entry?: string;
  /** script names from the project's package.json */
  scripts?: { build?: string; dev?: string };
  /** PNG, relative to the project; the package thumbnail, window icon and finalized browser favicon */
  icon?: string;
  /** colour and silhouette of the generated default icon while there is no `icon` */
  iconColor?: IconColor;
  iconShape?: IconShape;
  /** what the app is built for: `host` (unset; xrb-host on a display) or `webxr` (a standalone headset, no host or providers) */
  target?: BuildTarget;
  /** providers per role, built in or plugin names (`xrb-host --list-plugins`); unset: none, desktop, standalone */
  /** Enabled input methods; mouse and keyboard are browser inputs, other names are host providers. */
  inputs?: string[];
  /** Legacy single host input (read when inputs is absent). */
  input?: string;
  display?: string;
  /** station runtime; "" or unset: standalone, not packaged */
  platform?: string;
  /** optional WebXR publication identity and selected workspace publisher */
  publication?: PublicationConfig;
  /**
   * Configuration per plugin (`plugins.<name>`), passed to the host as is. The platform's section also holds the
   * package identity: the fields its packager declares, plus `version` (raised after each package) and `lastPackaged`.
   */
  plugins?: Record<string, PluginConfig>;
  /** xrb-host options for runs from the panel */
  host?: { recordHands?: string; args?: string[] };
  /** each platform tab's own Display and Input ("host:", "host:<platform>"), restored when the tab is chosen again */
  platformSettings?: Record<string, { display?: string; input?: string; inputs?: string[]; monitor?: number }>;
}

export type PluginConfig = Record<string, unknown>;

export interface FieldError {
  field: string;
  message: string;
}

export interface Project {
  /** Catalog ownership; legacy editable discovery may omit these fields. */
  key?: string;
  origin?: 'bundled' | 'workspace';
  readOnly?: boolean;
  /** Installed provenance retained by user-owned effective embedded projects. */
  productDir?: string;
  integrationWorkspace?: string;
  workingRoot?: string;
  stateProblem?: string;
  sourceUpdate?: { revision: string; path: string };
  organizationRevision?: string;
  importedRunRevision?: string | null;
  runDefaults?: { flat: boolean; cameraView: boolean };
  /** the project's folder name, e.g. "demo"; "archive/demo" when archived */
  id: string;
  dir: string;
  /** the section folder it is in (UNSORTED for none); null when archived */
  section: string | null;
  manifest: Manifest | null;
  /** set when the manifest cannot be used */
  errors: FieldError[];
  /** manifest file time when read, for the changed-on-disk check */
  manifestMtimeMs: number;
}

const VERSION = /^\d+(\.\d+){1,3}$/;
const PROVIDER = /^[a-z0-9-]*$/;

/** True when `p` resolves to `dir` or a path inside it. */
export function isInside(dir: string, p: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(dir, p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function defaultEntry(kind: ProjectKind): string {
  return kind === 'app' ? 'dist' : '.';
}

/** Checks a manifest; every problem names its field. */
export function validateManifest(m: unknown, projectDir: string): FieldError[] {
  const errors: FieldError[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  if (!m || typeof m !== 'object' || Array.isArray(m)) return [{ field: '', message: 'manifest must be a JSON object' }];
  const o = m as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim()) err('name', 'name is required');
  if (o.description !== undefined && (typeof o.description !== 'string' || o.description.length > 160)) err('description', 'description must be text up to 160 characters');
  if (o.kind !== 'app' && o.kind !== 'test') err('kind', 'kind must be "app" or "test"');
  for (const field of ['entry', 'icon'] as const) {
    const v = o[field];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !v.trim()) err(field, `${field} must be a path inside the project`);
    else if (!isInside(projectDir, v)) err(field, `${field} "${v}" is outside the project folder`);
    else if (field === 'icon' && !v.toLowerCase().endsWith('.png')) err('icon', 'icon must be a PNG file');
  }
  if (o.iconColor !== undefined && !isIconColor(o.iconColor)) err('iconColor', `iconColor must be one of ${Object.keys(ICON_COLORS).join(', ')}`);
  if (o.iconShape !== undefined && !isIconShape(o.iconShape)) err('iconShape', `iconShape must be one of ${ICON_SHAPES.join(', ')}`);
  if (o.target !== undefined && !BUILD_TARGETS.includes(o.target as BuildTarget)) err('target', `target must be one of ${BUILD_TARGETS.join(', ')}`);
  if (o.scripts !== undefined) {
    const s = o.scripts as Record<string, unknown>;
    if (!s || typeof s !== 'object') err('scripts', 'scripts must be an object');
    // Names only (they run as `pnpm run <name>` through cmd.exe): no spaces or shell characters.
    else for (const k of ['build', 'dev']) if (s[k] !== undefined && (typeof s[k] !== 'string' || !/^[\w:.-]+$/.test(s[k] as string))) err(`scripts.${k}`, `scripts.${k} must be a script name from package.json`);
  }
  if (o.inputs !== undefined && (!Array.isArray(o.inputs) || o.inputs.some((n) => typeof n !== 'string' || !PROVIDER.test(n) || !n || n === 'none') || new Set(o.inputs).size !== o.inputs.length))
    err('inputs', 'inputs must be a list of distinct input names');
  for (const role of ['input', 'display', 'platform'] as const) {
    const v = o[role];
    if (v !== undefined && (typeof v !== 'string' || !PROVIDER.test(v) || (role !== 'platform' && !v)))
      err(role, `${role} must be a provider name (lower case letters, digits, dashes)`);
  }
  if (o.package !== undefined) err('package', 'package is not a manifest field: the package identity is plugins.<platform>');
  errors.push(...publicationProblems(o.publication));
  if (o.plugins !== undefined) {
    const ps = o.plugins as Record<string, unknown>;
    if (!ps || typeof ps !== 'object' || Array.isArray(ps)) err('plugins', 'plugins must be an object of plugin sections');
    else
      for (const [name, cfg] of Object.entries(ps)) {
        if (!PROVIDER.test(name) || !name) err(`plugins.${name}`, `"${name}" is not a plugin name`);
        else if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) err(`plugins.${name}`, `plugins.${name} must be an object`);
      }
  }
  // The package identity's generic part (the packager checks its own fields): a dotted version.
  const identity = typeof o.platform === 'string' && o.platform ? (o.plugins as Record<string, Record<string, unknown>> | undefined)?.[o.platform] : undefined;
  if (identity && typeof identity === 'object') {
    const at = `plugins.${o.platform as string}`;
    if (identity.version !== undefined && (typeof identity.version !== 'string' || !VERSION.test(identity.version)))
      err(`${at}.version`, `version "${String(identity.version)}" must be dotted numbers, e.g. 1.0.0`);
    if (identity.lastPackaged !== undefined && (typeof identity.lastPackaged !== 'string' || !VERSION.test(identity.lastPackaged)))
      err(`${at}.lastPackaged`, 'lastPackaged must be dotted numbers, e.g. 1.0.0');
  }
  if (o.platformSettings !== undefined) {
    const ps = o.platformSettings;
    const isObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObject(ps) || !Object.values(ps as object).every(isObject)) err('platformSettings', 'platformSettings must map platform tabs to their display and input settings');
  }
  if (o.host !== undefined) {
    const h = o.host as Record<string, unknown>;
    if (!h || typeof h !== 'object') err('host', 'host must be an object');
    else {
      if (h.recordHands !== undefined) {
        if (typeof h.recordHands !== 'string') err('host.recordHands', 'recordHands must be a file path');
        else if (h.recordHands && !isInside(projectDir, h.recordHands)) err('host.recordHands', 'recordHands must be inside the project folder');
      }
      if (h.args !== undefined && (!Array.isArray(h.args) || h.args.some((a) => typeof a !== 'string' || !a.startsWith('--'))))
        err('host.args', 'args must be a list of --name=value options');
    }
  }
  return errors;
}

/** Which provider runs each role for a project (unset: no hands, the desktop display, standalone). */
export function selectionOf(m: Manifest): RoleSelection {
  const inputs = m.inputs ?? ['mouse', 'keyboard', ...(m.input && m.input !== 'none' ? [m.input] : [])];
  return { input: inputs.find((n) => n !== 'mouse' && n !== 'keyboard') ?? 'none', inputs,
    display: m.display ?? 'desktop', platform: m.platform ?? '' };
}

/** What the project is built for (`host` when unset). */
export function buildTargetOf(m: Manifest): BuildTarget {
  return m.target ?? 'host';
}

/** The package identity: the platform's section of `plugins` (null standalone or without one). */
export function identityOf(m: Manifest): Record<string, unknown> | null {
  return m.platform ? (m.plugins?.[m.platform] ?? null) : null;
}

/** Folder of the workspace that holds every project: projects/<section>/<project>/, projects/archive/<project>/. */
export const PROJECTS = 'projects';
/** projects/archive/<project>: archived projects (flat). Not a section name. */
export const ARCHIVE = 'archive';
/** projects/unsorted/<project>: projects in no section, and new ones. Shown last; not a section of the layout. */
export const UNSORTED = 'unsorted';
/** Folder names that are not sections. */
export const RESERVED_SECTIONS = [ARCHIVE, UNSORTED];

/** Reads the project folder `dir` with the given id; null when it holds no manifest. */
export async function readProject(dir: string, id: string, section: string | null): Promise<Project | null> {
  const file = path.join(dir, MANIFEST);
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch {
    return null;  // not a project
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)
    return { id, dir, section, manifest: null, errors: [{ field: '', message: 'Manifest must be a regular, unlinked file' }], manifestMtimeMs: stat.mtimeMs };
  let manifest: unknown;
  try {
    // Windows tools (PowerShell 5, older Notepad) write UTF-8 with a byte-order mark.
    manifest = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, ''));
  } catch (e) {
    return { id, dir, section, manifest: null, errors: [{ field: '', message: `${file}: ${(e as Error).message}` }], manifestMtimeMs: stat.mtimeMs };
  }
  const errors = validateManifest(manifest, dir);
  return { id, dir, section, manifest: errors.length ? null : (manifest as Manifest), errors, manifestMtimeMs: stat.mtimeMs };
}

const subdirs = async (dir: string) =>
  (await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])).filter((e) => e.isDirectory()).map((e) => e.name);

/** The section folders under projects/ (unsorted included, archive not), sorted. */
export async function sectionFolders(ws: string): Promise<string[]> {
  return (await subdirs(path.join(ws, PROJECTS))).filter((n) => n.toLowerCase() !== ARCHIVE).sort((a, b) => a.localeCompare(b));
}

/**
 * Live projects: every projects/<section>/<project> with a manifest, sorted by id. The id is the project's folder
 * name, unique across sections, so it stays the same when the project moves between sections. A second project
 * with a name already taken is listed broken under "<name>@<section>".
 */
export async function discoverProjects(ws: string): Promise<Project[]> {
  const out: Project[] = [];
  const seen = new Map<string, string>();
  for (const section of await sectionFolders(ws)) {
    for (const name of (await subdirs(path.join(ws, PROJECTS, section))).sort()) {
      const key = name.toLowerCase();
      const taken = seen.get(key);
      const p = await readProject(path.join(ws, PROJECTS, section, name), taken === undefined ? name : `${name}@${section}`, section);
      if (!p) continue;
      if (taken !== undefined) {
        p.manifest = null;
        p.errors = [{ field: '', message: `another project named ${name} is in ${taken}: project folder names must be unique` }];
      } else seen.set(key, section);
      out.push(p);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Archived projects (projects/archive/<project>); their ids are "archive/<project>". */
export async function discoverArchived(ws: string): Promise<Project[]> {
  const out: Project[] = [];
  for (const name of (await subdirs(path.join(ws, PROJECTS, ARCHIVE))).sort()) {
    const p = await readProject(path.join(ws, PROJECTS, ARCHIVE, name), `${ARCHIVE}/${name}`, null);
    if (p) out.push(p);
  }
  return out;
}

/** Live and archived projects: everything that can be selected, run and built. */
export async function discoverAll(ws: string): Promise<Project[]> {
  return [...(await discoverProjects(ws)), ...(await discoverArchived(ws))];
}

export const isArchivedId = (id: string) => /^(?:(?:bundled|workspace):)?archive\//.test(id);
/** "archive/x" -> "x" (the id it has when live). */
export const liveId = (id: string) => id.replace(/^((?:bundled|workspace):)?archive\//, '$1');

export class MoveRefused extends Error {}

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** A section folder name: no path or reserved characters, not reserved. Returns the problem or null. */
export function sectionNameProblem(name: string): string | null {
  if (!name.trim() || name !== name.trim()) return 'a section name cannot be empty or start or end with a space';
  if (/[\\/:*?"<>|]/.test(name) || /\.$/.test(name) || name === '.' || name === '..') return `"${name}" cannot be a folder name`;
  if (RESERVED_SECTIONS.some((r) => r.toLowerCase() === name.toLowerCase())) return `"${name}" is reserved`;
  return null;
}

/**
 * Moves a project folder (a plain rename: node_modules links move along unchanged, nothing is copied or deleted).
 * `to` is a section folder name, or ARCHIVE. Refuses when the target exists.
 */
export async function moveProject(ws: string, p: Project, to: string): Promise<string> {
  if (!(await exists(path.join(p.dir, MANIFEST)))) throw new MoveRefused(`no project at ${path.relative(ws, p.dir)}`);
  const dest = path.join(ws, PROJECTS, to, path.basename(p.dir));
  if (path.resolve(dest) === path.resolve(p.dir)) return dest;
  if (await exists(dest)) throw new MoveRefused(`${path.relative(ws, dest)} already exists`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(p.dir, dest);
  await removeIfEmpty(path.dirname(p.dir));
  return dest;
}

/** Removes a section folder that holds nothing (or only a .gitkeep); keeps projects/ itself. */
export async function removeIfEmpty(dir: string): Promise<void> {
  if (path.basename(path.dirname(dir)) !== PROJECTS) return;
  const left = await fs.readdir(dir).catch(() => null);
  if (!left || left.some((n) => n !== '.gitkeep')) return;
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

/** Folders in a section with a package.json but no manifest ("<section>/<folder>"): candidates for "create manifest". */
export async function unregisteredApps(ws: string): Promise<string[]> {
  const out: string[] = [];
  for (const section of await sectionFolders(ws)) {
    for (const name of await subdirs(path.join(ws, PROJECTS, section))) {
      const dir = path.join(ws, PROJECTS, section, name);
      const has = (f: string) => exists(path.join(dir, f));
      if ((await has('package.json')) && !(await has(MANIFEST))) out.push(`${section}/${name}`);
    }
  }
  return out.sort();
}

/** A default manifest for an app folder, from its package.json. */
/**
 * The manifest of a new app. It runs with the same providers as `like` (an existing app of the workspace), and
 * gets an identity for its platform (id and title from the folder, version 0.1.0); without one: standalone.
 */
export async function defaultManifest(dir: string, like?: Manifest | null): Promise<Manifest> {
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: string; scripts?: Record<string, string> };
  const name = path.basename(dir);
  const m: Manifest = {
    name,
    kind: 'app',
    entry: 'dist',
    scripts: { ...(pkg.scripts?.build ? { build: 'build' } : {}), ...(pkg.scripts?.dev ? { dev: 'dev' } : {}) },
  };
  if (like?.inputs) m.inputs = [...like.inputs];
  else if (like?.input) m.input = like.input;
  if (like?.display) m.display = like.display;
  if (like?.platform) {
    m.platform = like.platform;
    m.plugins = { [like.platform]: { id: name, title: name, version: '0.1.0' } };
  }
  return m;
}

export class ManifestConflictError extends Error {}

/**
 * Validates and writes a manifest. With `expectedMtimeMs`, refuses when the file changed on
 * disk since it was read (hand edits win; the panel reloads instead of overwriting).
 */
export async function saveManifest(dir: string, manifest: Manifest, expectedMtimeMs?: number): Promise<{ errors: FieldError[]; mtimeMs: number }> {
  const errors = validateManifest(manifest, dir);
  if (errors.length) return { errors, mtimeMs: expectedMtimeMs ?? 0 };
  const file = path.join(dir, MANIFEST);
  if (expectedMtimeMs !== undefined) {
    const now = await fs.stat(file).then((s) => s.mtimeMs, () => 0);
    if (now !== expectedMtimeMs) throw new ManifestConflictError(`${file} changed on disk; reload the project before saving`);
  }
  const temporary = path.join(dir, `.xrb-manifest-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    if (expectedMtimeMs !== undefined && (await fs.stat(file)).mtimeMs !== expectedMtimeMs) throw new ManifestConflictError(`${file} changed during save; reload the project`);
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
  return { errors: [], mtimeMs: (await fs.stat(file)).mtimeMs };
}

/** Next patch version after the highest of the given versions (e.g. 0.1.0 -> 0.1.1). */
export function nextVersion(...versions: Array<string | undefined>): string {
  const parsed = versions.filter((v): v is string => !!v && VERSION.test(v)).map((v) => v.split('.').map(Number));
  if (!parsed.length) return '0.1.0';
  parsed.sort(compareParts);
  const top = [...parsed[parsed.length - 1]];
  while (top.length < 3) top.push(0);
  top[top.length - 1]++;
  return top.join('.');
}

export function compareVersions(a: string, b: string): number {
  return compareParts(a.split('.').map(Number), b.split('.').map(Number));
}

function compareParts(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

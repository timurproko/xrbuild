// Baseline-aware updates never rewrite the old generation or the installed product.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { buildInventory, buildJson, inputHash, metadataText, writeBuildReceipt } from './embedded-inputs.ts';
import { containedPath } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import { defaultEntry, MANIFEST, validateManifest, type Manifest, type Project } from './projects.ts';
import { HttpError } from './http.ts';

type Files = Record<string, string>;
export interface SourceBaseline { version: 1; relative: string; files: Files; manifest: Manifest | null }
const maximum = 4 * 1024 * 1024;
const personal = new Set(['name', 'description', 'target', 'icon', 'iconColor', 'iconShape', 'inputs', 'input', 'display', 'platform', 'plugins', 'publication', 'platformSettings']);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const equal = isDeepStrictEqual;
const conflict = (file: string, recovery: string): never => { throw new HttpError(409, `Cannot update ${file}: it has conflicting local changes. Your previous files are safe at ${recovery}.`); };

/** Personal fields are overlays, not an excuse to pin source/build declarations. */
export function refreshManifest(base: Manifest | null, local: Manifest | null, next: Manifest | null, recovery: string): Manifest | null {
  if (!local || !next) {
    if (equal(local, base)) return next;
    if (equal(next, base) || equal(next, local)) return local;
    return conflict(MANIFEST, recovery);
  }
  const merge = (b: unknown, l: unknown, n: unknown, preferLocal: boolean, field: string): unknown => {
    if (base && equal(l, b)) return n;
    if (equal(l, n) || base && equal(n, b)) return l;
    if (object(l) && object(n) && (b === undefined || object(b))) {
      const result: Record<string, unknown> = Object.create(null);
      for (const key of new Set([...Object.keys(b ?? {}), ...Object.keys(l), ...Object.keys(n)])) {
        const value = merge(object(b) ? b[key] : undefined, l[key], n[key], preferLocal, `${field}.${key}`);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (preferLocal) return l;
    return conflict(`${MANIFEST}:${field}`, recovery);
  };
  const result: Record<string, unknown> = Object.create(null);
  for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(next)])) {
    const b = (base as unknown as Record<string, unknown> | null)?.[key], l = (local as unknown as Record<string, unknown>)[key], n = (next as unknown as Record<string, unknown>)[key];
    let value: unknown;
    if (key === 'host') {
      // Recording intent is user state; arbitrary command-line arguments are source configuration.
      const bh = object(b) ? b : {}, lh = object(l) ? l : {}, nh = object(n) ? n : {};
      const host: Record<string, unknown> = Object.create(null);
      for (const field of new Set([...Object.keys(bh), ...Object.keys(lh), ...Object.keys(nh)])) {
        const v = merge(bh[field], lh[field], nh[field], field === 'recordHands', `host.${field}`);
        if (v !== undefined) host[field] = v;
      }
      value = Object.keys(host).length ? host : undefined;
    } else value = merge(b, l, n, personal.has(key), key);
    if (value !== undefined) result[key] = value;
  }
  const errors = validateManifest(result, recovery);
  if (errors.length) throw new HttpError(409, 'Updated project settings are incompatible; correct the saved settings before running.', errors);
  return result as unknown as Manifest;
}

/** Include a static app's otherwise-filtered packaged entry in its source baseline. */
export async function sourceFiles(root: string, excluded: string[], relative: string, manifest: Manifest | null): Promise<Files> {
  const tree = await buildInventory(root, true, excluded), files = tree.hashes;
  const entry = manifest && !manifest.scripts?.build ? manifest.entry ?? defaultEntry(manifest.kind) : null;
  if (entry && entry !== '.') {
    const prefix = path.join(relative, entry).split(path.sep).join('/');
    const dir = await containedPath(root, prefix).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
    if (dir) {
      const output = await buildInventory(dir);
      files[prefix] = 'directory';
      for (const [name, hash] of Object.entries(output.hashes)) files[`${prefix}/${name}`] = hash;
    }
  }
  if (Object.keys(files).length > 20000) throw new Error('Embedded source baseline is too large');
  return files;
}
export async function writeSourceBaseline(work: string, baseline: SourceBaseline, core: string, projects: string): Promise<string> {
  const text = JSON.stringify(baseline), file = path.join(work, 'source-baseline.json');
  if (Buffer.byteLength(text) > maximum) throw new Error('Embedded source baseline is too large');
  assertWritablePath(core, projects, file); await fs.writeFile(file, text, { flag: 'wx', mode: 0o600 });
  return inputHash(text);
}
export async function readSourceBaseline(work: string, hash: string, relative: string): Promise<SourceBaseline> {
  const text = await metadataText(await containedPath(work, 'source-baseline.json'), maximum);
  const value = JSON.parse(text) as SourceBaseline;
  if (inputHash(text) !== hash || value.version !== 1 || value.relative !== relative || !object(value.files)
    || Object.keys(value.files).length > 20000 || value.manifest !== null && !object(value.manifest)) throw new Error('Invalid embedded source baseline');
  for (const [name, digest] of Object.entries(value.files)) {
    if (!name || name.includes('\\') || name.includes('\0') || name.includes(':') || path.posix.isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..')
      || digest !== 'directory' && !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid embedded source baseline entry');
  }
  return { ...value, files: Object.assign(Object.create(null), value.files) };
}

/** Move only the selected logical project's prefix when installed sections change. */
export function relocateFiles(files: Files, from: string, to: string): Files {
  if (from === to) return files;
  const result: Files = Object.create(null);
  for (const [name, value] of Object.entries(files)) {
    const mapped = name === from ? to : name.startsWith(`${from}/`) ? `${to}${name.slice(from.length)}` : name;
    if (result[mapped] !== undefined && result[mapped] !== value) throw new Error('Relocated embedded inputs conflict');
    result[mapped] = value;
  }
  // Parent sections are catalog placement, not a conflicting source edit.
  result[path.posix.dirname(to)] = 'directory';
  return result;
}

export async function mergeSourceFiles(core: string, projects: string, oldRoot: string, newRoot: string, base: Files, local: Files, next: Files,
  oldRelative: string, relative: string, icon?: string): Promise<void> {
  const selectedManifest = `${relative}/${MANIFEST}`, merged: Files = Object.create(null);
  const personalIcon = icon ? path.join(relative, icon).split(path.sep).join('/') : null;
  for (const name of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(next)])) {
    if (name === selectedManifest) continue;
    const b = base[name], l = local[name], n = next[name];
    let chosen: string | undefined;
    if (l === b) chosen = n;
    else if (n === b || n === l || name === personalIcon) chosen = l;
    else conflict(name, oldRoot);
    if (chosen !== undefined) merged[name] = chosen;
  }
  for (const name of Object.keys(merged)) {
    for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent)) {
      if (merged[parent] !== 'directory') conflict(name, oldRoot);
    }
  }
  // All removals affect only the new, unpublished candidate. Old inputs stay untouched.
  for (const name of Object.keys(next).sort((a, b) => b.length - a.length)) {
    if (name === selectedManifest || merged[name] === next[name]) continue;
    const target = path.join(newRoot, name); assertWritablePath(core, projects, target);
    await fs.rm(target, { recursive: next[name] === 'directory', force: true });
  }
  for (const name of Object.keys(merged).sort((a, b) => a.length - b.length)) {
    if (merged[name] === next[name]) continue;
    const target = path.join(newRoot, name); assertWritablePath(core, projects, target);
    if (merged[name] === 'directory') await fs.mkdir(target, { recursive: true });
    else {
      const original = name.startsWith(`${relative}/`) ? `${oldRelative}${name.slice(relative.length)}` : name;
      const source = await containedPath(oldRoot, original); assertWritablePath(core, projects, source);
      await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target, constants.COPYFILE_EXCL);
    }
  }
}

interface ManagedSources { version: 1; baseline: string; files: Record<string, { before: string | null; after: string }> }
function managedPaths(relative: string, manifest: Manifest) {
  const entry = path.join(relative, manifest.entry ?? defaultEntry(manifest.kind)).split(path.sep).join('/');
  return [`${entry}/index.html`, `${entry}/xrb-app-icon.png`];
}
async function managedRecord(work: string, baseline: string, relative: string): Promise<ManagedSources> {
  const file = await containedPath(work, 'managed-sources.json').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
  if (!file) return { version: 1, baseline, files: {} };
  const value = await buildJson(file) as ManagedSources;
  const managedName = (name: string) => name.startsWith(`${relative}/`) && !name.includes('\\') && !name.includes(':')
    && name.split('/').every(part => part && part !== '.' && part !== '..') && /\/(?:index\.html|xrb-app-icon\.png)$/.test(name);
  if (value.version !== 1 || value.baseline !== baseline || !object(value.files) || Object.keys(value.files).length > 128
    || Object.entries(value.files).some(([name, v]) => !managedName(name) || !object(v) || v.before !== null && !/^[a-f0-9]{64}$/.test(v.before) || !/^[a-f0-9]{64}$/.test(v.after))) throw new Error('Invalid managed source-finalization state');
  return value;
}
export async function normalizedSourceFiles(work: string, baseline: string, files: Files, relative: string, manifest: Manifest | null): Promise<Files> {
  if (!manifest || manifest.scripts?.build) return files;
  const record = await managedRecord(work, baseline, relative), normalized: Files = Object.assign(Object.create(null), files);
  for (const [name, value] of Object.entries(record.files)) if (normalized[name] === value.after) {
    if (value.before === null) delete normalized[name]; else normalized[name] = value.before;
  }
  return normalized;
}
/** An installed static app needs finalization, not a nonexistent compilation script. */
export async function staticSourcesMatchBaseline(p: Project): Promise<boolean> {
  if (!p.workingRoot || !p.manifest || p.manifest.scripts?.build) return false;
  const relative = path.relative(p.workingRoot, p.dir).split(path.sep).join('/'), work = path.dirname(p.workingRoot);
  const text = await metadataText(await containedPath(work, 'source-baseline.json'), maximum);
  const baseline = await readSourceBaseline(work, inputHash(text), relative);
  const files = await normalizedSourceFiles(work, inputHash(text), await sourceFiles(p.workingRoot, [], relative, p.manifest), relative, p.manifest);
  const prefix = path.join(relative, p.manifest.entry ?? defaultEntry(p.manifest.kind)).split(path.sep).join('/');
  const inEntry = (name: string) => name.startsWith(`${prefix}/`) && name !== `${relative}/${MANIFEST}`;
  const names = new Set([...Object.keys(files), ...Object.keys(baseline.files)].filter(inEntry));
  return names.size > 0 && [...names].every(name => files[name] === baseline.files[name]);
}

/** Only exact managed transformations are discounted on later source comparison. */
export async function trackSourceFinalization<T>(core: string, projects: string, p: Project, operation: () => Promise<T>): Promise<T> {
  if (!p.workingRoot || !p.manifest || p.manifest.scripts?.build) return operation();
  const work = path.dirname(p.workingRoot), relative = path.relative(p.workingRoot, p.dir).split(path.sep).join('/');
  const baseline = inputHash(await metadataText(await containedPath(work, 'source-baseline.json'), maximum));
  const names = managedPaths(relative, p.manifest), record = await managedRecord(work, baseline, relative);
  const hashes = async () => {
    const result: Record<string, string | null> = {};
    for (const name of names) {
      const file = path.join(p.workingRoot!, name); assertWritablePath(core, projects, file);
      const bytes = await fs.readFile(file).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
      result[name] = bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
    }
    return result;
  };
  const before = await hashes(), result = await operation(), after = await hashes();
  for (const name of names) if (after[name] !== null && after[name] !== before[name]) {
    const previous = record.files[name];
    record.files[name] = { before: previous && previous.after === before[name] ? previous.before : before[name], after: after[name]! };
  }
  await writeBuildReceipt(work, 'managed-sources.json', record, core, projects);
  return result;
}

// These are generated or independently owned trees, never personal input to the new build.
const disposable = new Set(['node_modules', 'dist', 'build', 'builds', 'coverage', '.cache', '.vite', 'logs', 'third_party', '.git', '.gitmodules', '.xrbuild', '.artifacts', '.xrb']);
/** Carry ignored personal files (recordings, signing files, etc.), not dependency/build output. */
export async function preservePersonalFiles(core: string, projects: string, oldDir: string, newDir: string, sources: Files, relative: string): Promise<() => Promise<void>> {
  const inventory = async (copy: boolean) => {
    const entries: Array<[string, string]> = [];
    const visit = async (sub = '') => {
      for (const name of (await fs.readdir(path.join(oldDir, sub))).sort()) {
        if (disposable.has(name.toLowerCase()) || /^\.xrb-manifest-.*\.tmp$/i.test(name)) continue;
        const local = sub ? `${sub}/${name}` : name, file = await containedPath(oldDir, local);
        assertWritablePath(core, projects, file);
        const stat = await fs.lstat(file);
        if (stat.isDirectory()) { await visit(local); continue; }
        if (sources[`${relative}/${local}`] !== undefined) continue;
        const bytes = await fs.readFile(file), hash = createHash('sha256').update(bytes).digest('hex');
        entries.push([local, hash]);
        if (copy) {
          const target = path.join(newDir, local); assertWritablePath(core, projects, target);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const existing = await fs.readFile(target).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
          if (existing && !existing.equals(bytes)) conflict(local, oldDir);
          if (!existing) await fs.writeFile(target, bytes, { flag: 'wx' });
        }
      }
    };
    await visit(); return JSON.stringify(entries);
  };
  const before = await inventory(true);
  return async () => { if (before !== await inventory(false)) throw new Error('Personal files changed during source update; try again'); };
}

#!/usr/bin/env node
// Collects native dependencies and checks every file against its pinned SHA-256. The core's sources
// (sources.mjs, pinned in deps.lock.json here) go into the core's third_party/. Plugins live in the
// user's workspace: each plugin folder with a deps.json (<workspace>/plugins/<plugin>/deps.json) brings
// its own sources, pinned in its own deps.lock.json, collected into <workspace>/third_party/.
//
//   node tools/fetch-deps/fetch-deps.mjs                    the core: verify + install
//   node tools/fetch-deps/fetch-deps.mjs --workspace        every user-workspace plugin with a deps.json
//   node tools/fetch-deps/fetch-deps.mjs --workspace=.xrbuild   this checkout's embedded workspace
//   node tools/fetch-deps/fetch-deps.mjs --workspace --plugins=<plugin>,<plugin>   only these plugins
//   node tools/fetch-deps/fetch-deps.mjs --update-lock      (re)pin hashes of current sources
//   node tools/fetch-deps/fetch-deps.mjs --only cef,nlohmann
//   node tools/fetch-deps/fetch-deps.mjs --output=<fresh-empty-directory>   pinned core inputs only
//
// The workspace is XRB_HOME, else %USERPROFILE%\.xrbuild (as the control panel resolves it).

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const LOCK_PATH = path.join(HERE, 'deps.lock.json');

export class HashMismatchError extends Error {}

/** The user's workspace, resolved like the control panel's (packages/control-panel/src/env.ts): XRB_HOME, else ~/.xrbuild. */
export function workspaceDir(env = process.env) {
  if (env.XRB_HOME) return path.resolve(env.XRB_HOME);
  return path.join(env.USERPROFILE || os.homedir(), '.xrbuild');
}

export async function sha256File(file) {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex');
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function listFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listFiles(p));
    else if (e.isFile() && !e.name.endsWith('.meta')) out.push(p);
  }
  return out;
}

/** Expand a source into [{ key, from, to }] file copies (keys are lock keys). */
async function expand(src, root) {
  if (src.kind === 'file') {
    return [{ key: src.dest, from: src.from, to: path.join(root, src.dest) }];
  }
  if (src.kind === 'dir') {
    if (!await exists(src.from)) throw new Error(`[${src.id}] source folder not found: ${src.from}`);
    const files = await listFiles(src.from);
    return files.map((f) => {
      const rel = path.relative(src.from, f).split(path.sep).join('/');
      const key = `${src.dest}/${rel}`;
      return { key, from: f, to: path.join(root, key) };
    });
  }
  throw new Error(`unknown kind ${src.kind}`);
}

function check(lock, key, actual, updateLock, log) {
  const pinned = lock[key];
  if (updateLock) {
    if (pinned && pinned !== actual) log(`  re-pinned ${key}`);
    lock[key] = actual;
    return;
  }
  if (!pinned) throw new HashMismatchError(`${key}: no pinned hash in deps.lock.json (run with --update-lock to pin)`);
  if (pinned !== actual) throw new HashMismatchError(`${key}: SHA-256 mismatch\n  expected ${pinned}\n  actual   ${actual}`);
}

/** Copy a file into place only after its hash checks out (via a temp file). */
async function installFile({ key, from, to }, lock, updateLock, log, fresh = false) {
  if (fresh && await exists(to)) throw new Error('Fresh dependency output changed; preserve and review it');
  if (!await exists(from)) throw new Error(`${key}: source not found: ${from}`);
  if (!updateLock && lock[key] && await exists(to) && await sha256File(to) === lock[key]) return 'kept';
  const actual = await sha256File(from);
  check(lock, key, actual, updateLock, log);
  await fs.mkdir(path.dirname(to), { recursive: true });
  const tmp = `${to}.partial`;
  await fs.copyFile(from, tmp, fresh ? 1 : 0);
  if (await sha256File(tmp) !== actual) throw new HashMismatchError(`${key}: changed while copying`);
  if (fresh) { await fs.link(tmp, to); await fs.unlink(tmp); }
  else await fs.rename(tmp, to);
  return 'copied';
}

async function installArchive(src, root, lock, updateLock, log, fresh = false) {
  const key = `archive:${src.id}`;
  const destDir = path.join(root, src.dest);
  if (fresh && await exists(destDir)) throw new Error('Fresh dependency output changed; preserve and review it');
  const marker = path.join(destDir, '.fetched-sha256');
  if (!updateLock && lock[key] && await exists(marker)
      && (await fs.readFile(marker, 'utf8')).trim() === lock[key]) return 'kept';

  const cacheDir = fresh ? await fs.mkdtemp(path.join(root, '.cache-')) : path.join(root, '.cache');
  if (!fresh) await fs.mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, decodeURIComponent(path.basename(new URL(src.url).pathname)));
  if (!await exists(file)) {
    log(`  downloading ${src.url}`);
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`[${src.id}] download failed: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.partial`, { flags: fresh ? 'wx' : 'w' }));
    if (fresh) { await fs.link(`${file}.partial`, file); await fs.unlink(`${file}.partial`); }
    else await fs.rename(`${file}.partial`, file);
  }
  const actual = await sha256File(file);
  try {
    if (updateLock && src.url) {
      // Pinning trusts nothing local: cross-check against the publisher's own checksum.
      const res = await fetch(`${src.url}.sha1`);
      if (!res.ok) throw new Error(`[${src.id}] cannot fetch publisher checksum: HTTP ${res.status}`);
      const expected = (await res.text()).trim().split(/\s+/)[0].toLowerCase();
      const h = createHash('sha1');
      await pipeline(createReadStream(file), h);
      if (h.digest('hex') !== expected) throw new HashMismatchError(`${key}: SHA-1 differs from publisher checksum`);
    }
    check(lock, key, actual, updateLock, log);
  } catch (e) {
    if (!fresh) await fs.rm(file, { force: true }); // Managed failed generations remain available for review.
    throw e;
  }
  if (fresh) await fs.mkdir(destDir); // Exclusive creation: never remove newly appeared KEEP/unknown state.
  else { await fs.rm(destDir, { recursive: true, force: true }); await fs.mkdir(destDir, { recursive: true }); }
  log(`  extracting into ${path.relative(root, destDir)}`);
  // Windows ships bsdtar, which handles .tar.bz2. Call it by full path: a GNU tar
  // from Git Bash earlier on PATH reads "D:\..." as a remote host.
  const tar = process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe')
    : 'tar';
  execFileSync(tar,['-xf', file, '-C', destDir, '--strip-components=1'], { stdio: 'inherit' });
  await fs.writeFile(marker, actual);
  return 'extracted';
}

async function installDownload(src, root, lock, updateLock, log, fresh = false) {
  const key = src.dest;
  const to = path.join(root, src.dest);
  if (fresh && await exists(to)) throw new Error('Fresh dependency output changed; preserve and review it');
  if (!updateLock && lock[key] && await exists(to) && await sha256File(to) === lock[key]) return 'kept';
  log(`  downloading ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`[${src.id}] download failed: HTTP ${res.status}`);
  await fs.mkdir(path.dirname(to), { recursive: true });
  const tmp = `${to}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp, { flags: fresh ? 'wx' : 'w' }));
  try {
    check(lock, key, await sha256File(tmp), updateLock, log);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  if (fresh) { await fs.link(tmp, to); await fs.unlink(tmp); }
  else await fs.rename(tmp, to);
  return 'downloaded';
}

/**
 * `${NAME}` in a plugin's paths: XRB_<NAME> from the environment, else the plugin's own default
 * ("vars" in its deps.json, which may use other variables), else GIT = XRB_GIT_ROOT or D:/Git.
 */
export function expandVars(text, vars, env = process.env) {
  const value = (name, depth) => {
    if (depth > 8) throw new Error(`\${${name}}: variables refer to each other in a loop`);
    const key = name === 'GIT' ? 'GIT_ROOT' : name;
    const fromEnv = env[`XRB_${key}`];
    if (fromEnv) return fromEnv;
    if (name in vars) return expand(vars[name], depth + 1);
    if (name === 'GIT') return 'D:/Git';
    throw new Error(`unknown variable \${${name}} (set XRB_${name})`);
  };
  const expand = (t, depth) => t.replace(/\$\{([A-Z0-9_]+)\}/g, (_, n) => value(n, depth));
  return expand(text, 0);
}

/** The workspace plugins with binaries: plugins/<plugin>/deps.json, with their sources' paths resolved. */
export async function pluginDeps(workspace, env = process.env) {
  const root = path.join(workspace, 'plugins');
  const dirs = await fs.readdir(root, { withFileTypes: true }).then((d) => d.filter((e) => e.isDirectory()).map((e) => e.name).sort(), () => []);
  const out = [];
  for (const dir of dirs) {
    const file = path.join(root, dir, 'deps.json');
    if (!await exists(file)) continue;
    const j = JSON.parse(await fs.readFile(file, 'utf8'));
    const vars = j.vars ?? {};
    const sources = (j.sources ?? []).map((src) => Object.fromEntries(Object.entries(src).map(([k, v]) => [k, typeof v === 'string' && (k === 'from' || k === 'url') ? expandVars(v, vars, env) : v])));
    out.push({ name: dir, sources, lockPath: path.join(root, dir, 'deps.lock.json'), root: path.join(workspace, 'third_party') });
  }
  return out;
}

/**
 * The groups to fetch, each with the third_party folder it fills (`root`). Without a workspace: the
 * core. With one: its plugins (all of them, or the ones named in `plugins`). Unknown names are an error.
 */
export async function depGroups(repoRoot, coreSources, { workspace = null, plugins = null } = {}, env = process.env) {
  if (!workspace) return [{ name: 'core', sources: coreSources, lockPath: LOCK_PATH, root: path.join(repoRoot, 'third_party') }];
  const all = await pluginDeps(workspace, env);
  if (plugins) {
    const unknown = plugins.filter((n) => !all.some((p) => p.name === n));
    if (unknown.length) throw new Error(`no plugins/<plugin>/deps.json in ${workspace} for: ${unknown.join(', ')} (present: ${all.map((p) => p.name).join(', ') || 'none'})`);
  }
  return all.filter((p) => !plugins || plugins.includes(p.name));
}

/**
 * Fetches one group into its root with its lock (`only`: source id prefixes). A failure names the group
 * (the plugin), the file and, for a hash mismatch, both hashes. Returns null when nothing was selected.
 */
export async function syncGroup(group, { updateLock = false, only = null, log = () => {}, fresh = false } = {}) {
  const sources = only ? group.sources.filter((s) => only.some((o) => s.id.startsWith(o))) : group.sources;
  if (!sources.length) return null;
  const lock = await exists(group.lockPath) ? JSON.parse(await fs.readFile(group.lockPath, 'utf8')) : {};
  let summary;
  try {
    summary = await syncSources(sources, { root: group.root, lock, updateLock, log, fresh });
  } catch (e) {
    e.message = `[${group.name}] ${e.message}`;
    throw e;
  }
  if (updateLock) {
    const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
    await fs.writeFile(group.lockPath, `${JSON.stringify(sorted, null, 2)}\n`);
    log(`pinned ${Object.keys(sorted).length} hashes in ${group.lockPath}`);
  }
  return summary;
}

/**
 * Install `sources` into `root`, verifying against `lock` (mutated when
 * updateLock is set). Throws HashMismatchError on any mismatch.
 */
export async function syncSources(sources, { root, lock, updateLock = false, log = () => {}, fresh = false }) {
  const summary = {};
  for (const src of sources) {
    log(`[${src.id}]`);
    if (src.kind === 'archive') {
      summary[src.id] = await installArchive(src, root, lock, updateLock, log, fresh);
      continue;
    }
    if (src.kind === 'download') {
      summary[src.id] = await installDownload(src, root, lock, updateLock, log, fresh);
      continue;
    }
    const copies = await expand(src, root);
    const counts = {};
    for (const c of copies) {
      const r = await installFile(c, lock, updateLock, log, fresh);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    summary[src.id] = counts;
  }
  return summary;
}

/** Managed callers can fetch pinned core inputs only into a fresh plain output tree. */
export async function freshOutputRoot(value) {
  const root = path.resolve(value);
  let current = root;
  for (;;) {
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Native dependency output must use plain directories');
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  const entries = await fs.readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  if (entries.length) throw new Error('Native dependency output must be a fresh empty directory');
  return root;
}

async function main() {
  const { SOURCES } = await import('./sources.mjs');
  const args = process.argv.slice(2);
  const updateLock = args.includes('--update-lock');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;
  const pluginsArg = args.find((a) => a.startsWith('--plugins='));
  const plugins = pluginsArg ? pluginsArg.slice('--plugins='.length).split(',').map((n) => n.trim()).filter(Boolean) : null;
  const wsArg = args.find((a) => a === '--workspace' || a.startsWith('--workspace='));
  const workspace = wsArg ? (wsArg.includes('=') ? path.resolve(wsArg.slice('--workspace='.length)) : workspaceDir()) : null;
  const outputs = args.filter(arg => arg === '--output' || arg.startsWith('--output='));
  if (outputs.length > 1 || outputs.length && (outputs[0] === '--output' || outputs[0] === '--output=' || workspace || plugins || updateLock || only)) {
    console.error('--output=<fresh-empty-directory> is only for pinned complete core inputs');
    process.exitCode = 1; return;
  }
  if (plugins && !workspace) {
    console.error('--plugins= picks workspace plugins: add --workspace');
    process.exitCode = 1;
    return;
  }
  try {
    if (workspace) console.log(`workspace ${workspace}`);
    const output = outputs.length ? await freshOutputRoot(outputs[0].slice('--output='.length)) : null;
    for (const group of await depGroups(REPO_ROOT, SOURCES, { workspace, plugins })) {
      if (output) group.root = output;
      console.log(`== ${group.name}`);
      const summary = await syncGroup(group, { updateLock, only, log: console.log, fresh: !!output });
      if (summary) console.log(JSON.stringify(summary, null, 1));
    }
  } catch (e) {
    console.error(`\nfetch-deps failed: ${e.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

#!/usr/bin/env node
// Task checkouts: one per task in .worktrees/<name> (git-ignored), on its own branch from origin/main.
// Only fetched core third_party/ entries are linked (directory junctions). Private workspaces are independent
// task-local clones, never shared.
//
//   pnpm worktree add <type/short-desc>        new branch + .worktrees/<short-desc>, linked third_party, pnpm install
//   pnpm worktree enter <type/short-desc>      create or re-enter a matching clean task checkout; retry failed installs
//
// Removing a finished checkout is not this tool's job: the shared delivery workflow does it (`delivery cleanup`).
// Run from the primary checkout or any worktree. Only one host runs at a time (named mutex): worktrees build and
// test in parallel, but run apps one at a time.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The branch types of the shared delivery workflow.
const TYPES = ['feature', 'fix', 'refactor', 'docs', 'test', 'chore', 'style'];

/** The worktree folder name for a branch: `fix/hand-jitter` -> `hand-jitter`. */
export function worktreeName(branch) {
  const m = /^([a-z]+)\/([a-z0-9][a-z0-9-]*)$/.exec(branch);
  if (!m || !TYPES.includes(m[1])) {
    throw new Error(`branch must be <type>/<short-desc> (lower case, digits, dashes); types: ${TYPES.join(', ')}`);
  }
  return m[2];
}

/** Links every entry of `from` (except tracked README.md) into `to`; entries already in `to` are kept. Returns the linked names. */
export function linkThirdParty(from, to) {
  if (!fs.existsSync(from)) return [];
  fs.mkdirSync(to, { recursive: true });
  const linked = [];
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'README.md') continue;
    const target = path.join(to, entry.name);
    if (fs.existsSync(target)) continue;
    fs.symlinkSync(path.join(from, entry.name), target, entry.isDirectory() ? 'junction' : 'file');
    linked.push(entry.name);
  }
  return linked;
}

/** Removes the links in `dir` without touching what they point to. Returns the unlinked names. */
export function unlinkThirdParty(dir) {
  if (!fs.existsSync(dir)) return [];
  const unlinked = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    // A junction is removed as a link (rmdir on the link itself), never by recursing into its target.
    const link = path.join(dir, entry.name);
    try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }
    unlinked.push(entry.name);
  }
  return unlinked;
}

const sharedDependencyTrees = (root) => [
  { label: 'third_party', dir: path.join(root, 'third_party') },
];

/** Links only fetched core dependencies into one task worktree. */
export function linkWorktreeDependencies(root, dir, log = console.log) {
  const result = {};
  for (const tree of sharedDependencyTrees(root)) {
    const linked = linkThirdParty(tree.dir, path.join(dir, path.relative(root, tree.dir)));
    result[tree.label] = linked;
    log(linked.length ? `${tree.label}: linked ${linked.join(', ')}` : `${tree.label}: nothing fetched in the primary checkout`);
  }
  return result;
}

/** Removes dependency links from a task worktree without touching the primary checkout. */
export function unlinkWorktreeDependencies(dir) {
  return Object.fromEntries(sharedDependencyTrees(dir).map((tree) => [tree.label, unlinkThirdParty(tree.dir)]));
}

// Output is null when it goes to the terminal (stdio: 'inherit').
const git = (cwd, args, opts = {}) => (execFileSync('git', args, { cwd, encoding: 'utf8', ...opts }) ?? '').trim();

/** The primary checkout's root, from anywhere inside it or one of its worktrees. */
export function primaryRoot(cwd = process.cwd()) {
  return path.dirname(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
}

/** Task worktrees (registered, under .worktrees/): [{ name, dir, branch }]. */
export function taskWorktrees(root) {
  // Compared as real paths: Windows may give the same folder as an 8.3 short path and as the long one.
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const base = real(path.join(root, '.worktrees')).toLowerCase() + path.sep;
  const out = [];
  let current = null;
  for (const line of git(root, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { dir: real(line.slice('worktree '.length)), branch: null };
      if (current.dir.toLowerCase().startsWith(base)) out.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  return out.map((w) => ({ ...w, name: path.basename(w.dir) }));
}

export function installDependencies(dir) {
  // Use Corepack's installed JS entry point, not a pnpm executable that may not be on PATH (notably on Windows).
  const corepack = path.join(path.dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  if (!fs.existsSync(corepack)) throw new Error(`Corepack is required for worktree dependencies: ${corepack}`);
  execFileSync(process.execPath, [corepack, 'pnpm', 'install', '--frozen-lockfile', '--silent'], { cwd: dir, stdio: 'inherit' });
}

export function add(branch, { root = primaryRoot(), install = true, installFn = installDependencies, fetch = true, log = console.log } = {}) {
  const name = worktreeName(branch);
  const dir = path.join(root, '.worktrees', name);
  if (fs.existsSync(dir)) throw new Error(`${dir} exists`);
  if (fetch) git(root, ['fetch', '--quiet', 'origin', 'main']);
  git(root, ['worktree', 'add', '--quiet', '-b', branch, dir, 'origin/main'], { stdio: 'inherit' });
  // A branch from origin/main tracks it; pushing goes to origin/<branch> instead.
  // Git may already have left this branch without an upstream (e.g. a local-only origin/main fixture).
  try { git(dir, ['branch', '--quiet', '--unset-upstream'], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { if (!/no upstream information/.test(String(error.stderr))) throw error; }
  linkWorktreeDependencies(root, dir, log);
  if (install) {
    try { installFn(dir); }
    catch (error) {
      // Keep the registered branch and checkout intact. `enter` can safely retry installation later.
      throw new Error(`worktree created at ${dir}, but dependency installation failed; retry with worktree enter ${branch}: ${error.message}`);
    }
  }
  log(`worktree ready: ${dir} (branch ${branch})`);
  return dir;
}

/** Create a task worktree, or re-enter only its matching registered branch; never adopt an unrelated directory. */
export function enter(branch, { root = primaryRoot(), installFn = installDependencies, log = console.log, fetch = true } = {}) {
  const name = worktreeName(branch);
  const dir = path.join(root, '.worktrees', name);
  const registered = taskWorktrees(root).find((w) => w.name === name);
  if (!registered) {
    if (fs.existsSync(dir)) throw new Error(`${dir} exists but is not a registered task worktree`);
    return add(branch, { root, installFn, fetch, log });
  }
  const sameDir = fs.realpathSync.native(registered.dir).toLowerCase() === fs.realpathSync.native(dir).toLowerCase();
  if (registered.branch !== branch || !sameDir) {
    throw new Error(`${dir} belongs to ${registered.branch ?? 'a detached worktree'}, not ${branch}`);
  }
  if (git(dir, ['status', '--porcelain'])) throw new Error(`${dir} is dirty; inspect its changes before re-entering`);
  linkWorktreeDependencies(root, dir, log);
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    try { installFn(dir); }
    catch (error) { throw new Error(`dependency installation failed in ${dir}: ${error.message}`); }
  }
  log(`worktree ready: ${dir} (branch ${branch})`);
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, branch] = process.argv.slice(2);
  try {
    if (cmd === 'add' && branch) add(branch);
    else if (cmd === 'enter' && branch) console.log(enter(branch));
    else throw new Error('usage: worktree add|enter <type/short-desc>');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

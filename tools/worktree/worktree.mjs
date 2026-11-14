#!/usr/bin/env node
// Task worktrees: one checkout per task in .worktrees/<name> (git-ignored), on its own branch from origin/main.
// Only fetched core third_party/ entries are linked (directory junctions). Private workspaces are independent
// task-local clones, never shared. Cleanup preserves .xrbuild/ and worktrees marked with .artifacts/KEEP.
//
//   pnpm worktree add <type/short-desc>        adopt an unoccupied local/remote task branch, or create from origin/main
//   pnpm worktree enter <type/short-desc>      prepare/resume the selected task; --a1 uses successful runtime attachment
//                                              --install explicitly links public dependencies and installs them
//   pnpm worktree remove <name>               exact published-local removal, retaining refs; trusted ownership required
//                                              --discard is a separate unsupported route, never a force fallback
//   pnpm worktree sweep [--apply]              every task worktree as dirty / active / merged / closed / unknown;
//                                              --apply removes the merged, clean ones and nothing else
//   pnpm worktree handoff <name> [--change <id>] [--pr <n>]
//                                              records worktree, branch, change, PR and head in .artifacts/handoff.json
//                                              and prints the handoff report skeleton
//
// Run from the primary checkout or any worktree. Only one host runs at a time (named mutex): worktrees build and
// test in parallel, but run apps one at a time. PR states come from `gh`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachA1, contextEnvironment, describeHandoff, prepareContext, registeredContexts, writeHandoffRecord } from './portable-context.mjs';
import { inspectRemovalTarget, preservationReason, removePublishedCheckout, runtimeCleanupUnavailable } from './published-removal.mjs';
export { preservationReason } from './published-removal.mjs';

const TYPES = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'ci', 'perf'];

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

/** A worktree's sweep state from what is known about it. `pr` is 'OPEN' | 'MERGED' | 'CLOSED' | null (no PR) | 'unknown'. */
export function classify({ dirty, pr }) {
  if (dirty) return 'dirty';
  if (pr === 'unknown') return 'unknown';
  if (pr === 'MERGED') return 'merged';
  if (pr === 'CLOSED') return 'closed';
  return 'active';
}

// Output is null when it goes to the terminal (stdio: 'inherit').
const git = (cwd, args, opts = {}) => (execFileSync('git', args, { cwd, env: contextEnvironment(), encoding: 'utf8', ...opts }) ?? '').trim();

/** The primary checkout's root, from anywhere inside it or one of its worktrees. */
export function primaryRoot(cwd = process.cwd()) {
  return path.dirname(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
}

/** The PR state of a branch through `gh`: 'OPEN' | 'MERGED' | 'CLOSED', null without a PR, 'unknown' when gh fails. */
export function ghPrState(branch, cwd) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'state', '--jq', '.[0].state // ""'], { cwd, env: contextEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return 'unknown';
  }
}

/** Task worktrees (registered, under .worktrees/): [{ name, dir, branch }]. */
export function taskWorktrees(root) {
  // Compared as real paths: Windows may give the same folder as an 8.3 short path and as the long one.
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const base = key(real(path.join(root, '.worktrees'))) + path.sep;
  return registeredContexts(root).map(({ dir, branch }) => ({ dir: real(dir), branch }))
    .filter(w => key(w.dir).startsWith(base)).map(w => ({ ...w, name: path.basename(w.dir) }));
}

function findWorktree(root, name) {
  const w = taskWorktrees(root).find((t) => t.name === name);
  if (!w || !fs.existsSync(w.dir)) throw new Error(`no worktree ${path.join(root, '.worktrees', name)}`);
  return w;
}

export function installDependencies(dir) {
  // Use Corepack's installed JS entry point, not a pnpm executable that may not be on PATH (notably on Windows).
  const corepack = path.join(path.dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  if (!fs.existsSync(corepack)) throw new Error(`Corepack is required for worktree dependencies: ${corepack}`);
  execFileSync(process.execPath, [corepack, 'pnpm', 'install', '--frozen-lockfile', '--silent'], { cwd: dir, stdio: 'inherit' });
}

function context(branch, { root = primaryRoot(), install = false, installFn = installDependencies, a1 = false,
  acquireOwnership, log = console.log, ...options } = {}, resume) {
  if (Object.hasOwn(options, 'fetch')) throw new Error('Fetch cannot be disabled for branch adoption');
  const name = worktreeName(branch);
  return prepareContext(branch, { ...options, root, name, resume, log,
    acquireOwnership: acquireOwnership ?? (a1 ? attachA1 : undefined),
    setup: install ? dir => {
      linkWorktreeDependencies(root, dir, log);
      try { installFn(dir); }
      catch { throw new Error(`Dependency setup failed; checkout/history preserved at ${dir}. Retry explicit setup in its owned context`); }
    } : undefined,
  });
}

export function add(branch, options = {}) { return context(branch, options, false); }

/** Existing context resumes only after verified ownership; dirty task edits are never reset. */
export function enter(branch, options = {}) { return context(branch, options, true); }

export function remove(name, { root = primaryRoot(), discard = false, expectedHead, log = console.log, ...options } = {}) {
  if (discard) throw new Error('Confirmed unmerged discard requires a separate supported adapter; no refs or remote work deleted');
  const w = findWorktree(root, name);
  const result = removePublishedCheckout({ ...options, root, target: w.dir, expectedHead });
  log(`removed ${w.dir} locally; ${result.branchPreserved ? 'local branch retained' : 'local ref state requires review'}; no remote writes`);
  return result;
}

/** Explicit bulk operation only; rechecks merged eligibility and reports preserved/blocked resources. */
export function sweep({ root = primaryRoot(), apply = false, prState = ghPrState, log = console.log, ...options } = {}) {
  const rows = taskWorktrees(root).filter((w) => fs.existsSync(w.dir)).map((w) => {
    let dirty = Boolean(preservationReason(w.dir));
    if (!dirty) {
      try { inspectRemovalTarget({ ...options, root, target: w.dir }); }
      catch { dirty = true; }
    }
    const pr = w.branch ? prState(w.branch, root) : null;
    return { name: w.name, branch: w.branch, head: git(w.dir, ['rev-parse', 'HEAD']), state: classify({ dirty, pr }) };
  });
  for (const r of rows) log(`${r.state.padEnd(8)} ${r.name} (${r.branch ?? 'detached'})`);
  if (!rows.length) log('no task worktrees');
  if (apply) for (const r of rows.filter(x => x.state === 'merged')) {
    try {
      if (prState(r.branch, root) !== 'MERGED') throw new Error('Merged eligibility changed; worktree preserved');
      remove(r.name, { ...options, root, expectedHead: r.head, log });
      r.cleanup = 'removed';
    } catch (error) { r.cleanup = 'blocked'; r.reason = error.message; log(`preserved ${r.name}: ${r.reason}`); }
  }
  return rows;
}

/** Local registration plus fresh publication evidence; no cleanup enrollment or acceptance. */
export function handoff(name, { root = primaryRoot(), change = null, pr = null, now = new Date(), ...options } = {}) {
  const w = findWorktree(root, name);
  const { record, report } = describeHandoff({ ...options, root, branch: w.branch, worktree: w.dir, change, pr, now });
  writeHandoffRecord(record);
  return report;
}

function options(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (['--apply', '--discard', '--a1', '--install'].includes(argv[i])) out[argv[i].slice(2)] = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = options(rest);
  try {
    if (['add', 'enter'].includes(cmd) && o._[0]) {
      const unknown = Object.keys(o).filter(key => !['_', 'a1', 'install', 'expected-head'].includes(key));
      if (unknown.length || o._.length !== 1) throw new Error('Unknown context option');
      console.log((cmd === 'add' ? add : enter)(o._[0], { a1: Boolean(o.a1), install: Boolean(o.install), expectedHead: o['expected-head'] }));
    }
    else if (cmd === 'remove' && o._[0]) {
      if (o._.length !== 1 || Object.keys(o).some(key => !['_', 'discard', 'expected-head'].includes(key))) throw new Error('Unknown removal option; no force/ownership assertion supported');
      remove(o._[0], { discard: Boolean(o.discard), expectedHead: o['expected-head'] });
    }
    else if (cmd === 'sweep') {
      if (o._.length || Object.keys(o).some(key => !['_', 'apply'].includes(key))) throw new Error('Unknown sweep scope/option');
      const rows = sweep({ apply: Boolean(o.apply) });
      if (o.apply && rows.some(row => row.cleanup === 'blocked')) process.exitCode = 1;
    }
    else if (['runtime-remove', 'complete'].includes(cmd)) runtimeCleanupUnavailable();
    else if (cmd === 'handoff' && o._[0]) console.log(handoff(o._[0], { change: o.change ?? null, pr: o.pr ?? null }));
    else throw new Error('usage: worktree add|enter <type/short-desc> [--a1] [--install] [--expected-head <sha>] | remove <name> [--discard] | sweep [--apply] | handoff <name> [--change <id>] [--pr <n>]');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

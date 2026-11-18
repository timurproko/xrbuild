#!/usr/bin/env node
// Task worktrees: one checkout per task in .worktrees/<name> (git-ignored), on its own branch from origin/main.
// Only fetched core third_party/ entries are linked (directory junctions). Private workspaces are independent
// task-local clones, never shared. Cleanup preserves .xrbuild/ and worktrees marked with .artifacts/KEEP.
//
//   pnpm worktree add <type/short-desc>        new branch + .worktrees/<short-desc>, linked third_party, pnpm install
//   pnpm worktree enter <type/short-desc>      create or re-enter a matching clean task checkout; retry failed installs
//   pnpm worktree remove <name> [--discard]    unlink core dependencies, remove the worktree (refuses dirty/protected trees);
//                                              deletes the local branch when its PR is merged. A worktree whose PR
//                                              closed unmerged is removed only with --discard (branch deleted too)
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
const git = (cwd, args, opts = {}) => (execFileSync('git', args, { cwd, encoding: 'utf8', ...opts }) ?? '').trim();

/** The primary checkout's root, from anywhere inside it or one of its worktrees. */
export function primaryRoot(cwd = process.cwd()) {
  return path.dirname(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
}

/** The PR state of a branch through `gh`: 'OPEN' | 'MERGED' | 'CLOSED', null without a PR, 'unknown' when gh fails. */
export function ghPrState(branch, cwd) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'state', '--jq', '.[0].state // ""'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return 'unknown';
  }
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

/** Ignored private data is not disposable just because outer Git status is clean. Fail closed on filesystem errors. */
export function preservationReason(dir) {
  for (const relative of ['.xrbuild', path.join('.artifacts', 'KEEP')]) {
    try {
      fs.lstatSync(path.join(dir, relative)); // Detect dangling links too; never follow them for cleanup.
      return `${relative} must be preserved separately before worktree cleanup`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export function remove(name, { root = primaryRoot(), discard = false, prState = ghPrState, log = console.log } = {}) {
  const w = findWorktree(root, name);
  const protectedData = preservationReason(w.dir);
  if (protectedData) throw new Error(`${w.dir}: ${protectedData}`);
  const dirty = git(w.dir, ['status', '--porcelain']);
  if (dirty) throw new Error(`${w.dir} has uncommitted changes:\n${dirty}`);
  const pr = w.branch ? prState(w.branch, root) : null;
  if (discard && pr !== 'CLOSED') throw new Error(`--discard is for a worktree whose PR closed unmerged; ${w.branch}'s PR is ${pr ?? 'missing'}`);
  if (!discard && pr === 'CLOSED') throw new Error(`${w.branch}'s PR closed unmerged: remove it with --discard if its work is not needed`);
  unlinkWorktreeDependencies(w.dir);
  // Ignored files (node_modules, builds) go with it; the clean-tree check above guards the rest.
  git(root, ['worktree', 'remove', '--force', w.dir], { stdio: ['ignore', 'pipe', 'inherit'] });
  // git leaves ignored folders it could not empty (pnpm's node_modules); the links in them are removed as links.
  fs.rmSync(w.dir, { recursive: true, force: true });
  log(`removed ${w.dir}`);
  if (w.branch && (pr === 'MERGED' || discard)) {
    git(root, ['branch', '-D', w.branch]);
    log(`deleted branch ${w.branch} (${discard ? 'discarded' : 'its PR is merged'})`);
  } else if (w.branch) {
    log(`kept branch ${w.branch} (no merged PR for it)`);
  }
}

/** Lists task worktrees with their state; with `apply`, removes the merged clean ones. Returns [{ name, branch, state }]. */
export function sweep({ root = primaryRoot(), apply = false, prState = ghPrState, log = console.log } = {}) {
  const rows = taskWorktrees(root).filter((w) => fs.existsSync(w.dir)).map((w) => {
    const dirty = Boolean(preservationReason(w.dir)) || Boolean(git(w.dir, ['status', '--porcelain']));
    const pr = w.branch ? prState(w.branch, root) : null;
    return { name: w.name, branch: w.branch, state: classify({ dirty, pr }) };
  });
  for (const r of rows) log(`${r.state.padEnd(8)} ${r.name} (${r.branch ?? 'detached'})`);
  if (!rows.length) log('no task worktrees');
  if (apply) for (const r of rows.filter((x) => x.state === 'merged')) remove(r.name, { root, prState, log });
  return rows;
}

/** Writes .artifacts/handoff.json in the worktree and returns the report skeleton. */
export function handoff(name, { root = primaryRoot(), change = null, pr = null, now = new Date() } = {}) {
  const w = findWorktree(root, name);
  const record = { worktree: w.dir, branch: w.branch, change, pr: pr ? Number(pr) : null, head: git(w.dir, ['rev-parse', 'HEAD']), time: now.toISOString() };
  fs.mkdirSync(path.join(w.dir, '.artifacts'), { recursive: true });
  fs.writeFileSync(path.join(w.dir, '.artifacts', 'handoff.json'), `${JSON.stringify(record, null, 2)}\n`);
  return [
    `Worktree: ${record.worktree}`,
    `Branch and PR: ${record.branch}${record.pr ? `, #${record.pr}` : ''}${change ? ` (change ${change})` : ''}`,
    `Commit: ${record.head.slice(0, 7)}`,
    'Commands run: ',
    'Behaviour: ',
    'Gaps: ',
    'Manual test: ',
  ].join('\n');
}

function options(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply' || argv[i] === '--discard') out[argv[i].slice(2)] = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = options(rest);
  try {
    if (cmd === 'add' && o._[0]) add(o._[0]);
    else if (cmd === 'enter' && o._[0]) console.log(enter(o._[0]));
    else if (cmd === 'remove' && o._[0]) remove(o._[0], { discard: Boolean(o.discard) });
    else if (cmd === 'sweep') sweep({ apply: Boolean(o.apply) });
    else if (cmd === 'handoff' && o._[0]) console.log(handoff(o._[0], { change: o.change ?? null, pr: o.pr ?? null }));
    else throw new Error('usage: worktree add|enter <type/short-desc> | remove <name> [--discard] | sweep [--apply] | handoff <name> [--change <id>] [--pr <n>]');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

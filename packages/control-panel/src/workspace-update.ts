// Update workspace: bring the selected workspace's Git clone up to date with its upstream by fast-forward only,
// fetch its Git LFS content, then rebuild the native plugins (and the core host only when it is missing or outdated).
// It never stashes, merges, rebases, resets or discards: Git's own refusals are reported with what to do by hand.
// It fast-forwards to exactly the upstream commit it fetched, never fetching a second time.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LineSplitter, type JobContext } from './jobs.ts';

export interface GitResult { code: number; output: string }
/** Runs `git <args>` in a folder; streamed lines go to onLine. Injectable so tests can stub `git lfs`. */
export type GitRunner = (args: string[], cwd: string, opts?: { onLine?: (line: string) => void; env?: NodeJS.ProcessEnv }) => Promise<GitResult>;

export const runGit: GitRunner = (args, cwd, opts = {}) => new Promise((resolve) => {
  const lines: string[] = [];
  const onLine = (line: string) => { lines.push(line); opts.onLine?.(line); };
  let child;
  try {
    child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env } });
  } catch (e) {
    resolve({ code: 127, output: (e as Error).message });
    return;
  }
  const out = new LineSplitter(onLine), err = new LineSplitter(onLine);
  child.stdout!.setEncoding('utf8').on('data', (d: string) => out.push(d));
  child.stderr!.setEncoding('utf8').on('data', (d: string) => err.push(d));
  child.on('error', (e) => { lines.push(e.message); });
  child.on('close', (code) => { out.flush(); err.flush(); resolve({ code: code ?? 127, output: lines.join('\n') }); });
});

export interface WorkspaceUpdateStatus {
  workspace: string;
  /** Update can start: the workspace is a Git clone of its own, on a branch with an upstream, and Git LFS is present. */
  available: boolean;
  /** Why Update is unavailable, or null. */
  reason: string | null;
  branch: string | null;
  upstream: string | null;
  /** Local commits not on the upstream, as of the last fetch. */
  ahead: number;
  /** Upstream commits not in the workspace, as of the last fetch. */
  behind: number;
  /** Uncommitted or untracked paths. */
  dirty: number;
  /** When the remote was last fetched (FETCH_HEAD), or null when it never was. Status never fetches. */
  checkedMs: number | null;
  /** An earlier update pulled new commits but its rebuild did not succeed: Update finishes it. */
  unfinished: boolean;
}

const unavailable = (workspace: string, reason: string, extra: Partial<WorkspaceUpdateStatus> = {}): WorkspaceUpdateStatus =>
  ({ workspace, available: false, reason, branch: null, upstream: null, ahead: 0, behind: 0, dirty: 0, checkedMs: null, unfinished: false, ...extra });

async function samePath(a: string, b: string): Promise<boolean> {
  const real = async (p: string) => path.resolve(await fs.realpath(p).catch(() => p));
  const [x, y] = await Promise.all([real(a), real(b)]);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

const firstLine = (text: string) => text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** Read-only Git: no optional locks, so `git status` does not refresh and rewrite the index while others use it. */
const readOnly = (git: GitRunner): GitRunner => (args, cwd, opts = {}) => git(args, cwd, { ...opts, env: { ...opts.env, GIT_OPTIONAL_LOCKS: '0' } });

/** The marker an update leaves under the Git folder after pulling, until its rebuild succeeds. */
const MARKER = 'xrb-workspace-update';
async function markerPath(workspace: string, git: GitRunner): Promise<string | null> {
  const found = await git(['rev-parse', '--git-path', MARKER], workspace);
  return found.code === 0 ? path.resolve(workspace, firstLine(found.output)) : null;
}
async function readMarker(file: string | null): Promise<{ from: string } | null> {
  if (!file) return null;
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8')) as { from?: unknown };
    return { from: typeof value.from === 'string' && /^[0-9a-f]{7,64}$/.test(value.from) ? value.from : '' };
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : { from: '' };
  }
}

/** Whether Update can run and how far the workspace is from its upstream as of the last fetch. Writes nothing. */
export async function workspaceUpdateStatus(workspace: string, runner: GitRunner = runGit): Promise<WorkspaceUpdateStatus> {
  const git = readOnly(runner);
  if (!await fs.stat(workspace).then((s) => s.isDirectory(), () => false)) return unavailable(workspace, 'The workspace folder does not exist.');
  const top = await git(['rev-parse', '--show-toplevel'], workspace);
  if (top.code === 127) return unavailable(workspace, 'Git is not installed.');
  // A workspace folder inside another clone (such as the core checkout) is not a clone of its own: never update that one.
  if (top.code !== 0 || !await samePath(firstLine(top.output), workspace)) return unavailable(workspace, 'The workspace is not a Git clone.');
  const branch = await git(['symbolic-ref', '-q', '--short', 'HEAD'], workspace);
  if (branch.code !== 0) return unavailable(workspace, 'The workspace is not on a branch (detached HEAD).');
  const name = firstLine(branch.output);
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], workspace);
  if (upstream.code !== 0) return unavailable(workspace, `The branch ${name} has no upstream to update from.`, { branch: name });
  const counts = await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], workspace);
  const [ahead, behind] = firstLine(counts.output).split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
  const status = await git(['status', '--porcelain'], workspace);
  const fetchHead = await git(['rev-parse', '--git-path', 'FETCH_HEAD'], workspace);
  const fetchFile = path.resolve(workspace, firstLine(fetchHead.output));
  const checkedMs = fetchHead.code === 0 ? (await fs.stat(fetchFile).catch(() => null))?.mtimeMs ?? null : null;
  const unfinished = !!await readMarker(await markerPath(workspace, git));
  const base = { branch: name, upstream: firstLine(upstream.output), ahead: ahead ?? 0, behind: behind ?? 0, dirty: status.output.split('\n').filter((l) => l.trim()).length, checkedMs, unfinished };
  const lfs = await git(['lfs', 'version'], workspace);
  if (lfs.code !== 0) return unavailable(workspace, 'Git LFS is not installed.', base);
  return { workspace, available: true, reason: null, ...base };
}

export type WorkspaceUpdateStep = 'check' | 'fetch' | 'lfs' | 'pull' | 'rebuild';
export const STEP_TITLES: Record<WorkspaceUpdateStep, string> = { check: 'Check', fetch: 'Fetch', lfs: 'LFS', pull: 'Pull', rebuild: 'Rebuild' };

/** A refusal or failure at one step; the message says what happened and what to do. */
export class WorkspaceUpdateError extends Error {
  readonly step: WorkspaceUpdateStep;
  constructor(step: WorkspaceUpdateStep, message: string) {
    super(`${STEP_TITLES[step]}: ${message}`);
    this.step = step;
  }
}

export interface WorkspaceUpdateResult {
  state: 'updated' | 'up-to-date';
  from: string;
  to: string;
  commits: number;
  /** What was rebuilt: `xrb-host` when the core host was, then the plugin folders. */
  rebuilt: string[];
  summary: string;
}

export interface WorkspaceUpdateDeps {
  git?: GitRunner;
  /** True when the core host is built and current, so only plugins need a rebuild. */
  coreHostCurrent: () => Promise<boolean>;
  /** The existing native rebuild, with the same tool discovery as Rebuild; returns the rebuilt plugin folders. */
  rebuild: (pluginsOnly: boolean, ctx: JobContext) => Promise<string[]>;
}

const TAIL = 12;

/** Plugin ids from rebuilt native projects: a plugin's `<id>/runtime` subproject is the same plugin. */
export function rebuiltPluginNames(plugins: ReadonlyArray<{ dir: string }>): string[] {
  return [...new Set(plugins.map((plugin) => plugin.dir.split('/')[0]!))];
}

/**
 * Git LFS writes a progress update per chunk (each carriage return becomes a line). Keep one line per 5 % of progress,
 * and every other line as it is, so the job output stays readable.
 */
export function lfsProgressFilter(onLine: (line: string) => void): (line: string) => void {
  let last = -1, label = '';
  return (line) => {
    const progress = /^(.*?):\s+(\d{1,3})%/.exec(line);
    if (!progress) { onLine(line); return; }
    const percent = Number(progress[2]);
    if (progress[1] !== label) { label = progress[1]!; last = -1; }
    if ((percent === 100 && last !== 100) || last < 0 || percent >= last + 5) { last = percent; onLine(line); }
  };
}
const tail = (output: string) => output.split('\n').filter((l) => l.trim()).slice(-TAIL).join('\n');
const short = (sha: string) => sha.slice(0, 7);

/** Paths Git lists under "... would be overwritten by merge/checkout:" (tab-indented lines). */
export function overwrittenFiles(output: string): string[] {
  const files: string[] = [];
  let inList = false;
  for (const line of output.split('\n')) {
    if (/would be (overwritten|removed) by/.test(line)) { inList = true; continue; }
    if (inList && /^\s+\S/.test(line)) files.push(line.trim());
    else if (inList && line.trim()) inList = false;
  }
  return [...new Set(files)];
}

/**
 * Steps 1-6 of Update workspace. Each step is announced as a `step <id>` line for the progress dialog.
 * LFS objects of the new commits are downloaded first (`git lfs fetch`, which honours the clone's
 * lfs.fetchinclude/fetchexclude), so the fast-forward's own checkout writes LFS content only for files the update
 * changes: a local deletion or edit of another LFS file stays, and an LFS failure changes nothing.
 * A successful pull leaves a marker under the Git folder until the rebuild succeeds, so running Update again after
 * a failed rebuild finishes it although the branch is no longer behind.
 */
export async function updateWorkspace(workspace: string, ctx: JobContext, deps: WorkspaceUpdateDeps): Promise<WorkspaceUpdateResult> {
  const git = deps.git ?? runGit;
  const step = (id: WorkspaceUpdateStep) => ctx.line(`step ${id}`);
  const quiet = (args: string[]) => readOnly(git)(args, workspace);
  const loud = (args: string[], env?: NodeJS.ProcessEnv, onLine: (line: string) => void = ctx.line) => { ctx.line(`> git ${args.join(' ')}`); return git(args, workspace, { onLine, env }); };
  const head = async () => firstLine((await quiet(['rev-parse', 'HEAD'])).output);

  step('check');
  const status = await workspaceUpdateStatus(workspace, git);
  if (!status.available) throw new WorkspaceUpdateError('check', `${status.reason} Nothing changed.`);
  ctx.line(`workspace ${workspace} on ${status.branch}, tracking ${status.upstream}`);
  const marker = await markerPath(workspace, readOnly(git));
  const pending = await readMarker(marker);
  if (pending) ctx.line('an earlier update did not finish its rebuild: finishing it');

  step('fetch');
  const fetched = await loud(['fetch']);
  if (fetched.code !== 0) throw new WorkspaceUpdateError('fetch', `Could not reach the remote. Nothing changed.\n${tail(fetched.output)}`);

  // The commit this update goes to: read once after the fetch and used for the count, the LFS download and the
  // fast-forward, so the update never moves past what was fetched and checked, even if the remote moves meanwhile.
  const target = firstLine((await quiet(['rev-parse', '--verify', '@{u}^{commit}'])).output);
  if (!/^[0-9a-f]{40,64}$/.test(target)) throw new WorkspaceUpdateError('fetch', 'Could not read the upstream commit after fetching. Nothing changed.');
  const counts = await quiet(['rev-list', '--left-right', '--count', `HEAD...${target}`]);
  const [ahead = 0, behind = 0] = firstLine(counts.output).split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
  const before = await head();
  if (ahead > 0 && behind > 0) throw new WorkspaceUpdateError('fetch', `The branch has ${ahead} local commit(s) and ${behind} new remote commit(s). Merge or rebase by hand, then run Update again. Nothing changed.`);
  if (behind === 0 && !pending) {
    const summary = `Already up to date (${short(before)}).${ahead ? ` ${ahead} local commit(s) not on the remote.` : ''} Nothing was rebuilt.`;
    ctx.line(summary);
    return { state: 'up-to-date', from: before, to: before, commits: 0, rebuilt: [], summary };
  }

  if (behind > 0) {
    step('lfs');
    const remote = firstLine((await quiet(['config', '--get', `branch.${status.branch}.remote`])).output) || 'origin';
    // Git LFS shows no progress when its output is not a terminal unless forced.
    const lfs = await loud(['lfs', 'fetch', remote, target], { GIT_LFS_FORCE_PROGRESS: '1' }, lfsProgressFilter(ctx.line));
    if (lfs.code !== 0) throw new WorkspaceUpdateError('lfs', `Could not download the LFS files of the new commits: run Update again. Nothing changed.\n${tail(lfs.output)}`);

    step('pull');
    // A fast-forward to the fetched commit, not `git pull`: that would fetch again and could move past `target`.
    const pulled = await loud(['merge', '--ff-only', '--no-edit', target]);
    if (pulled.code !== 0) {
      const files = overwrittenFiles(pulled.output);
      if (files.length) throw new WorkspaceUpdateError('pull', `Local changes would be overwritten by the update: ${files.join(', ')}. Commit or stash them first, then run Update again. Nothing changed.`);
      throw new WorkspaceUpdateError('pull', `Git could not fast-forward. Check git status in the workspace, then run Update again.\n${tail(pulled.output)}`);
    }
    // Until the rebuild succeeds, the next Update must finish it even though nothing is behind any more.
    if (marker && !pending?.from) await fs.writeFile(marker, `${JSON.stringify({ from: before })}\n`);
  }
  const to = await head();
  const from = pending?.from || before;
  const commits = from === to ? 0 : Number.parseInt(firstLine((await quiet(['rev-list', '--count', `${from}..${to}`])).output), 10) || 0;
  const moved = commits ? `${short(from)} → ${short(to)} (${commits} commit${commits === 1 ? '' : 's'})` : short(to);
  if (commits) ctx.line(`updated ${moved}`);

  step('rebuild');
  const pluginsOnly = await deps.coreHostCurrent();
  let plugins: string[];
  try {
    plugins = await deps.rebuild(pluginsOnly, ctx);
  } catch (e) {
    throw new WorkspaceUpdateError('rebuild', `${commits ? `Updated ${moved}, but the` : 'The'} rebuild failed: ${(e as Error).message}. Fix it and run Update again.`);
  }
  if (marker) await fs.rm(marker, { force: true });
  const rebuilt = [...(pluginsOnly ? [] : ['xrb-host']), ...plugins];
  const summary = `${commits ? `Updated ${moved}` : `Finished the update at ${moved}`}. Rebuilt: ${rebuilt.length ? rebuilt.join(', ') : 'nothing'}.`;
  ctx.line(summary);
  return { state: 'updated', from, to, commits, rebuilt, summary };
}

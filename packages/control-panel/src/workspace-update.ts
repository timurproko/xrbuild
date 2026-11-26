// Update: the status of the core checkout the panel runs from and of the selected workspace, and the update of the
// workspace's Git clone with its upstream by fast-forward only, its Git LFS content, then a rebuild of the native
// plugins (and the core host only when it is missing or outdated). The status and fast-forward helpers serve both
// repositories; this version reports the core read-only and does not update it.
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

/** Which of the two repositories of an update a folder is. */
export type RepoRole = 'core' | 'workspace';

export interface RepoStatus {
  dir: string;
  role: RepoRole;
  /** The repository can be fast-forwarded: a Git clone of its own, on a branch with an upstream, and Git LFS when required. */
  available: boolean;
  /** Why the repository cannot be updated, or null. */
  reason: string | null;
  branch: string | null;
  upstream: string | null;
  /** Local commits not on the upstream, as of the last fetch. */
  ahead: number;
  /** Upstream commits not in the repository, as of the last fetch. */
  behind: number;
  /** Uncommitted or untracked paths. */
  dirty: number;
  /** When the remote was last fetched (FETCH_HEAD), or null when it never was. Status never fetches. */
  checkedMs: number | null;
  /** An earlier update pulled new commits but its rebuild did not succeed: Update finishes it. */
  unfinished: boolean;
  /** The workspace is the core checkout the panel runs from: one repository, updated as the core, never twice. */
  sameAsCore?: boolean;
  /** Update reports this repository but does not update it in this version (the core). */
  readOnly?: boolean;
}
/** The workspace's status. */
export type WorkspaceUpdateStatus = RepoStatus;

export interface RepoStatusOptions {
  role: RepoRole;
  /** Git LFS is required to update the workspace; the core uses none, so it is optional there. */
  lfs: 'required' | 'optional';
  git?: GitRunner;
  /** The resume marker under the Git folder, when this repository has one. */
  marker?: string;
}

const unavailable = (dir: string, role: RepoRole, reason: string, extra: Partial<RepoStatus> = {}): RepoStatus =>
  ({ dir, role, available: false, reason, branch: null, upstream: null, ahead: 0, behind: 0, dirty: 0, checkedMs: null, unfinished: false, ...extra });

async function samePath(a: string, b: string): Promise<boolean> {
  const real = async (p: string) => path.resolve(await fs.realpath(p).catch(() => p));
  const [x, y] = await Promise.all([real(a), real(b)]);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

const firstLine = (text: string) => text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** Read-only Git: no optional locks, so `git status` does not refresh and rewrite the index while others use it. */
const readOnly = (git: GitRunner): GitRunner => (args, cwd, opts = {}) => git(args, cwd, { ...opts, env: { ...opts.env, GIT_OPTIONAL_LOCKS: '0' } });

/** Credentials in a remote URL (`https://user:token@host`, `https://token@host`) never reach the job output. */
export function redactRemote(line: string): string {
  return line.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@');
}

/** The marker an update leaves under the workspace's Git folder after pulling, until its rebuild succeeds. */
export const WORKSPACE_MARKER = 'xrb-workspace-update';
async function markerPath(dir: string, git: GitRunner, marker: string): Promise<string | null> {
  const found = await git(['rev-parse', '--git-path', marker], dir);
  return found.code === 0 ? path.resolve(dir, firstLine(found.output)) : null;
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

const CORE_NOT_A_CHECKOUT = 'The core is not a Git checkout: it updates with a new package.';
const REASONS: Record<RepoRole, { missing: string; notClone: string; detached: string }> = {
  workspace: { missing: 'The workspace folder does not exist.', notClone: 'The workspace is not a Git clone.', detached: 'The workspace is not on a branch (detached HEAD).' },
  core: { missing: CORE_NOT_A_CHECKOUT, notClone: CORE_NOT_A_CHECKOUT, detached: 'The core is not on a branch (detached HEAD).' },
};

/** Whether a repository can be fast-forwarded and how far it is from its upstream as of the last fetch. Writes nothing. */
export async function repoUpdateStatus(dir: string, options: RepoStatusOptions): Promise<RepoStatus> {
  const { role } = options, git = readOnly(options.git ?? runGit), why = REASONS[role];
  if (!await fs.stat(dir).then((s) => s.isDirectory(), () => false)) return unavailable(dir, role, why.missing);
  const top = await git(['rev-parse', '--show-toplevel'], dir);
  if (top.code === 127) return unavailable(dir, role, 'Git is not installed.');
  // A folder inside another clone (such as a workspace inside the core checkout) is not a clone of its own: never update that one.
  if (top.code !== 0 || !await samePath(firstLine(top.output), dir)) return unavailable(dir, role, why.notClone);
  const branch = await git(['symbolic-ref', '-q', '--short', 'HEAD'], dir);
  if (branch.code !== 0) return unavailable(dir, role, why.detached);
  const name = firstLine(branch.output);
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], dir);
  if (upstream.code !== 0) return unavailable(dir, role, `The branch ${name} has no upstream to update from.`, { branch: name });
  const counts = await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], dir);
  const [ahead, behind] = firstLine(counts.output).split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
  const status = await git(['status', '--porcelain'], dir);
  const fetchHead = await git(['rev-parse', '--git-path', 'FETCH_HEAD'], dir);
  const fetchFile = path.resolve(dir, firstLine(fetchHead.output));
  const checkedMs = fetchHead.code === 0 ? (await fs.stat(fetchFile).catch(() => null))?.mtimeMs ?? null : null;
  const unfinished = options.marker ? !!await readMarker(await markerPath(dir, git, options.marker)) : false;
  const base = { branch: name, upstream: firstLine(upstream.output), ahead: ahead ?? 0, behind: behind ?? 0, dirty: status.output.split('\n').filter((l) => l.trim()).length, checkedMs, unfinished };
  if (options.lfs === 'required' && (await git(['lfs', 'version'], dir)).code !== 0) return unavailable(dir, role, 'Git LFS is not installed.', base);
  return { dir, role, available: true, reason: null, ...base };
}

/** The core checkout the panel runs from, reported read-only: this version does not update it. */
export async function coreUpdateStatus(core: string, runner: GitRunner = runGit): Promise<RepoStatus> {
  return { ...await repoUpdateStatus(core, { role: 'core', lfs: 'optional', git: runner }), readOnly: true };
}

/** Why the workspace part skips a workspace that is the core checkout: that repository belongs to the core part. */
export const SAME_AS_CORE = 'The workspace is the core checkout: it is updated as the core, which this version does not do yet. Pull it by hand.';

/**
 * Whether Update can run and how far the workspace is from its upstream as of the last fetch. Writes nothing.
 * `core` is the core checkout the panel runs from: a workspace at the same path is that one repository.
 */
export async function workspaceUpdateStatus(workspace: string, runner: GitRunner = runGit, core?: string): Promise<WorkspaceUpdateStatus> {
  if (core && await fs.stat(workspace).then(() => true, () => false) && await samePath(workspace, core)) return unavailable(workspace, 'workspace', SAME_AS_CORE, { sameAsCore: true });
  return repoUpdateStatus(workspace, { role: 'workspace', lfs: 'required', git: runner, marker: WORKSPACE_MARKER });
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
  /** The core checkout the panel runs from; a workspace at the same path is not updated a second time as the workspace. */
  core?: string;
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

export interface FastForwardOptions {
  git?: GitRunner;
  role: RepoRole;
  lfs: 'required' | 'optional';
  /** The branch whose upstream is fetched; its remote is used for the LFS download. */
  branch: string;
  /** The resume marker written after the fast-forward, until the caller's update finishes. */
  marker: string;
}

export interface FastForwardResult {
  /** Where the repository was before this update, or before the unfinished update it resumes. */
  from: string;
  to: string;
  commits: number;
  /** Local commits not on the upstream, when nothing was behind. */
  ahead: number;
  /** An earlier update moved this repository but did not finish. */
  pending: boolean;
  /** The marker file to remove once the update finishes, or null. */
  marker: string | null;
}

/**
 * Fetch, then fast-forward to exactly the fetched upstream commit, for either repository. Each step is announced as
 * a `step <id>` line. LFS objects of the new commits are downloaded first (`git lfs fetch`, which honours the
 * clone's lfs.fetchinclude/fetchexclude), so the fast-forward's own checkout writes LFS content only for files the
 * update changes: a local deletion or edit of another LFS file stays, and an LFS failure changes nothing. With
 * optional LFS the download runs only when Git LFS is present and the fetched commit tracks LFS files.
 * A successful fast-forward leaves a marker under the Git folder until the caller removes it, so running Update
 * again after a later failure finishes it although the branch is no longer behind.
 */
export async function fastForward(dir: string, ctx: JobContext, options: FastForwardOptions): Promise<FastForwardResult> {
  const git = options.git ?? runGit;
  const prefix = options.role === 'core' ? 'Core: ' : '';
  const fail = (at: WorkspaceUpdateStep, message: string) => new WorkspaceUpdateError(at, `${prefix}${message}`);
  const step = (id: WorkspaceUpdateStep) => ctx.line(`step ${id}`);
  const quiet = (args: string[]) => readOnly(git)(args, dir);
  const out = (line: string) => ctx.line(redactRemote(line));
  const loud = (args: string[], env?: NodeJS.ProcessEnv, onLine: (line: string) => void = out) => { ctx.line(`> git ${args.join(' ')}`); return git(args, dir, { onLine, env }); };
  const head = async () => firstLine((await quiet(['rev-parse', 'HEAD'])).output);
  const marker = await markerPath(dir, readOnly(git), options.marker);
  const pending = await readMarker(marker);
  if (pending) ctx.line('an earlier update did not finish its rebuild: finishing it');

  step('fetch');
  const fetched = await loud(['fetch']);
  if (fetched.code !== 0) throw fail('fetch', `Could not reach the remote. Nothing changed.\n${redactRemote(tail(fetched.output))}`);

  // The commit this update goes to: read once after the fetch and used for the count, the LFS download and the
  // fast-forward, so the update never moves past what was fetched and checked, even if the remote moves meanwhile.
  const target = firstLine((await quiet(['rev-parse', '--verify', '@{u}^{commit}'])).output);
  if (!/^[0-9a-f]{40,64}$/.test(target)) throw fail('fetch', 'Could not read the upstream commit after fetching. Nothing changed.');
  const counts = await quiet(['rev-list', '--left-right', '--count', `HEAD...${target}`]);
  const [ahead = 0, behind = 0] = firstLine(counts.output).split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
  const before = await head();
  if (ahead > 0 && behind > 0) throw fail('fetch', `The branch has ${ahead} local commit(s) and ${behind} new remote commit(s). Merge or rebase by hand, then run Update again. Nothing changed.`);

  if (behind > 0) {
    const remote = firstLine((await quiet(['config', '--get', `branch.${options.branch}.remote`])).output) || 'origin';
    const lfsNeeded = options.lfs === 'required'
      || ((await quiet(['lfs', 'version'])).code === 0 && !!firstLine((await quiet(['lfs', 'ls-files', '--name-only', target])).output));
    if (lfsNeeded) {
      step('lfs');
      // Git LFS shows no progress when its output is not a terminal unless forced.
      const lfs = await loud(['lfs', 'fetch', remote, target], { GIT_LFS_FORCE_PROGRESS: '1' }, lfsProgressFilter(out));
      if (lfs.code !== 0) throw fail('lfs', `Could not download the LFS files of the new commits: run Update again. Nothing changed.\n${redactRemote(tail(lfs.output))}`);
    }

    step('pull');
    // A fast-forward to the fetched commit, not `git pull`: that would fetch again and could move past `target`.
    const pulled = await loud(['merge', '--ff-only', '--no-edit', target]);
    if (pulled.code !== 0) {
      const files = overwrittenFiles(pulled.output);
      if (files.length) throw fail('pull', `Local changes would be overwritten by the update: ${files.join(', ')}. Commit or stash them first, then run Update again. Nothing changed.`);
      throw fail('pull', `Git could not fast-forward. Check git status in the ${options.role}, then run Update again.\n${redactRemote(tail(pulled.output))}`);
    }
    // Until the caller's update finishes, the next Update must finish it even though nothing is behind any more.
    if (marker && !pending?.from) await fs.writeFile(marker, `${JSON.stringify({ from: before })}\n`);
  }
  const to = await head();
  const from = pending?.from || before;
  const commits = from === to ? 0 : Number.parseInt(firstLine((await quiet(['rev-list', '--count', `${from}..${to}`])).output), 10) || 0;
  return { from, to, commits, ahead: behind > 0 ? 0 : ahead, pending: !!pending, marker };
}

/**
 * The workspace part of Update. The marker from `fastForward` stays until the rebuild succeeds, so running Update
 * again after a failed rebuild finishes it.
 */
export async function updateWorkspace(workspace: string, ctx: JobContext, deps: WorkspaceUpdateDeps): Promise<WorkspaceUpdateResult> {
  const git = deps.git ?? runGit;

  ctx.line('step check');
  const status = await workspaceUpdateStatus(workspace, git, deps.core);
  if (!status.available) throw new WorkspaceUpdateError('check', `${status.reason} Nothing changed.`);
  ctx.line(`workspace ${workspace} on ${status.branch}, tracking ${status.upstream}`);

  const moved = await fastForward(workspace, ctx, { git, role: 'workspace', lfs: 'required', branch: status.branch!, marker: WORKSPACE_MARKER });
  const { from, to, commits } = moved;
  if (!commits && !moved.pending) {
    const summary = `Already up to date (${short(to)}).${moved.ahead ? ` ${moved.ahead} local commit(s) not on the remote.` : ''} Nothing was rebuilt.`;
    ctx.line(summary);
    return { state: 'up-to-date', from: to, to, commits: 0, rebuilt: [], summary };
  }
  const range = commits ? `${short(from)} → ${short(to)} (${commits} commit${commits === 1 ? '' : 's'})` : short(to);
  if (commits) ctx.line(`updated ${range}`);

  ctx.line('step rebuild');
  const pluginsOnly = await deps.coreHostCurrent();
  let plugins: string[];
  try {
    plugins = await deps.rebuild(pluginsOnly, ctx);
  } catch (e) {
    throw new WorkspaceUpdateError('rebuild', `${commits ? `Updated ${range}, but the` : 'The'} rebuild failed: ${(e as Error).message}. Fix it and run Update again.`);
  }
  if (moved.marker) await fs.rm(moved.marker, { force: true });
  const rebuilt = [...(pluginsOnly ? [] : ['xrb-host']), ...plugins];
  const summary = `${commits ? `Updated ${range}` : `Finished the update at ${range}`}. Rebuilt: ${rebuilt.length ? rebuilt.join(', ') : 'nothing'}.`;
  ctx.line(summary);
  return { state: 'updated', from, to, commits, rebuilt, summary };
}

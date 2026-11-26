// Update both independent checkouts to freshly fetched origin default-branch commits, without discarding work.
// One repository's refusal never prevents the other's attempt; partial success is a failed job, not all-green.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JobFailure, LineSplitter, type JobContext } from './jobs.ts';

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
export const CORE_MARKER = 'xrb-core-update';
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
  if (counts.code !== 0 || !/^\d+\s+\d+$/.test(counts.output.trim())) return unavailable(dir, role, 'Cannot compare Git history; inspect the checkout before updating.', { branch: name });
  const [ahead, behind] = counts.output.trim().split(/\s+/).map(Number);
  const status = await git(['status', '--porcelain', '--untracked-files=all'], dir);
  if (status.code !== 0) return unavailable(dir, role, 'Cannot read Git status; inspect the checkout before updating.', { branch: name });
  const fetchHead = await git(['rev-parse', '--git-path', 'FETCH_HEAD'], dir);
  const fetchFile = path.resolve(dir, firstLine(fetchHead.output));
  const checkedMs = fetchHead.code === 0 ? (await fs.stat(fetchFile).catch(() => null))?.mtimeMs ?? null : null;
  const unfinished = options.marker ? !!await readMarker(await markerPath(dir, git, options.marker)) : false;
  const base = { branch: name, upstream: firstLine(upstream.output), ahead: ahead ?? 0, behind: behind ?? 0, dirty: status.output.split('\n').filter((l) => l.trim()).length, checkedMs, unfinished };
  if (options.lfs === 'required' && (await git(['lfs', 'version'], dir)).code !== 0) return unavailable(dir, role, 'Git LFS is not installed.', base);
  return { dir, role, available: true, reason: null, ...base };
}

/** Status never fetches; both repositories are eligible for an explicit Update. */
export async function coreUpdateStatus(core: string, runner: GitRunner = runGit): Promise<RepoStatus> {
  return repoUpdateStatus(core, { role: 'core', lfs: 'optional', git: runner, marker: CORE_MARKER });
}

/**
 * Whether Update can run and how far the workspace is from its upstream as of the last fetch. Writes nothing.
 * `core` is the core checkout the panel runs from: a workspace at the same path is that one repository.
 */
export async function workspaceUpdateStatus(workspace: string, runner: GitRunner = runGit, core?: string): Promise<WorkspaceUpdateStatus> {
  if (core && await samePath(workspace, core)) return { ...await coreUpdateStatus(core, runner), role: 'workspace', sameAsCore: true };
  return repoUpdateStatus(workspace, { role: 'workspace', lfs: 'required', git: runner, marker: WORKSPACE_MARKER });
}

export type UpdateStep = 'check' | 'fetch' | 'lfs' | 'pull' | 'rebuild';
export const STEP_TITLES: Record<UpdateStep, string> = { check: 'Check', fetch: 'Fetch', lfs: 'LFS', pull: 'Pull', rebuild: 'Rebuild' };

/** A refusal or failure at one step; the message says what happened and what to do. */
export class UpdateError extends Error {
  fetched = false;
  defaultBranch: string | null = null;
  readonly step: UpdateStep;
  constructor(step: UpdateStep, message: string) {
    super(`${STEP_TITLES[step]}: ${message}`);
    this.step = step;
  }
}

export interface RepoOutcome {
  role: RepoRole;
  roles: RepoRole[];
  dir: string;
  state: 'updated' | 'up-to-date' | 'failed';
  from: string | null;
  to: string | null;
  /** Original commit of a pending update, if setup/build is being resumed. */
  updateFrom: string | null;
  commits: number;
  fetched: boolean;
  defaultBranch: string | null;
  error: string | null;
  step: UpdateStep | null;
  pending: boolean;
  marker: string | null;
}

export interface UpdateResult {
  state: 'updated' | 'up-to-date' | 'failed';
  repositories: RepoOutcome[];
  rebuilt: string[];
  restartRequired: boolean;
  lastLine: string;
  summary: string;
}

export class UpdateFailure extends JobFailure {
  declare readonly result: UpdateResult;
  constructor(result: UpdateResult) { super(result.summary, result, result.lastLine); }
}

export interface UpdateDeps {
  git?: GitRunner;
  /** The core checkout the panel runs from; an identical workspace is updated only once. */
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
  /** Optional expected branch from a prior status read; rechecked before checkout. */
  branch?: string;
  /** The resume marker written after the fast-forward, until the caller's update finishes. */
  marker: string;
}

export interface FastForwardResult {
  /** HEAD at the start of this attempt, distinct from the original pending update. */
  before: string;
  defaultBranch: string;
  fetched: true;
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

/** Freshly discover/fetch origin's default branch, refuse unsafe local state, and fast-forward to that exact target.
 * LFS downloads precede checkout; an update marker keeps post-pull work retryable. No stash, reset or forced refs.
 */
export async function fastForward(dir: string, ctx: JobContext, options: FastForwardOptions): Promise<FastForwardResult> {
  const git = options.git ?? runGit;
  const prefix = options.role === 'core' ? 'Core: ' : 'Workspace: ';
  let defaultBranch: string | null = null, fresh = false;
  const fail = (at: UpdateStep, message: string) => Object.assign(new UpdateError(at, `${prefix}${message}`), { fetched: fresh, defaultBranch });
  const step = (id: UpdateStep) => ctx.line(`step ${id}`);
  const quiet = (args: string[]) => readOnly(git)(args, dir);
  const out = (line: string) => ctx.line(redactRemote(line));
  const loud = (args: string[], env?: NodeJS.ProcessEnv, onLine: (line: string) => void = out) => { ctx.line(`> git ${args.join(' ')}`); return git(args, dir, { onLine, env }); };
  const checked = async (args: string[], at: UpdateStep = 'check') => {
    const result = await quiet(args);
    if (result.code !== 0) throw fail(at, `Git could not inspect ${args[0]}; check git status and retry Update.`);
    return result.output.trim();
  };
  const head = async () => {
    const sha = await checked(['rev-parse', '--verify', 'HEAD^{commit}']);
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw fail('check', 'Cannot read HEAD; repair the checkout before retrying Update.');
    return sha;
  };
  const top = await checked(['rev-parse', '--show-toplevel']);
  if (!await samePath(top, dir)) throw fail('check', 'This is not an independent clone; select its checkout root before retrying Update.');
  const before = await head();
  const marker = await markerPath(dir, readOnly(git), options.marker);
  if (!marker) throw fail('check', 'Cannot locate the update marker; check Git permissions and retry Update.');
  const pending = await readMarker(marker);
  if (pending) ctx.line(`${prefix}finishing the earlier update's setup and rebuild`);

  step('fetch');
  const advertised = await loud(['ls-remote', '--symref', 'origin', 'HEAD', 'refs/heads/*']);
  if (advertised.code !== 0) throw fail('fetch', 'Cannot discover origin default branch; check remote access and retry Update.');
  const defaults = [...advertised.output.matchAll(/^ref: refs\/heads\/(.+)\tHEAD\r?$/gm)].map(match => match[1]!);
  if (defaults.length !== 1) throw fail('fetch', 'Origin has no unambiguous default branch; repair its HEAD setting and retry Update.');
  defaultBranch = defaults[0]!;
  if ((await quiet(['check-ref-format', `refs/heads/${defaultBranch}`])).code !== 0
    || !advertised.output.split(/\r?\n/).some(line => new RegExp(`^[0-9a-f]{40,64}\\t`).test(line) && line.endsWith(`\trefs/heads/${defaultBranch}`)))
    throw fail('fetch', 'Origin default branch is invalid or missing; repair its HEAD setting and retry Update.');

  // Explicit refspec: neither a stale upstream nor a narrow configured fetch refspec can choose the target.
  // No '+' or force: a rewritten remote-tracking branch is an attention case, not permission to discard history.
  const fetched = await loud(['fetch', '--no-tags', '--no-recurse-submodules', 'origin', `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`]);
  if (fetched.code !== 0) throw fail('fetch', 'Could not fetch origin default branch; check remote access and history, then retry Update.');
  const target = await checked(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], 'fetch');
  if (!/^[0-9a-f]{40,64}$/.test(target)) throw fail('fetch', 'Cannot read the fetched commit; inspect the checkout and retry Update.');
  fresh = true;

  const branch = firstLine((await quiet(['symbolic-ref', '-q', '--short', 'HEAD'])).output);
  const recovery = `preserve local work, switch safely to ${defaultBranch} tracking origin/${defaultBranch}, then retry Update.`;
  if (!branch) throw fail('check', `Detached HEAD; ${recovery}`);
  const remote = firstLine((await quiet(['config', '--get', `branch.${branch}.remote`])).output);
  const merge = firstLine((await quiet(['config', '--get', `branch.${branch}.merge`])).output);
  if (branch !== defaultBranch || remote !== 'origin' || merge !== `refs/heads/${defaultBranch}`)
    throw fail('check', `Branch ${branch} has a missing, removed or non-default upstream; ${recovery}`);
  const ensureUnchanged = async () => {
    const currentBranch = await quiet(['symbolic-ref', '-q', '--short', 'HEAD']);
    if (currentBranch.code !== 0 || currentBranch.output.trim() !== branch || await head() !== before)
      throw fail('check', 'HEAD changed during Update; finish other Git work and retry Update.');
    const status = await checked(['status', '--porcelain', '--untracked-files=all']);
    if (status) throw fail('check', 'Uncommitted or untracked changes exist; commit or move them to safety before retrying Update.');
    for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
      const file = await checked(['rev-parse', '--git-path', state]);
      if (await fs.stat(path.resolve(dir, file)).then(() => true, () => false))
        throw fail('check', 'A merge, rebase or cherry-pick is in progress; finish or abort it yourself before retrying Update.');
    }
  };
  await ensureUnchanged();
  const counts = await checked(['rev-list', '--left-right', '--count', `${before}...${target}`], 'fetch');
  if (!/^\d+\s+\d+$/.test(counts)) throw fail('fetch', 'Cannot compare local and fetched history; inspect Git history before retrying Update.');
  const [ahead = 0, behind = 0] = counts.split(/\s+/).map(Number);
  if (ahead > 0) throw fail('fetch', `${ahead} local commit(s) are absent from origin/${defaultBranch}${behind ? ` and ${behind} remote commit(s) are missing locally` : ''}; reconcile local history by hand before retrying Update.`);

  if (behind > 0) {
    const lfsInstalled = (await quiet(['lfs', 'version'])).code === 0;
    // Optional LFS still must not silently check out pointers when the fetched core tracks LFS files.
    const attributes = await quiet(['grep', '-l', 'filter=lfs', target, '--', '.gitattributes', '**/.gitattributes']);
    if (attributes.code !== 0 && attributes.code !== 1) throw fail('lfs', 'Cannot inspect LFS attributes; check the fetched tree and retry Update.');
    const lfsNeeded = options.lfs === 'required' || !!attributes.output.trim();
    if (lfsNeeded && !lfsInstalled) throw fail('lfs', 'Git LFS is required; install it and retry Update.');
    if (lfsNeeded) {
      step('lfs');
      // Git LFS shows no progress when its output is not a terminal unless forced.
      const lfs = await loud(['lfs', 'fetch', 'origin', target], { GIT_LFS_FORCE_PROGRESS: '1' }, lfsProgressFilter(out));
      if (lfs.code !== 0) throw fail('lfs', `Could not download the LFS files of the new commits: run Update again. Nothing changed.\n${redactRemote(tail(lfs.output))}`);
    }

    await ensureUnchanged();
    step('pull');
    // Write before checkout so a crash after advancing HEAD still leaves retryable build work.
    if (!pending) await fs.writeFile(marker, `${JSON.stringify({ from: before })}\n`);
    const pulled = await loud(['-c', 'merge.autostash=false', 'merge', '--ff-only', '--no-edit', target]);
    if (pulled.code !== 0) {
      if (!pending && await head() === before) await fs.rm(marker, { force: true });
      throw fail('pull', 'Git could not fast-forward; check git status and reconcile by hand before retrying Update.');
    }
  }
  const to = await head();
  if (to !== target) throw fail('pull', 'HEAD does not match the fetched target; inspect other Git activity before retrying Update.');
  const from = pending?.from || before;
  const count = await checked(['rev-list', '--count', `${from}..${to}`]);
  if (!/^\d+$/.test(count)) throw fail('check', 'Cannot read the update range; inspect Git history before retrying Update.');
  return { before, from, to, commits: Number(count), ahead: 0, defaultBranch, fetched: true, pending: !!pending, marker };
}

export interface UpdateStatus { core: RepoStatus; workspace: RepoStatus }

/** Both repositories of an update, read-only: the core the panel runs from and the selected workspace. */
export async function updateStatus(core: string, workspace: string, runner: GitRunner = runGit): Promise<UpdateStatus> {
  const [coreStatus, workspaceStatus] = await Promise.all([coreUpdateStatus(core, runner), workspaceUpdateStatus(workspace, runner, core)]);
  return { core: coreStatus, workspace: workspaceStatus };
}

/** Independent, index-safe HEAD inspection: a workspace folder inside core must not borrow core's HEAD. */
async function checkoutHead(dir: string, git: GitRunner): Promise<string | null> {
  const top = await readOnly(git)(['rev-parse', '--show-toplevel'], dir);
  if (top.code !== 0 || !await samePath(firstLine(top.output), dir)) return null;
  const head = await readOnly(git)(['rev-parse', '--verify', 'HEAD^{commit}'], dir);
  return head.code === 0 && /^[0-9a-f]{40,64}$/.test(head.output.trim()) ? head.output.trim() : null;
}

/** Both attempts finish before the aggregate result fails; nothing rolls back an already advanced repository. */
export async function runUpdate(workspace: string, ctx: JobContext, deps: UpdateDeps): Promise<UpdateResult> {
  const git = deps.git ?? runGit;
  const repositories: RepoOutcome[] = [];
  const targets: Array<{ role: RepoRole; roles: RepoRole[]; dir: string }> = [];
  const identical = !!deps.core && await samePath(workspace, deps.core);
  if (deps.core) targets.push({ role: 'core', roles: identical ? ['core', 'workspace'] : ['core'], dir: deps.core });
  if (!identical) targets.push({ role: 'workspace', roles: ['workspace'], dir: workspace });
  for (const target of targets) {
    ctx.line('step check');
    ctx.line(`${target.roles.join('/')} checkout: ${target.dir}`);
    const outcome: RepoOutcome = { ...target, state: 'failed', from: await checkoutHead(target.dir, git), to: null,
      updateFrom: null, commits: 0, fetched: false, defaultBranch: null, error: null, step: null, pending: false, marker: null };
    repositories.push(outcome);
    try {
      const moved = await fastForward(target.dir, ctx, { git, role: target.role, lfs: target.role === 'core' ? 'optional' : 'required',
        marker: target.role === 'core' ? CORE_MARKER : WORKSPACE_MARKER });
      Object.assign(outcome, { state: moved.commits || moved.pending ? 'updated' : 'up-to-date', from: moved.before, to: moved.to,
        updateFrom: moved.from, commits: moved.commits, fetched: true, defaultBranch: moved.defaultBranch,
        pending: moved.pending || moved.before !== moved.to, marker: moved.marker });
    } catch (e) {
      outcome.to = await checkoutHead(target.dir, git);
      outcome.error = redactRemote((e as Error).message);
      outcome.step = e instanceof UpdateError ? e.step : 'check';
      if (e instanceof UpdateError) { outcome.fetched = e.fetched; outcome.defaultBranch = e.defaultBranch; }
      ctx.line(outcome.error);
    }
  }

  const work = repositories.filter(repo => repo.pending);
  let rebuilt: string[] = [], buildError: string | null = null;
  if (work.length) {
    if (repositories.some(repo => repo.state === 'failed')) {
      buildError = 'Build deferred because a repository needs attention; resolve its problem and retry Update.';
      ctx.line(buildError);
    } else {
      ctx.line('step rebuild');
      try {
        const pluginsOnly = await deps.coreHostCurrent();
        rebuilt = [...(pluginsOnly ? [] : ['xrb-host']), ...await deps.rebuild(pluginsOnly, ctx)];
        for (const repo of work) {
          if (repo.marker) await fs.rm(repo.marker, { force: true });
          repo.pending = false;
        }
      } catch (e) {
        buildError = `Rebuild failed: ${redactRemote((e as Error).message)}; fix the build and retry Update.`;
        ctx.line(buildError);
      }
    }
  }
  const changed = repositories.some(repo => !!repo.from && !!repo.to && repo.from !== repo.to || repo.updateFrom && repo.updateFrom !== repo.to);
  const restartRequired = !!changed;
  const lastLine = restartRequired
    ? 'Restart required: restart the panel to load the updated code; Update did not restart the panel.'
    : 'Update did not restart the panel; no repository code changed in this run.';
  const descriptions = repositories.map(repo => {
    const label = repo.roles.map(role => role === 'core' ? 'Core' : 'Workspace').join('/');
    const range = `${repo.from ?? 'unknown'} → ${repo.to ?? 'unknown'}`;
    return `${label}: ${range}; ${repo.state === 'failed' ? repo.error : repo.state === 'up-to-date'
      ? `already up to date after fresh fetch of origin/${repo.defaultBranch}` : `fetched origin/${repo.defaultBranch}, ${repo.commits} commit(s) in update${repo.pending ? ', setup/build pending' : ''}`}.`;
  });
  const failed = !!buildError || repositories.some(repo => repo.state === 'failed');
  const summary = [...descriptions, buildError ?? `Rebuilt: ${rebuilt.length ? rebuilt.join(', ') : 'nothing'}.`, lastLine].join(' ');
  const result: UpdateResult = { state: failed ? 'failed' : repositories.some(repo => repo.state === 'updated') ? 'updated' : 'up-to-date',
    repositories, rebuilt, restartRequired, lastLine, summary };
  for (const description of descriptions) ctx.line(description);
  ctx.line(lastLine);
  if (failed) throw new UpdateFailure(result);
  return result;
}

/** CLI boundary retains partial results and the required last-line restart instruction after a failure. */
export async function runUpdateCommand(workspace: string, ctx: JobContext, deps: UpdateDeps): Promise<number> {
  try { await runUpdate(workspace, ctx, deps); return 0; }
  catch (error) {
    ctx.line(`Update failed: ${redactRemote((error as Error).message)}`);
    if (error instanceof UpdateFailure) ctx.line(error.result.lastLine);
    return 1;
  }
}

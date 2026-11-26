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

export interface UpdateResult {
  state: 'updated' | 'up-to-date';
  from: string;
  to: string;
  commits: number;
  /** What was rebuilt: `xrb-host` when the core host was, then the plugin folders. */
  rebuilt: string[];
  /** What the run says about the core: behind or not updatable here. This version never updates the core. */
  coreNote: string | null;
  summary: string;
}

export interface UpdateDeps {
  git?: GitRunner;
  /** The core checkout the panel runs from: reported read-only, and a workspace at the same path is that one repository. */
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

/**
 * What an update says about the core while this version only reports it: that it is behind or cannot be updated
 * here, and to pull it by hand. Never that it was updated. Null when the core was up to date at its last fetch.
 */
export function coreNote(core: RepoStatus): string | null {
  if (!core.available) return `Core: not updated here. ${core.reason}`;
  if (core.readOnly && core.behind > 0) return `Core: ${core.behind} commit${core.behind === 1 ? '' : 's'} behind ${core.upstream}, not updated by this version yet; pull it by hand.`;
  return null;
}

/**
 * Update. This version reports the core and updates the workspace: check, fetch, LFS, fast-forward, rebuild. The
 * marker from `fastForward` stays until the rebuild succeeds, so running Update again after a failed rebuild
 * finishes it. The summary and every failure say what holds for the core; neither ever reports the core as updated.
 */
export async function runUpdate(workspace: string, ctx: JobContext, deps: UpdateDeps): Promise<UpdateResult> {
  const git = deps.git ?? runGit;

  ctx.line('step check');
  const status = await workspaceUpdateStatus(workspace, git, deps.core);
  const core = deps.core ? await coreUpdateStatus(deps.core, git) : null;
  // A workspace that is the core checkout already says so, and to pull it by hand.
  const note = core && !status.sameAsCore ? coreNote(core) : null;
  if (core) ctx.line(`core ${deps.core}: ${note ?? `on ${core.branch}, tracking ${core.upstream}; this version does not update the core`}`);
  const withNote = (text: string) => note ? `${text} ${note}` : text;
  try {
    if (!status.available) throw new UpdateError('check', `${status.reason} Nothing changed.`);
    ctx.line(`workspace ${workspace} on ${status.branch}, tracking ${status.upstream}`);

    const moved = await fastForward(workspace, ctx, { git, role: 'workspace', lfs: 'required', branch: status.branch!, marker: WORKSPACE_MARKER });
    const { from, to, commits } = moved;
    if (!commits && !moved.pending) {
      const summary = withNote(`Workspace already up to date (${short(to)}).${moved.ahead ? ` ${moved.ahead} local commit(s) not on the remote.` : ''} Nothing was rebuilt.`);
      ctx.line(summary);
      return { state: 'up-to-date', from: to, to, commits: 0, rebuilt: [], coreNote: note, summary };
    }
    const range = commits ? `${short(from)} → ${short(to)} (${commits} commit${commits === 1 ? '' : 's'})` : short(to);
    if (commits) ctx.line(`workspace updated ${range}`);

    ctx.line('step rebuild');
    const pluginsOnly = await deps.coreHostCurrent();
    let plugins: string[];
    try {
      plugins = await deps.rebuild(pluginsOnly, ctx);
    } catch (e) {
      throw new UpdateError('rebuild', `${commits ? `Workspace updated ${range}, but the` : 'The'} rebuild failed: ${(e as Error).message}. Fix it and run Update again.`);
    }
    if (moved.marker) await fs.rm(moved.marker, { force: true });
    const rebuilt = [...(pluginsOnly ? [] : ['xrb-host']), ...plugins];
    const summary = withNote(`${commits ? `Workspace updated ${range}` : `Workspace update finished at ${range}`}. Rebuilt: ${rebuilt.length ? rebuilt.join(', ') : 'nothing'}.`);
    ctx.line(summary);
    return { state: 'updated', from, to, commits, rebuilt, coreNote: note, summary };
  } catch (e) {
    if (e instanceof UpdateError) e.message = withNote(e.message);
    throw e;
  }
}

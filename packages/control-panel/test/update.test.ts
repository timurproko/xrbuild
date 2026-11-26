import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { JobRunner, type JobContext } from '../src/jobs.ts';
import { rebuildPresentation, updateTooltip } from '../ui/rebuild-dialog.js';
import { freePort } from '../src/host-runner.ts';
import { createServer } from '../src/server.ts';
import { coreNote, coreUpdateStatus, fastForward, lfsProgressFilter, overwrittenFiles, rebuiltPluginNames, runGit, redactRemote, SAME_AS_CORE, runUpdate, workspaceUpdateStatus, UpdateError, type GitRunner } from '../src/update.ts';

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_TERMINAL_PROMPT: '0' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args], { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare remote, a publisher clone that adds commits, and the workspace clone under test. Git LFS is stubbed. */
async function fixture(t: TestContext, lfs: { code: number } = { code: 0 }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-workspace-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const remote = path.join(root, 'remote.git'), publisher = path.join(root, 'publisher'), workspace = path.join(root, 'workspace');
  git(root, 'init', '--bare', '-q', remote);
  git(root, 'clone', '-q', remote, publisher);
  await fs.writeFile(path.join(publisher, 'shared.txt'), 'one\n');
  await fs.writeFile(path.join(publisher, 'other.txt'), 'one\n');
  git(publisher, 'add', '.'); git(publisher, 'commit', '-qm', 'first'); git(publisher, 'push', '-q', 'origin', 'HEAD:main');
  git(root, 'clone', '-q', remote, workspace);
  git(workspace, 'config', 'core.autocrlf', 'false');
  const publish = async (file: string, text: string) => {
    await fs.writeFile(path.join(publisher, file), text);
    git(publisher, 'commit', '-qam', `change ${file}`); git(publisher, 'push', '-q', 'origin', 'HEAD:main');
  };
  const calls: string[][] = [], lfsEnv: Array<NodeJS.ProcessEnv | undefined> = [];
  const stub: GitRunner = async (args, cwd, opts) => {
    calls.push(args);
    if (args[0] === 'lfs') {
      if (args[1] !== 'fetch') opts?.onLine?.('git-lfs/3.0.0 (stub)');
      else {
        // Like forced Git LFS progress: one update per chunk, then 100 % repeated as the last bytes land.
        lfsEnv.push(opts?.env);
        for (let p = 0; p <= 100; p++) opts?.onLine?.(`Downloading LFS objects: ${p}% (${p === 100 ? 1 : 0}/1), ${p} MB | 10 MB/s`);
        opts?.onLine?.('Downloading LFS objects: 100% (1/1), 100 MB | 10 MB/s');
        opts?.onLine?.('Downloading LFS objects: 100% (1/1), 100 MB | 10 MB/s, done.');
      }
      return { code: args[1] === 'fetch' ? lfs.code : 0, output: '' };
    }
    return runGit(args, cwd, { ...opts, env: { ...ENV, ...opts?.env } });
  };
  const lines: string[] = [];
  const ctx: JobContext = { line: (text) => lines.push(text), async run() { assert.fail('the update runs no other process'); } };
  const rebuilds: boolean[] = [];
  const deps = { git: stub, coreHostCurrent: async () => true, rebuild: async (pluginsOnly: boolean) => { rebuilds.push(pluginsOnly); return ['tracker']; } };
  const head = () => git(workspace, 'rev-parse', 'HEAD');
  return { root, remote, publisher, workspace, publish, calls, lfsEnv, lines, ctx, rebuilds, deps, head };
}

const rejectsAt = async (promise: Promise<unknown>, step: string, pattern: RegExp) => {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof UpdateError, String(e));
    assert.equal(e.step, step);
    assert.match(e.message, pattern);
    return true;
  });
};

test('downloads the LFS files of the new commits, fast-forwards, then rebuilds plugins and reports the commits', async (t) => {
  const f = await fixture(t), before = f.head();
  await f.publish('shared.txt', 'two\n'); await f.publish('other.txt', 'two\n'); await f.publish('shared.txt', 'three\n');
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated');
  assert.equal(result.from, before); assert.equal(result.to, f.head()); assert.equal(result.commits, 3);
  assert.deepEqual(result.rebuilt, ['tracker']); assert.deepEqual(f.rebuilds, [true]);
  assert.match(result.summary, new RegExp(`Workspace updated ${before.slice(0, 7)} → ${result.to.slice(0, 7)} \\(3 commits\\)\\. Rebuilt: tracker\\.`));
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'three\n');
  assert.deepEqual(f.lines.filter((l) => l.startsWith('step ')), ['step check', 'step fetch', 'step lfs', 'step pull', 'step rebuild']);
  assert.ok(f.calls.some((args) => args.join(' ') === `lfs fetch origin ${result.to}`), 'LFS objects of the fetched upstream commit are fetched, honouring the clone settings');
  assert.ok(!f.calls.some((args) => args[0] === 'lfs' && args[1] === 'pull'), 'no git lfs pull: it would restore LFS files deleted locally');
  assert.equal(f.lfsEnv[0]?.GIT_LFS_FORCE_PROGRESS, '1', 'LFS progress is forced although the output is not a terminal');
  const progress = f.lines.filter((l) => l.startsWith('Downloading LFS objects:'));
  assert.equal(progress.length, 21, 'one progress line per 5 % and 100 % once');
  assert.equal(progress.at(-1), 'Downloading LFS objects: 100% (1/1), 100 MB | 10 MB/s');
  assert.ok(f.calls.some((args) => args.join(' ') === `merge --ff-only --no-edit ${result.to}`), 'a fast-forward to exactly the fetched commit');
  assert.equal(f.calls.filter((args) => args[0] === 'fetch').length, 1, 'fetched once');
  for (const args of f.calls) assert.ok(!['stash', 'pull', 'rebase', 'reset', 'checkout', 'clean'].includes(args[0]!) && (args[0] !== 'merge' || args[1] === '--ff-only'), `never runs git ${args.join(' ')}`);
});

test('the remote moving after the LFS download does not move the fast-forward past the fetched commit', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  const fetched = git(f.publisher, 'rev-parse', 'HEAD');
  let moved = false;
  // Another commit reaches the remote while the LFS objects of the fetched commit are downloading.
  const deps = { ...f.deps, git: (async (args, cwd, opts) => {
    if (args[0] === 'lfs' && args[1] === 'fetch' && !moved) { moved = true; await f.publish('other.txt', 'two\n'); }
    return f.deps.git(args, cwd, opts);
  }) as GitRunner };
  const result = await runUpdate(f.workspace, f.ctx, deps);
  assert.ok(moved);
  assert.equal(result.to, fetched); assert.equal(f.head(), fetched); assert.equal(result.commits, 1);
  assert.equal(await fs.readFile(path.join(f.workspace, 'other.txt'), 'utf8'), 'one\n', 'the later commit is not in the workspace');
  assert.equal(f.calls.filter((args) => args[0] === 'fetch').length, 1, 'no second fetch');
  const next = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(next.state, 'updated'); assert.equal(next.commits, 1, 'the next Update brings the newer commit');
  assert.equal(await fs.readFile(path.join(f.workspace, 'other.txt'), 'utf8'), 'two\n');
});

test('rebuilds the core host too when it is missing or outdated', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  const result = await runUpdate(f.workspace, f.ctx, { ...f.deps, coreHostCurrent: async () => false });
  assert.deepEqual(f.rebuilds, [false]); assert.deepEqual(result.rebuilt, ['xrb-host', 'tracker']);
});

test('up to date: reports it, runs no LFS step and does not rebuild', async (t) => {
  const f = await fixture(t);
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'up-to-date'); assert.equal(result.commits, 0);
  assert.match(result.summary, /^Workspace already up to date \(\w{7}\)\. Nothing was rebuilt\.$/);
  assert.deepEqual(f.rebuilds, []);
  assert.ok(!f.calls.some((args) => args[0] === 'merge' || (args[0] === 'lfs' && args[1] !== 'version')), 'no fast-forward and no LFS download');
});
test('non-conflicting local changes stay', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.workspace, 'other.txt'), 'local edit\n');
  await fs.writeFile(path.join(f.workspace, 'untracked.txt'), 'mine\n');
  await f.publish('shared.txt', 'two\n');
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated');
  assert.equal(await fs.readFile(path.join(f.workspace, 'other.txt'), 'utf8'), 'local edit\n');
  assert.equal(await fs.readFile(path.join(f.workspace, 'untracked.txt'), 'utf8'), 'mine\n');
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'two\n');
});

test('conflicting local changes are refused with the file list and nothing changes', async (t) => {
  const f = await fixture(t), before = f.head();
  await fs.writeFile(path.join(f.workspace, 'shared.txt'), 'local edit\n');
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'pull', /Local changes would be overwritten by the update: shared\.txt\. Commit or stash them first/);
  assert.equal(f.head(), before);
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'local edit\n');
  assert.equal(git(f.workspace, 'stash', 'list'), '', 'nothing was stashed');
  assert.deepEqual(f.rebuilds, []);
});

test('a diverged branch is refused before pulling', async (t) => {
  const f = await fixture(t), before = f.head();
  await fs.writeFile(path.join(f.workspace, 'other.txt'), 'local commit\n');
  git(f.workspace, 'commit', '-qam', 'local');
  const local = f.head();
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'fetch', /1 local commit\(s\) and 1 new remote commit\(s\)\. Merge or rebase by hand/);
  assert.notEqual(local, before); assert.equal(f.head(), local);
  assert.ok(!f.calls.some((args) => args[0] === 'merge'));
});

test('a fetch failure stops with nothing changed', async (t) => {
  const f = await fixture(t), before = f.head();
  await f.publish('shared.txt', 'two\n');
  await fs.rename(f.remote, `${f.remote}.offline`);
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'fetch', /Could not reach the remote\. Nothing changed\./);
  assert.equal(f.head(), before); assert.deepEqual(f.rebuilds, []);
});

test('an LFS failure stops before the pull: nothing changes and no rebuild', async (t) => {
  const f = await fixture(t, { code: 2 }), before = f.head();
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'lfs', /^LFS: Could not download the LFS files of the new commits: run Update again\. Nothing changed\./);
  assert.equal(f.head(), before); assert.deepEqual(f.rebuilds, []);
  assert.ok(!f.calls.some((args) => args[0] === 'merge'));
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'one\n');
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git)).unfinished, false);
});
test('a rebuild failure names the step and keeps the update', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, { ...f.deps, rebuild: async () => { throw new Error('cmake exited with 1'); } }), 'rebuild', /Workspace updated \w{7} → \w{7} \(1 commit\), but the rebuild failed: cmake exited with 1/);
});

test('status reports behind and dirty without fetching, and when the remote was last checked', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  await fs.writeFile(path.join(f.workspace, 'other.txt'), 'local edit\n');
  const stale = await workspaceUpdateStatus(f.workspace, f.deps.git);
  assert.equal(stale.available, true); assert.equal(stale.behind, 0, 'status never fetches'); assert.equal(stale.dirty, 1);
  assert.equal(stale.branch, 'main'); assert.equal(stale.upstream, 'origin/main');
  assert.ok(!f.calls.some((args) => args[0] === 'fetch'));
  git(f.workspace, 'fetch', '-q');
  const fresh = await workspaceUpdateStatus(f.workspace, f.deps.git);
  assert.equal(fresh.behind, 1); assert.equal(fresh.ahead, 0);
  assert.ok(fresh.checkedMs && Math.abs(Date.now() - fresh.checkedMs) < 60_000, 'checkedMs comes from the last fetch');
});

test('not a clone, a folder inside another clone, no upstream, a detached HEAD and no LFS are unavailable with a reason', async (t) => {
  const f = await fixture(t);
  const plain = path.join(f.root, 'plain'); await fs.mkdir(plain);
  assert.equal((await workspaceUpdateStatus(plain, f.deps.git)).reason, 'The workspace is not a Git clone.');
  const nested = path.join(f.workspace, 'nested'); await fs.mkdir(nested);
  assert.equal((await workspaceUpdateStatus(nested, f.deps.git)).reason, 'The workspace is not a Git clone.');
  assert.equal((await workspaceUpdateStatus(path.join(f.root, 'missing'), f.deps.git)).available, false);
  git(f.workspace, 'checkout', '-qb', 'topic');
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git)).reason, 'The branch topic has no upstream to update from.');
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'check', /no upstream to update from\. Nothing changed\./);
  git(f.workspace, 'checkout', '-q', '--detach');
  assert.match((await workspaceUpdateStatus(f.workspace, f.deps.git)).reason ?? '', /detached HEAD/);
  git(f.workspace, 'checkout', '-q', 'main');
  const noLfs: GitRunner = async (args, cwd, opts) => args[0] === 'lfs' ? { code: 1, output: "git: 'lfs' is not a git command" } : f.deps.git(args, cwd, opts);
  const status = await workspaceUpdateStatus(f.workspace, noLfs);
  assert.equal(status.reason, 'Git LFS is not installed.'); assert.equal(status.available, false);
  assert.deepEqual(f.rebuilds, []);
});

test('a workspace that is the core checkout is one repository: reported as the core and not fast-forwarded as the workspace', async (t) => {
  const f = await fixture(t), before = f.head();
  await f.publish('shared.txt', 'two\n');
  const status = await workspaceUpdateStatus(f.workspace, f.deps.git, f.workspace);
  assert.equal(status.available, false); assert.equal(status.sameAsCore, true); assert.equal(status.reason, SAME_AS_CORE);
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git, path.join(f.root, 'core'))).sameAsCore, undefined, 'another core path is not the same repository');
  // The same folder written differently is still the same repository.
  const spelled = process.platform === 'win32' ? f.workspace.toUpperCase() : `${f.workspace}${path.sep}.`;
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git, spelled)).sameAsCore, true);
  await rejectsAt(runUpdate(f.workspace, f.ctx, { ...f.deps, core: f.workspace }), 'check', /The workspace is the core checkout: it is updated as the core.*Nothing changed\./);
  assert.equal(f.head(), before); assert.deepEqual(f.rebuilds, []);
  assert.ok(!f.calls.some((args) => ['fetch', 'merge'].includes(args[0]!) || (args[0] === 'lfs' && args[1] === 'fetch')), 'nothing is fetched or fast-forwarded');
});

test('the core status is read-only, needs no Git LFS, and names why a core cannot be updated', async (t) => {
  const f = await fixture(t);
  const noLfs: GitRunner = async (args, cwd, opts) => args[0] === 'lfs' ? { code: 1, output: "git: 'lfs' is not a git command" } : f.deps.git(args, cwd, opts);
  const core = await coreUpdateStatus(f.workspace, noLfs);
  assert.equal(core.role, 'core'); assert.equal(core.readOnly, true);
  assert.equal(core.available, true, 'Git LFS is optional for the core'); assert.equal(core.reason, null);
  assert.equal(core.branch, 'main'); assert.equal(core.upstream, 'origin/main'); assert.equal(core.unfinished, false);
  const packaged = path.join(f.root, 'packaged'); await fs.mkdir(packaged);
  assert.equal((await coreUpdateStatus(packaged, noLfs)).reason, 'The core is not a Git checkout: it updates with a new package.');
  const nested = path.join(f.workspace, 'nested'); await fs.mkdir(nested);
  assert.equal((await coreUpdateStatus(nested, noLfs)).reason, 'The core is not a Git checkout: it updates with a new package.', 'a folder inside another clone is not the core checkout');
  git(f.workspace, 'checkout', '-q', '--detach');
  const detached = await coreUpdateStatus(f.workspace, noLfs);
  assert.equal(detached.available, false); assert.equal(detached.reason, 'The core is not on a branch (detached HEAD).');
  git(f.workspace, 'checkout', '-qb', 'topic');
  assert.equal((await coreUpdateStatus(f.workspace, noLfs)).reason, 'The branch topic has no upstream to update from.');
  assert.ok(!f.calls.some((args) => args[0] === 'fetch'), 'the core status never fetches');
});

test('fastForward serves the core too: optional LFS is skipped when the commit tracks no LFS files, and refusals name the core', async (t) => {
  const f = await fixture(t), ctx = f.ctx;
  await f.publish('shared.txt', 'two\n');
  const moved = await fastForward(f.workspace, ctx, { git: f.deps.git, role: 'core', lfs: 'optional', branch: 'main', marker: 'xrb-test-update' });
  assert.equal(moved.commits, 1); assert.equal(moved.to, f.head()); assert.equal(moved.pending, false);
  assert.ok(moved.marker && await fs.stat(moved.marker).then(() => true), 'the marker stays until the caller finishes');
  assert.ok(f.calls.some((args) => args.join(' ').startsWith('lfs ls-files')), 'optional LFS asks whether the commit tracks LFS files');
  assert.ok(!f.calls.some((args) => args[0] === 'lfs' && args[1] === 'fetch'), 'no LFS download for a commit without LFS files');
  assert.deepEqual(f.lines.filter((l) => l.startsWith('step ')), ['step fetch', 'step pull']);
  await fs.writeFile(path.join(f.workspace, 'other.txt'), 'local commit\n');
  git(f.workspace, 'commit', '-qam', 'local');
  await f.publish('other.txt', 'remote\n');
  await rejectsAt(fastForward(f.workspace, ctx, { git: f.deps.git, role: 'core', lfs: 'optional', branch: 'main', marker: 'xrb-test-update' }), 'fetch', /^Fetch: Core: The branch has 1 local commit\(s\) and 1 new remote commit\(s\)/);
});

test('while the core is only reported, the result says it is behind and to pull it by hand, and never that it was updated', async (t) => {
  const f = await fixture(t);
  // The core: another clone of the same remote, fetched so it knows it is 1 commit behind.
  const core = path.join(f.root, 'core');
  git(f.root, 'clone', '-q', f.remote, core);
  await f.publish('shared.txt', 'two\n');
  git(core, 'fetch', '-q');
  const coreHead = git(core, 'rev-parse', 'HEAD');
  const note = 'Core: 1 commit behind origin/main, not updated by this version yet; pull it by hand.';
  assert.equal(coreNote(await coreUpdateStatus(core, f.deps.git)), note);
  const result = await runUpdate(f.workspace, f.ctx, { ...f.deps, core });
  assert.equal(result.state, 'updated'); assert.equal(result.coreNote, note);
  assert.match(result.summary, /^Workspace updated \w{7} → \w{7} \(1 commit\)\. Rebuilt: tracker\. Core: 1 commit behind origin\/main, not updated by this version yet; pull it by hand\.$/);
  assert.equal(git(core, 'rev-parse', 'HEAD'), coreHead, 'the core did not move');
  const current = await runUpdate(f.workspace, f.ctx, { ...f.deps, core });
  assert.equal(current.state, 'up-to-date'); assert.match(current.summary, /^Workspace already up to date \(\w{7}\)\. Nothing was rebuilt\. Core: 1 commit behind/);
  await f.publish('other.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, { ...f.deps, core, rebuild: async () => { throw new Error('cmake exited with 1'); } }), 'rebuild', /Fix it and run Update again\. Core: 1 commit behind origin\/main, not updated by this version yet; pull it by hand\.$/);
  for (const line of f.lines) assert.doesNotMatch(line, /core updated|updated the core|Core updated/i, 'nothing claims the core was updated');
  // A core that cannot be updated here says why; one that is up to date adds nothing.
  assert.equal(coreNote(await coreUpdateStatus(path.join(f.root, 'missing'), f.deps.git)), 'Core: not updated here. The core is not a Git checkout: it updates with a new package.');
  git(core, 'merge', '-q', '--ff-only', 'origin/main');
  assert.equal(coreNote(await coreUpdateStatus(core, f.deps.git)), null);
});

test('the Update tooltip names each repository and when the remote was last checked', () => {
  const now = Date.now();
  const repo = { available: true, reason: null, branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, dirty: 0, checkedMs: now - 5000, unfinished: false };
  const core = { ...repo, role: 'core' as const, readOnly: true }, workspace = { ...repo, role: 'workspace' as const };
  assert.equal(updateTooltip({ core, workspace }, now), 'Core: up to date. Workspace: up to date. Remote last checked just now.');
  assert.equal(updateTooltip({ core: { ...core, behind: 3 }, workspace: { ...workspace, behind: 2, checkedMs: now - 120_000 } }, now),
    'Core: 3 commits behind origin/main, not updated by this version yet; pull it by hand. Workspace: 2 commits behind origin. Remote last checked 2 min ago.');
  assert.equal(updateTooltip({ core: { ...core, available: false, reason: 'The core is not on a branch (detached HEAD).' }, workspace: { ...workspace, unfinished: true, checkedMs: null } }, now),
    'Core: not updated here. The core is not on a branch (detached HEAD). Workspace: the last update did not finish; run Update again. Remote last checked just now.', 'falls back to the core\'s last check');
  assert.equal(updateTooltip({ core: { ...core, checkedMs: null }, workspace: { ...workspace, available: false, reason: 'The workspace is not a Git clone.', checkedMs: null } }, now),
    'Core: up to date. Workspace: The workspace is not a Git clone. Remote not checked yet.');
  assert.equal(updateTooltip(null), '');
});

test('credentials in remote URLs never reach the job output', async (t) => {
  assert.equal(redactRemote('From https://user:secret@example.invalid/core'), 'From https://[redacted]@example.invalid/core');
  assert.equal(redactRemote('fatal: unable to access https://token123@example.invalid/x/'), 'fatal: unable to access https://[redacted]@example.invalid/x/');
  assert.equal(redactRemote('From ../remote.git'), 'From ../remote.git');
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  const leaky: GitRunner = async (args, cwd, opts) => {
    if (args[0] === 'fetch') opts?.onLine?.('From https://user:secret@example.invalid/workspace');
    return f.deps.git(args, cwd, opts);
  };
  await runUpdate(f.workspace, f.ctx, { ...f.deps, git: leaky });
  assert.ok(f.lines.includes('From https://[redacted]@example.invalid/workspace'));
  assert.ok(!f.lines.some((l) => l.includes('secret')));
});

test('overwritten file lists are read from Git output', () => {
  const output = [
    'Updating 1111111..2222222',
    'error: Your local changes to the following files would be overwritten by merge:',
    '\ta.txt',
    '\tdir/b.txt',
    'Please commit your changes or stash them before you merge.',
    'error: The following untracked working tree files would be overwritten by merge:',
    '\tnew.txt',
    'Aborting',
  ].join('\n');
  assert.deepEqual(overwrittenFiles(output), ['a.txt', 'dir/b.txt', 'new.txt']);
});

/** The panel with its workspace at the fixture clone; desktop setup is idle and the rebuild is gated by the test. */
async function serverFixture(t: TestContext) {
  const f = await fixture(t), core = path.join(f.root, 'core');
  await fs.mkdir(core);
  const server = createServer({ repo: core, workspace: f.workspace, workspaceKind: 'explicit', port: await freePort() });
  const gate = { release: () => {}, wait: Promise.resolve() };
  const hold = () => { gate.wait = new Promise<void>((resolve) => { gate.release = resolve; }); };
  server.panel.desktopSetup = { isBusy: async () => false, deps: { tools: async () => ({ cmake: null, generator: 'test' }) } } as never;
  server.panel.updateDeps = { git: f.deps.git, coreHostCurrent: async () => true, rebuild: async (pluginsOnly) => { f.rebuilds.push(pluginsOnly); await gate.wait; return ['tracker']; } };
  await new Promise<void>((resolve) => server.server.listen(server.port, '127.0.0.1', resolve));
  t.after(() => server.close());
  const request = async (method: string, route: string) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' } });
    return { status: response.status, data: await response.json() as any };
  };
  return { ...f, server, request, hold, gate };
}

test('GET update reports both repositories and POST runs the update as a job', async (t) => {
  const f = await serverFixture(t);
  await f.publish('shared.txt', 'two\n');
  const status = await f.request('GET', '/api/update');
  assert.equal(status.status, 200); assert.equal(status.data.workspace.available, true); assert.equal(status.data.workspace.behind, 0); assert.equal(status.data.updating, false);
  assert.equal(status.data.core.role, 'core'); assert.equal(status.data.core.readOnly, true); assert.equal(status.data.core.reason, 'The core is not a Git checkout: it updates with a new package.');
  const started = await f.request('POST', '/api/update');
  assert.equal(started.status, 202); assert.equal(started.data.kind, 'update');
  const job = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.data.id)!);
  assert.equal(job.state, 'done', job.error ?? '');
  assert.equal((job.result as { commits: number }).commits, 1);
  assert.equal((await f.request('GET', '/api/update')).data.workspace.behind, 0);
});

test('update, rebuild and run never overlap, and a running host refuses the update', async (t) => {
  const f = await serverFixture(t), panel = f.server.panel;
  await f.publish('shared.txt', 'two\n');
  f.hold();
  const started = await f.request('POST', '/api/update');
  assert.equal(started.status, 202);
  while (!f.rebuilds.length) await new Promise((resolve) => setTimeout(resolve, 20));
  let gitDuringUpdate = 0;
  const counting = f.server.panel.updateDeps.git!;
  f.server.panel.updateDeps.git = async (args, cwd, opts) => { gitDuringUpdate++; return counting(args, cwd, opts); };
  const during = await f.request('GET', '/api/update');
  assert.equal(during.data.updating, true); assert.equal(gitDuringUpdate, 0, 'status runs no Git beside an active update');
  f.server.panel.updateDeps.git = counting;
  const rebuild = await f.request('POST', '/api/host/rebuild');
  assert.equal(rebuild.status, 409); assert.match(rebuild.data.error, /wait for the update to finish/);
  assert.equal((await f.request('POST', '/api/update')).status, 409);
  await assert.rejects(panel.run({ id: 'demo', manifest: {} } as never, 'native'), /wait for the update to finish/);
  f.gate.release();
  assert.equal((await panel.jobs.wait(panel.jobs.get(started.data.id)!)).state, 'done');
  (panel as unknown as { preparingNativeRun: boolean }).preparingNativeRun = true;
  const busy = await f.request('POST', '/api/update');
  assert.equal(busy.status, 409); assert.match(busy.data.error, /stop the running or starting host first/);
});

test('the job runner keeps an update apart from every other job in both directions', async () => {
  for (const kind of ['web-build', 'package', 'host-rebuild', 'icon-render', 'publication', 'update'] as const) for (const reverse of [false, true]) {
    const jobs = new JobRunner(); let release!: () => void;
    const job = jobs.start(reverse ? kind : 'update', null, 'active', () => new Promise<void>((resolve) => { release = resolve; }));
    assert.throws(() => jobs.start(reverse ? 'update' : kind, null, 'conflict', async () => {}), /an update cannot overlap/);
    release(); await jobs.wait(job);
  }
});

test('POST update refuses a workspace that is not a clone, with the reason', async (t) => {
  const f = await serverFixture(t);
  await fs.rm(path.join(f.workspace, '.git'), { recursive: true, force: true });
  const refused = await f.request('POST', '/api/update');
  assert.equal(refused.status, 409); assert.equal(refused.data.error, 'The workspace is not a Git clone.');
  assert.equal(f.server.panel.jobs.list().length, 0);
});

test('POST update refuses a workspace that is the core checkout the panel runs from', async (t) => {
  const f = await serverFixture(t);
  (f.server.panel as unknown as { repo: string }).repo = f.workspace;
  const status = await f.request('GET', '/api/update');
  assert.equal(status.data.workspace.sameAsCore, true); assert.equal(status.data.workspace.available, false); assert.equal(status.data.core.available, true);
  const refused = await f.request('POST', '/api/update');
  assert.equal(refused.status, 409); assert.equal(refused.data.error, SAME_AS_CORE);
  assert.equal(f.server.panel.jobs.list().length, 0);
});

test('a long LFS or build step keeps its step in the dialog although /api/jobs sends only the last lines', async () => {
  const jobs = new JobRunner(); let release!: () => void;
  const job = jobs.start('update', null, 'update', (ctx) => {
    for (const step of ['check', 'fetch', 'lfs', 'pull', 'rebuild']) ctx.line(`step ${step}`);
    ctx.line('plugin tracker');
    for (let i = 0; i < 250; i++) ctx.line(`cmake output ${i}`);
    return new Promise<void>((resolve) => { release = resolve; });
  });
  const listed = jobs.list().find((j) => j.id === job.id)!;
  assert.ok(!listed.lines.some((l) => l.startsWith('step ')), 'the visible tail has no step line');
  assert.equal(listed.step, 'rebuild');
  const shown = rebuildPresentation(listed);
  assert.equal(shown.step, 'rebuild'); assert.equal(shown.message, 'Step 5 of 5, Rebuild: Rebuilding plugins…');
  release(); await jobs.wait(job);
  const other = jobs.start('web-build', null, 'build', async (ctx) => { ctx.line('step one'); });
  await jobs.wait(other);
  assert.equal(other.step, undefined, 'only updates track steps');
});

test('rebuilt plugins are named by plugin, not by their runtime subproject', () => {
  assert.deepEqual(rebuiltPluginNames([{ dir: 'foo' }, { dir: 'foo/runtime' }, { dir: 'bar/runtime' }]), ['foo', 'bar']);
});

test('LFS progress keeps other lines and restarts its throttle for a new meter', () => {
  const out: string[] = [], keep = lfsProgressFilter((l) => out.push(l));
  for (const l of ['Downloading LFS objects: 0% (0/2)', 'Downloading LFS objects: 3% (0/2)', 'Downloading LFS objects: 5% (0/2)', 'error: smudge failed', 'Checking out LFS objects: 1% (0/2)']) keep(l);
  assert.deepEqual(out, ['Downloading LFS objects: 0% (0/2)', 'Downloading LFS objects: 5% (0/2)', 'error: smudge failed', 'Checking out LFS objects: 1% (0/2)']);
});

test('running Update again after an LFS failure pulls and rebuilds', async (t) => {
  const lfs = { code: 2 };
  const f = await fixture(t, lfs), before = f.head();
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(runUpdate(f.workspace, f.ctx, f.deps), 'lfs', /run Update again\. Nothing changed\./);
  const status = await workspaceUpdateStatus(f.workspace, f.deps.git);
  assert.equal(status.behind, 1, 'still behind, so the hint still offers the update'); assert.equal(status.unfinished, false);
  lfs.code = 0;
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated'); assert.deepEqual(f.rebuilds, [true]);
  assert.equal(result.from, before); assert.equal(result.commits, 1);
  assert.match(result.summary, /^Workspace updated \w{7} → \w{7} \(1 commit\)\. Rebuilt: tracker\.$/);
  assert.equal((await runUpdate(f.workspace, f.ctx, f.deps)).state, 'up-to-date');
});
test('running Update again after a rebuild failure rebuilds although nothing is behind', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  let fail = true;
  const deps = { ...f.deps, rebuild: async (pluginsOnly: boolean) => { f.rebuilds.push(pluginsOnly); if (fail) throw new Error('cmake exited with 1'); return ['tracker']; } };
  await rejectsAt(runUpdate(f.workspace, f.ctx, deps), 'rebuild', /rebuild failed: cmake exited with 1\. Fix it and run Update again\./);
  const unfinished = await workspaceUpdateStatus(f.workspace, f.deps.git);
  assert.equal(unfinished.behind, 0); assert.equal(unfinished.unfinished, true, 'the panel knows the update is unfinished');
  fail = false;
  const lfsFetches = () => f.calls.filter((args) => args[0] === 'lfs' && args[1] === 'fetch').length, fetchesBefore = lfsFetches();
  const result = await runUpdate(f.workspace, f.ctx, deps);
  assert.equal(result.state, 'updated'); assert.equal(result.commits, 1); assert.equal(f.rebuilds.length, 2);
  assert.match(result.summary, /^Workspace updated \w{7} → \w{7} \(1 commit\)\. Rebuilt: tracker\.$/);
  assert.equal(lfsFetches(), fetchesBefore, 'finishing the rebuild runs no LFS step');
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git)).unfinished, false);
  assert.equal((await runUpdate(f.workspace, f.ctx, deps)).state, 'up-to-date');
});

test('the status check does not rewrite the Git index', async (t) => {
  const f = await fixture(t), index = path.join(f.workspace, '.git', 'index');
  // A changed stat makes a plain `git status` refresh the index and write it under index.lock.
  const touch = async () => { const later = new Date(Date.now() + 5000 + Math.random() * 1000); await fs.utimes(path.join(f.workspace, 'shared.txt'), later, later); };
  await touch();
  const before = (await fs.stat(index)).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const status = await workspaceUpdateStatus(f.workspace, f.deps.git);
  assert.equal(status.available, true);
  assert.equal((await fs.stat(index)).mtimeMs, before, 'status takes no optional lock and leaves the index alone');
  git(f.workspace, 'status', '--porcelain');
  assert.notEqual((await fs.stat(index)).mtimeMs, before, 'a plain git status would have rewritten it');
});


// Real Git LFS: a stub cannot show which files `git lfs` writes. Skipped, with a note, when git-lfs is not installed.
const LFS_INSTALLED = (() => { try { execFileSync('git', ['lfs', 'version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const LFS_SKIP = LFS_INSTALLED ? false : 'git-lfs is not installed: the real-LFS behaviour is not checked here';

/** A remote with two LFS files (a.bin, b.bin) and a workspace clone with their content, using real git-lfs. */
async function lfsFixture(t: TestContext, setup: (workspace: string) => void = () => {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-workspace-lfs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const remote = path.join(root, 'remote.git'), publisher = path.join(root, 'publisher'), workspace = path.join(root, 'workspace');
  git(root, 'init', '--bare', '-q', remote);
  git(root, 'clone', '-q', remote, publisher);
  git(publisher, 'lfs', 'install', '--local'); git(publisher, 'lfs', 'track', '*.bin');
  await fs.writeFile(path.join(publisher, 'a.bin'), 'first a\n'); await fs.writeFile(path.join(publisher, 'b.bin'), 'first b\n');
  await fs.writeFile(path.join(publisher, 'note.txt'), 'one\n');
  git(publisher, 'add', '.'); git(publisher, 'commit', '-qm', 'first'); git(publisher, 'push', '-q', 'origin', 'HEAD:main');
  git(root, 'clone', '-q', remote, workspace);
  git(workspace, 'config', 'core.autocrlf', 'false'); git(workspace, 'lfs', 'install', '--local');
  setup(workspace);
  const publish = async (file: string, text: string) => {
    await fs.writeFile(path.join(publisher, file), text);
    git(publisher, 'commit', '-qam', `change ${file}`); git(publisher, 'push', '-q', 'origin', 'HEAD:main');
  };
  const realGit: GitRunner = (args, cwd, opts) => runGit(args, cwd, { ...opts, env: { ...ENV, ...opts?.env } });
  const rebuilds: boolean[] = [], lines: string[] = [];
  const ctx: JobContext = { line: (text) => lines.push(text), async run() { assert.fail('the update runs no other process'); } };
  const deps = { git: realGit, coreHostCurrent: async () => true, rebuild: async (pluginsOnly: boolean) => { rebuilds.push(pluginsOnly); return ['tracker']; } };
  return { workspace, publish, rebuilds, ctx, deps };
}

test('real LFS: a locally deleted LFS file survives an update that does not touch it', { skip: LFS_SKIP }, async (t) => {
  const f = await lfsFixture(t);
  await fs.rm(path.join(f.workspace, 'a.bin'));
  await f.publish('b.bin', 'second b\n'); await f.publish('note.txt', 'two\n');
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated'); assert.equal(result.commits, 2); assert.deepEqual(f.rebuilds, [true]);
  assert.equal(await fs.stat(path.join(f.workspace, 'a.bin')).then(() => true, () => false), false, 'the local deletion stays');
  assert.equal(git(f.workspace, 'status', '--porcelain'), 'D a.bin');
  assert.equal(await fs.readFile(path.join(f.workspace, 'b.bin'), 'utf8'), 'second b\n', 'the changed LFS file has its content');
});

test('real LFS: a clone that excludes LFS files from fetching finishes its update', { skip: LFS_SKIP }, async (t) => {
  const f = await lfsFixture(t, (workspace) => git(workspace, 'config', 'lfs.fetchexclude', 'b.bin'));
  await f.publish('b.bin', 'second b\n'); await f.publish('a.bin', 'second a\n');
  const result = await runUpdate(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated'); assert.deepEqual(f.rebuilds, [true]);
  assert.equal(await fs.readFile(path.join(f.workspace, 'a.bin'), 'utf8'), 'second a\n');
  assert.match(await fs.readFile(path.join(f.workspace, 'b.bin'), 'utf8'), /^version https:\/\/git-lfs\.github\.com\/spec\/v1/, 'the excluded file stays a pointer');
  assert.equal((await workspaceUpdateStatus(f.workspace, f.deps.git)).unfinished, false, 'no marker is left behind');
  assert.equal((await runUpdate(f.workspace, f.ctx, f.deps)).state, 'up-to-date');
});

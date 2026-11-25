import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { JobRunner, type JobContext } from '../src/jobs.ts';
import { freePort } from '../src/host-runner.ts';
import { createServer } from '../src/server.ts';
import { overwrittenFiles, runGit, updateWorkspace, workspaceUpdateStatus, WorkspaceUpdateError, type GitRunner } from '../src/workspace-update.ts';

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
  const calls: string[][] = [];
  const stub: GitRunner = async (args, cwd, opts) => {
    calls.push(args);
    if (args[0] === 'lfs') {
      opts?.onLine?.(args[1] === 'pull' ? 'Downloading LFS objects: 100% (1/1)' : 'git-lfs/3.0.0 (stub)');
      return { code: args[1] === 'pull' ? lfs.code : 0, output: '' };
    }
    return runGit(args, cwd, { ...opts, env: { ...ENV, ...opts?.env } });
  };
  const lines: string[] = [];
  const ctx: JobContext = { line: (text) => lines.push(text), async run() { assert.fail('the update runs no other process'); } };
  const rebuilds: boolean[] = [];
  const deps = { git: stub, coreHostCurrent: async () => true, rebuild: async (pluginsOnly: boolean) => { rebuilds.push(pluginsOnly); return ['tracker']; } };
  const head = () => git(workspace, 'rev-parse', 'HEAD');
  return { root, remote, publisher, workspace, publish, calls, lines, ctx, rebuilds, deps, head };
}

const rejectsAt = async (promise: Promise<unknown>, step: string, pattern: RegExp) => {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof WorkspaceUpdateError, String(e));
    assert.equal(e.step, step);
    assert.match(e.message, pattern);
    return true;
  });
};

test('fast-forwards, pulls LFS content, then rebuilds plugins and reports the commits', async (t) => {
  const f = await fixture(t), before = f.head();
  await f.publish('shared.txt', 'two\n'); await f.publish('other.txt', 'two\n'); await f.publish('shared.txt', 'three\n');
  const result = await updateWorkspace(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated');
  assert.equal(result.from, before); assert.equal(result.to, f.head()); assert.equal(result.commits, 3);
  assert.deepEqual(result.rebuilt, ['tracker']); assert.deepEqual(f.rebuilds, [true]);
  assert.match(result.summary, new RegExp(`Updated ${before.slice(0, 7)} → ${result.to.slice(0, 7)} \\(3 commits\\)\\. Rebuilt: tracker\\.`));
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'three\n');
  assert.deepEqual(f.lines.filter((l) => l.startsWith('step ')), ['step check', 'step fetch', 'step pull', 'step lfs', 'step rebuild']);
  assert.ok(f.lines.includes('Downloading LFS objects: 100% (1/1)'), 'LFS progress is streamed');
  assert.ok(f.calls.some((args) => args.join(' ') === 'pull --ff-only --no-rebase'));
  for (const args of f.calls) assert.ok(!['stash', 'merge', 'rebase', 'reset', 'checkout', 'clean'].includes(args[0]!), `never runs git ${args[0]}`);
});

test('rebuilds the core host too when it is missing or outdated', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  const result = await updateWorkspace(f.workspace, f.ctx, { ...f.deps, coreHostCurrent: async () => false });
  assert.deepEqual(f.rebuilds, [false]); assert.deepEqual(result.rebuilt, ['xrb-host', 'tracker']);
});

test('up to date: reports it and does not rebuild', async (t) => {
  const f = await fixture(t);
  const result = await updateWorkspace(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'up-to-date'); assert.equal(result.commits, 0);
  assert.match(result.summary, /Already up to date/);
  assert.deepEqual(f.rebuilds, []);
  assert.ok(!f.calls.some((args) => args[0] === 'pull' || (args[0] === 'lfs' && args[1] === 'pull')));
});

test('non-conflicting local changes stay', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.workspace, 'other.txt'), 'local edit\n');
  await fs.writeFile(path.join(f.workspace, 'untracked.txt'), 'mine\n');
  await f.publish('shared.txt', 'two\n');
  const result = await updateWorkspace(f.workspace, f.ctx, f.deps);
  assert.equal(result.state, 'updated');
  assert.equal(await fs.readFile(path.join(f.workspace, 'other.txt'), 'utf8'), 'local edit\n');
  assert.equal(await fs.readFile(path.join(f.workspace, 'untracked.txt'), 'utf8'), 'mine\n');
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'two\n');
});

test('conflicting local changes are refused with the file list and nothing changes', async (t) => {
  const f = await fixture(t), before = f.head();
  await fs.writeFile(path.join(f.workspace, 'shared.txt'), 'local edit\n');
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, f.deps), 'pull', /Local changes would be overwritten by the update: shared\.txt\. Commit or stash them first/);
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
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, f.deps), 'fetch', /1 local commit\(s\) and 1 new remote commit\(s\)\. Merge or rebase by hand/);
  assert.notEqual(local, before); assert.equal(f.head(), local);
  assert.ok(!f.calls.some((args) => args[0] === 'pull'));
});

test('a fetch failure stops with nothing changed', async (t) => {
  const f = await fixture(t), before = f.head();
  await f.publish('shared.txt', 'two\n');
  await fs.rename(f.remote, `${f.remote}.offline`);
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, f.deps), 'fetch', /Could not reach the remote\. Nothing changed\./);
  assert.equal(f.head(), before); assert.deepEqual(f.rebuilds, []);
});

test('an LFS failure after the pull skips the rebuild and asks to run Update again', async (t) => {
  const f = await fixture(t, { code: 2 });
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, f.deps), 'lfs', /LFS files are missing: run Update again\. Nothing was rebuilt\./);
  assert.deepEqual(f.rebuilds, []);
  assert.equal(await fs.readFile(path.join(f.workspace, 'shared.txt'), 'utf8'), 'two\n', 'the pull itself stays');
});

test('a rebuild failure names the step and keeps the update', async (t) => {
  const f = await fixture(t);
  await f.publish('shared.txt', 'two\n');
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, { ...f.deps, rebuild: async () => { throw new Error('cmake exited with 1'); } }), 'rebuild', /but the rebuild failed: cmake exited with 1/);
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
  await rejectsAt(updateWorkspace(f.workspace, f.ctx, f.deps), 'check', /no upstream to update from\. Nothing changed\./);
  git(f.workspace, 'checkout', '-q', '--detach');
  assert.match((await workspaceUpdateStatus(f.workspace, f.deps.git)).reason ?? '', /detached HEAD/);
  git(f.workspace, 'checkout', '-q', 'main');
  const noLfs: GitRunner = async (args, cwd, opts) => args[0] === 'lfs' ? { code: 1, output: "git: 'lfs' is not a git command" } : f.deps.git(args, cwd, opts);
  const status = await workspaceUpdateStatus(f.workspace, noLfs);
  assert.equal(status.reason, 'Git LFS is not installed.'); assert.equal(status.available, false);
  assert.deepEqual(f.rebuilds, []);
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
  server.panel.workspaceUpdateDeps = { git: f.deps.git, coreHostCurrent: async () => true, rebuild: async (pluginsOnly) => { f.rebuilds.push(pluginsOnly); await gate.wait; return ['tracker']; } };
  await new Promise<void>((resolve) => server.server.listen(server.port, '127.0.0.1', resolve));
  t.after(() => server.close());
  const request = async (method: string, route: string) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' } });
    return { status: response.status, data: await response.json() as any };
  };
  return { ...f, server, request, hold, gate };
}

test('GET workspace/update reports status and POST runs the update as a job', async (t) => {
  const f = await serverFixture(t);
  await f.publish('shared.txt', 'two\n');
  const status = await f.request('GET', '/api/workspace/update');
  assert.equal(status.status, 200); assert.equal(status.data.available, true); assert.equal(status.data.behind, 0);
  const started = await f.request('POST', '/api/workspace/update');
  assert.equal(started.status, 202); assert.equal(started.data.kind, 'workspace-update');
  const job = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.data.id)!);
  assert.equal(job.state, 'done', job.error ?? '');
  assert.equal((job.result as { commits: number }).commits, 1);
  assert.equal((await f.request('GET', '/api/workspace/update')).data.behind, 0);
});

test('update, rebuild and run never overlap, and a running host refuses the update', async (t) => {
  const f = await serverFixture(t), panel = f.server.panel;
  await f.publish('shared.txt', 'two\n');
  f.hold();
  const started = await f.request('POST', '/api/workspace/update');
  assert.equal(started.status, 202);
  while (!f.rebuilds.length) await new Promise((resolve) => setTimeout(resolve, 20));
  const rebuild = await f.request('POST', '/api/host/rebuild');
  assert.equal(rebuild.status, 409); assert.match(rebuild.data.error, /workspace update/);
  assert.equal((await f.request('POST', '/api/workspace/update')).status, 409);
  await assert.rejects(panel.run({ id: 'demo', manifest: {} } as never, 'native'), /workspace update to finish/);
  f.gate.release();
  assert.equal((await panel.jobs.wait(panel.jobs.get(started.data.id)!)).state, 'done');
  (panel as unknown as { preparingNativeRun: boolean }).preparingNativeRun = true;
  const busy = await f.request('POST', '/api/workspace/update');
  assert.equal(busy.status, 409); assert.match(busy.data.error, /stop the running or starting host first/);
});

test('the job runner keeps a workspace update apart from every other job in both directions', async () => {
  for (const kind of ['web-build', 'package', 'host-rebuild', 'icon-render', 'publication', 'workspace-update'] as const) for (const reverse of [false, true]) {
    const jobs = new JobRunner(); let release!: () => void;
    const job = jobs.start(reverse ? kind : 'workspace-update', null, 'active', () => new Promise<void>((resolve) => { release = resolve; }));
    assert.throws(() => jobs.start(reverse ? 'workspace-update' : kind, null, 'conflict', async () => {}), /workspace update/);
    release(); await jobs.wait(job);
  }
});

test('POST workspace/update refuses a workspace that is not a clone, with the reason', async (t) => {
  const f = await serverFixture(t);
  await fs.rm(path.join(f.workspace, '.git'), { recursive: true, force: true });
  const refused = await f.request('POST', '/api/workspace/update');
  assert.equal(refused.status, 409); assert.equal(refused.data.error, 'The workspace is not a Git clone.');
  assert.equal(f.server.panel.jobs.list().length, 0);
});

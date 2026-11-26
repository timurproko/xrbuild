import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { JobRunner } from '../src/jobs.ts';
import { freePort } from '../src/host-runner.ts';
import { createServer } from '../src/server.ts';
import { rebuiltPluginNames, lfsProgressFilter, redactRemote, runUpdate, runUpdateCommand, updateStatus, UpdateFailure,
  type GitRunner, type UpdateResult } from '../src/update.ts';
import { rebuildPresentation, updateTooltip } from '../ui/rebuild-dialog.js';
import { fixture, git, snapshot } from './helpers/update-fixture.ts';

async function setup(t: TestContext) {
  const f = await fixture(t), rebuilds: boolean[] = [];
  const deps = { core: f.core.checkout, git: f.runner, coreHostCurrent: async () => true,
    rebuild: async (pluginsOnly: boolean) => { rebuilds.push(pluginsOnly); return ['tracker']; } };
  return { ...f, deps, rebuilds };
}

async function failure(promise: Promise<unknown>): Promise<UpdateResult> {
  try { await promise; assert.fail('expected UpdateFailure'); }
  catch (error) { assert.ok(error instanceof UpdateFailure, String(error)); return error.result; }
}

test('regression: workspace success cannot conceal an unfetched stale core checkout', async t => {
  const f = await setup(t), beforeCore = f.core.head(), beforeWorkspace = f.workspace.head();
  const nextCore = await f.core.publish(), nextWorkspace = await f.workspace.publish();
  assert.equal(git(f.core.checkout, 'rev-parse', 'origin/main'), beforeCore);
  assert.equal((await updateStatus(f.core.checkout, f.workspace.checkout, f.runner)).core.behind, 0, 'cached status reproduces the misleading old hint');
  const result = await runUpdate(f.workspace.checkout, f.ctx, f.deps);
  assert.equal(result.state, 'updated'); assert.equal(f.core.head(), nextCore); assert.equal(f.workspace.head(), nextWorkspace);
  assert.deepEqual(result.repositories.map(repo => [repo.from, repo.to, repo.fetched]), [[beforeCore, nextCore, true], [beforeWorkspace, nextWorkspace, true]]);
  assert.match(result.summary, new RegExp(`${beforeCore} → ${nextCore}`));
  assert.match(result.summary, new RegExp(`${beforeWorkspace} → ${nextWorkspace}`));
  assert.deepEqual(f.rebuilds, [true]); assert.equal(result.restartRequired, true);
  assert.equal(f.lines.at(-1), result.lastLine); assert.match(result.lastLine, /Restart required.*did not restart/);
  const current = await runUpdate(f.workspace.checkout, f.ctx, f.deps);
  assert.equal(current.state, 'up-to-date'); assert.ok(current.repositories.every(repo => repo.fetched && repo.from === repo.to));
  assert.equal(current.restartRequired, true, 'a second Update has not restarted this process');
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 4, 'both clones fetched on every invocation');
});

for (const role of ['core', 'workspace'] as const) for (const state of ['dirty', 'staged', 'untracked', 'detached', 'ahead', 'diverged', 'removed-upstream', 'fetch-failure']) {
  test(`partial failure: ${role} ${state} is preserved while the other repository updates`, async t => {
    const f = await setup(t), unsafe = f[role], other = role === 'core' ? f.workspace : f.core;
    const nextOther = await other.publish();
    if (state !== 'ahead') await unsafe.publish(state === 'untracked' ? 'new.txt' : ['dirty', 'staged'].includes(state) ? 'shared.txt' : 'other.txt');
    if (['dirty', 'staged', 'ahead', 'diverged'].includes(state)) {
      await fs.writeFile(path.join(unsafe.checkout, 'shared.txt'), 'local\n');
      if (state === 'staged') git(unsafe.checkout, 'add', '.');
      if (state === 'ahead' || state === 'diverged') git(unsafe.checkout, 'commit', '-qam', 'local-only');
    }
    if (state === 'untracked') await fs.writeFile(path.join(unsafe.checkout, 'new.txt'), 'local\n');
    if (state === 'detached') git(unsafe.checkout, 'checkout', '-q', '--detach');
    if (state === 'removed-upstream') {
      git(unsafe.checkout, 'branch', '-m', 'develop');
      git(unsafe.checkout, 'config', 'branch.develop.merge', 'refs/heads/develop');
      git(unsafe.checkout, 'update-ref', 'refs/remotes/origin/develop', unsafe.head());
    }
    const before = await snapshot(unsafe.checkout);
    const runner: GitRunner = (args, cwd, opts) => state === 'fetch-failure' && cwd === unsafe.checkout && args[0] === 'fetch'
      ? Promise.resolve({ code: 1, output: 'network unavailable' }) : f.runner(args, cwd, opts);
    const result = await failure(runUpdate(f.workspace.checkout, f.ctx, { ...f.deps, git: runner }));
    assert.equal(result.state, 'failed'); assert.deepEqual(await snapshot(unsafe.checkout), before); assert.equal(other.head(), nextOther);
    const bad = result.repositories.find(repo => repo.role === role)!, good = result.repositories.find(repo => repo.role !== role)!;
    assert.equal(bad.state, 'failed'); assert.equal(bad.from, before.head); assert.equal(bad.to, before.head);
    assert.match(bad.error!, /retry.*Update/); assert.equal(good.state, 'updated'); assert.equal(good.to, nextOther);
    assert.equal(f.rebuilds.length, 0, 'do not rebuild through a refused source'); assert.equal(good.pending, true);
    if (state === 'removed-upstream') assert.match(bad.error!, /removed.*switch safely to main tracking origin\/main/);
    if (role === 'workspace') assert.match(f.lines.at(-1)!, /Restart required/);
  });
}

test('same checkout is fetched and advanced once for both roles, without requiring core LFS', async t => {
  const f = await setup(t); await f.core.publish();
  const noLfs: GitRunner = (args, cwd, opts) => args[0] === 'lfs' ? Promise.resolve({ code: 127, output: 'not installed' }) : f.runner(args, cwd, opts);
  const result = await runUpdate(f.core.checkout, f.ctx, { ...f.deps, git: noLfs });
  assert.equal(result.repositories.length, 1); assert.deepEqual(result.repositories[0]!.roles, ['core', 'workspace']);
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 1);
  assert.equal((await updateStatus(f.core.checkout, f.core.checkout, f.runner)).workspace.sameAsCore, true);
});

test('regression: repeated jobs retain the activation warning until a new process starts', async t => {
  const f = await setup(t), loadedCore = f.core.head(); await f.core.publish();
  const jobs = new JobRunner();
  const first = jobs.start('update', null, 'update', ctx => runUpdate(f.workspace.checkout, ctx, f.deps));
  await jobs.wait(first); assert.notEqual(f.core.head(), loadedCore);
  const second = jobs.start('update', null, 'update', ctx => runUpdate(f.workspace.checkout, ctx, { ...f.deps }));
  await jobs.wait(second);
  assert.equal(second.state, 'done'); assert.equal((second.result as UpdateResult).state, 'up-to-date');
  assert.equal((second.result as UpdateResult).restartRequired, true);
  assert.match(second.lines.at(-1)!, /Restart required.*did not restart/);
  assert.equal(rebuildPresentation(second).title, 'Restart required');
  // A genuinely new Node process loads the current checkout and has no stale-code latch.
  const script = `import {runUpdate,runGit} from ${JSON.stringify(new URL('../src/update.ts', import.meta.url).href)};
    const result=await runUpdate(${JSON.stringify(f.workspace.checkout)}, {line(){},async run(){throw Error('unexpected build')}},
      {core:${JSON.stringify(f.core.checkout)},git:(args,cwd,opts)=>args[0]==='lfs'?Promise.resolve({code:0,output:''}):runGit(args,cwd,opts)});
    console.log(JSON.stringify({restartRequired:result.restartRequired,state:result.state}));`;
  const fresh = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { timeout: 60_000 });
  assert.deepEqual(JSON.parse(fresh.stdout), { restartRequired: false, state: 'up-to-date' });
  await f.workspace.publish('shared.txt', 'new remote\n');
  await fs.writeFile(path.join(f.workspace.checkout, 'shared.txt'), 'local work\n');
  const failed = jobs.start('update', null, 'update', ctx => runUpdate(f.workspace.checkout, ctx, { ...f.deps }));
  await jobs.wait(failed); assert.equal(failed.state, 'failed');
  assert.equal((failed.result as UpdateResult).restartRequired, true); assert.match(failed.lines.at(-1)!, /Restart required/);
});

test('CLI boundary returns nonzero and retains final restart instruction on partial failure', async t => {
  const f = await setup(t); await f.core.publish();
  git(f.workspace.checkout, 'checkout', '-q', '--detach');
  assert.equal(await runUpdateCommand(f.workspace.checkout, f.ctx, f.deps), 1);
  assert.match(f.lines.at(-1)!, /Restart required.*did not restart/);
});

test('read-only status leaves index and remote refs alone, and tooltip never vouches for cached currentness', async t => {
  const f = await setup(t), index = path.join(f.core.checkout, '.git/index');
  const later = new Date(Date.now() + 5000); await fs.utimes(path.join(f.core.checkout, 'shared.txt'), later, later);
  const before = await fs.stat(index);
  const status = await updateStatus(f.core.checkout, f.workspace.checkout, f.runner);
  assert.equal((await fs.stat(index)).mtimeMs, before.mtimeMs);
  assert.ok(!f.calls.some(call => ['fetch', 'ls-remote'].includes(call.args[0]!)));
  assert.match(updateTooltip(status), /Core: no missing commits in cached origin\/main/);
  assert.doesNotMatch(updateTooltip(status), /up to date/);
});

async function serverFixture(t: TestContext) {
  const f = await setup(t);
  const server = createServer({ repo: f.core.checkout, workspace: f.workspace.checkout, workspaceKind: 'explicit', port: await freePort() });
  const gate = { release: () => {}, wait: Promise.resolve() };
  server.panel.desktopSetup = { isBusy: async () => false, deps: { tools: async () => ({ cmake: null, generator: 'test' }) } } as never;
  server.panel.updateDeps = { ...f.deps, rebuild: async pluginsOnly => { f.rebuilds.push(pluginsOnly); await gate.wait; return ['tracker']; } };
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  t.after(() => server.close());
  const request = async (method: string, route: string) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' } });
    return { status: response.status, data: await response.json() as any };
  };
  return { ...f, server, gate, request };
}

test('POST still updates core when workspace is unavailable; failed job retains both outcomes and last line', async t => {
  const f = await serverFixture(t); const target = await f.core.publish();
  await fs.rm(path.join(f.workspace.checkout, '.git'), { recursive: true, force: true });
  const started = await f.request('POST', '/api/update'); assert.equal(started.status, 202);
  const job = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.data.id)!);
  assert.equal(job.state, 'failed'); assert.equal(f.core.head(), target);
  assert.equal((job.result as UpdateResult).repositories.length, 2);
  assert.match(job.lines.at(-1)!, /Restart required/);
  const shown = rebuildPresentation(job);
  assert.equal(shown.title, 'Update needs attention'); assert.equal(shown.succeeded, false);
  assert.match(shown.message, /Core:.*Workspace:/);
});

test('update, rebuild, status and native run exclusion guards remain effective', async t => {
  const f = await serverFixture(t), panel = f.server.panel; await f.core.publish();
  f.gate.wait = new Promise<void>(resolve => { f.gate.release = resolve; });
  t.after(() => f.gate.release());
  const started = await f.request('POST', '/api/update'); assert.equal(started.status, 202);
  while (!f.rebuilds.length) await new Promise(resolve => setTimeout(resolve, 20));
  const calls = f.calls.length;
  assert.equal((await f.request('GET', '/api/update')).data.updating, true); assert.equal(f.calls.length, calls);
  assert.equal((await f.request('POST', '/api/host/rebuild')).status, 409);
  assert.equal((await f.request('POST', '/api/update')).status, 409); assert.equal(f.calls.length, calls);
  await assert.rejects(panel.run({ id: 'demo', manifest: {} } as never, 'native'), /wait for the update to finish/);
  f.gate.release(); assert.equal((await panel.jobs.wait(panel.jobs.get(started.data.id)!)).state, 'done');
  (panel as unknown as { preparingNativeRun: boolean }).preparingNativeRun = true;
  assert.equal((await f.request('POST', '/api/update')).status, 409);
});

test('the job runner excludes all other jobs in both directions and retains long-running update step', async () => {
  for (const kind of ['web-build', 'package', 'host-rebuild', 'icon-render', 'publication', 'update'] as const) for (const reverse of [false, true]) {
    const jobs = new JobRunner(); let release!: () => void;
    const job = jobs.start(reverse ? kind : 'update', null, 'active', ctx => {
      ctx.line('step rebuild'); for (let i = 0; i < 250; i++) ctx.line(`build ${i}`);
      return new Promise<void>(resolve => { release = resolve; });
    });
    assert.throws(() => jobs.start(reverse ? 'update' : kind, null, 'conflict', async () => {}), /an update cannot overlap/);
    if (!reverse) assert.equal(jobs.list()[0]!.step, 'rebuild');
    release(); await jobs.wait(job);
  }
});

test('redaction, plugin naming and LFS progress filtering preserve meaningful output', () => {
  assert.equal(redactRemote('From https://user:secret@example.invalid/core'), 'From https://[redacted]@example.invalid/core');
  assert.deepEqual(rebuiltPluginNames([{ dir: 'foo' }, { dir: 'foo/runtime' }, { dir: 'bar/runtime' }]), ['foo', 'bar']);
  const out: string[] = [], keep = lfsProgressFilter(line => out.push(line));
  for (const line of ['LFS: 0%', 'LFS: 3%', 'LFS: 5%', 'error: download failed', 'Other: 1%']) keep(line);
  assert.deepEqual(out, ['LFS: 0%', 'LFS: 5%', 'error: download failed', 'Other: 1%']);
});

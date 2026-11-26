import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { HostRunner, type RunRequest } from '../src/host-runner.ts';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

async function fixture(t: TestContext, kill: (pid: number, force: boolean) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'host-start-cleanup-'));
  await fs.writeFile(path.join(root, 'index.html'), 'fixture');
  const script = path.join(root, 'host.mjs');
  await fs.writeFile(script, "console.log('@channel ws://127.0.0.1:1/'); setInterval(() => {}, 1000);");
  const runner = new HostRunner(async () => [], kill);
  runner.checkAcquisitionHost = async () => {};
  const children = new Map<ChildProcess, Promise<void>>();
  runner.on('state', () => {
    const child = (runner as any).host as ChildProcess | null;
    if (child && !children.has(child)) children.set(child, new Promise(resolve => child.once('close', () => resolve())));
  });
  t.after(async () => {
    for (const [child, closed] of children) {
      if (child.pid && child.exitCode === null && child.signalCode === null) process.kill(child.pid);
      await closed;
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const req: RunRequest = { projectId: 'fixture', mode: 'built', hostExe: process.execPath, hostArgs: [script],
    projectDir: root, entryDir: root, handPolicy: 'native', acquisitionHelper: 'fake-helper.exe' };
  return { runner, req, children };
}

for (const failure of ['handoff', 'reservation close']) {
  test(`${failure} failure after spawn stays busy until the designated child closes`, { timeout: 10000 }, async t => {
    const killRequested = deferred<number>();
    const { runner, req, children } = await fixture(t, async pid => { killRequested.resolve(pid); });
    const error = new Error(`${failure} failed`);
    let closes = 0;
    runner.reserveAcquisition = async () => ({ ticket: 'fake-ticket',
      handoff: async () => { if (failure === 'handoff') throw error; },
      close: async () => { closes++; if (failure === 'reservation close') throw error; } });
    let settled = false;
    const rejected = assert.rejects(runner.start(req).finally(() => { settled = true; }), error);
    const pid = await killRequested.promise;
    assert.equal(runner.busy, true);
    assert.equal(runner.state().phase, 'stopping');
    assert.equal(runner.state().pid, pid);
    assert.equal(settled, false, 'a stop request alone is not exit verification');
    process.kill(pid, 0);
    await assert.rejects(runner.start(req), /already running/);
    await assert.rejects(runner.startPreview(req, 'built', async () => { throw new Error('must not launch'); }), /already running/);
    process.kill(pid);
    await rejected;
    await Promise.all(children.values());
    assert.equal(runner.busy, false);
    assert.equal(runner.state().pid, null);
    assert.equal(runner.state().channelUrl, null);
    assert.equal(runner.state().devUrl, null);
    assert.equal(runner.state().warning, error.message);
    assert.equal(closes, 1);
  });
}

test('handoff failure shares forced-stop fallback and concurrent Stop joins the same child', { timeout: 10000 }, async t => {
  const killRequested = deferred();
  const kills: boolean[] = [];
  const { runner, req } = await fixture(t, async (pid, force) => {
    kills.push(force);
    if (force) process.kill(pid); else killRequested.resolve();
  });
  runner.reserveAcquisition = async () => ({ ticket: 'fake-ticket', handoff: async () => { throw new Error('handoff failed'); }, close: async () => {} });
  const rejected = assert.rejects(runner.start(req), /handoff failed/);
  await killRequested.promise;
  await runner.stop(10);
  await rejected;
  assert.ok(kills.includes(false));
  assert.ok(kills.includes(true));
  assert.equal(runner.busy, false);
  assert.equal(runner.state().last?.forced, true);
});

test('Stop during handoff cannot publish idle until its child closes', { timeout: 10000 }, async t => {
  const handed = deferred<number>(), cancelled = deferred(), killRequested = deferred();
  const { runner, req } = await fixture(t, async () => { killRequested.resolve(); });
  runner.reserveAcquisition = async () => ({ ticket: 'fake-ticket',
    handoff: async pid => { handed.resolve(pid); await cancelled.promise; throw new Error('handoff cancelled'); },
    close: async () => { cancelled.resolve(); } });
  const rejected = assert.rejects(runner.start(req), /handoff cancelled/);
  const pid = await handed.promise;
  const stopped = runner.stop();
  await killRequested.promise;
  assert.equal(runner.busy, true);
  assert.equal(runner.state().pid, pid);
  process.kill(pid);
  await Promise.all([stopped, rejected]);
  assert.equal(runner.busy, false);
});

test('late handoff failure cannot stop or overwrite a replacement launch', { timeout: 10000 }, async t => {
  const handed = deferred<number>(), fail = deferred();
  const { runner, req, children } = await fixture(t, async () => { assert.fail('no live child from the failed launch remains'); });
  runner.reserveAcquisition = async () => ({ ticket: 'fake-ticket',
    handoff: async pid => { handed.resolve(pid); await fail.promise; throw new Error('late handoff failure'); }, close: async () => {} });
  const rejected = assert.rejects(runner.start(req), /late handoff failure/);
  process.kill(await handed.promise);
  await Promise.all(children.values());
  await runner.start({ ...req, projectId: 'replacement', handPolicy: 'off' });
  const replacement = runner.state().pid;
  fail.resolve();
  await rejected;
  assert.equal(runner.projectId, 'replacement');
  assert.equal(runner.state().pid, replacement);
  assert.equal(runner.state().phase, 'running');
  assert.equal(runner.state().warning, null);
  assert.ok(!runner.logLines().some(line => line.includes('late handoff failure')));
});

test('late reservation cancellation cannot overwrite a replacement launch', { timeout: 10000 }, async t => {
  const reserving = deferred(), release = deferred();
  const { runner, req } = await fixture(t, async () => { assert.fail('cancelled preparation spawned no host'); });
  let closes = 0;
  runner.reserveAcquisition = async () => {
    reserving.resolve(); await release.promise;
    return { ticket: 'cancelled-ticket', handoff: async () => { assert.fail('must not hand off'); }, close: async () => { closes++; } };
  };
  const rejected = assert.rejects(runner.start(req), /Native launch was cancelled/);
  await reserving.promise;
  await runner.stop();
  await runner.start({ ...req, projectId: 'replacement', handPolicy: 'off' });
  const replacement = runner.state().pid;
  release.resolve();
  await rejected;
  assert.equal(runner.projectId, 'replacement');
  assert.equal(runner.state().pid, replacement);
  assert.equal(runner.state().phase, 'running');
  assert.equal(runner.state().warning, null);
  assert.equal(closes, 1);
});

for (const failure of ['missing entry', 'dev startup', 'spawn']) {
  test(`${failure} failure releases its reservation without leaving a tracked host`, { timeout: 10000 }, async t => {
    const { runner, req } = await fixture(t, async () => { assert.fail('no live host to kill'); });
    let closes = 0;
    runner.reserveAcquisition = async () => ({ ticket: 'fake-ticket', handoff: async () => { assert.fail('must not hand off'); }, close: async () => { closes++; } });
    if (failure === 'missing entry') req.entryDir = path.join(req.entryDir, 'missing');
    if (failure === 'dev startup') {
      req.mode = 'dev';
      (runner as any).startDev = async () => { throw new Error('dev startup failed'); };
    }
    if (failure === 'spawn') req.hostExe = path.join(req.entryDir, 'missing-host.exe');
    await assert.rejects(runner.start(req), /run Build first|dev startup failed|Native host did not start/);
    assert.equal(runner.busy, false);
    assert.equal(runner.state().pid, null);
    assert.equal((runner as any).host, null);
    assert.equal(closes, 1);
  });
}

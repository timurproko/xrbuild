import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { reserveHandAcquisition } from '../src/hand-acquisition.ts';
import { HostRunner } from '../src/host-runner.ts';

const helper = process.env.XRB_TEST_ACQUISITION_HELPER, nativeChild = process.env.XRB_TEST_ACQUISITION_CHILD;
test('native reservation excludes cross-process contenders, hands off once and releases only with the actual owner', { skip: !helper || !nativeChild, timeout: 20000 }, async () => {
  const testScope = randomBytes(32).toString('hex');
  const reserve = (label: string) => reserveHandAcquisition(helper!, label, { testScope });
  let first = await reserve('Hands in another panel');
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await assert.rejects(reserve('other source/app'), /Hands in another panel.*stop it first/);
    child = spawn(nativeChild!, ['--handoff', `-test-${testScope}`], { windowsHide: true, env: { ...process.env, XRB_HAND_LEASE_TICKET: first.ticket }, stdio: ['pipe', 'pipe', 'pipe'] });
    await first.handoff(child.pid!);
    await assert.rejects(reserve('Hands'), /App designated test child.*stop it first/);
    const closed = once(child, 'close'); child.stdin!.end('stop\n');
    assert.equal((await closed)[0], 0);
    first = await reserve('new session after owner exit');
    await first.close();
    const next = await reserve('after cancellation'); await next.close();
  } finally { await first.close(); child?.kill(); }
});

test('legacy host guard refuses old hosts but allows updated input-free hosts, in an isolated OS namespace', { skip: !helper || !nativeChild, timeout: 20000 }, async () => {
  const testScope = randomBytes(32).toString('hex');
  for (const mode of ['--legacy', '--capable']) {
    const child = spawn(nativeChild!, [mode, `-test-${testScope}`], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await once(child.stdout!, 'data');
      if (mode === '--legacy') await assert.rejects(reserveHandAcquisition(helper!, 'Hands', { testScope, checkLegacyHost: true }), /older native host.*close or update/);
      else { const reservation = await reserveHandAcquisition(helper!, 'Hands', { testScope, checkLegacyHost: true }); await reservation.close(); }
    } finally { const closed = once(child, 'close'); child.stdin!.end('stop\n'); await closed; child.kill(); }
  }
});

test('missing native helper fails with Rebuild guidance rather than unprotected launch', async () => {
  await assert.rejects(reserveHandAcquisition('xrb-nonexistent-acquisition-test.exe', 'App'), /Rebuild the host/);
});

test('managed Hand reservation is acquired before starting dev/display, keeps ticket out of logs and closes on rejection', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-lease-runner-'));
  const script = path.join(root, 'fake.mjs'); await fs.writeFile(path.join(root, 'index.html'), 'test');
  await fs.writeFile(script, `if(process.env.XRB_HAND_LEASE_TICKET!=='secret-ticket')process.exitCode=9;`);
  const runner = new HostRunner(async () => [], async () => {});
  let held = false, transferred = 0, closed = 0;
  runner.reserveAcquisition = async (_exe, label) => {
    assert.match(label, /App example/); held = true;
    return { ticket: 'secret-ticket', handoff: async pid => { assert.ok(pid > 0); transferred++; }, close: async () => { held = false; closed++; } };
  };
  const exited = once(runner, 'exit');
  await runner.start({ projectId: 'example', mode: 'built', hostExe: process.execPath, entryDir: root, projectDir: root, hostArgs: [script], handPolicy: 'native', acquisitionHelper: 'checked-helper.exe' });
  assert.equal((await exited)[0], 0); assert.equal(transferred, 1); assert.equal(closed, 1); assert.equal(held, false);
  assert.ok(!runner.logLines().join('\n').includes('secret-ticket'));
  runner.reserveAcquisition = async () => { throw new Error('Hands holds hand acquisition; stop it first'); };
  let devStarted = false; (runner as any).startDev = async () => { devStarted = true; return 'http://127.0.0.1:1/'; };
  await assert.rejects(runner.start({ projectId: 'blocked', mode: 'dev', hostExe: process.execPath, entryDir: root, projectDir: root, hostArgs: [script], handPolicy: 'native', acquisitionHelper: 'helper.exe' }), /Hands.*stop it first/);
  assert.equal(devStarted, false); assert.equal(runner.state().pid, null);
  await fs.rm(root, { recursive: true, force: true });
});

test('Hand-off does not reserve native acquisition and cancellation cannot launch after delayed reservation', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-lease-cancel-'));
  await fs.writeFile(path.join(root, 'index.html'), 'test'); const script = path.join(root, 'fake.mjs'); await fs.writeFile(script, '');
  const runner = new HostRunner(async () => [], async () => {});
  runner.reserveAcquisition = async () => { throw new Error('must not reserve'); };
  const exited = once(runner, 'exit');
  await runner.start({ projectId: 'off', mode: 'built', hostExe: process.execPath, entryDir: root, projectDir: root, hostArgs: [script], handPolicy: 'off', acquisitionHelper: 'helper.exe' }); await exited;
  let release!: () => void, closed = 0;
  runner.reserveAcquisition = () => new Promise(resolve => { release = () => resolve({ ticket: 'never-spawn', handoff: async () => { assert.fail('cancelled launch must not hand off'); }, close: async () => { closed++; } }); });
  const starting = runner.start({ projectId: 'cancel', mode: 'built', hostExe: process.execPath, entryDir: root, projectDir: root, hostArgs: [script], handPolicy: 'native', acquisitionHelper: 'helper.exe' });
  await runner.stop(); release(); await assert.rejects(starting, /cancelled/);
  assert.equal(closed, 1); assert.equal(runner.state().pid, null);
  await fs.rm(root, { recursive: true, force: true });
});

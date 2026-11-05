import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { test } from 'node:test';
import { HostRunner } from '../src/host-runner.ts';

test('browser camera changes publish run state across the launcher navigation session', async () => {
  const runner = new HostRunner(async () => [], async () => {});
  assert.throws(() => runner.setPreviewView(true), /no browser preview/);
  const browser = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null });
  await runner.startPreview({ projectId: 'launcher', projectDir: '.', flat: false }, 'built', async () => browser as unknown as ChildProcess);
  const states: boolean[] = [];
  runner.on('state', (state) => states.push(state.flat));
  // Launcher goes 2D; the destination goes 3D; closing it must not restore the launcher's old 2D state.
  runner.setPreviewView(true);
  assert.equal(runner.state().flat, true);
  runner.setPreviewView(false);
  assert.equal(runner.state().flat, false);
  assert.equal(runner.state().projectId, 'launcher', 'navigation retains the managed preview session');
  runner.setPreviewView(false);
  assert.deepEqual(states, [true, false], 'listeners receive changes without duplicate events');
  browser.emit('close', 0);
  assert.equal(runner.state().phase, 'idle');
  assert.throws(() => runner.setPreviewView(true), /no browser preview/);
  assert.equal(runner.state().flat, false);
});

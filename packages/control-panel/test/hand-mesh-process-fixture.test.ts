import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import { meshFixtureDirectory, meshFixtureOutput, stopMeshFixture } from './helpers/mesh-process-fixture.ts';
function child(t: TestContext, code: string, executable = process.execPath) {
  const fixture = spawn(executable, ['-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stopMeshFixture(fixture)); return fixture;
}
test('fixture root resolves default/configured relative paths before crossing the process boundary', async t => {
  const base = await meshFixtureDirectory('mesh-path-test-'); t.after(() => fs.rm(base, { recursive: true, force: true }));
  const relative = path.relative(process.cwd(), base);
  const root = await meshFixtureDirectory('relative-', relative);
  assert.equal(path.isAbsolute(root), true); assert.equal(path.dirname(root), path.resolve(base));
  const absolute = await meshFixtureDirectory('absolute-', base);
  assert.equal(path.isAbsolute(absolute), true); assert.equal(path.dirname(absolute), path.resolve(base));
});
test('fixture output waits for a complete fragmented line and releases its startup listeners', async t => {
  const fixture = child(t, `process.stdout.write('{"ok":'); setTimeout(()=>process.stdout.write('true}\\n'),20);`);
  assert.deepEqual(JSON.parse((await meshFixtureOutput(fixture)).toString()), { ok: true });
  assert.equal(fixture.stdout.listenerCount('data'), 0); assert.equal(fixture.listenerCount('error'), 0);
});
test('an owner exiting without metadata rejects instead of leaving the test pending', async t => {
  const fixture = child(t, `process.stderr.write('deliberate startup failure'); process.exit(7);`);
  await assert.rejects(meshFixtureOutput(fixture), /Fixture (stdout ended|exited) before expected output/);
  assert.equal(fixture.stdout.listenerCount('data'), 0);
  await stopMeshFixture(fixture); assert.ok(fixture.exitCode !== null || fixture.signalCode !== null);
});
test('EOF without a process-exit event rejects and removes the startup listeners', async () => {
  const stdout = new PassThrough(), stderr = new PassThrough();
  const fixture = Object.assign(new EventEmitter(), { stdout, stderr, exitCode: null, signalCode: null }) as unknown as ChildProcess;
  try {
    const rejected = assert.rejects(meshFixtureOutput(fixture), /stdout ended before expected output/);
    stdout.end(); await rejected;
    assert.equal(fixture.exitCode, null); assert.equal(fixture.listenerCount('close'), 0); assert.equal(stdout.listenerCount('data'), 0);
  } finally { stdout.destroy(); stderr.destroy(); }
});
test('spawn failure rejects and closes pipes without a startup timer keeping the test alive', async t => {
  const fixture = child(t, '', process.execPath + '.missing-fixture');
  await assert.rejects(meshFixtureOutput(fixture), /Fixture (error|stdout|has no)/);
  await stopMeshFixture(fixture); assert.equal(fixture.stdout.destroyed, true);
});
test('a silent fixture hits its local output bound and is explicitly terminated and joined', async t => {
  const fixture = child(t, `setInterval(()=>{},1000);`);
  await assert.rejects(meshFixtureOutput(fixture, { timeoutMs: 100 }), /startup output timed out/);
  await stopMeshFixture(fixture); assert.ok(fixture.exitCode !== null || fixture.signalCode !== null);
});
test('oversized fixture output fails with bounded buffering and explicit cleanup', async t => {
  const fixture = child(t, `process.stdout.write('x'.repeat(5000)); setInterval(()=>{},1000);`);
  await assert.rejects(meshFixtureOutput(fixture), /output exceeded bound/); await stopMeshFixture(fixture);
});

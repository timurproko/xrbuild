import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { LineSplitter } from '../src/jobs.ts';

const worker = process.env.XRB_TEST_PROVIDER_WORKER, dll = process.env.XRB_TEST_PROVIDER_DLL;
async function start(runtimeName: string, config: object, pluginPath?: string, testOptions: object = {}) {
  const child = spawn(worker!, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const events: any[] = [], updates = new EventEmitter(); let closed = false, error: Error | null = null;
  const lines = new LineSplitter(line => {
    if (line.startsWith('@provider ')) { events.push(JSON.parse(line.slice(10))); updates.emit('event'); }
  });
  child.stdout.setEncoding('utf8').on('data', data => lines.push(data)); child.stderr.resume();
  child.on('error', value => { error = value; updates.emit('event'); });
  child.on('close', () => { closed = true; lines.flush(); updates.emit('event'); });
  child.stdin.on('error', () => {});
  child.stdin.write(JSON.stringify({ version: 1, parentPid: process.pid, runtimeName, pluginPath, config, testScope: randomBytes(32).toString('hex'), token: randomBytes(32).toString('hex'), epoch: randomBytes(32).toString('hex'), origin: 'http://127.0.0.1:33333', ...testOptions }) + '\n');
  async function waitFor(check: (event: any) => boolean) {
    const deadline = Date.now() + 8000;
    while (!events.some(check)) {
      if (closed || error) throw error ?? new Error(`Worker exited: ${JSON.stringify(events)}`);
      if (Date.now() > deadline) throw new Error(`Worker timed out: ${JSON.stringify(events)}`);
      await new Promise<void>(resolve => { const timer = setTimeout(() => { updates.removeListener('event', changed); resolve(); }, 100); const changed = () => { clearTimeout(timer); resolve(); }; updates.once('event', changed); });
    }
    return events.find(check);
  }
  async function stop() {
    if (closed) return;
    const exit = once(child, 'close'); child.stdin.end('{"stop":true}\n');
    const timer = setTimeout(() => child.kill(), 7000);
    try { await exit; } finally { clearTimeout(timer); }
  }
  return { child, events, waitFor, stop };
}
test('bad or oversized bootstrap exits before provider startup', { skip: !worker, timeout: 10000 }, async () => {
  for (const bootstrap of ['not-json\n', '{}\n', 'x'.repeat(16385) + '\n']) {
    const child = spawn(worker!, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.resume(); child.stderr.resume(); child.stdin.on('error', () => {});
    const exit = once(child, 'close'); child.stdin.end(bootstrap);
    assert.equal((await exit)[0], 2);
  }
});

test('headless worker loads a test-built ABI DLL, copies its frame and shuts down without display/CEF', { skip: !worker || !dll, timeout: 15000 }, async () => {
  const session = await start('session-test', {}, path.resolve(dll!));
  try {
    const running = await session.waitFor(event => event.phase === 'running' && event.sequence > 0);
    assert.equal(running.hands, 1); assert.ok(running.publicationTimeMs >= running.captureTimeMs);
    await session.stop(); assert.equal(session.events.at(-1).phase, 'stopped');
  } finally { await session.stop(); }
});
test('worker preserves create/start failure reasons and never substitutes synthetic input', { skip: !worker || !dll, timeout: 20000 }, async () => {
  for (const deferControlReader of [false, true]) for (const config of [{ failCreate: true }, { failStart: true }]) {
    const session = await start('session-test', config, path.resolve(dll!), { deferControlReader });
    try {
      const failed = await session.waitFor(event => event.phase === 'failed');
      assert.match(failed.reason, config.failCreate ? /create failed on request/ : /test failure on request/);
      assert.equal(session.events.some(event => event.phase === 'running'), false);
      await session.stop(); assert.equal(session.child.exitCode, 4);
    } finally { await session.stop(); }
  }
});
test('empty detections remain empty and malformed frames fail rather than becoming generated hands', { skip: !worker || !dll, timeout: 15000 }, async () => {
  const empty = await start('session-test', { empty: true }, path.resolve(dll!));
  try { const event = await empty.waitFor(value => value.phase === 'running' && value.sequence > 0); assert.equal(event.hands, 0); } finally { await empty.stop(); }
  const bad = await start('session-test', { malformed: true }, path.resolve(dll!), { invalidWindowMs: 200 });
  try { assert.match((await bad.waitFor(value => value.phase === 'failed')).reason, /Persistently malformed.*Rejected frame-header; joint n\/a; count/); assert.equal(bad.events.some(value => value.sequence > 0), false); } finally { await bad.stop(); }
});

test('worker contains hung startup, stop and destruction with a bounded test-clock watchdog', { skip: !worker || !dll, timeout: 15000 }, async () => {
  for (const field of ['hangStart', 'hangStop', 'hangDestroy']) {
    const session = await start('session-test', { [field]: true }, path.resolve(dll!), { startTimeoutMs: 200, stopTimeoutMs: 200 });
    try {
      const exited = once(session.child, 'close');
      if (field !== 'hangStart') { await session.waitFor(value => value.phase === 'running'); session.child.stdin.end('{"stop":true}\n'); }
      const limit = setTimeout(() => session.child.kill(), 5000);
      try { assert.equal((await exited)[0], 4); } finally { clearTimeout(limit); }
    } finally { await session.stop(); }
  }
});

for (const kind of ['invalidConfidence', 'nanJoint']) test(`recent malformed ${kind} rate fails with a safe visible diagnostic, while healthy frames reset it`, { skip: !worker || !dll, timeout: 15000 }, async () => {
  const broken = await start('session-test', { [kind]: true }, path.resolve(dll!), { invalidWindowMs: 200 });
  try {
    const failed = await broken.waitFor(e => e.phase === 'failed');
    assert.match(failed.reason, /Persistently malformed.*Rejected (confidence-range|joint-nonfinite); joint 8; count \d+/);
    assert.match(failed.diagnostic, /joint 8; count/);
  } finally { await broken.stop(); }
  for (const recovery of [{ sporadic: true }, { mixed: true }]) {
    const healthy = await start('session-test', { [kind]: true, ...recovery }, path.resolve(dll!), { invalidWindowMs: 200 });
    try {
      await healthy.waitFor(e => e.sequence > 0);
      await new Promise(r => setTimeout(r, 650));
      assert.equal(healthy.events.some(e => e.phase === 'failed'), false, 'healthy output resets rate; intact peers remain usable');
      await healthy.stop(); assert.equal(healthy.events.at(-1).phase, 'stopped');
      assert.match(healthy.events.at(-1).diagnostic, /joint 8; count/);
    } finally { await healthy.stop(); }
  }
});

test('existing explicitly selected synthetic source runs through the same headless ABI lifecycle', { skip: !worker, timeout: 15000 }, async () => {
  const session = await start('simulated', { hands: 2, rateHz: 30 });
  try { const running = await session.waitFor(event => event.phase === 'running' && event.sequence > 0); assert.equal(running.hands, 2); }
  finally { await session.stop(); }
  assert.equal(session.events.at(-1).phase, 'stopped');
});

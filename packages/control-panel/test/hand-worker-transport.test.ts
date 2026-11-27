import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { LineSplitter } from '../src/jobs.ts';
const worker = process.env.XRB_TEST_PROVIDER_WORKER, supervisor = process.env.XRB_TEST_PROVIDER_SUPERVISOR;
const origin = 'http://127.0.0.1:33333';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(supervised = false, input: object = {}) {
  const token = randomBytes(32).toString('hex'), epoch = randomBytes(32).toString('hex');
  const child = spawn(supervised ? supervisor! : worker!, supervised ? [worker!, String(process.pid)] : [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let url = '', workerPid = 0, workerBirth = '', ended = false; const stdout: string[] = [];
  child.once('close', () => { ended = true; });
  child.stdout.setEncoding('utf8').on('data', data => lines.push(data)); child.stderr.resume(); child.stdin.on('error', () => {});
  const lines = new LineSplitter(line => { stdout.push(line); if (line.startsWith('@provider ')) { const message = JSON.parse(line.slice(10)); if (message.phase === 'spawned') workerBirth = message.birth; if (message.url) { url = message.url; workerPid = message.pid; } } });
  child.stdin.write(JSON.stringify({ version: 1, runtimeName: 'simulated', config: { hands: 2, rateHz: 120 }, parentPid: process.pid, testScope: randomBytes(32).toString('hex'), token, epoch, origin, ...input }) + '\n');
  const until = Date.now() + 5000;
  while (!url) { if (Date.now() > until || child.exitCode !== null) throw new Error(stdout.join('\n')); await delay(10); }
  return { child, token, epoch, url, workerPid, workerBirth, stdout, async close() { if (ended) return; const exited = once(child, 'close'); child.stdin.end('{"stop":true}\n'); const timer = setTimeout(() => child.kill(), 7000); try { await exited; } finally { clearTimeout(timer); } } };
}
function masked(payload: Uint8Array) {
  assert.ok(payload.length < 126); const mask = randomBytes(4), out = Buffer.alloc(payload.length + 6);
  out[0] = 0x82; out[1] = 0x80 | payload.length; mask.copy(out, 2);
  for (let i = 0; i < payload.length; i++) out[i + 6] = payload[i] ^ mask[i % 4]; return out;
}
async function connect(url: string, peerOrigin = origin) {
  const endpoint = new URL(url), socket = net.connect(Number(endpoint.port), '127.0.0.1');
  let buffer = Buffer.alloc(0), response = '', upgraded = false, closed = false;
  const packets: Buffer[] = [];
  socket.on('error', () => {}); socket.on('close', () => { closed = true; });
  socket.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    if (!upgraded) { const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return; response = buffer.subarray(0, end).toString(); buffer = buffer.subarray(end + 4); upgraded = true; }
    while (buffer.length >= 2) {
      let size = buffer[1] & 127, offset = 2;
      if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); offset = 4; }
      else if (size === 127) { if (buffer.length < 10) return; size = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (buffer.length < offset + size) return;
      packets.push(buffer.subarray(offset, offset + size)); buffer = buffer.subarray(offset + size);
    }
  });
  await once(socket, 'connect');
  socket.write(`GET /hands HTTP/1.1\r\nHost: 127.0.0.1:${endpoint.port}\r\nOrigin: ${peerOrigin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`);
  const deadline = Date.now() + 3000;
  while (!response) { if (Date.now() > deadline) throw new Error('No socket upgrade response'); await delay(10); }
  return { socket, packets, response, get closed() { return closed; }, send: (payload: Uint8Array) => socket.write(masked(payload)), async next() {
    const limit = Date.now() + 3000;
    while (!packets.length) { if (closed || Date.now() > limit) throw new Error('No authenticated packet'); await delay(10); }
    return packets.shift()!;
  } };
}
test('supervised explicit Stop returns only after its worker has exited and the socket closes', { skip: !worker || !supervisor, timeout: 15000 }, async () => {
  const f = await fixture(true), peer = await connect(f.url);
  try {
    peer.send(Buffer.from(f.token)); await peer.next(); await f.close();
    assert.throws(() => process.kill(f.workerPid, 0), (error: any) => error.code === 'ESRCH');
    for (let i = 0; i < 100 && !peer.closed; i++) await delay(10);
    assert.equal(peer.closed, true);
  } finally { peer.socket.destroy(); await f.close(); }
});

test('native supervisor contains the worker at birth and launcher death leaves no live child or socket', { skip: !worker || !supervisor, timeout: 15000 }, async () => {
  const f = await fixture(true), peer = await connect(f.url);
  try {
    peer.send(Buffer.from(f.token)); await peer.next();
    assert.notEqual(f.workerPid, f.child.pid);
    const exited = once(f.child, 'close'); f.child.kill(); await exited;
    let alive = true;
    for (let i = 0; i < 100; i++) {
      try { process.kill(f.workerPid, 0); } catch (error: any) { if (error.code === 'ESRCH') { alive = false; break; } throw error; }
      await delay(20);
    }
    assert.equal(alive, false, 'job-owned worker must be dead, not merely disconnected');
    for (let i = 0; i < 100 && !peer.closed; i++) await delay(10);
    assert.equal(peer.closed, true);
  } finally { peer.socket.destroy(); await f.close(); }
});

test('actual panel-process death closes the supervisor job and its worker', { skip: !worker || !supervisor, timeout: 15000 }, async () => {
  const code = `const {spawn}=require('node:child_process'); process.stdin.once('data',data=>{const b=JSON.parse(data);const p=spawn(b.supervisor,[b.worker,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','ignore']});process.stdout.write('@launcher '+p.pid+'\\n');p.stdout.pipe(process.stdout);delete b.supervisor;delete b.worker;b.parentPid=process.pid;p.stdin.write(JSON.stringify(b)+'\\n');});setInterval(()=>{},1000);`;
  const panel = spawn(process.execPath, ['-e', code], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let launcher = 0, pid = 0;
  const lines = new LineSplitter(line => { if (line.startsWith('@launcher ')) launcher = Number(line.slice(10)); if (line.startsWith('@provider ')) { const event = JSON.parse(line.slice(10)); if (event.url) pid = event.pid; } });
  panel.stdout.setEncoding('utf8').on('data', text => lines.push(text));
  panel.stdin.end(JSON.stringify({ worker, supervisor, version: 1, runtimeName: 'simulated', config: {}, testScope: randomBytes(32).toString('hex'), token: randomBytes(32).toString('hex'), epoch: randomBytes(32).toString('hex'), origin }));
  try {
    const until = Date.now() + 5000; while (!pid && Date.now() < until) await delay(10); assert.ok(pid); assert.ok(launcher);
    const gone = once(panel, 'close'); panel.kill(); await gone;
    for (const child of [pid, launcher]) {
      let dead = false; for (let i = 0; i < 150; i++) { try { process.kill(child, 0); } catch (e: any) { if (e.code === 'ESRCH') { dead = true; break; } throw e; } await delay(20); }
      assert.equal(dead, true, `owned child ${child} must not outlive its panel process`);
    }
  } finally { if (panel.exitCode === null && panel.signalCode === null) panel.kill(); }
});

test('supervisor joins hung owned-provider teardown before releasing the isolated acquisition slot', { skip: !worker || !supervisor || !process.env.XRB_TEST_PROVIDER_DLL, timeout: 20000 }, async () => {
  const testScope = randomBytes(32).toString('hex');
  const f = await fixture(true, { testScope, runtimeName: 'session-test', pluginPath: path.resolve(process.env.XRB_TEST_PROVIDER_DLL!), config: { testHold: true, hangStop: true }, stopTimeoutMs: 200, partialOnStop: true });
  try {
    await f.close();
    assert.ok(f.stdout.some(line => line.includes('"phase":"joined"')), 'exact-handle completion receipt follows forced watchdog termination');
    assert.equal(f.stdout.some(line => line.includes('"partial"')), false, 'a truncated worker JSON tail cannot corrupt the supervisor completion receipt');
    assert.throws(() => process.kill(f.workerPid, 0), (e: any) => e.code === 'ESRCH');
    const next = await fixture(true, { testScope }); try { assert.ok(next.workerPid); } finally { await next.close(); }
  } finally { await f.close(); }
});

test('read-only reaper distinguishes creation identity, never kills a reused PID, and joins the designated worker', { skip: !worker || !supervisor, timeout: 15000 }, async () => {
  const f = await fixture(true); let probe: ReturnType<typeof spawn> | undefined;
  try {
    assert.match(f.workerBirth, /^\d+$/);
    probe = spawn(supervisor!, ['--join', String(f.workerPid), '1'], { windowsHide: true, stdio: 'ignore' });
    assert.equal((await once(probe, 'close'))[0], 0, 'mismatched creation identity means the old designated process is gone');
    assert.doesNotThrow(() => process.kill(f.workerPid, 0), 'the different live identity is read-only, never killed');
    probe = spawn(supervisor!, ['--join', String(f.workerPid), f.workerBirth], { windowsHide: true, stdio: 'ignore' });
    const joined = once(probe, 'close'); await delay(50); assert.equal(probe.exitCode, null);
    await f.close(); assert.equal((await joined)[0], 0, 'exact process wait ends only after designated worker death');
  } finally { if (probe && probe.exitCode === null) probe.kill(); await f.close(); }
});

test('supervisor forces and joins a worker that never reads Stop', { skip: !worker || !supervisor, timeout: 15000 }, async () => {
  const f = await fixture(true, { deferControlReader: true }), peer = await connect(f.url);
  try {
    peer.send(Buffer.from(f.token)); await peer.next();
    await f.close();
    assert.ok(f.stdout.some(line => line.includes('"phase":"joined"')));
    assert.throws(() => process.kill(f.workerPid, 0), (e: any) => e.code === 'ESRCH');
  } finally { peer.socket.destroy(); await f.close(); }
});

test('headless socket requires exact Origin and first-message capability and never leaks credentials in URL/logs', { skip: !worker, timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    assert.equal(new URL(f.url).search, ''); assert.equal(f.stdout.join('\n').includes(f.token), false);
    const foreign = await connect(f.url, 'https://foreign.invalid');
    try { assert.match(foreign.response, /403 Forbidden/); assert.equal(foreign.packets.length, 0); } finally { foreign.socket.destroy(); }
    const wrong = await connect(f.url);
    try { assert.match(wrong.response, /101 Switching/); wrong.send(Buffer.from('0'.repeat(64))); for (let i = 0; i < 100 && !wrong.closed; ++i) await delay(10); assert.equal(wrong.closed, true); assert.equal(wrong.packets.length, 0); }
    finally { wrong.socket.destroy(); }
  } finally { await f.close(); }
});
test('filtered and intact observations share one consumption credit and newest pending slot', { skip: !worker || !process.env.XRB_TEST_PROVIDER_DLL, timeout: 15000 }, async () => {
  const f = await fixture(false, { runtimeName: 'session-test', pluginPath: path.resolve(process.env.XRB_TEST_PROVIDER_DLL!), config: { invalidConfidence: true, sporadic: true, alternateBlocks: true } });
  const peer = await connect(f.url);
  try {
    peer.send(Buffer.from(f.token)); let packet = await peer.next(); const kinds = new Set<number>();
    // Blocks outlast consumption cadence, avoiding phase-lock aliasing against single bad callbacks.
    for (let i = 0; i < 24; i++) {
      kinds.add(packet[0]); assert.ok([21, 23].includes(packet[0]));
      await delay(30); assert.equal(peer.packets.length, 0, 'no second observation before consumption, even across kinds');
      const ack = Buffer.alloc(5); ack[0] = 110; ack.writeUInt32LE(packet.readUInt32LE(4), 1); peer.send(ack); packet = await peer.next();
    }
    assert.ok(kinds.has(23), 'marked filtered observation actually transported');
    assert.ok(kinds.has(21), 'healthy observations actually recover');
  } finally { peer.socket.destroy(); await f.close(); }
});

test('one in-flight frame plus newest pending survives a slow receiver, retains raw packets/epochs and answers clock mapping', { skip: !worker, timeout: 15000 }, async () => {
  const f = await fixture(); const peer = await connect(f.url);
  try {
    peer.send(Buffer.from(f.token)); const first = await peer.next();
    assert.equal(first[0], 21); assert.equal(first.subarray(16, 80).toString(), f.epoch);
    const sequence = Number(first.readBigUInt64LE(80));
    assert.equal(first[88], 2); assert.equal(first[89], 2, 'unchanged native HANDS v2 packet');
    assert.equal(first[116], 2, 'both published hands are retained');
    await delay(250); assert.equal(peer.packets.length, 0, 'no producer-speed FIFO enters the receiving socket before consumption ACK');
    const ack = Buffer.alloc(5); ack[0] = 110; ack.writeUInt32LE(first.readUInt32LE(4), 1); peer.send(ack);
    const newest = await peer.next(); assert.ok(Number(newest.readBigUInt64LE(80)) > sequence + 1, 'superseded source frames were dropped');
    const ping = Buffer.alloc(9); ping[0] = 111; ping.writeDoubleLE(1234, 1); peer.send(ping);
    const clocks = await peer.next(); assert.equal(clocks[0], 22); assert.equal(clocks.readDoubleLE(16), 1234); assert.ok(clocks.readDoubleLE(32) >= clocks.readDoubleLE(24));
  } finally { peer.socket.destroy(); await f.close(); }
});

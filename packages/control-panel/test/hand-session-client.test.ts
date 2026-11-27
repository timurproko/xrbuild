import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMessage } from '../../sdk/src/protocol.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { createHandsSession } from '../ui/hands-session.js';
const epoch = 'a'.repeat(64), sessionId = '12345678-1234-1234-1234-123456789abc';
function envelope(sequence = 1, count = 0) {
  const data = new ArrayBuffer(120 + count * 456), v = new DataView(data); v.setUint8(0, 21); v.setUint8(1, 2); v.setUint32(4, sequence + 10, true); v.setFloat64(8, 1103, true);
  new Uint8Array(data, 16, 64).set(new TextEncoder().encode(epoch)); v.setBigUint64(80, BigInt(sequence), true);
  v.setUint8(88, 2); v.setUint8(89, 2); v.setUint32(92, sequence, true); v.setFloat64(96, 1102, true); v.setFloat64(104, 1101, true); v.setFloat32(112, 120, true); v.setUint8(116, count); return data;
}
test('owning client gates frames on profile/clock, ACKs only consumption, counts source fps and clears stale/retired input', async () => {
  let now = 100, callback: (() => void) | null = null, socket: any, clears = 0, pushes = 0, held = false;
  const statuses: any[] = [], calls: any[] = [], sent: Uint8Array[] = [], samples: any[] = [];
  const view = { profile: handProfile(), active: false, replaying: false, async setProfile(p: any) { this.profile = p; return true; }, beginSession() { this.active = true; return true; }, pushFrame() { pushes++; held = true; return true; }, clearHands() { clears++; held = false; }, clearSession() { clears++; held = false; this.active = false; } };
  class Socket { readyState = 1; constructor() { socket = this; } send(data: ArrayBuffer | Uint8Array) { sent.push(new Uint8Array(data)); } close() {} }
  const profile = { version: 1, runId: sessionId, sequence: 0, revision: 'b'.repeat(64), profile: handProfile() };
  const fetcher = async (url: string, options: any) => {
    calls.push({ url, options }); const action = url.split('/session')[1];
    const value = action === '/bootstrap' ? { capability: 'c'.repeat(64) } : action ? { owns: true, sessionId, phase: 'running' } : { owns: true, sessionId, phase: 'running', epoch, source: { owner: 'core', id: 'simulated' }, url: 'ws://127.0.0.1:2222/hands', observer: 'd'.repeat(64), profile };
    return { ok: true, json: async () => value };
  };
  const client = createHandsSession({ view, decode: decodeMessage, Socket, fetcher, now: () => now, frame: (fn: any) => { callback = fn; return 1; }, cancel: () => {}, onStatus: (s: any) => statuses.push(s) });
  client.subscribeRawFrames((sample: any) => { samples.push(sample); sample.packet[0] = 99; });
  try {
    await client.start({ provider: { owner: 'core', id: 'simulated' }, revision: 'r', registryRevision: 'g' });
    socket.onopen(); assert.equal(sent[0].length, 64); assert.equal(sent[1][0], 111);
    socket.onmessage({ data: envelope() }); callback!(); assert.equal(pushes, 0); assert.equal(sent.filter(p => p[0] === 110).length, 0);
    now = 102; const clock = new ArrayBuffer(40), v = new DataView(clock); v.setUint8(0, 22); v.setUint8(1, 2); v.setFloat64(8, 1102, true); v.setFloat64(16, 100, true); v.setFloat64(24, 1100, true); v.setFloat64(32, 1100, true); socket.onmessage({ data: clock });
    now = 104; callback!(); assert.equal(pushes, 1); assert.equal(sent.at(-1)![0], 110); assert.equal(samples.length, 1); assert.equal(samples[0].frame.hands.length, 0);
    for (let i = 0; i < 40; i++) callback!();
    assert.equal(statuses.at(-1).trackingFps, 1, 'neither renders nor declared 120 Hz count as captured frames'); assert.equal(statuses.at(-1).phase, 'no-hands');
    assert.equal(client.recordingSource()!.globalAdjustmentsApplied, false);
    const filtered = envelope(2); new DataView(filtered).setUint8(0, 23); socket.onmessage({ data: filtered }); callback!();
    assert.equal(pushes, 2); assert.equal(samples.length, 1, 'filtered observation cannot impersonate unchanged raw recording');
    assert.equal(statuses.at(-1).trackingFps, null, 'diagnostic-only clearing has no invented detection fps');
    const peer = envelope(3, 1); new DataView(peer).setUint8(0, 23); socket.onmessage({ data: peer }); callback!();
    assert.equal(statuses.at(-1).trackingFps, 2, 'intact admitted peer results have an actual observed rate');
    assert.equal(samples.length, 1, 'partial packet still cannot masquerade as original whole-callback recording');
    now = 400; callback!(); assert.equal(held, false); assert.equal(statuses.at(-1).phase, 'stalled'); assert.equal(statuses.at(-1).trackingFps, null);
    for (let seq = 3; seq <= 6; seq++) { socket.onmessage({ data: envelope(seq) }); callback!(); }
    assert.equal(client.active, true, 'several stale observations do not prematurely fail the session');
    const fresh = envelope(7); const freshView = new DataView(fresh); freshView.setFloat64(96, 1399, true); freshView.setFloat64(104, 1398, true);
    socket.onmessage({ data: fresh }); callback!(); assert.equal(statuses.at(-1).phase, 'no-hands', 'fresh input recovers Stalled automatically');
    now = 10500; callback!(); await new Promise(r => setTimeout(r, 10));
    assert.equal(client.active, false); assert.equal(client.stopping, false); assert.match(statuses.at(-1).reason, /Tracking stalled/);
    const terminal: boolean[] = []; client.subscribeLifecycle((s: any) => { if (['failed', 'stopped'].includes(s.phase)) terminal.push(client.stopping); });
    await client.start({ provider: { owner: 'core', id: 'simulated' }, revision: 'r', registryRevision: 'g' });
    await client.stop(); assert.deepEqual(terminal, [false], 'terminal notification follows local retired-context cleanup'); assert.equal(view.active, false); const before = pushes; socket.onmessage({ data: envelope(2) }); callback!(); assert.equal(pushes, before); assert.ok(clears > 0);
    assert.ok(calls.some(c => c.url.endsWith('/ack'))); assert.ok(calls.every(c => !c.url.includes('?')));
  } finally { client.dispose(); }
});

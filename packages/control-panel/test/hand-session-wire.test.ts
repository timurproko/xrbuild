import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMessage } from '../../sdk/src/protocol.ts';
import { providerPacket, sessionPacket, createSessionClock } from '../ui/hands-session-wire.js';
function packet(count = 0) { const data = new Uint8Array(32 + count * 456), v = new DataView(data.buffer); v.setUint8(0, 2); v.setUint8(1, 2); v.setUint32(4, 1, true); v.setFloat64(8, 1010, true); v.setFloat64(16, 1000, true); v.setFloat32(24, 120, true); v.setUint8(28, count); v.setUint8(29, 7); return data; }
test('raw packet validation preserves empty/all-255 hands and rejects normalization, duplicates, invalid fields and lengths', () => {
  const empty = packet(); assert.equal(providerPacket(empty, decodeMessage).hands.length, 0);
  const all = packet(255), v = new DataView(all.buffer); for (let i = 0; i < 255; i++) v.setInt32(32 + i * 456, i, true);
  assert.equal(providerPacket(all, decodeMessage).hands.length, 255);
  for (const mutate of [(p: Uint8Array) => p[37] = 2, (p: Uint8Array) => p[38] = 2, (p: Uint8Array) => p[36] = 9, (p: Uint8Array) => new DataView(p.buffer).setFloat32(44, NaN, true), (p: Uint8Array) => new DataView(p.buffer).setFloat32(56, 2, true), (p: Uint8Array) => p[29] = 128]) {
    const p = packet(1); mutate(p); assert.throws(() => providerPacket(p, decodeMessage));
  }
  assert.throws(() => providerPacket(packet(2), decodeMessage)); assert.throws(() => providerPacket(empty.slice(0, 31), decodeMessage));
  const env = new Uint8Array(88 + empty.length), e = new DataView(env.buffer); e.setUint8(0, 21); e.setUint8(1, 2); e.setFloat64(8, 1011, true); env.set(new TextEncoder().encode('a'.repeat(64)), 16); e.setBigUint64(80, 1n, true); env.set(empty, 88);
  assert.deepEqual(sessionPacket(env.buffer, 'a'.repeat(64), decodeMessage).packet, empty);
  assert.throws(() => sessionPacket(env.buffer, 'b'.repeat(64), decodeMessage), /epoch/);
  e.setBigUint64(80, 2n ** 54n, true); assert.throws(() => sessionPacket(env.buffer, 'a'.repeat(64), decodeMessage), /sequence/);
});
test('four-timestamp clock admission excludes stale/future/duplicate, detects backwards time and mapping discontinuity', () => {
  let now = 100; const c = createSessionClock({ now: () => now });
  assert.equal(c.admit({ sequence: 1, frame: { captureTimeMs: 1090 } }), null);
  assert.equal(c.sample([90, 1091, 1092], 93), true); now = 110;
  assert.equal(c.mapping.offset, 1000); assert.equal(c.mapping.uncertainty, 1);
  assert.equal(c.admit({ sequence: 1, frame: { captureTimeMs: 1100 } }), 100);
  assert.equal(c.admit({ sequence: 1, frame: { captureTimeMs: 1100 } }), null);
  assert.throws(() => c.admit({ sequence: 2, frame: { captureTimeMs: 1099 } }), /backwards/);
  assert.equal(c.admit({ sequence: 3, frame: { captureTimeMs: 1200 } }), null);
  now = 500; assert.equal(c.admit({ sequence: 4, frame: { captureTimeMs: 1201 } }), null);
  now = 12000; assert.equal(c.mapping, null);
  assert.throws(() => c.sample([12000, 15000, 15000], 12000), /mapping changed/);
  const uncertain = createSessionClock({ now: () => 200 }); assert.equal(uncertain.sample([0, 1000, 1000], 200), false); assert.equal(uncertain.mapping, null);
});

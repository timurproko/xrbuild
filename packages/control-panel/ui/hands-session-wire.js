import { validHandFrame } from './hands-stream.js';
export const SESSION_BOUNDS = Object.freeze({ bytes: 128 * 1024, age: 250, future: 50, uncertainty: 50 });
/** Check raw flags before the general SDK decoder can normalize them. */
export function providerPacket(packet, decode) {
  if (!(packet instanceof Uint8Array) || packet.byteLength < 32 || packet.byteLength > SESSION_BOUNDS.bytes) throw new Error('Invalid provider packet size');
  const v = new DataView(packet.buffer, packet.byteOffset, packet.byteLength), count = v.getUint8(28);
  if (v.getUint8(0) !== 2 || v.getUint8(1) !== 2 || v.getUint16(2, true) || packet.length !== 32 + count * 456 || v.getUint8(29) & ~7) throw new Error('Invalid HANDS v2 layout');
  for (let i = 0; i < count; i++) { const b = 32 + i * 456; if (![-1, 0, 1].includes(v.getInt8(b + 4)) || v.getUint8(b + 5) > 1 || [6, 7, 8, 9].some(n => v.getUint8(b + n) > 1)) throw new Error('Invalid provider hand signals'); }
  const frame = decode(packet.slice().buffer);
  if (!validHandFrame(frame) || frame.captureTimeMs < 0 || frame.hostTimeMs < frame.captureTimeMs) throw new Error('Invalid provider frame');
  return frame;
}
export function sessionPacket(buffer, epoch, decode) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16 || buffer.byteLength > SESSION_BOUNDS.bytes) throw new Error('Invalid session envelope');
  const v = new DataView(buffer);
  if (v.getUint8(1) !== 2 || v.getUint16(2, true) || !Number.isFinite(v.getFloat64(8, true)) || v.getFloat64(8, true) < 0) throw new Error('Invalid session header');
  if (v.getUint8(0) === 22) { if (buffer.byteLength !== 40) throw new Error('Invalid clock reply'); return { type: 'clock', clocks: [16, 24, 32].map(n => v.getFloat64(n, true)) }; }
  if (v.getUint8(0) !== 21 || buffer.byteLength < 120 || new TextDecoder().decode(new Uint8Array(buffer, 16, 64)) !== epoch) throw new Error('Wrong or retired session epoch');
  const sequence = Number(v.getBigUint64(80, true)); if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= 0xffffffff) throw new Error('Invalid source sequence');
  const packet = new Uint8Array(buffer.slice(88)), frame = providerPacket(packet, decode);
  if (frame.seq !== sequence) throw new Error('Inconsistent source sequence');
  return { type: 'frame', sequence, packet, frame, transportSequence: v.getUint32(4, true) };
}
export function createSessionClock({ now = () => performance.now() } = {}) {
  let samples = [], mapping = null, lastSequence = -1, capture = -Infinity;
  return {
    get mapping() { return mapping && now() - mapping.at <= 10000 ? { ...mapping } : null; },
    sample([p0, w1, w2], p3 = now()) {
      if (![p0, w1, w2, p3].every(Number.isFinite) || p0 < 0 || w1 < 0 || w2 < w1 || p3 < p0) throw new Error('Invalid clock exchange');
      const rtt = p3 - p0 - (w2 - w1); if (rtt < -1) throw new Error('Invalid clock round trip');
      const next = { offset: ((w1 - p0) + (w2 - p3)) / 2, uncertainty: Math.max(0, rtt) / 2, rtt: Math.max(0, rtt), at: p3 };
      if (!Object.values(next).every(Number.isFinite)) throw new Error('Invalid clock arithmetic');
      samples = samples.filter(s => p3 - s.at < 10000); samples.push(next); samples = samples.slice(-8);
      const best = samples.reduce((a, b) => a.rtt < b.rtt ? a : b);
      if (best.uncertainty > SESSION_BOUNDS.uncertainty) return false;
      if (mapping && Math.abs(best.offset - mapping.offset) > SESSION_BOUNDS.future) throw new Error('Worker clock mapping changed; Start a fresh session');
      mapping = best; return true;
    },
    admit(event) {
      const at = now();
      if (!mapping || at - mapping.at > 10000) return null;
      if (event.sequence <= lastSequence) return null;
      if (event.frame.captureTimeMs < capture) throw new Error('Provider capture clock moved backwards');
      const mapped = event.frame.captureTimeMs - mapping.offset;
      lastSequence = event.sequence; capture = event.frame.captureTimeMs;
      if (mapped > at + mapping.uncertainty + SESSION_BOUNDS.future || at - mapped > SESSION_BOUNDS.age) return null;
      return mapped;
    },
  };
}

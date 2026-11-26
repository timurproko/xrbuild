import { providerPacket } from './hands-session-wire.js';
const LIMIT = { bytes: 16 * 1024 * 1024, samples: 10000, duration: 120000 };
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const fail = () => { throw new Error('Invalid provider-stream recording or provenance'); };
function decode64(text) {
  if (typeof text !== 'string' || text.length > 180000 || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail();
  const binary = atob(text); if (btoa(binary) !== text) fail(); return Uint8Array.from(binary, c => c.charCodeAt(0));
}
/** A separately versioned raw format; no legacy coordinates or data are reinterpreted. */
export function createProviderFormat({ decode, normalize }) {
  function validate(document) {
    if (!keys(document, ['kind', 'version', 'source', 'sessionId', 'epoch', 'profile', 'frameSpace', 'processing', 'globalAdjustmentsApplied', 'clockDomain', 'axes', 'samples']) ||
      document.kind !== 'xrbuild-hand-session' || document.version !== 1 || document.frameSpace !== 'panel-metres' || document.processing !== 'provider-published' || document.globalAdjustmentsApplied !== false || document.clockDomain !== 'windows-qpc-ms' || document.axes !== 'x-right,y-up,z-viewer' ||
      !/^[0-9a-f-]{36}$/.test(document.sessionId) || !/^[0-9a-f]{64}$/.test(document.epoch) || !keys(document.source, ['owner', 'id', 'version']) || typeof document.source.owner !== 'string' || typeof document.source.id !== 'string' || !/^(core|(?:workspace|bundled):[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(document.source.owner) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(document.source.id) || document.source.version !== undefined && (typeof document.source.version !== 'string' || !/^[A-Za-z0-9._+ -]{1,128}$/.test(document.source.version))) fail();
    const p = document.profile;
    if (!keys(p, ['version', 'offsetMm', 'sizeFactor', 'appearance']) || Object.keys(p).length !== 4 || p.version !== 1 || !keys(p.offsetMm, ['x', 'y', 'z']) || Object.keys(p.offsetMm).length !== 3 || !keys(p.appearance, Object.keys(normalize(p).appearance))) fail();
    normalize(p);
    if (!Array.isArray(document.samples) || !document.samples.length || document.samples.length > LIMIT.samples) fail();
    let used = new TextEncoder().encode(JSON.stringify({ ...document, samples: [] })).length;
    let sequence = -1, capture = -Infinity, first;
    for (const s of document.samples) {
      if (!keys(s, ['sequence', 'captureTimeMs', 'publishTimeMs', 'packet']) || !Number.isSafeInteger(s.sequence) || s.sequence <= sequence || s.sequence < 1 || s.sequence >= 0xffffffff || !Number.isFinite(s.captureTimeMs) || s.captureTimeMs < 0 || s.captureTimeMs < capture || !Number.isFinite(s.publishTimeMs) || s.publishTimeMs < s.captureTimeMs) fail();
      if (typeof s.packet !== 'string' || s.packet.length > 180000) fail();
      used += new TextEncoder().encode(JSON.stringify(s)).length + (sequence === -1 ? 0 : 1); if (used > LIMIT.bytes) fail();
      const packet = decode64(s.packet), frame = providerPacket(packet, decode);
      if (frame.seq !== s.sequence || frame.captureTimeMs !== s.captureTimeMs || frame.hostTimeMs !== s.publishTimeMs) fail();
      first ??= s.captureTimeMs; if (s.captureTimeMs - first > LIMIT.duration) fail();
      sequence = s.sequence; capture = s.captureTimeMs;
    }
    return document;
  }
  async function replay(value, { view, now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
    // Own the validated document so a caller cannot change a queued sample or frozen profile.
    const document = structuredClone(validate(value));
    if (view.active) throw new Error('Stop live hands before replay');
    const epoch = 'replay-' + crypto.randomUUID(); let closed = false, raf = 0, resolve;
    const done = new Promise(r => { resolve = r; });
    const stop = () => { if (closed) return; closed = true; cancelFrame(raf); view.clearSession(); resolve(); };
    stop.done = done;
    if (!await view.setProfile(normalize(document.profile), { isCurrent: () => !closed, mode: 'replay' })) throw new Error('Replay profile application failed');
    if (!view.beginSession({ epoch, mode: 'replay' })) throw new Error('Replay session was not admitted');
    const began = now(), first = document.samples[0].captureTimeMs; let index = 0;
    const tick = () => {
      if (closed) return;
      const elapsed = now() - began;
      if (document.samples[index].captureTimeMs - first <= elapsed) {
        while (index + 1 < document.samples.length && document.samples[index + 1].captureTimeMs - first <= elapsed) index++;
        const sample = document.samples[index++], frame = providerPacket(decode64(sample.packet), decode);
        if (!view.pushFrame({ epoch, sequence: sample.sequence, frame, capturePageMs: began + sample.captureTimeMs - first })) { stop(); return; }
        if (index === document.samples.length) { raf = requestFrame(stop); return; }
      }
      raf = requestFrame(tick);
    };
    raf = requestFrame(tick); return stop;
  }
  return { validate, replay };
}

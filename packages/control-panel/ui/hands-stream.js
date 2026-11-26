// Admission/lifetime only. SDK ingress owns hand adjustment, filtering and gestures.
const items = (value, count, check) => Array.isArray(value) && value.length === count && Array.from(value).every(check);
const vector = p => items(p, 3, Number.isFinite);
export function validHandFrame(frame) {
  return !!(frame?.type === 2 && [1, 2].includes(frame.version) && Number.isSafeInteger(frame.seq) && frame.seq >= 0 && frame.seq <= 0xffffffff && Number.isFinite(frame.hostTimeMs) && Number.isFinite(frame.captureTimeMs) && Number.isFinite(frame.trackingHz) && frame.trackingHz >= 0 && frame.trackingHz <= 1000 &&
    frame.capabilities && ['pinch', 'grab', 'palm'].every(k => typeof frame.capabilities[k] === 'boolean') &&
    Array.isArray(frame.hands) && frame.hands.length <= 2 && new Set(Array.from(frame.hands, h => h?.id)).size === frame.hands.length && Array.from(frame.hands).every(h => h && Number.isSafeInteger(h.id) && [-1, 0, 1].includes(h.handedness) &&
      typeof h.grabbing === 'boolean' && items(h.pinch, 4, v => typeof v === 'boolean') &&
      items(h.keypoints, 21, vector) && items(h.scores, 21, v => Number.isFinite(v) && v >= 0 && v <= 1) &&
      items(h.pinchPositions, 4, vector) && vector(h.grabPosition) && items(h.palm, 4, vector)));
}
export function createHandStream({ ingress, clear = () => {}, now = () => performance.now() }) {
  let closed = false, ready = false, epoch = null, sequence = -1, capture = -Infinity, accepted = 0, lastFrame = null, times = [];
  function reset() { ingress.reset(now()); clear(); lastFrame = null; capture = -Infinity; sequence = -1; accepted = 0; times = []; }
  return {
    get active() { return epoch !== null; },
    get ready() { return ready; },
    setReady(value) { ready = value === true; if (!ready) { epoch = null; reset(); } },
    beginSession({ epoch: next } = {}) {
      if (closed || !ready || typeof next !== 'string' || !next || next.length > 256) return false;
      reset(); epoch = next; return true;
    },
    pushFrame({ epoch: owner, sequence: seq, frame, capturePageMs } = {}) {
      if (closed || !ready || !epoch || owner !== epoch || !Number.isSafeInteger(seq) || seq <= sequence || !Number.isFinite(capturePageMs) || capturePageMs < capture || !validHandFrame(frame)) return false;
      if (!ingress.push('native', frame, capturePageMs)) return false;
      sequence = seq; capture = capturePageMs; accepted++; lastFrame = frame;
      const at = now(); times.push(at); times = times.filter(t => at - t <= 1000); return true;
    },
    metrics() {
      const at = now(); times = times.filter(t => at - t <= 1000);
      return { trackingFps: epoch && accepted ? times.length : null, handCount: lastFrame?.hands.length ?? null, frameAgeMs: lastFrame ? Math.max(0, at - capture) : null };
    },
    clearSession() { epoch = null; reset(); },
    dispose() { if (closed) return; closed = true; epoch = null; ready = false; reset(); ingress.close(now()); },
  };
}

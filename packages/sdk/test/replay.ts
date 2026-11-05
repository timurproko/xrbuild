// Replay harness: runs a hand stream through HandInput exactly as Xrb does (push at capture time,
// sample at display time) and measures what the user feels. Used by hand-signal.test.ts and tune.ts.
import { HandInput, KP, type HandInputOptions } from '../src/hands.ts';
import { decodeMessage, type HandsMessage, type Vec3 } from '../src/protocol.ts';
import { handsMessage, openHand } from './fixtures.ts';

export interface AccuracyMetrics {
  /** samples compared */
  samples: number;
  /** index tip at display time vs the recorded tip at that time, metres */
  errorRms: number;
  errorP95: number;
  /** frame-to-frame jitter (second difference RMS) where the recorded tip moves < 3 cm/s, metres */
  stillJitter: number;
  /** the same for the recorded stream itself */
  rawStillJitter: number;
}

const sub = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / Math.max(1, xs.length));
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;

type Sample = { t: number; tip: Vec3 };

/** Recorded tip per hand id, for looking up "where the finger really was" at any time. */
function tracks(frames: HandsMessage[]): Map<number, Sample[]> {
  const out = new Map<number, Sample[]>();
  for (const f of frames) for (const h of f.hands) {
    if (!out.has(h.id)) out.set(h.id, []);
    out.get(h.id)!.push({ t: f.captureTimeMs, tip: h.keypoints[KP.INDEX_TIP] });
  }
  return out;
}

/** Recorded tip at time t, interpolated; null across gaps longer than `maxGapMs` or outside the track. */
function tipAt(track: Sample[], t: number, maxGapMs = 50): Vec3 | null {
  let lo = 0, hi = track.length - 1;
  if (!track.length || t < track[0].t || t > track[hi].t) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = track[lo], b = track[hi];
  if (b.t - a.t > maxGapMs) return null;
  return b.t === a.t ? a.tip : lerp(a.tip, b.tip, (t - a.t) / (b.t - a.t));
}

/**
 * Fingertip accuracy and stillness jitter of a recording replayed with `options`.
 * Each frame is sampled `leadMs` after its capture, as the page would show it.
 */
export function replayAccuracy(frames: HandsMessage[], options: HandInputOptions = {}, leadMs = 30): AccuracyMetrics {
  const input = new HandInput(options);
  const truth = tracks(frames);
  const errors: number[] = [];
  const out = new Map<number, Sample[]>();
  for (const f of frames) {
    input.push(f, f.captureTimeMs);
    const display = f.captureTimeMs + leadMs;
    for (const h of input.sample(display)) {
      if (h.coasting) continue;
      const tip = h.keypoints[KP.INDEX_TIP];
      if (!out.has(h.id)) out.set(h.id, []);
      out.get(h.id)!.push({ t: f.captureTimeMs, tip });
      const real = tipAt(truth.get(h.id) ?? [], display);
      if (real) errors.push(sub(tip, real));
    }
  }
  const still: number[] = [], rawStill: number[] = [];
  for (const [id, raw] of truth) {
    const shown = new Map((out.get(id) ?? []).map((s) => [s.t, s.tip]));
    for (let i = 2; i < raw.length; i++) {
      const [a, b, c] = [raw[i - 2], raw[i - 1], raw[i]];
      if (c.t - a.t > 50) continue;
      if (sub(c.tip, b.tip) / ((c.t - b.t) / 1000) >= 0.03) continue;
      rawStill.push(sub(c.tip, b.tip.map((v, k) => 2 * v - a.tip[k]) as Vec3));
      const [sa, sb, sc] = [shown.get(a.t), shown.get(b.t), shown.get(c.t)];
      if (sa && sb && sc) still.push(sub(sc, sb.map((v, k) => 2 * v - sa[k]) as Vec3));
    }
  }
  return { samples: errors.length, errorRms: rms(errors), errorP95: p95(errors), stillJitter: rms(still), rawStillJitter: rms(rawStill) };
}

export interface StopMetrics {
  /** furthest the shown tip passes the stop point once a sample at rest has arrived, metres */
  overshoot: number;
  /** time from the stop until the shown tip stays within 2 mm of the stop point, ms */
  settleMs: number;
}

/**
 * Synthetic stop: a fingertip moves along +x at `speed` m/s (60 Hz, 0.5 mm noise) and stops dead on a
 * capture frame. The page renders at 120 Hz with each frame shown `leadMs` after the newest capture.
 * Overshoot counts only after the first sample at rest arrived: before that no predictor can know.
 */
export function replayStop(options: HandInputOptions = {}, speed = 0.5, leadMs = 30): StopMetrics {
  const input = new HandInput(options);
  let s = 11;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  const dt = 1000 / 60, t0 = 1000, stopAt = t0 + 30 * dt, end = stopAt + 500;
  const xAt = (t: number) => -0.1 + (Math.min(t, stopAt) - t0) / 1000 * speed;
  const stopX = xAt(stopAt);
  let overshoot = 0, settled = -1, lastCapture = -Infinity;
  for (let t = t0; t <= end; t += dt / 2) {
    const frame = Math.round((t - t0) / dt);
    const capture = t0 + frame * dt;
    if (capture > lastCapture && Math.abs(t - capture) < 1e-6) {
      lastCapture = capture;
      const x = xAt(capture) + rnd() * 0.0005;
      const kp = openHand([0, 0, 0.15]).map((p) => [p[0] + x, p[1], p[2]] as Vec3);
      input.push(decodeMessage(handsMessage([{ id: 1, keypoints: kp }], capture)) as HandsMessage, capture);
    }
    const hand = input.sample(lastCapture + leadMs)[0];
    if (!hand) continue;
    const x = hand.keypoints[KP.INDEX_TIP][0] - openHand([0, 0, 0.15])[KP.INDEX_TIP][0];
    if (lastCapture > stopAt) {
      overshoot = Math.max(overshoot, x - stopX);
      if (Math.abs(x - stopX) > 0.002) settled = -1;
      else if (settled < 0) settled = t;
    }
  }
  return { overshoot, settleMs: settled < 0 ? Infinity : settled - stopAt };
}

export interface PinchMetrics {
  /** pinches by plain distance hysteresis (no debounce): the reference */
  reference: number;
  starts: number;
  ends: number;
  /** tracking frames from each reference start/end to the SDK's, worst case */
  maxStartDelay: number;
  maxEndDelay: number;
}

/** Pinch events vs. the thumb-index distance crossing its enter/exit thresholds, frame by frame. */
export function replayPinch(frames: HandsMessage[], options: HandInputOptions = {}, enterM = 0.0275, exitM = 0.0325): PinchMetrics {
  const input = new HandInput(options);
  let events: string[] = [];
  input.on((e) => { if (e.type === 'pinchstart' || e.type === 'pinchend') events.push(e.type); });
  const ref = new Map<number, boolean>();
  let reference = 0, starts = 0, ends = 0, maxStartDelay = 0, maxEndDelay = 0;
  let pendingStart: number | null = null, pendingEnd: number | null = null;
  frames.forEach((f, i) => {
    events = [];
    input.push(f, f.captureTimeMs);
    input.sample(f.captureTimeMs);
    const h = f.hands[0];
    if (h) {
      const d = sub(h.keypoints[KP.THUMB_TIP], h.keypoints[KP.INDEX_TIP]);
      const was = ref.get(h.id) ?? false;
      const now = was ? d <= exitM : d < enterM;
      ref.set(h.id, now);
      if (now && !was) { reference++; pendingStart = i; }
      if (!now && was) pendingEnd = i;
    }
    for (const e of events) {
      if (e === 'pinchstart') { starts++; if (pendingStart !== null) maxStartDelay = Math.max(maxStartDelay, i - pendingStart); pendingStart = null; }
      else { ends++; if (pendingEnd !== null) maxEndDelay = Math.max(maxEndDelay, i - pendingEnd); pendingEnd = null; }
    }
  });
  return { reference, starts, ends, maxStartDelay, maxEndDelay };
}

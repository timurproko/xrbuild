// Tracked hands for the page: smoothed, predicted to display time, with a short
// grace period across tracking dropouts and debounced pinch/grab events.
// Gestures work with any input provider: pinch and grab are computed from the keypoints, and the
// provider's own flags are used only when its frames declare them (HandsMessage.capabilities).
// Everything here is in the panel frame (metres); the SDK converts to scene space.
// Defaults are tuned by replaying rig recordings (test/tune.ts, test/hand-signal.test.ts).
import { OneEuro, type OneEuroParams } from './one-euro.ts';
import { ALL_CAPABILITIES, NUM_KEYPOINTS, type HandCapabilities, type HandsMessage, type Vec3, type WireHand } from './protocol.ts';

export const KP = {
  WRIST: 0, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_TIP: 12, RING_MCP: 13, RING_TIP: 16, PINKY_MCP: 17, PINKY_TIP: 20,
} as const;

export interface HandInputOptions {
  /** One-Euro per keypoint axis, in metres (beta per m/s) */
  smoothing?: OneEuroParams | false;
  /** predict keypoints forward to display time, capped at `maxPredictionMs` */
  prediction?: boolean;
  maxPredictionMs?: number;
  /**
   * velocity used for prediction: 'window' = from the newest raw samples, never larger than its low-passed
   * value and zero when they disagree, so a stop ends the prediction at once; 'filter' = the One-Euro derivative
   */
  predictionVelocity?: 'window' | 'filter';
  /** low-pass cutoff of the 'window' velocity, Hz */
  velocityCutoffHz?: number;
  /** keypoints slower than this (m/s) are not predicted, faster than twice this fully; keeps a still hand still */
  predictionMinSpeed?: number;
  /** keep a hand this long after it stops being tracked: a tracker may restart its filter after an empty frame (seen: a one-frame glitch returns ~200 ms later) */
  graceMs?: number;
  /** thumb-index distance hysteresis for pinch (metres) */
  pinchEnterM?: number;
  pinchExitM?: number;
  /** tracking frames the distance must stay past a threshold */
  pinchEnterFrames?: number;
  pinchExitFrames?: number;
  /** thumb-index distance at which pinch strength is 0 (metres) */
  pinchOpenM?: number;
  /** also count the provider's own pinch flag when it declares one (often slower: e.g. a 3/5-frame debounce) */
  nativePinch?: boolean;
  /**
   * grab from the keypoints when the provider has no grab of its own: the mean fingertip-to-palm distance of the
   * four fingers, in hand lengths (wrist to middle knuckle); a fist is below `grabEnterCurl`, an open hand above
   * `grabExitCurl` (open hands on the rig recordings: >= 0.65)
   */
  grabEnterCurl?: number;
  grabExitCurl?: number;
  grabEnterFrames?: number;
  grabExitFrames?: number;
  /** use the provider's grab when it declares one (default); false: always the keypoint grab */
  nativeGrab?: boolean;
}

type Settings = Required<Omit<HandInputOptions, 'smoothing'>> & { smoothing: OneEuroParams | false };

export const DEFAULT_HAND_INPUT: Settings & { smoothing: OneEuroParams } = {
  smoothing: { minCutoff: 1.5, beta: 40, dCutoff: 3 },
  prediction: true,
  maxPredictionMs: 50,
  predictionVelocity: 'window',
  velocityCutoffHz: 8,
  predictionMinSpeed: 0.05,
  graceMs: 400,
  pinchEnterM: 0.0275,
  pinchExitM: 0.0325,
  pinchEnterFrames: 2,
  pinchExitFrames: 2,
  pinchOpenM: 0.08,
  nativePinch: false,
  grabEnterCurl: 0.45,
  grabExitCurl: 0.55,
  grabEnterFrames: 2,
  grabExitFrames: 2,
  nativeGrab: true,
};

export interface Hand {
  id: number;
  handedness: 'left' | 'right' | 'unknown';
  /** 21 keypoints, smoothed and predicted to the requested display time */
  keypoints: Vec3[];
  /** raw keypoints of the newest result */
  rawKeypoints: Vec3[];
  pinching: boolean;
  /** 0 with thumb and index open (`pinchOpenM` apart), 1 at the pinch enter distance and while pinching */
  pinchStrength: number;
  grabbing: boolean;
  /** index fingertip (same as keypoints[KP.INDEX_TIP]) */
  tip: Vec3;
  /** between thumb tip and index tip */
  pinchPoint: Vec3;
  /** true while inside the grace period (not in the newest tracking result) */
  coasting: boolean;
  /** page time (ms) of the newest tracking result for this hand */
  lastSeen: number;
}

export type HandEvent =
  | { type: 'appear' | 'lost'; hand: Hand }
  | { type: 'pinchstart' | 'pinchend' | 'grabstart' | 'grabend'; hand: Hand };

interface Track {
  id: number;
  handedness: number;
  filters: OneEuro[];
  raw: Vec3[];
  smoothed: Vec3[];
  /** velocity used for prediction, per keypoint */
  velocity: Vec3[];
  /** low-passed frame-to-frame velocity per keypoint ('window' prediction) */
  windowVelocity: Vec3[];
  captureTime: number;
  lastSeen: number;
  nativePinch: boolean;
  grab: boolean;
  distancePinch: boolean;
  pinchCount: number;
  curlGrab: boolean;
  grabCount: number;
  pinching: boolean;
  grabbing: boolean;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const zeros = (n: number) => Array.from({ length: n }, () => [0, 0, 0] as Vec3);

/**
 * How curled the fingers are: the mean distance of the index, middle, ring and pinky tips from the palm centre
 * (wrist and the four knuckles), in hand lengths (wrist to middle knuckle). About 1 for an open hand, under 0.45 for a fist.
 */
export function fingerCurl(k: Vec3[]): number {
  const palmIdx = [KP.WRIST, KP.INDEX_MCP, KP.MIDDLE_MCP, KP.RING_MCP, KP.PINKY_MCP];
  const palm = [0, 1, 2].map((a) => palmIdx.reduce<number>((s, i) => s + k[i][a], 0) / palmIdx.length) as Vec3;
  const size = dist(k[KP.WRIST], k[KP.MIDDLE_MCP]);
  if (size <= 1e-6) return Infinity;
  return [KP.INDEX_TIP, KP.MIDDLE_TIP, KP.RING_TIP, KP.PINKY_TIP].reduce((s, i) => s + dist(k[i], palm), 0) / 4 / size;
}

/** The core validity rule: at least half of the keypoint scores above zero. */
export function isValidHand(h: WireHand): boolean {
  return h.scores.filter((s) => s > 0).length * 2 >= NUM_KEYPOINTS;
}

export class HandInput {
  private readonly opts: Settings;
  private readonly tracks = new Map<number, Track>();
  private readonly listeners = new Set<(e: HandEvent) => void>();
  /** capture time of the newest HANDS message */
  private newestCapture = -Infinity;

  constructor(options: HandInputOptions = {}) {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.opts = { ...DEFAULT_HAND_INPUT, ...given };
  }

  on(fn: (e: HandEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Feeds one HANDS message. `capturePageMs` is its capture time on the page clock. */
  push(msg: HandsMessage, capturePageMs: number): void {
    this.newestCapture = Math.max(this.newestCapture, capturePageMs);
    const caps: HandCapabilities = msg.capabilities ?? ALL_CAPABILITIES;
    for (const wire of msg.hands) {
      if (wire.id < 0 || !isValidHand(wire)) continue;
      let t = this.tracks.get(wire.id);
      const isNew = !t;
      if (!t) {
        t = {
          id: wire.id, handedness: wire.handedness, filters: [], raw: [], smoothed: [],
          velocity: zeros(NUM_KEYPOINTS), windowVelocity: zeros(NUM_KEYPOINTS),
          captureTime: capturePageMs, lastSeen: capturePageMs, nativePinch: false, grab: false,
          distancePinch: false, pinchCount: 0, curlGrab: false, grabCount: 0, pinching: false, grabbing: false,
        };
        if (this.opts.smoothing) for (let i = 0; i < NUM_KEYPOINTS * 3; i++) t.filters.push(new OneEuro(this.opts.smoothing));
        this.tracks.set(wire.id, t);
      }
      const raw = wire.keypoints.map((p) => [p[0], p[1], p[2]] as Vec3);
      const track = t;
      if (this.opts.predictionVelocity === 'window') this.updateWindowVelocity(track, raw, capturePageMs);
      track.handedness = wire.handedness;
      track.captureTime = capturePageMs;
      track.lastSeen = capturePageMs;
      track.raw = raw;
      if (this.opts.smoothing) {
        track.smoothed = raw.map((p, k) => [0, 1, 2].map((a) => track.filters[k * 3 + a].filter(p[a], capturePageMs)) as Vec3);
        if (this.opts.predictionVelocity === 'filter') track.velocity = raw.map((_, k) => [0, 1, 2].map((a) => track.filters[k * 3 + a].velocity) as Vec3);
      } else {
        track.smoothed = raw;
        if (this.opts.predictionVelocity === 'filter') track.velocity = zeros(NUM_KEYPOINTS);
      }
      track.nativePinch = caps.pinch && wire.pinch[0];
      this.updateDistancePinch(track);
      this.updateCurlGrab(track);
      track.grab = caps.grab && this.opts.nativeGrab ? wire.grabbing : track.curlGrab;
      if (isNew) this.emit({ type: 'appear', hand: this.view(track, capturePageMs) });
      this.updateGestures(track, capturePageMs);
    }
  }

  /**
   * Hands for a frame shown at `displayPageMs`: drops hands past the grace period
   * (emitting `lost`) and predicts the rest forward to the display time.
   */
  sample(displayPageMs: number): Hand[] {
    const out: Hand[] = [];
    for (const [id, t] of this.tracks) {
      if (displayPageMs - t.lastSeen > this.opts.graceMs) {
        this.tracks.delete(id);
        if (t.pinching) this.emit({ type: 'pinchend', hand: this.view(t, displayPageMs) });
        if (t.grabbing) this.emit({ type: 'grabend', hand: this.view(t, displayPageMs) });
        this.emit({ type: 'lost', hand: this.view(t, displayPageMs) });
        continue;
      }
      out.push(this.view(t, displayPageMs));
    }
    return out;
  }

  get count(): number {
    return this.tracks.size;
  }

  /**
   * 'window' prediction velocity: the newest frame-to-frame velocity, limited per axis to its
   * low-passed value (noise spikes do not pass) and zero when the two disagree in sign (a stop or
   * reversal ends the prediction at once instead of carrying the old motion on).
   */
  private updateWindowVelocity(t: Track, raw: Vec3[], now: number): void {
    const dt = (now - t.captureTime) / 1000;
    if (!t.raw.length || dt <= 0 || dt > 0.1) {
      t.windowVelocity = zeros(NUM_KEYPOINTS);
      t.velocity = zeros(NUM_KEYPOINTS);
      return;
    }
    const alpha = 1 / (1 + 1 / (2 * Math.PI * this.opts.velocityCutoffHz * dt));
    const min = this.opts.predictionMinSpeed;
    t.velocity = raw.map((p, k) => {
      const f = t.windowVelocity[k];
      const v = [0, 1, 2].map((a) => {
        const now = (p[a] - t.raw[k][a]) / dt;
        f[a] += alpha * (now - f[a]);
        return Math.sign(now) !== Math.sign(f[a]) ? 0 : Math.sign(f[a]) * Math.min(Math.abs(now), Math.abs(f[a]));
      }) as Vec3;
      // Fade prediction in with speed: tracking noise alone must not move a still hand.
      const gain = min > 0 ? Math.min(1, Math.max(0, Math.hypot(f[0], f[1], f[2]) / min - 1)) : 1;
      return [v[0] * gain, v[1] * gain, v[2] * gain] as Vec3;
    });
  }

  private updateDistancePinch(t: Track): void {
    const d = dist(t.raw[KP.THUMB_TIP], t.raw[KP.INDEX_TIP]);
    if (!t.distancePinch) {
      t.pinchCount = d < this.opts.pinchEnterM ? t.pinchCount + 1 : 0;
      if (t.pinchCount >= this.opts.pinchEnterFrames) { t.distancePinch = true; t.pinchCount = 0; }
    } else {
      t.pinchCount = d > this.opts.pinchExitM ? t.pinchCount + 1 : 0;
      if (t.pinchCount >= this.opts.pinchExitFrames) { t.distancePinch = false; t.pinchCount = 0; }
    }
  }

  private updateCurlGrab(t: Track): void {
    const c = fingerCurl(t.raw);
    if (!t.curlGrab) {
      t.grabCount = c < this.opts.grabEnterCurl ? t.grabCount + 1 : 0;
      if (t.grabCount >= this.opts.grabEnterFrames) { t.curlGrab = true; t.grabCount = 0; }
    } else {
      t.grabCount = c > this.opts.grabExitCurl ? t.grabCount + 1 : 0;
      if (t.grabCount >= this.opts.grabExitFrames) { t.curlGrab = false; t.grabCount = 0; }
    }
  }

  private updateGestures(t: Track, now: number): void {
    const pinching = t.distancePinch || (this.opts.nativePinch && t.nativePinch);
    if (pinching !== t.pinching) {
      t.pinching = pinching;
      this.emit({ type: pinching ? 'pinchstart' : 'pinchend', hand: this.view(t, now) });
    }
    if (t.grab !== t.grabbing) {
      t.grabbing = t.grab;
      this.emit({ type: t.grab ? 'grabstart' : 'grabend', hand: this.view(t, now) });
    }
  }

  private view(t: Track, displayPageMs: number): Hand {
    const coasting = t.lastSeen < this.newestCapture;
    const leadMs = this.opts.prediction && !coasting ? Math.min(Math.max(displayPageMs - t.captureTime, 0), this.opts.maxPredictionMs) : 0;
    const k = leadMs / 1000;
    const keypoints = t.smoothed.map((p, i) => [p[0] + t.velocity[i][0] * k, p[1] + t.velocity[i][1] * k, p[2] + t.velocity[i][2] * k] as Vec3);
    const a = keypoints[KP.THUMB_TIP], b = keypoints[KP.INDEX_TIP];
    const { pinchOpenM: open, pinchEnterM: enter } = this.opts;
    const strength = (open - dist(t.smoothed[KP.THUMB_TIP], t.smoothed[KP.INDEX_TIP])) / (open - enter);
    return {
      id: t.id,
      handedness: t.handedness === 0 ? 'left' : t.handedness === 1 ? 'right' : 'unknown',
      keypoints,
      rawKeypoints: t.raw,
      pinching: t.pinching,
      pinchStrength: t.pinching ? 1 : Math.min(1, Math.max(0, strength)),
      grabbing: t.grabbing,
      tip: b,
      pinchPoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      coasting,
      lastSeen: t.lastSeen,
    };
  }

  private emit(e: HandEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}

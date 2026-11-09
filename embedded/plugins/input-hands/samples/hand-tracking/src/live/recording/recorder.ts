import type { LiveFrame } from '../contracts.ts';
import { LIMITS, validateCapture, validateObservation, pngDimensions, hash, json, freezeObservation,
  type CaptureMetadata, type Manifest, type Drops, type RecordedFrame, type Clip } from './format.ts';
export interface RecorderDependencies {
  now(): number; utc(): string; id(): string;
  encode(bitmap: ImageBitmap): Promise<Blob>;
  timer(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(handle: ReturnType<typeof setTimeout>): void;
  sourceBusy?(): number;
}
export function pngEncoder(): { encode(bitmap: ImageBitmap): Promise<Blob>; dispose(): void } {
  const canvas = document.createElement('canvas');
  return {
    // drawImage and toBlob snapshot synchronously, BEFORE LiveSession closes its borrowed bitmap.
    encode(bitmap) { canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { colorSpace: 'srgb' }); if (!context) throw new Error('PNG canvas unavailable');
      context.drawImage(bitmap,0,0);
      return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
    },
    dispose() { canvas.width = canvas.height = 0; },
  };
}
/** Single encoder in flight. Only explicit start() admits frames, and none acquired before start are retained. */
export class Recorder {
  private generation = 0;
  private state: 'idle' | 'recording' | 'finishing' | 'ready' = 'idle';
  private metadata: CaptureMetadata | null = null;
  private frames: RecordedFrame[] = [];
  private drops: Drops = { sourceBusy: 0, encoderBusy: 0, beforeStart: 0, invalid: 0, limit: 0 };
  private bytes = 0;
  private started = 0;
  private startedUtc = '';
  private sourceBusyStart = 0;
  private ignoreInFlight = false;
  private lastBusy = 0;
  private firstPage: number | null = null;
  private pending: Promise<void> | null = null;
  private finishing: Promise<Clip | null> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private requestedStop = '';
  private reason = '';
  private readonly deps: RecorderDependencies;
  private readonly ready: (clip: Clip | null) => void;
  constructor(deps: RecorderDependencies, ready: (clip: Clip | null) => void) { this.deps = deps; this.ready = ready; }
  snapshot() { return { state: this.state, frames: this.frames.length, bytes: this.bytes, drops: { ...this.drops, sourceBusy: this.state === 'recording' ? Math.max(0,(this.deps.sourceBusy?.() ?? this.lastBusy)-this.sourceBusyStart) : this.drops.sourceBusy }, reason: this.reason, inFlight: this.pending ? 1 : 0 }; }
  start(metadata: CaptureMetadata, sourceBusy: number, ignoreInFlight = false): void {
    if (this.state !== 'idle' || this.pending) throw new Error('Delete the previous recording before starting another');
    validateCapture(metadata); this.metadata = structuredClone(metadata); this.started = this.deps.now(); this.startedUtc = this.deps.utc();
    this.sourceBusyStart = this.lastBusy = sourceBusy; this.ignoreInFlight = ignoreInFlight; this.state = 'recording';
    this.deadline = this.deps.timer(() => { void this.stop('20-second limit', this.deps.sourceBusy?.() ?? this.lastBusy); }, LIMITS.durationMs);
  }
  capture(frame: LiveFrame, bitmap: ImageBitmap, sourceBusy: number): void {
    if (this.state !== 'recording' || !this.metadata) return;
    this.lastBusy = sourceBusy;
    // Fence the existing job as well as its timestamp: browser clocks can round
    // a pre-consent snapshot and Start to the very same performance.now() value.
    if (this.ignoreInFlight) { this.ignoreInFlight = false; this.drops.beforeStart++; return; }
    if (frame.timing.frameReadyPageMs < this.started) { this.drops.beforeStart++; return; }
    if (frame.timing.frameReadyPageMs - this.started >= LIMITS.durationMs) { void this.stop('20-second limit', sourceBusy); return; }
    if (this.pending) { this.drops.encoderBusy++; return; }
    try {
      validateObservation(frame);
      if (frame.sourceId !== this.metadata.source.id || bitmap.width !== this.metadata.source.width || bitmap.height !== this.metadata.source.height) throw new Error('Source/profile changed');
      if (this.firstPage !== null && frame.timing.frameReadyPageMs <= this.frames.at(-1)!.meta.observation.timing.frameReadyPageMs) throw new Error('Non-monotonic frame');
    } catch { this.drops.invalid++; return; }
    const generation = this.generation, observation = freezeObservation(frame);
    // Invoke encode NOW, not in a later microtask: the input bitmap is borrowed only during this callback.
    let encoded: Promise<Blob>;
    try { encoded = this.deps.encode(bitmap); } catch (error) { encoded = Promise.reject(error); }
    this.pending = this.save(encoded, observation, generation).catch(error => {
      if (generation === this.generation) { this.drops.invalid++; this.requestedStop = `Encoding stopped: ${error instanceof Error ? error.message : String(error)}`; }
    }).then(() => {
      if (generation !== this.generation) { this.pending = null; return; }
      this.pending = null;
      if (this.requestedStop && this.state === 'recording') void this.stop(this.requestedStop, this.lastBusy);
    });
  }
  private async save(encoded: Promise<Blob>, observation: LiveFrame, generation: number): Promise<void> {
    const png = await encoded;
    if (generation !== this.generation || !this.metadata) return;
    await pngDimensions(png, this.metadata.source.width, this.metadata.source.height);
    if (generation !== this.generation) return;
    const pngSha256 = await hash(png);
    if (generation !== this.generation) return;
    const relativeMs = observation.timing.frameReadyPageMs - (this.firstPage ?? observation.timing.frameReadyPageMs);
    const meta = Object.freeze({ index: this.frames.length, relativeMs, pngSha256, observation });
    const bytes = png.size + json(meta).size + 8;
    // Reserve the maximum bounded manifest/header, not just the RGB payload.
    if (this.bytes + bytes + LIMITS.jsonBytes + 12 > LIMITS.bytes) { this.drops.limit++; this.requestedStop = '128 MiB size limit'; return; }
    this.firstPage ??= observation.timing.frameReadyPageMs;
    this.frames.push(Object.freeze({ meta, png })); this.bytes += bytes;
    if (this.frames.length >= LIMITS.frames) this.requestedStop = '600-frame limit';
  }
  stop(reason = 'User stopped recording', sourceBusy = this.lastBusy): Promise<Clip | null> {
    if (this.finishing) return this.finishing;
    if (this.state !== 'recording') return Promise.resolve(null);
    this.state = 'finishing'; this.reason = reason;
    if (this.deadline !== null) this.deps.clearTimer(this.deadline); this.deadline = null;
    this.drops.sourceBusy = Math.max(0, sourceBusy - this.sourceBusyStart);
    const stoppedPageMs = this.deps.now(), stoppedUtc = this.deps.utc(), generation = this.generation;
    this.finishing = (async () => {
      await this.pending;
      if (generation !== this.generation || !this.metadata) return null;
      this.state = 'ready';
      const manifest: Manifest = { ...this.metadata, format: 'xrbuild-hand-tracking', version: 1, id: this.deps.id(),
        startedUtc: this.startedUtc, stoppedUtc, startedPageMs: this.started, stoppedPageMs,
        stopReason: this.requestedStop || reason, frameCount: this.frames.length, durationMs: this.frames.at(-1)?.meta.relativeMs ?? 0,
        drops: Object.freeze({ ...this.drops }), calibration: 'unavailable', topology: 'mediapipe-21', runningMode: 'VIDEO', maxHands: 2,
        streams: [{ kind: 'rgb', encoding: 'png-rgba8-srgb', width: this.metadata.source.width, height: this.metadata.source.height }],
        timebase: 'relative-frame-ready-ms', privateEvaluationOnly: true };
      const clip: Clip | null = this.frames.length ? Object.freeze({ manifest: Object.freeze(manifest), frames: Object.freeze([...this.frames]) }) : null;
      this.reason = manifest.stopReason; this.ready(clip); return clip;
    })();
    return this.finishing;
  }
  clear(): void {
    ++this.generation;
    if (this.deadline !== null) this.deps.clearTimer(this.deadline); this.deadline = null;
    this.state = 'idle'; this.ignoreInFlight = false; this.metadata = null; this.frames = []; this.bytes = 0; this.firstPage = null;
    // An uncancellable native PNG encode may still finish; block restart until it settles.
    this.finishing = null; this.reason = this.requestedStop = '';
    this.drops = { sourceBusy: 0, encoderBusy: 0, beforeStart: 0, invalid: 0, limit: 0 };
  }
}

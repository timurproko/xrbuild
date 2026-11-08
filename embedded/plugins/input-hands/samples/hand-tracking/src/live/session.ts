import { CameraSource, cameraError, type CameraDevices, type RgbCaptureProfile } from './camera.ts';
import { MediaPipeEstimator } from './estimator.ts';
import { ObservationTracker, type TrackEvent } from './observations.ts';
import { validateSettings, type Settings, type LiveFrame, type ProcessedFrame, type Delegate } from './contracts.ts';
export interface Estimator {
  initialize(base: string, file: string, settings: Settings): Promise<{ delegate: Delegate; fallback: string | null }>;
  estimate(bitmap: ImageBitmap, time: number): Promise<ProcessedFrame>;
  dispose(): Promise<void>;
}
export interface Callbacks {
  status(message: string): void;
  frame(frame: LiveFrame, bitmap: ImageBitmap): void;
  clear(): void;
  event(event: TrackEvent): void;
  camera(info: { label: string; deviceId: string; width: number; height: number }): void;
  error(message: string): void;
}
export interface Dependencies {
  media: CameraDevices;
  estimator(): Estimator;
  bitmap(video: HTMLVideoElement): Promise<ImageBitmap>;
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
  now(): number;
}
export class LiveSession {
  private generation = 0;
  private source: CameraSource;
  private estimator: Estimator | null = null;
  private tracker: ObservationTracker;
  private raf: number | null = null;
  private busy = false;
  private sourceId = '';
  private lastMediaTime = -1;
  private lastVideoPageMs = 0;
  private started = 0;
  private totalInference = 0;
  private runSettings: Readonly<Settings> | null = null;
  private stats = { state: 'idle', frames: 0, skipped: 0, inferenceMs: 0, frameReadyToResultMs: 0,
    delegate: '' as string, fallback: null as string | null, label: '', deviceId: '', width: 0, height: 0, frameRate: null as number | null };
  private readonly deps: Dependencies;
  private readonly video: HTMLVideoElement;
  private readonly callbacks: Callbacks;
  constructor(video: HTMLVideoElement, callbacks: Callbacks, dependencies?: Dependencies) {
    this.video = video; this.callbacks = callbacks;
    this.deps = dependencies ?? { media: navigator.mediaDevices, estimator: () => new MediaPipeEstimator(),
      bitmap: source => createImageBitmap(source), request: callback => requestAnimationFrame(callback),
      cancel: handle => cancelAnimationFrame(handle), now: () => performance.now() };
    this.source = new CameraSource(video, this.deps.media, () => {
      void this.stop(); this.stats.state = 'error'; callbacks.error('Camera disconnected or capture ended. Select a camera and start again.');
    });
    this.tracker = new ObservationTracker(event => callbacks.event(event));
  }
  snapshot() {
    const seconds = Math.max((this.deps.now() - this.started) / 1000, 0.001);
    return { ...this.stats, settings: this.runSettings ? { ...this.runSettings } : null, inferenceMeanMs: this.stats.frames ? this.totalInference / this.stats.frames : 0,
      processedHz: this.stats.state === 'running' ? this.stats.frames / seconds : 0, activeTracks: this.source.activeTracks, inFlight: this.busy ? 1 : 0 };
  }
  async start(deviceId: string, assetsBase: string, modelFile: string, settings: Settings,profile?:RgbCaptureProfile): Promise<void> {
    const cleanup = this.stop();
    const generation = this.generation;
    validateSettings(settings);
    this.runSettings = Object.freeze({ ...settings });
    this.stats = { state: 'loading', frames: 0, skipped: 0, inferenceMs: 0, frameReadyToResultMs: 0, delegate: '', fallback: null, label: '', deviceId: '', width: 0, height: 0, frameRate: null };
    this.totalInference = 0;
    this.callbacks.status('Loading pinned MediaPipe runtime/model in a worker…');
    try {
      await cleanup;
      if (generation !== this.generation) return;
      const estimator = this.deps.estimator(); this.estimator = estimator;
      const ready = await estimator.initialize(assetsBase, modelFile, this.runSettings);
      if (generation !== this.generation) return;
      this.stats.delegate = ready.delegate; this.stats.fallback = ready.fallback;
      this.stats.state = 'permission';
      this.callbacks.status('Requesting the explicitly selected RGB camera and profile.');
      const info = await this.source.start(deviceId,profile);
      if (generation !== this.generation) return;
      this.sourceId = info.deviceId;
      this.callbacks.camera(info);
      Object.assign(this.stats, info, { state: 'running' });
      this.started = this.lastVideoPageMs = this.deps.now();
      this.callbacks.status(`${info.label} · ${info.width}×${info.height} · ${ready.delegate} worker${ready.fallback ? ` · ${ready.fallback}` : ''}`);
      this.schedule(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stop(); this.stats.state = 'error'; this.callbacks.error(cameraError(error));
    }
  }
  private schedule(generation: number): void {
    this.raf = this.deps.request(() => {
      this.raf = null;
      if (generation !== this.generation || this.stats.state !== 'running') return;
      this.schedule(generation);
      if (this.video.readyState < 2 || this.video.currentTime === this.lastMediaTime) {
        if (this.deps.now() - this.lastVideoPageMs > 3000) {
          void this.stop(); this.stats.state = 'error'; this.callbacks.error('Camera stream stalled. Stop other camera users and restart capture.');
        }
        return;
      }
      this.lastVideoPageMs = this.deps.now();
      this.lastMediaTime = this.video.currentTime;
      if (this.busy) { this.stats.skipped++; return; }
      this.busy = true;
      const frameReadyPageMs = this.deps.now(), mediaTimeMs = this.video.currentTime * 1000;
      void this.process(generation, frameReadyPageMs, mediaTimeMs);
    });
  }
  private async process(generation: number, frameReadyPageMs: number, mediaTimeMs: number): Promise<void> {
    let processed: ProcessedFrame | null = null;
    try {
      const bitmap = await this.deps.bitmap(this.video);
      if (generation !== this.generation || !this.estimator) { bitmap.close(); return; }
      processed = await this.estimator.estimate(bitmap, frameReadyPageMs);
      if (generation !== this.generation) return;
      const receivedPageMs = this.deps.now();
      this.stats.frames++;
      this.stats.inferenceMs = processed.inferenceEndWorkerMs - processed.inferenceStartWorkerMs;
      this.totalInference += this.stats.inferenceMs;
      this.stats.frameReadyToResultMs = receivedPageMs - frameReadyPageMs;
      this.callbacks.frame(this.tracker.frame(processed.raw, { frameReadyPageMs, mediaTimeMs,
        inferenceStartWorkerMs: processed.inferenceStartWorkerMs, inferenceEndWorkerMs: processed.inferenceEndWorkerMs,
        workerTimeOriginMs: processed.workerTimeOriginMs, receivedPageMs }, this.sourceId), processed.bitmap);
    } catch (error) {
      if (generation === this.generation) { await this.stop(); this.stats.state = 'error'; this.callbacks.error(cameraError(error)); }
    } finally { processed?.bitmap.close(); if (generation === this.generation) this.busy = false; }
  }
  stop(): Promise<void> {
    ++this.generation;
    if (this.raf !== null) this.deps.cancel(this.raf);
    this.raf = null; this.source.stop(); this.sourceId = ''; this.busy = false; this.lastMediaTime = -1;
    const estimator = this.estimator; this.estimator = null;
    this.stats.state = 'stopped'; this.tracker.reset(this.deps.now()); this.callbacks.clear();
    return estimator?.dispose() ?? Promise.resolve();
  }
}

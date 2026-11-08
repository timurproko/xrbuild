import { MediaPipeEstimator } from '../estimator.ts';
import { ObservationTracker } from '../observations.ts';
import { validateSettings, type LiveFrame, type Settings, type Delegate } from '../contracts.ts';
import type { Estimator } from '../session.ts';
import type { Clip } from './format.ts';
export interface Rerun { readonly settings: Readonly<Settings>; readonly delegate: Delegate; readonly fallback: string | null; readonly frames: readonly LiveFrame[] }
export interface ReprocessDependencies { estimator(): Estimator; decode(blob: Blob): Promise<ImageBitmap>; now(): number }
/** Always replay frame 0..N into a NEW VIDEO-mode model; seeking never changes inference history. */
export class Reprocessor {
  private generation = 0;
  private estimator: Estimator | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  private state = 'idle';
  private completed = 0;
  private total = 0;
  private readonly deps: ReprocessDependencies;
  constructor(deps: ReprocessDependencies = { estimator: () => new MediaPipeEstimator(), decode: blob => createImageBitmap(blob), now: () => performance.now() }) { this.deps = deps; }
  snapshot() { return { state: this.state, completed: this.completed, total: this.total }; }
  cancel(): Promise<void> {
    ++this.generation; const owned = this.estimator; this.estimator = null; this.state = 'cancelled';
    if (owned) this.cleanup = owned.dispose(); return this.cleanup;
  }
  async run(clip: Clip, assetsBase: string, modelFile: string, settings: Settings): Promise<Rerun | null> {
    validateSettings(settings); const config = Object.freeze({ ...settings });
    const cleanup = this.cancel(), generation = this.generation;
    this.state = 'loading'; this.completed = 0; this.total = clip.frames.length;
    let estimator: Estimator | null = null, output:Rerun|null=null;
    try {
      await cleanup; if (generation !== this.generation) return null;
      estimator = this.deps.estimator(); this.estimator = estimator;
      const ready = await estimator.initialize(assetsBase,modelFile,config);
      if (generation !== this.generation) return null;
      this.state = 'running'; const tracker = new ObservationTracker(), frames: LiveFrame[] = [];
      for (const input of clip.frames) {
        const frameReadyPageMs = this.deps.now(), bitmap = await this.deps.decode(input.png);
        if (generation !== this.generation) { bitmap.close(); return null; }
        // Original capture clocks remain in clip. These clocks describe ONLY this rerun.
        // +1 ms keeps the first task timestamp positive; gaps are the recorded gaps, not wall processing speed.
        const processed = await estimator.estimate(bitmap,input.meta.relativeMs + 1);
        try {
          if (generation !== this.generation) return null;
          frames.push(tracker.frame(processed.raw, { frameReadyPageMs, mediaTimeMs: input.meta.relativeMs,
            inferenceStartWorkerMs: processed.inferenceStartWorkerMs, inferenceEndWorkerMs: processed.inferenceEndWorkerMs,
            workerTimeOriginMs: processed.workerTimeOriginMs, receivedPageMs: this.deps.now() }, `recording:${clip.manifest.id}`));
          this.completed++;
        } finally { processed.bitmap.close(); }
      }
      output=Object.freeze({ settings: config, ...ready, frames: Object.freeze(frames) });
    } catch (error) { if (generation !== this.generation) return null; this.state = 'error'; throw error; }
    finally { if (estimator) { await estimator.dispose(); if (this.estimator === estimator) this.estimator = null; } }
    if(generation!==this.generation)return null;this.state='complete';return output;
  }
}

import type { Delegate, ProcessedFrame, Settings, WorkerRequest, WorkerResponse } from './contracts.ts';
export interface WorkerPort {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}
let workers = 0;
export const activeWorkers = () => workers;
const aborted = () => new DOMException('Estimator stopped', 'AbortError');
export class MediaPipeEstimator {
  private port: WorkerPort;
  private closed = false;
  private terminated = false;
  private sequence = 0;
  private ready = false;
  private initialized = false;
  private readyResolve: ((value: { delegate: Delegate; fallback: string | null }) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private flight: { id: number; resolve(value: ProcessedFrame): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private initTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdown: Promise<void> | null = null;
  private shutdownResolve: (() => void) | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(factory: () => WorkerPort = () => new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' })) {
    this.port = factory(); ++workers;
    this.port.onmessage = event => {
      const response = event.data;
      if (response.type === 'disposed') { this.finish(); return; }
      if (this.closed) { if (response.type === 'result') response.bitmap.close(); return; }
      if (response.type === 'ready') {
        this.ready = true; this.clearInit(); this.readyResolve?.(response); this.readyResolve = this.readyReject = null;
      } else if (response.type === 'result' && response.id === this.flight?.id) {
        const flight = this.flight; this.flight = null; clearTimeout(flight.timer); flight.resolve({ ...response.result, bitmap: response.bitmap });
      } else if (response.type === 'result') response.bitmap.close();
      else if (response.type === 'error') this.fail(new Error(response.message));
    };
    this.port.onerror = event => { event.preventDefault?.(); this.fail(new Error(event.message || 'Inference worker failed')); };
  }
  private clearInit(): void { if (this.initTimer) clearTimeout(this.initTimer); this.initTimer = null; }
  private fail(error: Error): void {
    this.ready = false;
    this.clearInit(); this.readyReject?.(error); this.readyResolve = this.readyReject = null;
    if (this.flight) { clearTimeout(this.flight.timer); this.flight.reject(error); this.flight = null; }
  }
  initialize(assetsBase: string, modelFile: string, settings: Settings): Promise<{ delegate: Delegate; fallback: string | null }> {
    if (this.closed) return Promise.reject(aborted());
    if (this.initialized) return Promise.reject(new Error('Estimator initialization is single-use; create a new session'));
    this.initialized = true;
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve; this.readyReject = reject;
      this.initTimer = setTimeout(() => this.fail(new Error('Model initialization timed out; stop and retry')), 30000);
      try { this.port.postMessage({ type: 'init', assetsBase, modelFile, settings }); } catch (error) { this.fail(error as Error); }
    });
  }
  /** Consumes the bitmap, including on rejection. Only one transferred frame can be outstanding. */
  estimate(bitmap: ImageBitmap, timestampMs: number): Promise<ProcessedFrame> {
    if (this.closed || !this.ready || this.flight) { bitmap.close(); return Promise.reject(new Error('Estimator not ready or already busy')); }
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail(new Error('Inference timed out')), 15000);
      this.flight = { id, resolve, reject, timer };
      try { this.port.postMessage({ type: 'frame', id, bitmap, timestampMs }, [bitmap]); }
      catch (error) { bitmap.close(); this.fail(error as Error); }
    });
  }
  private finish(): void {
    if (this.terminated) return;
    this.terminated = true;
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.port.onmessage = this.port.onerror = null;
    this.port.terminate(); --workers;
    this.shutdownResolve?.(); this.shutdownResolve = null;
  }
  dispose(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true; this.ready = false; this.fail(aborted());
    this.shutdown = new Promise(resolve => { this.shutdownResolve = resolve; });
    // Give an idle worker time to call model.close(); terminate a stuck initializer/inference after a bound.
    this.shutdownTimer = setTimeout(() => this.finish(), 750);
    try { this.port.postMessage({ type: 'dispose' }); } catch { this.finish(); }
    return this.shutdown;
  }
}

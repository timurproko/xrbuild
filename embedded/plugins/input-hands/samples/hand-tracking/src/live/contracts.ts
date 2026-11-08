// Framework-neutral observations. Never an XrbHand / panel-space application pose.
export type Delegate = 'CPU' | 'GPU';
export interface Settings {
  delegate: Delegate;
  detection: number;
  presence: number;
  tracking: number;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ delegate: 'CPU', detection: 0.5, presence: 0.5, tracking: 0.5 });
export function validateSettings(value: Settings): void {
  if (!['CPU', 'GPU'].includes(value.delegate)) throw new Error('Unsupported inference delegate');
  for (const key of ['detection', 'presence', 'tracking'] as const) if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1) throw new Error(`${key} threshold must be in 0..1`);
}
export interface Point { readonly x: number; readonly y: number; readonly z: number }
export interface Category { readonly categoryName: string; readonly score: number; readonly index?: number; readonly displayName?: string }
export interface RawResult {
  readonly landmarks: readonly (readonly Point[])[];
  readonly worldLandmarks: readonly (readonly Point[])[];
  readonly handedness: readonly (readonly Category[])[];
}
export interface Observation {
  readonly id: number; // Best-effort local association, not a provider-guaranteed identity.
  readonly imageFrame: 'image-normalized';
  readonly relativeFrame: 'hand-relative';
  readonly image: readonly Point[];
  readonly relative: readonly Point[] | null;
  readonly handedness: Readonly<Category> | null;
  // No per-joint confidence: Hand Landmarker does not supply one here.
}
export interface FrameTiming {
  readonly frameReadyPageMs: number;
  readonly mediaTimeMs?: number; // Absent for native RGB-D input; device clocks live in its wire metadata.
  readonly reportedCapturePageMs?: number;
  readonly inferenceStartWorkerMs: number;
  readonly inferenceEndWorkerMs: number;
  readonly workerTimeOriginMs: number;
  readonly receivedPageMs: number;
}
export interface LiveFrame {
  readonly sourceId: string; // Browser device ID within this origin/session, not a native camera serial.
  readonly providerId: 'mediapipe-hand-landmarker';
  readonly raw: RawResult;
  readonly hands: readonly Observation[];
  readonly timing: FrameTiming;
}
export interface FrameStamp { frameReadyPageMs: number; mediaTimeMs: number; reportedCapturePageMs?: number }
export interface InferResult { raw: RawResult; inferenceStartWorkerMs: number; inferenceEndWorkerMs: number; workerTimeOriginMs: number }
export interface ProcessedFrame extends InferResult { bitmap: ImageBitmap }
export type WorkerRequest =
  | { type: 'init'; assetsBase: string; modelFile: string; settings: Settings }
  | { type: 'frame'; id: number; bitmap: ImageBitmap; timestampMs: number }
  | { type: 'dispose' };
export type WorkerResponse =
  | { type: 'ready'; delegate: Delegate; fallback: string | null }
  | { type: 'result'; id: number; result: InferResult; bitmap: ImageBitmap }
  | { type: 'error'; message: string }
  | { type: 'disposed' };
export const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]] as const;

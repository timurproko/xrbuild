import type { Point, RawResult, InferResult, WorkerRequest, WorkerResponse } from '../src/live/contracts.ts';
import type { WorkerPort } from '../src/live/estimator.ts';
export function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes,no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export class Track extends EventTarget {
  readyState = 'live'; stops = 0;
  readonly id: string; readonly label: string;
  constructor(id = 'camera', label = 'RGB camera') { super(); this.id = id; this.label = label; }
  getSettings() { return { deviceId: this.id, width: 640, height: 480, frameRate: 30 }; }
  stop() { if (this.readyState === 'live') { this.stops++; this.readyState = 'ended'; } }
}
export const stream = (track: Track) => ({ getTracks: () => [track], getVideoTracks: () => [track] }) as unknown as MediaStream;
export function video() { return { srcObject: null, videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 0, play: async () => {}, pause() {} } as unknown as HTMLVideoElement; }
export const device = (id: string, label: string) => ({ kind: 'videoinput', deviceId: id, label, groupId: '' }) as MediaDeviceInfo;
export function bitmap() { const state = { closes: 0 }; return { state, value: { width: 640, height: 480, close() { state.closes++; } } as ImageBitmap }; }
export function raw(x = 0.2): RawResult {
  const points: Point[] = Array.from({ length: 21 }, (_, i) => ({ x: x + i * 0.002, y: 0.3 + i * 0.002, z: -i * 0.001 }));
  return { landmarks: [points], worldLandmarks: [points.map(p => ({ ...p }))], handedness: [[{ categoryName: 'Left', score: 0.9 }]] };
}
export const inference = (value = raw()): InferResult => ({ raw: value, inferenceStartWorkerMs: 10, inferenceEndWorkerMs: 25, workerTimeOriginMs: 100000 });
export class Port implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null; onerror: WorkerPort['onerror'] = null;
  sent: WorkerRequest[] = []; terminations = 0;
  postMessage(value: WorkerRequest) { this.sent.push(value); }
  terminate() { this.terminations++; }
  emit(data: WorkerResponse) { this.onmessage?.({ data } as MessageEvent<WorkerResponse>); }
}
export const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

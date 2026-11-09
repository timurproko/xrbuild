/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { validateSettings, type Delegate, type WorkerRequest, type WorkerResponse } from './contracts.ts';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let model: HandLandmarker | null = null;
let closing = false;
const post = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
async function initialize(request: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  validateSettings(request.settings);
  if (!(await FilesetResolver.isSimdSupported(true))) throw new Error('WebAssembly SIMD is required; use a current desktop Chrome browser');
  const files = await FilesetResolver.forVisionTasks(`${request.assetsBase}wasm`, true);
  let delegate: Delegate = request.settings.delegate;
  let fallback: string | null = null;
  const create = (selected: Delegate) => HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${request.assetsBase}${request.modelFile}`, delegate: selected },
    canvas: new OffscreenCanvas(1, 1), runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: request.settings.detection, minHandPresenceConfidence: request.settings.presence,
    minTrackingConfidence: request.settings.tracking,
  });
  try { model = await create(delegate); }
  catch (error) {
    if (delegate !== 'GPU' || closing) throw error;
    fallback = `GPU initialization failed (${message(error)}); using CPU`;
    delegate = 'CPU'; model = await create(delegate);
  }
  if (closing) { model.close(); model = null; return; }
  post({ type: 'ready', delegate, fallback });
}
scope.onmessage = event => {
  const request = event.data as WorkerRequest;
  if (request.type === 'dispose') {
    closing = true; model?.close(); model = null; post({ type: 'disposed' }); return;
  }
  if (request.type === 'init') {
    void initialize(request).catch(error => { if (!closing) post({ type: 'error', message: message(error) }); });
    return;
  }
  if (request.type === 'frame') {
    try {
      if (!model || closing) throw new Error('Estimator is not ready');
      const start = performance.now();
      const result = model.detectForVideo(request.bitmap, request.timestampMs);
      const end = performance.now();
      post({ type: 'result', id: request.id, bitmap: request.bitmap, result: {
        raw: { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, handedness: result.handedness },
        inferenceStartWorkerMs: start, inferenceEndWorkerMs: end, workerTimeOriginMs: performance.timeOrigin,
      } }, [request.bitmap]);
    } catch (error) { post({ type: 'error', message: message(error) }); }
    finally { request.bitmap.close(); }
  }
};

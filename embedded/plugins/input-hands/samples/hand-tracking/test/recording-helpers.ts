import { deflateSync } from 'node:zlib';
import { ObservationTracker } from '../src/live/observations.ts';
import { hash, type CaptureMetadata, type Clip, type Manifest } from '../src/live/recording/format.ts';
import { raw } from './live-helpers.ts';
export const metadata = (): CaptureMetadata => ({
  assets: { runtime: { package: '@mediapipe/tasks-vision', version: '1.2.0', npmIntegrity: 'fixture-only' },
    model: { id: 'unit-fixture', file: 'fixture.task', sha256: '1'.repeat(64) }, wasm: [{ file: 'fixture.wasm', sha256: '2'.repeat(64) }] },
  settings: { delegate: 'GPU', detection: 0.5, presence: 0.4, tracking: 0.6 }, backend: { delegate: 'CPU', fallback: 'Fixture fallback' },
  source: { kind: 'browser-rgb', id: 'camera', label: 'UNIT TEST ONLY', width: 1, height: 1, frameRate: 30 }, pageTimeOriginMs: 100000, mirroredPreview: true,
});
function crc(bytes: Uint8Array): number { let value = 0xffffffff; for (const b of bytes) { value ^= b; for (let i=0;i<8;i++) value = (value>>>1) ^ ((value&1) ? 0xedb88320 : 0); } return (value^0xffffffff)>>>0; }
function chunk(name: string, bytes: Uint8Array): Buffer { const type = Buffer.from(name), head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc(Buffer.concat([type,bytes]))); return Buffer.concat([head,type,bytes,tail]); }
export function png(): Blob {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1,0); ihdr.writeUInt32BE(1,4); ihdr[8]=8; ihdr[9]=6;
  return new Blob([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,19,67,123,255]))),chunk('IEND',Buffer.alloc(0))],{type:'image/png'});
}
export const observation = (pageMs = 100, empty = false) => new ObservationTracker().frame(empty ? { landmarks: [], worldLandmarks: [], handedness: [] } : raw(),
  { frameReadyPageMs: pageMs, mediaTimeMs: pageMs+200, inferenceStartWorkerMs: 10, inferenceEndWorkerMs: 25, workerTimeOriginMs: 100000, receivedPageMs: pageMs+25 },'camera');
export const image = () => ({ width: 1, height: 1, close() {} }) as ImageBitmap;
export async function clip(): Promise<Clip> {
  const media = png(), pngSha256 = await hash(media), times = [0,33,250];
  const manifest: Manifest = { ...metadata(), format: 'xrbuild-hand-tracking', version: 1, id: 'unit-clip', startedUtc: '2026-10-31T00:00:00.000Z', stoppedUtc: '2026-10-31T00:00:01.000Z',
    startedPageMs: 100, stoppedPageMs: 500, stopReason: 'Fixture only', frameCount: 3, durationMs: 250,
    drops: { sourceBusy: 4, encoderBusy: 1, beforeStart: 1, invalid: 0, limit: 0 },
    streams: [{ kind: 'rgb', encoding: 'png-rgba8-srgb', width: 1, height: 1 }], calibration: 'unavailable', topology: 'mediapipe-21', runningMode: 'VIDEO', maxHands: 2, timebase: 'relative-frame-ready-ms', privateEvaluationOnly: true };
  return { manifest, frames: times.map((relativeMs,index) => ({ meta: { index, relativeMs, pngSha256, observation: observation(100+relativeMs,index === 1) }, png: media })) };
}
export const settle = async () => { await new Promise(resolve => setTimeout(resolve,5)); };

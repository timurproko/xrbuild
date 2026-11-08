import { validateSettings, type Settings, type Delegate, type LiveFrame } from '../contracts.ts';
import { immutableRaw } from '../observations.ts';
import {LEGACY_RECORDING_FORMAT,LEGACY_RGB_MAGIC} from '../legacy.ts';

export const LIMITS = Object.freeze({ bytes: 128 * 1024 * 1024, frames: 600, durationMs: 20_000,
  pixels: 1280 * 720, imageBytes: 4 * 1024 * 1024, jsonBytes: 128 * 1024 });
const MAGIC = 'XRBHTRK1';
export interface Assets {
  runtime: { package: string; version: string; npmIntegrity: string };
  model: { id: string; file: string; sha256: string };
  wasm: readonly { file: string; sha256: string }[];
}
export interface CaptureMetadata {
  assets: Assets;
  settings: Settings;
  backend: { delegate: Delegate; fallback: string | null };
  source: { kind: 'browser-rgb'; id: string; label: string; width: number; height: number; frameRate: number | null };
  pageTimeOriginMs: number;
  mirroredPreview: boolean;
}
export interface Drops { sourceBusy: number; encoderBusy: number; beforeStart: number; invalid: number; limit: number }
export interface Manifest extends CaptureMetadata {
  format: 'xrbuild-hand-tracking' | typeof LEGACY_RECORDING_FORMAT; version: 1; id: string;
  startedUtc: string; stoppedUtc: string; startedPageMs: number; stoppedPageMs: number;
  stopReason: string; frameCount: number; durationMs: number; drops: Drops;
  streams: readonly [{ kind: 'rgb'; encoding: 'png-rgba8-srgb'; width: number; height: number }];
  calibration: 'unavailable'; topology: 'mediapipe-21'; runningMode: 'VIDEO'; maxHands: 2;
  timebase: 'relative-frame-ready-ms'; privateEvaluationOnly: true;
}
export interface FrameMetadata { index: number; relativeMs: number; pngSha256: string; observation: LiveFrame }
export interface RecordedFrame { readonly meta: Readonly<FrameMetadata>; readonly png: Blob }
export interface Clip { readonly manifest: Readonly<Manifest>; readonly frames: readonly RecordedFrame[] }
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Invalid recording: ${message}`); }
export const object = (v: unknown): Record<string, unknown> => { check(v && typeof v === 'object' && !Array.isArray(v), 'expected object'); return v as Record<string, unknown>; };
export const string = (v: unknown, max = 1024): v is string => typeof v === 'string' && v.length <= max;
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
export const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function dimensions(width: unknown, height: unknown): void {
  check(integer(width, 1, LIMITS.pixels) && integer(height, 1, LIMITS.pixels) && width * height <= LIMITS.pixels, 'image dimensions/pixel limit');
}
function category(value: unknown): void {
  const v = object(value); check(string(v.categoryName, 128) && finite(v.score) && v.score >= 0 && v.score <= 1, 'handedness category');
  check(v.index === undefined || integer(v.index, 0, 100), 'category index');
  check(v.displayName === undefined || string(v.displayName, 128), 'category name');
}
function points(value: unknown): void {
  check(Array.isArray(value) && value.length === 21, 'expected 21 joints');
  for (const point of value) { const p = object(point); check([p.x,p.y,p.z].every(n => finite(n) && Math.abs(n) <= 1e6), 'nonfinite/unbounded joint'); }
}
export function validateObservation(value: unknown, native = false): asserts value is LiveFrame {
  const v = object(value), raw = object(v.raw), timing = object(v.timing);
  check(string(v.sourceId) && v.providerId === 'mediapipe-hand-landmarker', 'observation source/provider');
  for (const key of ['landmarks', 'worldLandmarks'] as const) {
    check(Array.isArray(raw[key]) && raw[key].length <= 2, 'at most two raw hands');
    for (const hand of raw[key]) points(hand);
  }
  check(Array.isArray(raw.handedness) && raw.handedness.length <= 2, 'handedness');
  for (const categories of raw.handedness) { check(Array.isArray(categories) && categories.length <= 2, 'categories'); categories.forEach(category); }
  check(Array.isArray(v.hands) && v.hands.length === (raw.landmarks as unknown[]).length, 'observation count');
  const ids = new Set<number>();
  for (const value of v.hands) {
    const hand = object(value); check(integer(hand.id, 1, Number.MAX_SAFE_INTEGER) && !ids.has(hand.id), 'hand ID'); ids.add(hand.id);
    check(hand.imageFrame === 'image-normalized' && hand.relativeFrame === 'hand-relative', 'coordinate frame');
    points(hand.image); if (hand.relative !== null) points(hand.relative); if (hand.handedness !== null) category(hand.handedness);
  }
  for (const key of ['frameReadyPageMs', 'inferenceStartWorkerMs', 'inferenceEndWorkerMs', 'workerTimeOriginMs', 'receivedPageMs'])
    check(finite(timing[key]) && (timing[key] as number) >= 0, `timing ${key}`);
  check(native ? timing.mediaTimeMs === undefined : finite(timing.mediaTimeMs) && timing.mediaTimeMs >= 0, 'source media-time semantics');
  check((timing.inferenceEndWorkerMs as number) >= (timing.inferenceStartWorkerMs as number), 'inference clock order');
  check((timing.receivedPageMs as number) >= (timing.frameReadyPageMs as number), 'page clock order');
  check(timing.reportedCapturePageMs === undefined || finite(timing.reportedCapturePageMs), 'reported capture clock');
}
export function validateAssetsSettings(value: unknown): void {
  const v = object(value), assets = object(v.assets), runtime = object(assets.runtime), model = object(assets.model);
  check(string(runtime.package, 128) && string(runtime.version, 128) && string(runtime.npmIntegrity), 'runtime provenance');
  check(string(model.id, 128) && string(model.file, 128) && sha(model.sha256), 'model provenance');
  check(Array.isArray(assets.wasm) && assets.wasm.length > 0 && assets.wasm.length <= 4, 'WASM provenance');
  for (const file of assets.wasm) { const f = object(file); check(string(f.file, 128) && sha(f.sha256), 'WASM hash'); }
  const settings = object(v.settings); validateSettings(settings as unknown as Settings);
}
export function validateCapture(value: unknown): asserts value is CaptureMetadata {
  validateAssetsSettings(value); const v = object(value), source = object(v.source), backend = object(v.backend);
  check(['CPU','GPU'].includes(backend.delegate as string) && (backend.fallback === null || string(backend.fallback)), 'actual backend');
  check(source.kind === 'browser-rgb' && string(source.id) && string(source.label), 'RGB source'); dimensions(source.width, source.height);
  check(source.frameRate === null || (finite(source.frameRate) && source.frameRate > 0 && source.frameRate <= 1000), 'source rate');
  check(finite(v.pageTimeOriginMs) && v.pageTimeOriginMs >= 0 && typeof v.mirroredPreview === 'boolean', 'page clock/display metadata');
}
export function validateManifest(value: unknown): asserts value is Manifest {
  validateCapture(value); const v = object(value);
  check((v.format === 'xrbuild-hand-tracking' || v.format === LEGACY_RECORDING_FORMAT) && v.version === 1, 'unsupported format/version (expected version 1)');
  check(string(v.id, 128) && v.id.length > 0 && string(v.stopReason), 'recording identity/stop reason');
  check(string(v.startedUtc, 64) && Number.isFinite(Date.parse(v.startedUtc)) && string(v.stoppedUtc, 64) && Number.isFinite(Date.parse(v.stoppedUtc)), 'UTC dates');
  check(finite(v.startedPageMs) && finite(v.stoppedPageMs) && v.startedPageMs >= 0 && v.stoppedPageMs >= v.startedPageMs, 'recording clocks');
  check(integer(v.frameCount, 1, LIMITS.frames) && finite(v.durationMs) && v.durationMs >= 0 && v.durationMs <= LIMITS.durationMs, 'frame count/duration');
  const drops = object(v.drops); for (const key of ['sourceBusy','encoderBusy','beforeStart','invalid','limit']) check(integer(drops[key], 0, Number.MAX_SAFE_INTEGER), 'drop counters');
  check(Array.isArray(v.streams) && v.streams.length === 1, 'one RGB stream required; depth unsupported in version 1');
  const stream = object(v.streams[0]); check(stream.kind === 'rgb' && stream.encoding === 'png-rgba8-srgb', 'unsupported RGB encoding');
  check(stream.width === value.source.width && stream.height === value.source.height, 'stream profile mismatch');
  check(v.calibration === 'unavailable' && v.topology === 'mediapipe-21' && v.runningMode === 'VIDEO' && v.maxHands === 2 && v.timebase === 'relative-frame-ready-ms' && v.privateEvaluationOnly === true, 'coordinate/model/usage declarations');
}
export function freezeObservation(value: LiveFrame): LiveFrame {
  const raw = immutableRaw(value.raw);
  return Object.freeze({ sourceId: value.sourceId, providerId: value.providerId, raw, timing: Object.freeze({ ...value.timing }),
    hands: Object.freeze(value.hands.map(hand => Object.freeze({ ...hand,
      image: Object.freeze(hand.image.map(p => Object.freeze({ ...p }))),
      relative: hand.relative ? Object.freeze(hand.relative.map(p => Object.freeze({ ...p }))) : null,
      handedness: hand.handedness ? Object.freeze({ ...hand.handedness }) : null }))) });
}
export async function pngDimensions(png: Blob, width: number, height: number): Promise<void> {
  check(png.size > 33 && png.size <= LIMITS.imageBytes, 'PNG size limit');
  const bytes = new Uint8Array(await png.slice(0,33).arrayBuffer()), view = new DataView(bytes.buffer);
  check([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) && view.getUint32(8) === 13 && String.fromCharCode(...bytes.slice(12,16)) === 'IHDR', 'PNG signature/IHDR');
  dimensions(view.getUint32(16), view.getUint32(20));
  check(view.getUint32(16) === width && view.getUint32(20) === height && bytes[24] === 8 && [2,6].includes(bytes[25]), 'PNG profile (8-bit RGB/RGBA required)');
}
export async function hash(blob: Blob): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2,'0')).join('');
}
export function json(value: unknown): Blob {
  // JSON.stringify normally loses IEEE -0. Emit a numeric -0 token, with a sentinel
  // proven absent from every original JSON string/key (including imported labels).
  const ordinary = JSON.stringify(value);
  let sentinel = `__handtracking_negative_zero_${crypto.randomUUID()}__`;
  while (ordinary.includes(sentinel)) sentinel = `__handtracking_negative_zero_${crypto.randomUUID()}__`;
  const serialized = JSON.stringify(value,(_key,v) => typeof v === 'number' && Object.is(v,-0) ? sentinel : v).replaceAll(JSON.stringify(sentinel),'-0');
  const bytes = encoder.encode(serialized); check(bytes.length > 0 && bytes.length <= LIMITS.jsonBytes, 'JSON chunk limit');
  return new Blob([bytes], { type: 'application/json' });
}
/** Logical metadata identity ignores object-key order, but preserves array order and IEEE signed zero. */
export function metadataHash(value:unknown):Promise<string>{
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])])):v;
  return hash(json(canonical(value)));
}
export function header(...sizes: number[]): Blob { const bytes = new ArrayBuffer(sizes.length * 4), view = new DataView(bytes); sizes.forEach((size,i) => view.setUint32(i*4,size,true)); return new Blob([bytes]); }
export function exportClip(clip: Clip): Blob {
  validateManifest(clip.manifest); check(clip.frames.length === clip.manifest.frameCount, 'frame count mismatch');
  const manifest = json(clip.manifest), parts: BlobPart[] = [MAGIC, header(manifest.size), manifest];
  for (const frame of clip.frames) { const meta = json(frame.meta); parts.push(header(meta.size, frame.png.size), meta, frame.png); }
  const result = new Blob(parts, { type: 'application/octet-stream' }); check(result.size <= LIMITS.bytes, 'file size limit'); return result;
}
export async function parse(blob: Blob): Promise<unknown> { check(blob.size > 0 && blob.size <= LIMITS.jsonBytes, 'JSON size'); try { return JSON.parse(decoder.decode(await blob.arrayBuffer())); } catch { throw new Error('Invalid recording: malformed UTF-8/JSON'); } }
/** Progressive Blob slices: never copy the whole imported RGB file into an ArrayBuffer. */
export async function importClip(file: Blob, cancelled = () => false): Promise<Clip> {
  check(file.size >= 12 && file.size <= LIMITS.bytes, 'file size limit');
  const prefix = await file.slice(0,12).arrayBuffer(); const magic=decoder.decode(prefix.slice(0,8));check(magic === MAGIC || magic === LEGACY_RGB_MAGIC, 'file magic/version');
  const size = new DataView(prefix).getUint32(8,true); check(size > 0 && size <= LIMITS.jsonBytes && size + 12 <= file.size, 'manifest length');
  const parsedManifest = await parse(file.slice(12,12+size)); validateManifest(parsedManifest);
  const manifest = (parsedManifest.format===LEGACY_RECORDING_FORMAT?{...parsedManifest,format:'xrbuild-hand-tracking'}:parsedManifest) as Manifest;
  let offset = 12 + size, previous = -1, firstPage = -1;
  const frames: RecordedFrame[] = [];
  for (let index = 0; index < manifest.frameCount; index++) {
    if (cancelled()) throw new DOMException('Import cancelled', 'AbortError');
    check(offset + 8 <= file.size, 'truncated frame header');
    const view = new DataView(await file.slice(offset,offset+8).arrayBuffer()), metaSize = view.getUint32(0,true), pngSize = view.getUint32(4,true); offset += 8;
    check(metaSize > 0 && metaSize <= LIMITS.jsonBytes && pngSize > 33 && pngSize <= LIMITS.imageBytes && offset + metaSize + pngSize <= file.size, 'truncated/oversized frame');
    const meta = object(await parse(file.slice(offset,offset+metaSize))); offset += metaSize;
    check(meta.index === index && finite(meta.relativeMs) && meta.relativeMs > previous && meta.relativeMs <= LIMITS.durationMs && (index !== 0 || meta.relativeMs === 0), 'frame index/timeline');
    validateObservation(meta.observation); check(meta.observation.sourceId === manifest.source.id, 'mixed source IDs');
    if (index === 0) firstPage = meta.observation.timing.frameReadyPageMs;
    check(firstPage >= manifest.startedPageMs && Math.abs(meta.observation.timing.frameReadyPageMs - firstPage - meta.relativeMs) < 0.001 && meta.observation.timing.frameReadyPageMs <= manifest.stoppedPageMs, 'frame clock provenance');
    check(sha(meta.pngSha256), 'PNG hash'); const png = file.slice(offset,offset+pngSize,'image/png'); offset += pngSize;
    await pngDimensions(png,manifest.source.width,manifest.source.height); check(await hash(png) === meta.pngSha256, 'PNG integrity hash mismatch');
    previous = meta.relativeMs;
    frames.push(Object.freeze({ meta: Object.freeze({ index, relativeMs: meta.relativeMs, pngSha256: meta.pngSha256, observation: freezeObservation(meta.observation) }), png }));
  }
  check(offset === file.size && Math.abs(previous - manifest.durationMs) < 0.001, 'trailing bytes/duration mismatch');
  if (cancelled()) throw new DOMException('Import cancelled', 'AbortError');
  // Freeze known schema-owned objects; do not recursively traverse arbitrary imported extensions.
  return Object.freeze({ manifest: Object.freeze(manifest), frames: Object.freeze(frames) });
}

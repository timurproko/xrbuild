import type { LiveFrame, Settings, Delegate } from '../contracts.ts';
import { framePacket, validateFramePlanes, validateCalibration, RGBD, type Calibration, type Packet, type WireFrame } from '../rgbd/protocol.ts';
import { validateDepthSettings, type DepthSettings } from '../rgbd/reconstruction.ts';
import { LIMITS, check, object, string, finite, integer, sha, hash, json, header, parse,
  validateAssetsSettings, validateObservation, type Assets, type Drops } from './format.ts';

import {profileKey} from '../rgbd/profiles.ts';
import {LEGACY_DEPTH_MAGIC,LEGACY_RECORDING_FORMAT} from '../legacy.ts';
export const DEPTH_MAGIC = 'XRBHTRK2';
export interface ClockEstimate { offsetMs: number; uncertaintyMs: number; rttMs: number }
export interface DepthCaptureMetadata {
  assets: Assets; settings: Settings; backend: { delegate: Delegate | null; fallback: string | null };
  source: { kind: 'native-rgbd'; id: string; label: string }; calibration: Calibration;
  pageTimeOriginMs: number; mirroredPreview: boolean;
}
export interface DepthManifest extends DepthCaptureMetadata {
  format: 'xrbuild-hand-tracking' | typeof LEGACY_RECORDING_FORMAT; version: 2; id: string; startedUtc: string; stoppedUtc: string;
  startedPageMs: number; stoppedPageMs: number; stopReason: string; frameCount: number; durationMs: number;
  drops: Drops; encoding: 'deflate-xrb3'; timebase: 'relative-browser-receive-ms';
  topology: 'mediapipe-21'; privateEvaluationOnly: true;
}
export interface DepthFrameInput {
  receivedPageMs: number; completedPageMs: number; presentedPageMs?:number|null; observation: LiveFrame | null; sampling: DepthSettings;
  pixelMs: number; reconstructionMs: number; transferApproxMs: number | null;
  pageClock: ClockEstimate | null; nativeClock: ClockEstimate | null;
}
export interface DepthFrameMetadata extends DepthFrameInput {
  index: number; relativeMs: number; packetSha256: string; packetBytes: number;
}
export interface DepthRecordedFrame { readonly meta: Readonly<DepthFrameMetadata>; readonly data: Blob }
export interface DepthClip { readonly manifest: Readonly<DepthManifest>; readonly frames: readonly DepthRecordedFrame[] }

/** Keep snapshots isolated from source objects, including all calibration/settings arrays. */
export function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}
export function validateDepthCapture(value: unknown): asserts value is DepthCaptureMetadata {
  validateAssetsSettings(value); const v = object(value), source = object(v.source), backend = object(v.backend);
  validateCalibration(v.calibration);
  check(source.kind === 'native-rgbd' && string(source.id) && source.id.length > 0 && string(source.label), 'native RGB-D source');
  check((backend.delegate === null || ['CPU','GPU'].includes(backend.delegate as string)) && (backend.fallback === null || string(backend.fallback)), 'actual RGB-D backend');
  check(finite(v.pageTimeOriginMs) && v.pageTimeOriginMs >= 0 && typeof v.mirroredPreview === 'boolean', 'page clock/display');
}
export function validateDepthManifest(value: unknown): asserts value is DepthManifest {
  validateDepthCapture(value); const v = object(value);
  check((v.format === 'xrbuild-hand-tracking' || v.format === LEGACY_RECORDING_FORMAT) && v.version === 2 && v.encoding === 'deflate-xrb3', 'unsupported RGB-D recording version/encoding');
  check(string(v.id,128) && v.id.length > 0 && string(v.stopReason), 'clip identity');
  for (const key of ['startedUtc','stoppedUtc']) check(string(v[key],64) && Number.isFinite(Date.parse(v[key] as string)), 'UTC dates');
  check(finite(v.startedPageMs) && finite(v.stoppedPageMs) && v.startedPageMs >= 0 && v.stoppedPageMs >= v.startedPageMs, 'recording clock order');
  check(integer(v.frameCount,1,LIMITS.frames) && finite(v.durationMs) && v.durationMs >= 0 && v.durationMs <= LIMITS.durationMs, 'frame count/duration');
  const drops = object(v.drops); for (const key of ['sourceBusy','encoderBusy','beforeStart','invalid','limit']) check(integer(drops[key],0,Number.MAX_SAFE_INTEGER),'drop counter');
  check(v.topology === 'mediapipe-21' && v.timebase === 'relative-browser-receive-ms' && v.privateEvaluationOnly === true, 'coordinate/time/privacy declarations');
}
function clock(value: unknown): void {
  if (value === null) return; const v = object(value);
  check(finite(v.offsetMs) && finite(v.uncertaintyMs) && v.uncertaintyMs >= 0 && finite(v.rttMs) && v.rttMs >= 0, 'clock estimate');
}
export function validateDepthInput(value: unknown): asserts value is DepthFrameInput {
  const v = object(value);
  check(finite(v.receivedPageMs) && v.receivedPageMs >= 0 && finite(v.completedPageMs) && v.completedPageMs >= v.receivedPageMs, 'processed page clock');
  check(v.presentedPageMs===undefined||v.presentedPageMs===null||finite(v.presentedPageMs)&&v.presentedPageMs>=v.receivedPageMs, 'render page clock');
  check(finite(v.pixelMs) && v.pixelMs >= 0 && finite(v.reconstructionMs) && v.reconstructionMs >= 0, 'component durations');
  check(v.transferApproxMs === null || finite(v.transferApproxMs), 'transfer approximation'); clock(v.pageClock); clock(v.nativeClock);
  validateDepthSettings(object(v.sampling) as unknown as DepthSettings);
  if (v.observation !== null) { validateObservation(v.observation,true); check(v.observation.timing.frameReadyPageMs === v.receivedPageMs && v.observation.timing.receivedPageMs <= v.completedPageMs, 'observation receive provenance'); }
}
function validateDepthFrameMetadata(value: unknown): asserts value is DepthFrameMetadata {
  validateDepthInput(value); const v=object(value);
  check(integer(v.index,0,LIMITS.frames-1) && finite(v.relativeMs) && sha(v.packetSha256) && integer(v.packetBytes,RGBD.header,RGBD.packetBytes),'frame index/time/packet hash');
}
export function validateDepthSource(meta: DepthFrameInput, packet: Packet & { meta: WireFrame }, capture: DepthCaptureMetadata): void {
  validateFramePlanes(packet,profileKey(capture.calibration.color));
  check(/^[a-z][a-z0-9-]*:/.test(capture.source.id) && capture.source.id.slice(capture.source.id.indexOf(':')) === `:${capture.calibration.serial}:${packet.meta.runId}`, 'packet/source/calibration identity');
  check(meta.observation === null ? capture.backend.delegate === null : capture.backend.delegate !== null && meta.observation.sourceId === capture.source.id, 'model/source provenance');
}
export async function compressPacket(packet: Blob): Promise<Blob> {
  return new Response(packet.stream().pipeThrough(new CompressionStream('deflate'))).blob();
}
/** Streaming decompression is capped BEFORE collecting each output chunk. */
export async function decompressPacket(data: Blob, expected: number, cancelled = () => false): Promise<ArrayBuffer> {
  check(integer(expected,RGBD.header,RGBD.packetBytes) && data.size > 0 && data.size <= RGBD.packetBytes, 'compressed packet size');
  const reader = data.stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const parts: Uint8Array<ArrayBuffer>[] = []; let total = 0;
  try {
    while (true) {
      if (cancelled()) throw new DOMException('RGB-D decode cancelled','AbortError');
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength; check(total <= expected, 'decompression output limit'); parts.push(value);
    }
    check(total === expected, 'decompressed packet length');
    if (cancelled()) throw new DOMException('RGB-D decode cancelled','AbortError');
    return new Blob(parts).arrayBuffer();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function decodeDepthFrame(frame: DepthRecordedFrame, cancelled = () => false): Promise<Packet & { meta: WireFrame }> {
  const buffer = await decompressPacket(frame.data,frame.meta.packetBytes,cancelled);
  check(await hash(new Blob([buffer])) === frame.meta.packetSha256, 'RGB-D packet integrity hash mismatch');
  if (cancelled()) throw new DOMException('RGB-D decode cancelled','AbortError');
  return framePacket(buffer);
}
export function exportDepthClip(clip: DepthClip): Blob {
  validateDepthManifest(clip.manifest); check(clip.frames.length === clip.manifest.frameCount,'frame count mismatch');
  const manifest = json(clip.manifest), parts: BlobPart[] = [DEPTH_MAGIC,header(manifest.size),manifest];
  for (const frame of clip.frames) { const meta = json(frame.meta); parts.push(header(meta.size,frame.data.size),meta,frame.data); }
  const blob = new Blob(parts,{type:'application/octet-stream'}); check(blob.size <= LIMITS.bytes,'file size limit'); return blob;
}
export async function isDepthClip(file: Blob): Promise<boolean> { const magic=await file.slice(0,8).text();return magic===DEPTH_MAGIC||magic===LEGACY_DEPTH_MAGIC; }
export async function importDepthClip(file: Blob, cancelled = () => false): Promise<DepthClip> {
  check(file.size >= 12 && file.size <= LIMITS.bytes,'file size limit');
  const prefix = await file.slice(0,12).arrayBuffer();const magic=new TextDecoder().decode(prefix.slice(0,8));check(magic===DEPTH_MAGIC||magic===LEGACY_DEPTH_MAGIC,'file magic/version');
  const size = new DataView(prefix).getUint32(8,true); check(size > 0 && size <= LIMITS.jsonBytes && size+12 <= file.size,'manifest length');
  const parsedManifest=await parse(file.slice(12,12+size));validateDepthManifest(parsedManifest);
  const manifest=(parsedManifest.format===LEGACY_RECORDING_FORMAT?{...parsedManifest,format:'xrbuild-hand-tracking'}:parsedManifest) as DepthManifest;
  let offset = 12+size, previous = -1, firstPage = -1, sequence = 0, nativeTime = -1;
  const frames: DepthRecordedFrame[] = [];
  for (let index=0; index<manifest.frameCount; index++) {
    if (cancelled()) throw new DOMException('Import cancelled','AbortError');
    check(offset+8 <= file.size,'truncated frame header');
    const view = new DataView(await file.slice(offset,offset+8).arrayBuffer()), metaSize=view.getUint32(0,true), dataSize=view.getUint32(4,true); offset+=8;
    check(metaSize > 0 && metaSize <= LIMITS.jsonBytes && dataSize > 0 && dataSize <= RGBD.packetBytes && offset+metaSize+dataSize <= file.size,'truncated/oversized RGB-D frame');
    const value = object(await parse(file.slice(offset,offset+metaSize))); offset+=metaSize; validateDepthFrameMetadata(value);
    const meta = value;
    check(meta.index === index && finite(meta.relativeMs) && meta.relativeMs > previous && meta.relativeMs <= LIMITS.durationMs && (index !== 0 || meta.relativeMs === 0),'frame index/timeline');
    check(sha(meta.packetSha256) && integer(meta.packetBytes,RGBD.header,RGBD.packetBytes),'packet length/hash');
    if (index===0) firstPage=meta.receivedPageMs;
    check(firstPage >= manifest.startedPageMs && Math.abs(meta.receivedPageMs-firstPage-meta.relativeMs)<0.001 && meta.receivedPageMs <= manifest.stoppedPageMs,'receive timeline provenance');
    const frame = {meta,data:file.slice(offset,offset+dataSize)}; offset+=dataSize;
    const packet = await decodeDepthFrame(frame,cancelled); validateDepthSource(meta,packet,manifest);
    check(packet.meta.sequence > sequence && packet.meta.nativeReceiveMs > nativeTime,'source frame order');
    sequence=packet.meta.sequence; nativeTime=packet.meta.nativeReceiveMs; previous=meta.relativeMs;
    frames.push(Object.freeze({meta:immutable(meta),data:frame.data}));
  }
  check(offset === file.size && Math.abs(previous-manifest.durationMs)<0.001,'trailing bytes/duration mismatch');
  if (cancelled()) throw new DOMException('Import cancelled','AbortError');
  return Object.freeze({manifest:immutable(manifest),frames:Object.freeze(frames)});
}

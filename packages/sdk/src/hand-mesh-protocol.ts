import type { Vec3 } from './protocol.ts';
import type { HandObservations } from './hands.ts';

export const MESH_PROTOCOL_VERSION = 2;
export const MESH_CAPABILITIES = ['final-pose-observations-v1', 'live-configure-v1', 'preparation-progress-v1'] as const;
export type MeshCapability = typeof MESH_CAPABILITIES[number];
export function validMeshCapabilities(v: unknown): v is MeshCapability[] {
  return Array.isArray(v) && v.length <= MESH_CAPABILITIES.length && new Set(v).size === v.length
    && v.every(c => MESH_CAPABILITIES.includes(c));
}
export function unknownMeshObservations(): HandObservations {
  return { confidence: Array(21).fill(null), supported: Array(21).fill(null), ageMs: Array(21).fill(null) };
}
export function validMeshObservations(v: unknown): v is HandObservations {
  if (!object(v)) return false;
  const array = (a: unknown, check: (n: unknown) => boolean) => Array.isArray(a) && a.length === 21 && a.every(n => n === null || check(n));
  return array(v.confidence, n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
    && array(v.supported, n => typeof n === 'boolean')
    && array(v.ageMs, n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
}

export const MESH_MAX_BYTES = 2 * 1024 * 1024, MESH_MAX_VERTICES = 16384, MESH_MAX_INDICES = 32768 * 3;
export interface MeshPose { id: number; handedness: string; keypoints: Vec3[]; observations?: HandObservations }
export interface MeshFrame { type: 'frame'; epoch: string; sequence: number; revision: number; sentMs: number; sampleMs: number; hands: MeshPose[]; drawingStatus?: string;
  version?: 2; runId?: string; settingsGeneration?: number; drawingGeneration?: number | null; protocolVersion?: 2; capabilities?: MeshCapability[] }
export const MESH_PREPARATION_STEPS = ['runtime', 'assets', 'models', 'device', 'warming'] as const;
export interface MeshState {
  step?: typeof MESH_PREPARATION_STEPS[number] | null;
  runId: string; phase: 'Preparing' | 'Ready' | 'Failed' | 'Stopped'; reason: string | null; progress: number | null;
  requestedGeneration: number; appliedGeneration: number | null; drawingGeneration: number | null; savedRevision: string | null;
  owner: string | null; id: string | null;
}
export interface MeshSurface { id: number; topology: string; positions: Float32Array; normals?: Float32Array; indices: Uint32Array }
export interface MeshResult { type: 'result'; epoch: string; sequence: number; revision: number; meshes: MeshSurface[]; version?: 2; runId?: string; settingsGeneration?: number }
export function validMeshState(v: unknown): v is MeshState {
  return object(v) && typeof v.runId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v.runId)
    && ['Preparing', 'Ready', 'Failed', 'Stopped'].includes(v.phase as string) && integer(v.requestedGeneration)
    && (v.appliedGeneration === null || integer(v.appliedGeneration) && v.appliedGeneration <= v.requestedGeneration)
    && (v.drawingGeneration === null || integer(v.drawingGeneration) && v.drawingGeneration === v.appliedGeneration)
    && (v.step === undefined || v.step === null || MESH_PREPARATION_STEPS.includes(v.step as typeof MESH_PREPARATION_STEPS[number]))
    && (v.progress === null || typeof v.progress === 'number' && Number.isFinite(v.progress) && v.progress >= 0 && v.progress <= 1)
    && (v.reason === null || typeof v.reason === 'string' && v.reason.length <= 240 && !/[\x00-\x1f\x7f]/.test(v.reason))
    && (v.savedRevision === null || typeof v.savedRevision === 'string' && v.savedRevision.length <= 128)
    && (v.owner === null || typeof v.owner === 'string' && v.owner.length <= 160) && (v.id === null || typeof v.id === 'string' && v.id.length <= 128);
}
export interface MeshRuntime { version: 1; url: string; token: string }
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function meshAssociation(v: unknown): v is Record<string, unknown> & { epoch: string; sequence: number; revision: number } {
  return object(v) && typeof v.epoch === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v.epoch) && integer(v.sequence) && integer(v.revision);
}
export function validMeshFrame(v: unknown): v is MeshFrame {
  return meshAssociation(v) && object(v) && v.type === 'frame' && typeof v.sentMs === 'number' && Number.isFinite(v.sentMs)
    && typeof v.sampleMs === 'number' && Number.isFinite(v.sampleMs)
    && (v.protocolVersion === undefined || v.protocolVersion === 2 && validMeshCapabilities(v.capabilities))
    && (v.version === undefined || v.version === 2 && typeof v.runId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v.runId) && integer(v.settingsGeneration))
    && (v.drawingGeneration === undefined || v.drawingGeneration === null || integer(v.drawingGeneration))
    && (v.drawingStatus === undefined || typeof v.drawingStatus === 'string' && v.drawingStatus.length <= 128 && !/[\x00-\x1f\x7f]/.test(v.drawingStatus)) && Array.isArray(v.hands) && v.hands.length <= 2
    && new Set(v.hands.map(h => object(h) ? h.id : null)).size === v.hands.length
    && v.hands.every(h => object(h) && integer(h.id) && ['left', 'right', 'unknown'].includes(h.handedness as string)
      && (h.observations === undefined || validMeshObservations(h.observations))
      && Array.isArray(h.keypoints) && h.keypoints.length === 21 && h.keypoints.every(p => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n))));
}
/** 12-byte little-endian header: magic 0x314d5258, JSON bytes, binary bytes. */
export function meshPacket(meta: unknown, payload = new Uint8Array()): Uint8Array {
  const json = enc.encode(JSON.stringify(meta));
  if (json.length > 16384 || 12 + json.length + payload.length > MESH_MAX_BYTES) throw new Error('Oversized mesh packet');
  const out = new Uint8Array(12 + json.length + payload.length), view = new DataView(out.buffer);
  view.setUint32(0, 0x314d5258, true); view.setUint32(4, json.length, true); view.setUint32(8, payload.length, true);
  out.set(json, 12); out.set(payload, 12 + json.length); return out;
}
export function readMeshPacket(bytes: Uint8Array): { meta: any; payload: Uint8Array } {
  if (bytes.length < 12 || bytes.length > MESH_MAX_BYTES) throw new Error('Invalid mesh packet size');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = v.getUint32(4, true), b = v.getUint32(8, true);
  if (v.getUint32(0, true) !== 0x314d5258 || n > 16384 || 12 + n + b !== bytes.length) throw new Error('Invalid mesh packet header');
  return { meta: JSON.parse(dec.decode(bytes.subarray(12, 12 + n))), payload: bytes.subarray(12 + n) };
}
export function encodeMeshResult(result: MeshResult): Uint8Array {
  const parts: Uint8Array[] = [], meshes = result.meshes.map(m => {
    for (const a of [m.positions, ...(m.normals ? [m.normals] : []), m.indices]) parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    return { id: m.id, topology: m.topology, vertices: m.positions.length / 3, normals: !!m.normals, indices: m.indices.length };
  });
  const payload = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0;
  for (const p of parts) { payload.set(p, offset); offset += p.length; }
  return meshPacket({ type: 'result', epoch: result.epoch, sequence: result.sequence, revision: result.revision, meshes,
    ...(result.version === 2 ? { version: 2, runId: result.runId, settingsGeneration: result.settingsGeneration } : {}) }, payload);
}
export function decodeMeshResult(bytes: Uint8Array): MeshResult {
  const { meta: m, payload } = readMeshPacket(bytes);
  if (!meshAssociation(m) || m.version !== undefined && (m.version !== 2 || typeof m.runId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(m.runId) || !integer(m.settingsGeneration)) || m.type !== 'result' || !Array.isArray(m.meshes) || m.meshes.length > 2) throw new Error('Invalid mesh result');
  let offset = 0;
  const take = (count: number, kind: 'float' | 'index') => {
    if (offset + count * 4 > payload.length) throw new Error('Truncated mesh buffers');
    const v = new DataView(payload.buffer, payload.byteOffset + offset, count * 4); offset += count * 4;
    const out = kind === 'float' ? new Float32Array(count) : new Uint32Array(count);
    for (let i = 0; i < count; i++) { out[i] = kind === 'float' ? v.getFloat32(i * 4, true) : v.getUint32(i * 4, true); if (!Number.isFinite(out[i])) throw new Error('Nonfinite mesh value'); }
    return out;
  };
  const ids = new Set<number>();
  const meshes = m.meshes.map((s: any): MeshSurface => {
    if (!object(s) || !integer(s.id) || ids.has(s.id) || typeof s.topology !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(s.topology)
      || !integer(s.vertices) || !s.vertices || s.vertices > MESH_MAX_VERTICES || !integer(s.indices) || s.indices > MESH_MAX_INDICES || s.indices % 3 || typeof s.normals !== 'boolean') throw new Error('Invalid mesh topology');
    ids.add(s.id);
    const positions = take(s.vertices * 3, 'float') as Float32Array, normals = s.normals ? take(s.vertices * 3, 'float') as Float32Array : undefined;
    const indices = take(s.indices, 'index') as Uint32Array, vertices = s.vertices;
    if (indices.some(i => i >= vertices)) throw new Error('Mesh index out of range');
    return { id: s.id, topology: s.topology, positions, normals, indices };
  });
  if (offset !== payload.length) throw new Error('Unexpected mesh bytes');
  return { type: 'result', epoch: m.epoch, sequence: m.sequence, revision: m.revision, meshes,
    ...(m.version === 2 ? { version: 2 as const, runId: m.runId as string, settingsGeneration: m.settingsGeneration as number } : {}) };
}

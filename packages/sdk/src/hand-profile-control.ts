import { handProfile, object, sameHandGeometry, type HandProfile } from './hand-profile.ts';
export const MSG_HAND_PROFILE = 7, MSG_HAND_PROFILE_ACK = 8, MSG_SET_HAND_PROFILE = 104, MSG_ACK_HAND_PROFILE = 105;
export const PROFILE_MAX_BYTES = 8192;
export interface HandProfileEnvelope { version: 1; runId: string; sequence: number; revision: string; profile: HandProfile }
export type HandProfileAck = Pick<HandProfileEnvelope, 'runId' | 'sequence' | 'revision'>;
export function profileEnvelope(value: unknown): HandProfileEnvelope {
  if (!object(value) || value.version !== 1 || typeof value.runId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value.runId)
    || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)
    || !object(value.profile) || value.profile.version !== 1) throw new Error('Invalid Hands profile envelope');
  return { version: 1, runId: value.runId, sequence: value.sequence as number, revision: value.revision, profile: handProfile(value.profile) };
}
export function encodeProfileControl(type: number, value: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > PROFILE_MAX_BYTES) throw new Error('Hands control is oversized');
  const out = new Uint8Array(16 + bytes.length); out[0] = type; out[1] = 2; out.set(bytes, 16); return out.buffer;
}
export function decodeProfileControl(data: ArrayBuffer, type: number): unknown {
  const b = new Uint8Array(data);
  if (b.length <= 16 || b.length > 16 + PROFILE_MAX_BYTES || b[0] !== type || b[1] !== 2) return null;
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(16))); } catch { return null; }
}
export const matchesProfileAck = (v: unknown, e: HandProfileAck): boolean => object(v) && v.runId === e.runId && v.sequence === e.sequence && v.revision === e.revision;
/** Run binding is supplied by trusted launch metadata, never adopted from an incoming message. */
export class HandProfileReceiver {
  private current: HandProfileEnvelope | null = null;
  private pending: HandProfileEnvelope | null = null;
  private closed = false;
  readonly runId: string;
  private apply: (profile: HandProfile, geometryChanged: boolean) => void;
  private ack: (e: HandProfileAck) => void;
  constructor(runId: string, apply: (profile: HandProfile, geometryChanged: boolean) => void, ack: (e: HandProfileAck) => void) { this.runId = runId; this.apply = apply; this.ack = ack; }
  receive(value: unknown): boolean {
    if (this.closed) return false;
    let e: HandProfileEnvelope; try { e = profileEnvelope(value); } catch { return false; }
    if (e.runId !== this.runId) return false;
    if (this.current && matchesProfileAck(e, this.current)) { this.ack(this.current); return false; }
    if (e.sequence <= Math.max(this.current?.sequence ?? -1, this.pending?.sequence ?? -1)) return false;
    this.pending = e; return true;
  }
  flush(): void {
    if (this.closed || !this.pending) return;
    const e = this.pending; this.pending = null;
    this.apply(e.profile, !!this.current && !sameHandGeometry(this.current.profile, e.profile));
    this.current = e; this.ack(e);
  }
  close(): void { this.closed = true; this.pending = null; }
}

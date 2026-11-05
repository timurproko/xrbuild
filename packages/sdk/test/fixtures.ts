// Builders for host channel messages, byte-compatible with the native host.
import { CAP_GRAB, CAP_PALM, CAP_PINCH, HAND_BYTES, HEADER_BYTES, MSG_DEBUG_IMAGE, MSG_EYES, MSG_HANDS, MSG_PLATFORM, MSG_PROJECTION, MSG_STATUS, MSG_VIEW, PROTOCOL_VERSION, type Vec3 } from '../src/protocol.ts';

function header(v: DataView, type: number, seq: number, hostTimeMs: number, version = PROTOCOL_VERSION) {
  v.setUint8(0, type);
  v.setUint8(1, version);
  v.setUint32(4, seq, true);
  v.setFloat64(8, hostTimeMs, true);
}

export function eyesMessage(left: Vec3, right: Vec3, stale = false, seq = 1, hostTimeMs = 1000): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 28);
  const v = new DataView(b);
  header(v, MSG_EYES, seq, hostTimeMs);
  [...left, ...right].forEach((x, i) => v.setFloat32(HEADER_BYTES + i * 4, x, true));
  v.setUint8(HEADER_BYTES + 24, stale ? 1 : 0);
  return b;
}

export interface FakeHand {
  id: number;
  handedness?: number;
  grabbing?: boolean;
  pinch?: boolean;
  /** 21 keypoints; missing ones are filled from `at` */
  keypoints?: Vec3[];
  at?: Vec3;
  score?: number;
}

/** A plausible open hand around `at` (panel metres): wrist at `at`, fingers pointing +Y. */
export function openHand(at: Vec3): Vec3[] {
  const kp: Vec3[] = [at];
  const fingerX = [-0.03, -0.015, 0, 0.015, 0.03];
  for (let f = 0; f < 5; f++)
    for (let j = 1; j <= 4; j++) kp.push([at[0] + fingerX[f], at[1] + 0.02 * j + (f === 0 ? 0 : 0.03), at[2]]);
  return kp;
}

export interface HandsOptions {
  /** XRB_CAP_* mask (default: all) */
  capabilities?: number;
  /** header version (1: an older host or recording, no capabilities byte) */
  version?: number;
}

export function handsMessage(hands: FakeHand[], captureTimeMs = 1000, seq = 1, trackingHz = 60, opts: HandsOptions = {}): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 16 + hands.length * HAND_BYTES);
  const v = new DataView(b);
  const version = opts.version ?? PROTOCOL_VERSION;
  header(v, MSG_HANDS, seq, captureTimeMs + 5, version);
  v.setFloat64(HEADER_BYTES, captureTimeMs, true);
  v.setFloat32(HEADER_BYTES + 8, trackingHz, true);
  v.setUint8(HEADER_BYTES + 12, hands.length);
  if (version >= 2) v.setUint8(HEADER_BYTES + 13, opts.capabilities ?? CAP_PINCH | CAP_GRAB | CAP_PALM);
  hands.forEach((h, i) => {
    const o = HEADER_BYTES + 16 + i * HAND_BYTES;
    v.setInt32(o, h.id, true);
    v.setInt8(o + 4, h.handedness ?? 1);
    v.setUint8(o + 5, h.grabbing ? 1 : 0);
    v.setUint8(o + 6, h.pinch ? 1 : 0);
    const kp = h.keypoints ?? openHand(h.at ?? [0, 0, 0.2]);
    kp.forEach((p, k) => {
      v.setFloat32(o + 12 + k * 16, p[0], true);
      v.setFloat32(o + 12 + k * 16 + 4, p[1], true);
      v.setFloat32(o + 12 + k * 16 + 8, p[2], true);
      v.setFloat32(o + 12 + k * 16 + 12, h.score ?? 0.9, true);
    });
  });
  return b;
}

export function statusMessage(state: number, text: string, hz = 0): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  const b = new ArrayBuffer(HEADER_BYTES + 10 + bytes.length);
  const v = new DataView(b);
  header(v, MSG_STATUS, 1, 1000);
  v.setUint8(HEADER_BYTES, state);
  v.setFloat32(HEADER_BYTES + 4, hz, true);
  v.setUint16(HEADER_BYTES + 8, bytes.length, true);
  new Uint8Array(b, HEADER_BYTES + 10).set(bytes);
  return b;
}

/** The station's parameters as the host sends them (kPlatform: utf8 JSON). */
export function platformMessage(json: string, seq = 1): ArrayBuffer {
  const bytes = new TextEncoder().encode(json);
  const b = new ArrayBuffer(HEADER_BYTES + bytes.length);
  header(new DataView(b), MSG_PLATFORM, seq, 1000);
  new Uint8Array(b, HEADER_BYTES).set(bytes);
  return b;
}

/** A debug image as the host encodes it (host_channel.cpp encodeImage). */
export function debugImageMessage(stream: number, label: string, format: 1 | 2, width: number, height: number,
  full: [number, number], boxes: [number, number, number, number, number][], pixels: number[]): ArrayBuffer {
  const lb = new TextEncoder().encode(label);
  const b = new ArrayBuffer(HEADER_BYTES + 12 + lb.length + boxes.length * 20 + pixels.length);
  const v = new DataView(b);
  header(v, MSG_DEBUG_IMAGE + stream, 1, 1000);
  const p = HEADER_BYTES;
  v.setUint8(p, stream);
  v.setUint8(p + 1, format);
  v.setUint8(p + 2, boxes.length);
  v.setUint8(p + 3, lb.length);
  [width, height, full[0], full[1]].forEach((x, i) => v.setUint16(p + 4 + i * 2, x, true));
  new Uint8Array(b, p + 12, lb.length).set(lb);
  let o = p + 12 + lb.length;
  for (const bx of boxes) for (const x of bx) { v.setFloat32(o, x, true); o += 4; }
  new Uint8Array(b, o).set(pixels);
  return b;
}

export function projectionMessage(orthographic: boolean, seq = 1): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 1);
  const v = new DataView(b);
  header(v, MSG_PROJECTION, seq, 1000);
  v.setUint8(HEADER_BYTES, orthographic ? 1 : 0);
  return b;
}

/** Fake WebSocket + host for channel tests. */
export function viewMessage(stereo: boolean, switchable = true, width = 1920, height = 1080, seq = 1): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 6);
  const v = new DataView(b);
  v.setUint8(0, MSG_VIEW);
  v.setUint8(1, 1);
  v.setUint32(4, seq, true);
  v.setFloat64(8, 1000, true);
  v.setUint8(HEADER_BYTES, stereo ? 1 : 0);
  v.setUint8(HEADER_BYTES + 1, switchable ? 1 : 0);
  v.setUint16(HEADER_BYTES + 2, width, true);
  v.setUint16(HEADER_BYTES + 4, height, true);
  return b;
}

export class FakeSocket {
  static all: FakeSocket[] = [];
  binaryType = 'blob';
  readyState = 0;
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: ArrayBuffer[] = [];
  url: string;
  constructor(url: string) { this.url = url; FakeSocket.all.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: ArrayBuffer) { this.onmessage?.({ data }); }
  drop() { this.readyState = 3; this.onclose?.(); }
  send(data: ArrayBuffer) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

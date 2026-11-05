// Host channel wire format (little endian). Mirrors native/host/src/host_channel.h and the hand
// layout in native/plugin-sdk/include/xrb_plugin.h; every message starts with a 16-byte header:
//   u8 type, u8 version, u16 reserved, u32 seq, f64 hostTimeMs
// Version 2 (plugins): the hands header carries the provider's capabilities, the input states are
// neutral, and debug images are labelled. Version 1 messages (older hosts, old recordings) still decode.

export const MSG_EYES = 1;
export const MSG_HANDS = 2;
export const MSG_STATUS = 3;
export const MSG_VIEW = 4;
/** v2: the station's configure parameters (JSON) */
export const MSG_PLATFORM = 5;
/** Managed mono camera projection: 0 Perspective, 1 Orthographic. */
export const MSG_PROJECTION = 6;
/** Debug images: MSG_DEBUG_IMAGE + stream (0..7) */
export const MSG_DEBUG_IMAGE = 10;
export const DEBUG_STREAMS = 8;
export const MSG_PAGE_FRAME = 100;
export const MSG_SET_VIEW = 101;
export const MSG_SET_PROJECTION = 103;
export const PROTOCOL_VERSION = 2;
export const HEADER_BYTES = 16;
export const HAND_BYTES = 456;
export const NUM_KEYPOINTS = 21;

export type Vec3 = [number, number, number];

export interface Header {
  type: number;
  version: number;
  seq: number;
  hostTimeMs: number;
}

/** Eye positions in the panel frame (metres): origin at the panel centre, +X right, +Y up the panel, +Z toward the viewer. */
export interface EyesMessage extends Header {
  left: Vec3;
  right: Vec3;
  stale: boolean;
}

export interface WireHand {
  id: number;
  /** 0 left, 1 right, -1 unknown */
  handedness: number;
  grabbing: boolean;
  /** index, middle, ring, pinky */
  pinch: [boolean, boolean, boolean, boolean];
  /** 21 keypoints in the common hand landmark order, panel frame metres */
  keypoints: Vec3[];
  scores: number[];
  pinchPositions: Vec3[];
  grabPosition: Vec3;
  /** wrist, palm normal, palm right, palm forward */
  palm: [Vec3, Vec3, Vec3, Vec3];
}

/**
 * What the input provider fills in natively. Without a capability its fields are zero and the SDK
 * computes the gesture from the keypoints instead.
 */
export interface HandCapabilities {
  /** `pinch` and `pinchPositions` */
  pinch: boolean;
  /** `grabbing` and `grabPosition` */
  grab: boolean;
  /** `palm` */
  palm: boolean;
}

export const CAP_PINCH = 1;
export const CAP_GRAB = 2;
export const CAP_PALM = 4;
/** Version 1 hands predate capabilities: their only provider filled every field. */
export const ALL_CAPABILITIES: HandCapabilities = { pinch: true, grab: true, palm: true };

export function capabilitiesFromMask(mask: number): HandCapabilities {
  return { pinch: (mask & CAP_PINCH) !== 0, grab: (mask & CAP_GRAB) !== 0, palm: (mask & CAP_PALM) !== 0 };
}

export interface HandsMessage extends Header {
  /** host clock (QPC ms) when the newest device frame of this result arrived */
  captureTimeMs: number;
  trackingHz: number;
  capabilities: HandCapabilities;
  hands: WireHand[];
}

/** Input provider states (the same numbers in versions 1 and 2; version 1 named 2 and 3 after its tracker). */
export const HAND_STATE = ['starting', 'running', 'needs-setup', 'device-missing', 'failed'] as const;
export type HandState = (typeof HAND_STATE)[number];

export interface StatusMessage extends Header {
  state: HandState;
  trackingHz: number;
  text: string;
}

/** The host's current view: side by side in 3D, or mono in 2D. Sent at start and after every switch. */
export interface ViewMessage extends Header {
  /** true: the page is 2 x eye width, left eye in the left half, shown in 3D */
  stereo: boolean;
  /** the display has a switchable session: the view can be switched at run time (false on a mono display) */
  switchable: boolean;
  /** per-eye view size in CSS px */
  width: number;
  height: number;
}

/** The station runtime and the parameters it configured the app with (sent at start and after every configure). */
export interface PlatformInfo {
  /** platform provider, e.g. "station"; "" when the app runs standalone */
  name: string;
  /** configure parameters, as the station sends them (often all strings) */
  params: Record<string, unknown>;
}

export interface PlatformMessage extends Header, PlatformInfo {}

export interface ProjectionMessage extends Header {
  orthographic: boolean;
}

/** One debug image of the input provider (camera view): sent with --camera-view=on. */
export interface DebugImageMessage extends Header {
  stream: number;
  format: 'y8' | 'rgb8';
  /** e.g. "Camera 1 IR" */
  label: string;
  /** sent size, pixels */
  width: number;
  height: number;
  /** pixel space of `boxes` (the device's full image size) */
  fullWidth: number;
  fullHeight: number;
  /** detections: x, y, w, h, score */
  boxes: [number, number, number, number, number][];
  /** tightly packed rows, 1 (y8) or 3 (rgb8) bytes per pixel */
  pixels: Uint8Array;
}

export type HostMessage = EyesMessage | HandsMessage | StatusMessage | ViewMessage | ProjectionMessage | DebugImageMessage | PlatformMessage;

function header(v: DataView): Header {
  return { type: v.getUint8(0), version: v.getUint8(1), seq: v.getUint32(4, true), hostTimeMs: v.getFloat64(8, true) };
}

function vec3(v: DataView, o: number): Vec3 {
  return [v.getFloat32(o, true), v.getFloat32(o + 4, true), v.getFloat32(o + 8, true)];
}

/** Decodes one channel message; returns null for unknown types or truncated data. */
export function decodeMessage(buffer: ArrayBuffer): HostMessage | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const v = new DataView(buffer);
  const h = header(v);
  const p = HEADER_BYTES;
  if (h.type === MSG_EYES) {
    if (buffer.byteLength < p + 28) return null;
    return { ...h, left: vec3(v, p), right: vec3(v, p + 12), stale: v.getUint8(p + 24) === 1 };
  }
  if (h.type === MSG_HANDS) {
    if (buffer.byteLength < p + 16) return null;
    const count = v.getUint8(p + 12);
    if (buffer.byteLength < p + 16 + count * HAND_BYTES) return null;
    const hands: WireHand[] = [];
    for (let i = 0; i < count; i++) {
      const b = p + 16 + i * HAND_BYTES;
      const keypoints: Vec3[] = [];
      const scores: number[] = [];
      for (let k = 0; k < NUM_KEYPOINTS; k++) {
        keypoints.push(vec3(v, b + 12 + k * 16));
        scores.push(v.getFloat32(b + 12 + k * 16 + 12, true));
      }
      const pp = b + 12 + NUM_KEYPOINTS * 16;
      hands.push({
        id: v.getInt32(b, true),
        handedness: v.getInt8(b + 4),
        grabbing: (v.getUint8(b + 5) & 1) === 1,
        pinch: [v.getUint8(b + 6) === 1, v.getUint8(b + 7) === 1, v.getUint8(b + 8) === 1, v.getUint8(b + 9) === 1],
        keypoints,
        scores,
        pinchPositions: [vec3(v, pp), vec3(v, pp + 12), vec3(v, pp + 24), vec3(v, pp + 36)],
        grabPosition: vec3(v, pp + 48),
        palm: [vec3(v, pp + 60), vec3(v, pp + 72), vec3(v, pp + 84), vec3(v, pp + 96)],
      });
    }
    const capabilities = h.version >= 2 ? capabilitiesFromMask(v.getUint8(p + 13)) : { ...ALL_CAPABILITIES };
    return { ...h, captureTimeMs: v.getFloat64(p, true), trackingHz: v.getFloat32(p + 8, true), capabilities, hands };
  }
  if (h.type === MSG_VIEW) {
    if (buffer.byteLength < p + 6) return null;
    return { ...h, stereo: v.getUint8(p) === 1, switchable: v.getUint8(p + 1) === 1, width: v.getUint16(p + 2, true), height: v.getUint16(p + 4, true) };
  }
  if (h.type === MSG_PROJECTION) {
    if (buffer.byteLength < p + 1 || v.getUint8(p) > 1) return null;
    return { ...h, orthographic: v.getUint8(p) === 1 };
  }
  if (h.type === MSG_STATUS) {
    if (buffer.byteLength < p + 10) return null;
    const len = v.getUint16(p + 8, true);
    const text = new TextDecoder().decode(new Uint8Array(buffer, p + 10, Math.min(len, buffer.byteLength - p - 10)));
    return { ...h, state: HAND_STATE[v.getUint8(p)] ?? 'failed', trackingHz: v.getFloat32(p + 4, true), text };
  }
  if (h.type === MSG_PLATFORM) {
    let j: unknown;
    try {
      j = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, p)));
    } catch {
      return null;
    }
    const o = (j ?? {}) as { name?: unknown; params?: unknown };
    const params = o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? (o.params as Record<string, unknown>) : {};
    return { ...h, name: typeof o.name === 'string' ? o.name : '', params };
  }
  if (h.type >= MSG_DEBUG_IMAGE && h.type < MSG_DEBUG_IMAGE + DEBUG_STREAMS && h.version >= 2) {
    if (buffer.byteLength < p + 12) return null;
    const format = v.getUint8(p + 1) === 2 ? 'rgb8' : 'y8';
    const nBoxes = v.getUint8(p + 2), labelLen = v.getUint8(p + 3);
    const width = v.getUint16(p + 4, true), height = v.getUint16(p + 6, true);
    let o = p + 12;
    const pixelBytes = width * height * (format === 'rgb8' ? 3 : 1);
    if (buffer.byteLength < o + labelLen + nBoxes * 20 + pixelBytes) return null;
    const label = new TextDecoder().decode(new Uint8Array(buffer, o, labelLen));
    o += labelLen;
    const boxes: DebugImageMessage['boxes'] = [];
    for (let i = 0; i < nBoxes; i++, o += 20)
      boxes.push([v.getFloat32(o, true), v.getFloat32(o + 4, true), v.getFloat32(o + 8, true), v.getFloat32(o + 12, true), v.getFloat32(o + 16, true)]);
    return {
      ...h, stream: v.getUint8(p), format, label, width, height,
      fullWidth: v.getUint16(p + 8, true), fullHeight: v.getUint16(p + 10, true), boxes, pixels: new Uint8Array(buffer, o, pixelBytes),
    };
  }
  return null;
}

/** The page's own performance, reported to the host (shown in the control panel, not in the app). */
export interface PagePerformance {
  fps: number;
  /** median frame interval over the last second, ms */
  frameMs: number;
  /** median camera-to-page hand delivery over the last second, ms; null when no hands arrive */
  latencyMs: number | null;
  /** render resolution of one eye, pixels */
  eyeWidth: number;
  eyeHeight: number;
}

/** Page -> host: show the app in 3D (side by side, stereo on) or in 2D (mono). Payload: u8 stereo. */
export function encodeSetView(hostTimeMs: number, stereo: boolean): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 1);
  const v = new DataView(b);
  v.setUint8(0, MSG_SET_VIEW);
  v.setUint8(1, PROTOCOL_VERSION);
  v.setFloat64(8, hostTimeMs, true);
  v.setUint8(HEADER_BYTES, stereo ? 1 : 0);
  return b;
}

/** Tool -> host: update the managed mono camera projection. Payload: u8 orthographic. */
export function encodeSetProjection(hostTimeMs: number, orthographic: boolean): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + 1);
  const v = new DataView(b);
  v.setUint8(0, MSG_SET_PROJECTION);
  v.setUint8(1, PROTOCOL_VERSION);
  v.setFloat64(8, hostTimeMs, true);
  v.setUint8(HEADER_BYTES, orthographic ? 1 : 0);
  return b;
}

/** Payload bytes of the page heartbeat. Hosts also accept the older 12-byte form (fps only). */
export const PAGE_FRAME_BYTES = 24;

/**
 * Page -> host heartbeat: lets the host report the page's performance and detect a hung page.
 * Payload: f64 pageTimeMs, f32 fps, f32 frameMs, f32 latencyMs (NaN = unknown), u16 eyeW, u16 eyeH.
 */
export function encodePageFrame(hostTimeMs: number, pageTimeMs: number, perf: PagePerformance): ArrayBuffer {
  const b = new ArrayBuffer(HEADER_BYTES + PAGE_FRAME_BYTES);
  const v = new DataView(b);
  const p = HEADER_BYTES;
  v.setUint8(0, MSG_PAGE_FRAME);
  v.setUint8(1, PROTOCOL_VERSION);
  v.setFloat64(8, hostTimeMs, true);
  v.setFloat64(p, pageTimeMs, true);
  v.setFloat32(p + 8, perf.fps, true);
  v.setFloat32(p + 12, perf.frameMs, true);
  v.setFloat32(p + 16, perf.latencyMs ?? Number.NaN, true);
  v.setUint16(p + 20, Math.max(0, Math.min(65535, Math.round(perf.eyeWidth))), true);
  v.setUint16(p + 22, Math.max(0, Math.min(65535, Math.round(perf.eyeHeight))), true);
  return b;
}

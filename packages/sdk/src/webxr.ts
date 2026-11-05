// WebXR headset runtime: the same app in a standalone headset's browser engine, without a host.
// The headset's hand joints become the SDK's 21-keypoint hands, and a virtual panel anchored in the
// room in front of the user stands in for the physical panel, so panel mappings, hand-to-scene
// conversion and the controls' physical sizes mean the same as on a 3D display.
// Only the WebXR calls the SDK uses are typed here (no dependency on the WebXR type package).
import * as THREE from 'three';
import type { DisplayInfo } from './host.ts';
import { MSG_HANDS, NUM_KEYPOINTS, PROTOCOL_VERSION, type HandCapabilities, type HandsMessage, type Vec3, type WireHand } from './protocol.ts';

export type XrMode = 'immersive-ar' | 'immersive-vr';

export interface XrPose {
  transform: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
}
export interface XrView extends XrPose {
  eye: 'left' | 'right' | 'none';
}
export interface XrViewerPose extends XrPose {
  views: readonly XrView[];
}
export interface XrInputSource {
  handedness: 'left' | 'right' | 'none';
  /** XRHand: joint name -> joint space */
  hand?: { get(joint: string): unknown } | null;
}
export interface XrSessionLike extends EventTarget {
  inputSources: Iterable<XrInputSource>;
  end(): Promise<void>;
}
export interface XrFrameLike {
  session: XrSessionLike;
  getViewerPose(space: unknown): XrViewerPose | null | undefined;
  getJointPose?(joint: unknown, space: unknown): XrPose | null | undefined;
}
export interface XrSystemLike {
  addEventListener?(type: 'sessiongranted', fn: () => void): void;
  isSessionSupported(mode: XrMode): Promise<boolean>;
  requestSession(mode: XrMode, init?: { optionalFeatures?: string[]; requiredFeatures?: string[] }): Promise<XrSessionLike>;
}

export interface XrPanelOptions {
  /** virtual panel size in metres; default: the nominal display's (about 0.60 x 0.34 m) */
  widthM?: number;
  heightM?: number;
  /** panel centre in front of the head (metres) */
  distanceM?: number;
  /** panel centre below the head (metres) */
  dropM?: number;
}

export interface XrOptions {
  /** session kind; default: passthrough ('immersive-ar') when the headset offers it, else 'immersive-vr' */
  mode?: XrMode;
  /** show the SDK's Enter button when a session is available; default true */
  button?: boolean;
  /** hide the scene background in passthrough so the room shows through; default true */
  passthroughBackground?: boolean;
  /**
   * enter the session as soon as it is available, without the Enter button: for an app installed as an
   * immersive headset app, whose launch counts as the user's gesture. Default: the page URL has `xrb-xr=enter`
   * (what a headset packager puts in the app's start address).
   */
  autoEnter?: boolean;
  panel?: XrPanelOptions;
}

export const XR_PANEL_DEFAULTS = { distanceM: 0.45, dropM: 0.15 };

/**
 * WebXR hand joints in the SDK's keypoint order (wrist, then thumb, index, middle, ring, pinky from the
 * base to the tip). The thumb's metacarpal is its first keypoint; the other fingers' metacarpals are dropped.
 */
export const XR_JOINTS: readonly string[] = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].flatMap((f) => [
    `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`,
  ]),
];

/** The headset tracks keypoints only: pinch and grab are computed by the SDK. */
export const XR_HAND_CAPABILITIES: HandCapabilities = { pinch: false, grab: false, palm: false };

/** The immersive session this browser offers: `preferred` when given, else passthrough before VR; null when none. */
export async function detectXrMode(xr: XrSystemLike | null | undefined, preferred?: XrMode): Promise<XrMode | null> {
  if (!xr) return null;
  const order: XrMode[] = preferred ? [preferred] : ['immersive-ar', 'immersive-vr'];
  for (const mode of order) {
    try {
      if (await xr.isSessionSupported(mode)) return mode;
    } catch {
      // a browser may refuse the query (e.g. no secure context): treated as unsupported
    }
  }
  return null;
}

/** Whether a page address asks to enter the headset session at once (`?xrb-xr=enter`). */
export function wantsAutoEnter(search: string): boolean {
  return new URLSearchParams(search).get('xrb-xr') === 'enter';
}

/** The size of the virtual panel as the display the SDK renders for. */
export function virtualDisplay(base: DisplayInfo, panel: XrPanelOptions = {}): DisplayInfo {
  return { ...base, widthM: panel.widthM ?? base.widthM, heightM: panel.heightM ?? base.heightM, tiltRad: 0 };
}

const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const quat = (q: { x: number; y: number; z: number; w: number }) => new THREE.Quaternion(q.x, q.y, q.z, q.w);

/**
 * The virtual panel in the session's reference space (metres): anchored in front of the head, upright,
 * turned to face it (yaw only). `toPanel` maps reference-space points into the panel frame.
 */
export class VirtualPanel {
  /** panel frame -> reference space */
  readonly pose = new THREE.Matrix4();
  /** reference space -> panel frame */
  readonly toPanel = new THREE.Matrix4();
  anchored = false;
  private readonly distanceM: number;
  private readonly dropM: number;

  constructor(options: XrPanelOptions = {}) {
    this.distanceM = options.distanceM ?? XR_PANEL_DEFAULTS.distanceM;
    this.dropM = options.dropM ?? XR_PANEL_DEFAULTS.dropM;
  }

  /** Places the panel in front of a head pose (reference space). */
  anchor(headPosition: THREE.Vector3, headQuaternion: THREE.Quaternion): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);  // looking straight up or down: keep the reference heading
    forward.normalize();
    const yaw = Math.atan2(-forward.x, -forward.z);
    const centre = headPosition.clone().addScaledVector(forward, this.distanceM);
    centre.y -= this.dropM;
    this.pose.compose(centre, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    this.toPanel.copy(this.pose).invert();
    this.anchored = true;
  }

  /** Forgets the anchor: the next frame places the panel in front of the head again. */
  reset(): void {
    this.anchored = false;
  }

  pointToPanel(p: { x: number; y: number; z: number }): Vec3 {
    const v = v3(p).applyMatrix4(this.toPanel);
    return [v.x, v.y, v.z];
  }
}

/** One XRHand's joints as the 21 keypoints in the panel frame; null when a joint has no pose this frame. */
export function handKeypoints(frame: XrFrameLike, hand: NonNullable<XrInputSource['hand']>, space: unknown, panel: VirtualPanel): Vec3[] | null {
  if (!frame.getJointPose) return null;
  const out: Vec3[] = [];
  for (const name of XR_JOINTS) {
    const joint = hand.get(name);
    const pose = joint ? frame.getJointPose(joint, space) : null;
    if (!pose) return null;
    out.push(panel.pointToPanel(pose.transform.position));
  }
  return out;
}

/** A tracked hand in the host's wire format, so the headset feeds the same hand input as any provider. */
export function wireHand(id: number, handedness: XrInputSource['handedness'], keypoints: Vec3[]): WireHand {
  const zero: Vec3 = [0, 0, 0];
  return {
    id,
    handedness: handedness === 'left' ? 0 : handedness === 'right' ? 1 : -1,
    grabbing: false,
    pinch: [false, false, false, false],
    keypoints,
    scores: Array(NUM_KEYPOINTS).fill(1),
    pinchPositions: [zero, zero, zero, zero],
    grabPosition: zero,
    palm: [keypoints[0], zero, zero, zero],
  };
}

/** Reads the session's hands each frame; ids stay stable per input source. */
export class XrHands {
  private readonly ids = new WeakMap<object, number>();
  private nextId = 1;
  private seq = 0;

  read(frame: XrFrameLike, space: unknown, panel: VirtualPanel, timeMs: number): HandsMessage {
    const hands: WireHand[] = [];
    for (const source of frame.session.inputSources) {
      if (!source.hand) continue;
      const keypoints = handKeypoints(frame, source.hand, space, panel);
      if (!keypoints) continue;
      let id = this.ids.get(source);
      if (id === undefined) this.ids.set(source, (id = this.nextId++));
      hands.push(wireHand(id, source.handedness, keypoints));
    }
    return { type: MSG_HANDS, version: PROTOCOL_VERSION, seq: this.seq++, hostTimeMs: timeMs, captureTimeMs: timeMs, trackingHz: 0, capabilities: XR_HAND_CAPABILITIES, hands };
  }
}

/** Eye positions of a viewer pose in the panel frame (left, right); both at the head without per-eye views. */
export function eyesInPanel(pose: XrViewerPose, panel: VirtualPanel): { left: Vec3; right: Vec3 } {
  const left = pose.views.find((v) => v.eye === 'left') ?? pose;
  const right = pose.views.find((v) => v.eye === 'right') ?? pose;
  return { left: panel.pointToPanel(left.transform.position), right: panel.pointToPanel(right.transform.position) };
}

/** Head position and orientation of a viewer pose. */
export function headOf(pose: XrPose): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  return { position: v3(pose.transform.position), quaternion: quat(pose.transform.orientation) };
}

/**
 * Reference space -> world for the XR camera's parent: the virtual panel lands where the app's panel
 * mapping puts the panel in the scene (`panelToWorld`, scale included).
 */
export function rigMatrix(panelToWorld: THREE.Matrix4, panel: VirtualPanel, out = new THREE.Matrix4()): THREE.Matrix4 {
  return out.multiplyMatrices(panelToWorld, panel.toPanel);
}

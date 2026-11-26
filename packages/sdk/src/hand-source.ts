import { HandInput } from './hands.ts';
import { handProfile, type HandProfile } from './hand-profile.ts';
import { ALL_CAPABILITIES, type Vec3, type HandCapabilities, type HandsMessage } from './protocol.ts';

export type HandSourcePolicy = 'off' | 'native' | 'webxr';
export function handSourcePolicy(hosted: boolean, search = '', bundled?: unknown): HandSourcePolicy {
  const query = new URLSearchParams(search).get('xrb-hand');
  const value = bundled ?? query;
  return value === 'off' || value === 'native' || value === 'webxr' ? value : hosted ? 'native' : 'webxr';
}
/** Exactly once, after provider panel conversion and before shared filtering/gestures. */
export function prepareHandFrame(frame: HandsMessage, profile: HandProfile = handProfile()): HandsMessage {
  const { sizeFactor: s, offsetMm: d } = profile;
  if (s === 1 && d.x === 0 && d.y === 0 && d.z === 0) return frame;
  const caps = frame.capabilities ?? ALL_CAPABILITIES;
  return { ...frame, hands: frame.hands.map(hand => {
    const w = hand.keypoints[0];
    const point = (p: Vec3): Vec3 => [w[0] + s * (p[0] - w[0]) + d.x / 1000, w[1] + s * (p[1] - w[1]) + d.y / 1000, w[2] + s * (p[2] - w[2]) + d.z / 1000];
    return { ...hand, keypoints: hand.keypoints.map(point),
      pinchPositions: caps.pinch ? hand.pinchPositions.map(point) : hand.pinchPositions,
      grabPosition: caps.grab ? point(hand.grabPosition) : hand.grabPosition,
      palm: caps.palm ? [point(hand.palm[0]), hand.palm[1], hand.palm[2], hand.palm[3]] as typeof hand.palm : hand.palm };
  }) };
}

export class HandFrameIngress {
  generation = 0;
  capabilities: HandCapabilities = ALL_CAPABILITIES;
  profile: HandProfile = handProfile();
  ready = true;
  private closed = false;
  private readonly input: HandInput;
  readonly policy: HandSourcePolicy;
  constructor(input: HandInput, policy: HandSourcePolicy) { this.input = input; this.policy = policy; }
  push(source: 'native' | 'webxr', frame: HandsMessage, capturePageMs: number, generation = this.generation): boolean {
    if (this.closed || !this.ready || source !== this.policy || generation !== this.generation) return false;
    const prepared = prepareHandFrame(frame, this.profile);
    this.capabilities = prepared.capabilities ?? ALL_CAPABILITIES;
    this.input.push(prepared, capturePageMs);
    return true;
  }
  reset(now = performance.now()): void { this.generation++; this.input.reset(now); this.capabilities = ALL_CAPABILITIES; }
  close(now = performance.now()): void { this.closed = true; this.reset(now); }
}

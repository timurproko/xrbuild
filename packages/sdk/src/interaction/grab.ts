// Grabbing objects with a hand: pinch-grab with a filtered follow. The grab point is the pinch centre (between thumb
// and index tip) and the object follows the hand through a 60 ms filter.
import * as THREE from 'three';
import { KP } from '../hands.ts';

/**
 * Palm orientation from three keypoints, as HandOrientation.cs computes it:
 * normal = (index MCP - wrist) x (pinky MCP - wrist), flipped for right hands;
 * right = pinky MCP - index MCP projected onto the palm plane.
 * Points are world-space; returns a world quaternion (Y = palm normal).
 */
export function palmQuaternion(points: THREE.Vector3[], handedness: 'left' | 'right' | 'unknown', out = new THREE.Quaternion()): THREE.Quaternion {
  const wrist = points[KP.WRIST], index = points[KP.INDEX_MCP], pinky = points[KP.PINKY_MCP];
  const normal = new THREE.Vector3().crossVectors(index.clone().sub(wrist), pinky.clone().sub(wrist)).normalize();
  if (handedness === 'right') normal.negate();
  const right = pinky.clone().sub(index);
  right.addScaledVector(normal, -right.dot(normal)).normalize();
  if (handedness === 'left') right.negate();
  // Proper rotation basis (right, normal, right x normal); a look rotation (forward = right x normal, up = normal)
  // is the same frame in its left-handed convention.
  const forward = new THREE.Vector3().crossVectors(right, normal).normalize();
  const m = new THREE.Matrix4().makeBasis(right, normal, forward);
  return out.setFromRotationMatrix(m);
}

/** Midpoint of thumb tip and index tip: the pinch centre. */
export function pinchCentre(points: THREE.Vector3[], out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(points[KP.THUMB_TIP]).add(points[KP.INDEX_TIP]).multiplyScalar(0.5);
}

export interface GrabRotateOptions {
  /** 'y': only the twist about the object's local Y axis (a desk globe); 'free': full palm rotation */
  axis?: 'y' | 'free';
  /** TransformFilter smoothing time (s) */
  smoothTime?: number;
}

/**
 * Rotates an object with the palm while grabbed (the object stays where it is).
 * Start with the palm orientation at the grab moment; the object then turns by
 * however much the palm turns.
 */
export class GrabRotate {
  readonly object: THREE.Object3D;
  grabbing = false;
  private readonly o: Required<GrabRotateOptions>;
  private readonly startObject = new THREE.Quaternion();
  private readonly startPalmInv = new THREE.Quaternion();
  private readonly target = new THREE.Quaternion();
  private startYaw = 0;

  constructor(object: THREE.Object3D, options: GrabRotateOptions = {}) {
    this.object = object;
    this.o = { axis: 'y', smoothTime: 0.06, ...options };
  }

  begin(palm: THREE.Quaternion): void {
    this.grabbing = true;
    this.startObject.copy(this.object.quaternion);
    this.startPalmInv.copy(palm).invert();
    this.startYaw = this.yawOf(palm);
    this.target.copy(this.object.quaternion);
  }

  update(palm: THREE.Quaternion, dt: number): void {
    if (!this.grabbing) return;
    if (this.o.axis === 'y') {
      // Twist of the palm about the object's parent-space up axis.
      let d = this.yawOf(palm) - this.startYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const twist = new THREE.Quaternion().setFromAxisAngle(this.upAxis(), d);
      this.target.copy(twist).multiply(this.startObject);
    } else {
      // palm * inv(startPalm) applied on top of the start orientation, in parent space.
      const delta = palm.clone().multiply(this.startPalmInv);
      const parentInv = this.parentQuaternion().invert();
      const parent = this.parentQuaternion();
      this.target.copy(parentInv.multiply(delta).multiply(parent)).multiply(this.startObject);
    }
    // TransformFilter: slerp(current, target, dt / smoothTime).
    this.object.quaternion.slerp(this.target, Math.min(1, dt / this.o.smoothTime));
    this.object.updateMatrixWorld();
  }

  end(): void {
    this.grabbing = false;
  }

  private parentQuaternion(): THREE.Quaternion {
    const q = new THREE.Quaternion();
    this.object.parent?.getWorldQuaternion(q);
    return q;
  }

  /** The object's up axis expressed in its parent's frame at grab start. */
  private upAxis(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.startObject).normalize();
  }

  /** Palm heading angle around the object's up axis, measured in the parent's frame. */
  private yawOf(palmWorld: THREE.Quaternion): number {
    const parentInv = this.parentQuaternion().invert();
    const palmLocal = parentInv.multiply(palmWorld);
    const up = this.upAxis();
    // Palm "right" direction projected onto the plane perpendicular to up.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(palmLocal);
    right.addScaledVector(up, -right.dot(up));
    const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = ref.addScaledVector(up, -ref.dot(up)).normalize();
    const e2 = new THREE.Vector3().crossVectors(up, e1);
    return Math.atan2(right.dot(e2), right.dot(e1));
  }
}

export interface SelectTarget<T> {
  id: T;
  /** world position of the target (e.g. a marker) */
  position: THREE.Vector3;
  /** false = currently not selectable (hidden, behind the globe, ...) */
  enabled?: boolean;
}

/**
 * Pinch to select: on the first frame of a
 * pinch, the target closest to the pinch centre wins if it is within `radius`.
 * No rays. `hover` reports the target a pinch would hit right now.
 */
export function nearestTarget<T>(targets: SelectTarget<T>[], point: THREE.Vector3, radius: number): SelectTarget<T> | null {
  let best: SelectTarget<T> | null = null, bestD = radius;
  for (const t of targets) {
    if (t.enabled === false) continue;
    const d = t.position.distanceTo(point);
    if (d <= bestD) { bestD = d; best = t; }
  }
  return best;
}

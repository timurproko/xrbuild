// Trackball: put a hand into the sphere and move it to turn the object; it coasts to a
// stop after the hand leaves.
//
// The contact set is the hand keypoints inside the sphere. Algorithm per fixed 50 Hz tick:
//   contact = mean of the keypoints inside, in the object's own (rotating) frame
//   smoothed with SmoothDamp(0.15 s)
//   axis = prev x curr, angle = signedAngle(prev, curr) * gain(3) -> rotate
//   after release: angular velocity /= 1 + dt * damp(5) per tick
// Measuring in the rotating frame makes the loop self-limiting: the ball turns at
// about gain/(1+gain) = 75 % of the hand's angular speed.
import * as THREE from 'three';
import { smoothDamp } from './smooth-damp.ts';

export interface TrackballOptions {
  /** sphere radius in the object's local units */
  radius: number;
  /** 'x' | 'y' | 'z': spin about that local axis only ('y' = a desk globe); 'free': roll in any direction */
  axis?: TrackballAxis;
  gain?: number;
  smoothTime?: number;
  damp?: number;
  /** keypoints inside the sphere needed to engage / to stay engaged */
  engageCount?: number;
  releaseCount?: number;
  /** contact centre must stay within this fraction of the radius */
  maxRadius?: number;
}

export type TrackballAxis = 'x' | 'y' | 'z' | 'free';

const TICK = 0.02;  // fixed 50 Hz step
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export class Trackball {
  readonly object: THREE.Object3D;
  enabled = true;
  touching = false;
  /** degrees per tick, signed, about `axisLocal` */
  angularVelocity = 0;
  /** spin axis mode; may change at any time (Trackball3D's Full / X / Y / Z) */
  axis: TrackballAxis;
  private readonly o: Required<TrackballOptions>;
  private readonly axisLocal = new THREE.Vector3(0, 1, 0);
  private readonly current = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private accumulator = 0;

  constructor(object: THREE.Object3D, options: TrackballOptions) {
    this.object = object;
    this.o = {
      axis: 'y', gain: 3, smoothTime: 0.15, damp: 5, engageCount: 6, releaseCount: 4, maxRadius: 0.98,
      ...options,
    };
    this.axis = this.o.axis;
  }

  /** Feed all hand keypoints (world space) for this frame; advances in fixed ticks. */
  update(dt: number, worldPoints: THREE.Vector3[]): void {
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= TICK) {
      this.accumulator -= TICK;
      this.tick(worldPoints);
    }
  }

  /** Stops any coasting (e.g. when a grab takes over). */
  stop(): void {
    this.angularVelocity = 0;
    this.touching = false;
  }

  private tick(worldPoints: THREE.Vector3[]): void {
    const contact = this.enabled ? this.contact(worldPoints) : null;
    if (contact && !this.touching) {
      // Engage without a jump.
      this.touching = true;
      this.current.copy(contact);
      this.prev.copy(contact);
      this.vel.set(0, 0, 0);
    } else if (!contact && this.touching) {
      this.touching = false;
    }

    if (this.touching && contact) {
      this.target.copy(contact);
      smoothDamp(this.current, this.target, this.vel, this.o.smoothTime, TICK, this.current);
      const a = this.prev.clone(), b = this.current.clone();
      if (this.axis !== 'free') {
        // Spin about one local axis: measure in the plane perpendicular to it.
        this.axisLocal.copy(AXES[this.axis]);
        a.addScaledVector(this.axisLocal, -a.dot(this.axisLocal));
        b.addScaledVector(this.axisLocal, -b.dot(this.axisLocal));
      } else this.axisLocal.crossVectors(a, b).normalize();
      if (a.lengthSq() > 1e-12 && b.lengthSq() > 1e-12 && this.axisLocal.lengthSq() > 0.5) {
        const angle = a.angleTo(b) * Math.sign(new THREE.Vector3().crossVectors(a, b).dot(this.axisLocal) || 1);
        this.angularVelocity = THREE.MathUtils.radToDeg(angle) * this.o.gain;
      } else {
        this.angularVelocity = 0;
      }
      this.prev.copy(this.current);
    } else {
      this.angularVelocity /= 1 + TICK * this.o.damp;
      if (Math.abs(this.angularVelocity) <= 0.001) this.angularVelocity = 0;
    }

    if (this.angularVelocity !== 0) {
      this.object.rotateOnAxis(this.axisLocal, THREE.MathUtils.degToRad(this.angularVelocity));
      this.object.updateMatrixWorld();
    }
  }

  /** Mean of the keypoints inside the sphere, in the object's local frame; null if not engaged. */
  private contact(worldPoints: THREE.Vector3[]): THREE.Vector3 | null {
    this.object.updateMatrixWorld();
    const inv = this.object.matrixWorld.clone().invert();
    const r = this.o.radius;
    const limit = this.touching ? this.o.maxRadius * 1.02 : this.o.maxRadius;
    const sum = new THREE.Vector3();
    let n = 0;
    for (const p of worldPoints) {
      const l = p.clone().applyMatrix4(inv);
      if (l.length() < r) { sum.add(l); n++; }
    }
    // Hysteresis: engage at engageCount, release at releaseCount.
    if (this.touching ? n <= this.o.releaseCount : n < this.o.engageCount) return null;
    const mean = sum.divideScalar(n);
    return mean.length() < limit * r ? mean : null;
  }
}

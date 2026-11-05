// Critically damped spring smoothing (the "SmoothDamp" of Game Programming Gems 4, ch. 1.10):
// moves toward a target with a smooth time and no overshoot.
import * as THREE from 'three';

export function smoothDamp(
  current: THREE.Vector3,
  target: THREE.Vector3,
  velocity: THREE.Vector3,
  smoothTime: number,
  dt: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current.clone().sub(target);
  const tmp = velocity.clone().addScaledVector(change, omega).multiplyScalar(dt);
  velocity.sub(tmp.clone().multiplyScalar(omega)).multiplyScalar(exp);
  out.copy(target).add(change.add(tmp).multiplyScalar(exp));
  // Prevent overshooting.
  const toTarget = target.clone().sub(current);
  const toOut = out.clone().sub(target);
  if (toTarget.dot(toOut) > 0) {
    out.copy(target);
    velocity.set(0, 0, 0);
  }
  return out;
}

import { Matrix4, Vector3 } from 'three';
import type { MeshPose } from './hand-mesh-protocol.ts';

/** Maximum articulation change after removing rigid wrist motion, not a fit-quality score. */
export const MESH_MAX_RESIDUAL_M = .01;
function wristFrame(pose: MeshPose): Matrix4 | null {
  if (pose.keypoints.length !== 21 || pose.keypoints.some(p => p.length !== 3 || p.some(n => !Number.isFinite(n)))) return null;
  // Unknown evidence remains unknown; explicitly unsupported anchor joints cannot orient skin safely.
  if ([0, 5, 9, 17].some(i => pose.observations?.supported[i] === false)) return null;
  const wrist = new Vector3(...pose.keypoints[0]);
  const x = new Vector3(...pose.keypoints[5]).sub(new Vector3(...pose.keypoints[17]));
  const y = new Vector3(...pose.keypoints[9]).sub(wrist);
  if (x.lengthSq() < 1e-8 || y.lengthSq() < 1e-8) return null;
  x.normalize(); y.normalize();
  const z = new Vector3().crossVectors(x, y);
  if (z.lengthSq() < .01) return null; // near-collinear palm, no stable orientation
  z.normalize(); y.crossVectors(z, x).normalize();
  return new Matrix4().makeBasis(x, y, z).setPosition(wrist);
}
/** Pure source-to-current transform. Always operate on original geometry, never the previous render. */
export function meshMotion(source: MeshPose, current: MeshPose): { transform: number[]; residualM: number } | null {
  if (source.id !== current.id || source.handedness !== current.handedness || current.handedness === 'unknown') return null;
  const before = wristFrame(source), after = wristFrame(current);
  if (!before || !after) return null;
  const delta = after.multiply(before.invert()), point = new Vector3();
  let residualM = 0;
  for (let i = 0; i < 21; i++) {
    point.set(...source.keypoints[i]).applyMatrix4(delta);
    residualM = Math.max(residualM, Math.hypot(point.x - current.keypoints[i][0], point.y - current.keypoints[i][1], point.z - current.keypoints[i][2]));
  }
  return { transform: delta.elements, residualM };
}

// A tracked hand in scene space: what interaction code reads each frame, computed once by Xrb.
import * as THREE from 'three';
import { KP, type Hand } from './hands.ts';
import { palmQuaternion } from './interaction/grab.ts';
import type { PanelFrame } from './stereo.ts';

export interface SceneHand {
  /** the panel-frame hand this was made from */
  hand: Hand;
  /** 21 keypoints in world coordinates */
  points: THREE.Vector3[];
  /** index fingertip */
  tip: THREE.Vector3;
  /** between thumb tip and index tip */
  pinchPoint: THREE.Vector3;
  /** palm centre (wrist, index and pinky knuckles) and orientation (Y = palm normal, as palmQuaternion) */
  palm: { position: THREE.Vector3; quaternion: THREE.Quaternion };
}

export function toSceneHand(hand: Hand, panel: PanelFrame): SceneHand {
  const points = hand.keypoints.map((p) => panel.pointToWorld(p, new THREE.Vector3()));
  const position = new THREE.Vector3().add(points[KP.WRIST]).add(points[KP.INDEX_MCP]).add(points[KP.PINKY_MCP]).divideScalar(3);
  return {
    hand,
    points,
    tip: points[KP.INDEX_TIP].clone(),
    pinchPoint: panel.pointToWorld(hand.pinchPoint, new THREE.Vector3()),
    palm: { position, quaternion: palmQuaternion(points, hand.handedness) },
  };
}

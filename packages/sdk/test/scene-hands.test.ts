import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { HandInput, KP } from '../src/hands.ts';
import { palmQuaternion } from '../src/interaction/grab.ts';
import { toSceneHand } from '../src/scene-hands.ts';
import { PanelFrame } from '../src/stereo.ts';
import { readHandsRecording } from './recording.ts';

const RECORDING = readHandsRecording(fileURLToPath(new URL('./data/rig-2026-10-08.hands', import.meta.url)));

function panels(): [string, PanelFrame][] {
  const world = new PanelFrame();
  world.update({ mode: 'world', center: new THREE.Vector3(1, 2, 3), scale: 7.6, quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.5, 0)) }, new THREE.PerspectiveCamera());
  const head = new THREE.PerspectiveCamera();
  head.position.set(0, 5, 12);
  head.lookAt(0, 0, 0);
  head.updateMatrixWorld();
  const camera = new PanelFrame();
  camera.update({ mode: 'camera' }, head);
  return [['world', world], ['camera', camera]];
}

test('scene hands: keypoints, tip, pinch point and palm match the panel transform on recorded hands', () => {
  const input = new HandInput();
  let checked = 0;
  for (const [i, f] of RECORDING.entries()) {
    input.push(f, f.captureTimeMs);
    if (i % 10) continue;
    for (const hand of input.sample(f.captureTimeMs + 20)) {
      for (const [name, panel] of panels()) {
        const s = toSceneHand(hand, panel);
        const expected = hand.keypoints.map((p) => panel.pointToWorld(p));
        s.points.forEach((p, i) => assert.ok(p.distanceTo(expected[i]) < 1e-9, `${name} keypoint ${i}`));
        assert.ok(s.tip.distanceTo(expected[KP.INDEX_TIP]) < 1e-9);
        assert.ok(s.pinchPoint.distanceTo(expected[KP.THUMB_TIP].clone().add(expected[KP.INDEX_TIP]).multiplyScalar(0.5)) < 1e-9);
        assert.ok(s.palm.quaternion.angleTo(palmQuaternion(expected, hand.handedness)) < 1e-6, `${name} palm`);
        const centre = expected[KP.WRIST].clone().add(expected[KP.INDEX_MCP]).add(expected[KP.PINKY_MCP]).divideScalar(3);
        assert.ok(s.palm.position.distanceTo(centre) < 1e-9);
        checked++;
      }
    }
  }
  assert.ok(checked > 300, `checked ${checked}`);
});

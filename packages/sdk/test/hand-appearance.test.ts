import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { HandVisual } from '../src/hand-visual.ts';
import { HAND_APPEARANCE_DEFAULTS } from '../src/hand-profile.ts';
import { HandInput } from '../src/hands.ts';
import { PanelFrame } from '../src/stereo.ts';
import { projectToPanel } from '../src/pointer.ts';
import { DEFAULT_DISPLAY } from '../src/host.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
function fixture() {
  const input = new HandInput({ smoothing: false, prediction: false });
  input.push(decodeMessage(handsMessage([{ id: 1, grabbing: true }], 0)) as HandsMessage, 0);
  const hands = input.sample(0), panel = new PanelFrame(); return { input, hands, panel };
}
const snapshot = (v: HandVisual) => v.children.map(c => ({ visible: c.visible, matrix: (c as THREE.InstancedMesh).instanceMatrix ? Array.from((c as THREE.InstancedMesh).instanceMatrix.array) : c.position.toArray(), colour: ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).color.toArray(), opacity: ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity }));
test('absent and exact default appearance leave material values and drawing matrices unchanged', () => {
  const { hands, panel } = fixture(), original = new HandVisual(), defaults = new HandVisual();
  original.update(hands, panel); defaults.applyAppearance(HAND_APPEARANCE_DEFAULTS); defaults.update(hands, panel);
  assert.deepEqual(snapshot(defaults), snapshot(original));
  defaults.applyAppearance(); defaults.update(hands, panel); assert.deepEqual(snapshot(defaults), snapshot(original));
  assert.equal((defaults.children[0] as THREE.InstancedMesh).count, 21);
  assert.equal(defaults.children[2].visible, true, 'grab alone shows existing indicator');
});
test('appearance mutates drawing only and retains constructor styles when overrides are removed', () => {
  const { input, hands, panel } = fixture(), v = new HandVisual({ jointDiameterM: .02, opacity: .7 });
  const before = structuredClone(hands), pointer = projectToPanel([0, 0, .6], hands[0].keypoints[8], DEFAULT_DISPLAY);
  const material = (v.children[0] as THREE.Mesh).material;
  v.applyAppearance({ showJoints: false, showBones: false, showPinchGrabIndicator: false, jointDiameterMm: 30, opacity: .1, jointColorLinear: [1, 0, 0] });
  v.update(hands, panel);
  assert.equal(v.children[0].visible, false); assert.equal(v.children[1].visible, false); assert.equal(v.children[2].visible, false);
  assert.equal((v.children[0] as THREE.Mesh).material, material);
  assert.deepEqual(hands, before); assert.equal(input.count, 1);
  assert.deepEqual(projectToPanel([0, 0, .6], hands[0].keypoints[8], DEFAULT_DISPLAY), pointer);
  v.applyAppearance(); v.update(hands, panel); assert.equal(v.style.jointDiameterM, .02); assert.equal(v.style.opacity, .7);
  assert.ok(v.children.slice(0, 3).every(c => c.visible));
  assert.equal(v.children[3].visible, false, 'unused second-hand marker stays hidden');
});

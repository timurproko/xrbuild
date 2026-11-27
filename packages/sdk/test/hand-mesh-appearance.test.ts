import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandVisual } from '../src/hand-visual.ts';
import { HandInput } from '../src/hands.ts';
import { PanelFrame } from '../src/stereo.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
const surface = { id: 1, topology: 'triangle', positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) };
for (const showJoints of [true, false]) for (const showBones of [true, false]) test(`mesh selection independent of joints=${showJoints}, bones=${showBones}`, () => {
  const visual = new HandVisual(), panel = new PanelFrame(), input = new HandInput({ prediction: false, smoothing: false });
  input.push(decodeMessage(handsMessage([{ id: 1, grabbing: true }], 0)) as HandsMessage, 0);
  const hands = input.sample(0), before = structuredClone(hands);
  visual.applyAppearance({ showJoints, showBones, boneColorLinear: [.1, .2, .3], opacity: .4 }); visual.update(hands, panel);
  try {
    for (const surfaces of [[surface], [], [surface]]) {
      visual.updateMeshes(surfaces, panel); visual.update(hands, panel);
      assert.equal(visual.children[0].visible, showJoints); assert.equal(visual.children[1].visible, showBones);
      const mesh = visual.getObjectByName('xrb-hand-mesh')!; assert.equal(mesh.visible, !!surfaces.length);
      assert.equal(visual.visible, true, 'hiding skeleton components must not hide the mesh parent');
      if (surfaces.length) { const material = (mesh.children[0] as any).material; assert.equal(material.opacity, .4); assert.equal(material.color.g, .2); }
      assert.deepEqual(hands, before);
    }
  } finally { visual.disposeMeshes(); }
});

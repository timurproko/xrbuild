import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { generate } from '../src/synthetic.ts';
const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is required for SDK interaction tests');
const { HandInput, PanelFrame, Interactor, PinchTarget, toSceneHand, MSG_HANDS, PROTOCOL_VERSION } = await import(pathToFileURL(path.join(core, 'packages/sdk/src/index.ts')).href);

test('synthetic keypoints drive existing SDK button/drag targets without native gesture flags', () => {
  const input = new HandInput({ smoothing: false, prediction: false, graceMs: 0 });
  const frame = new PanelFrame();
  frame.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, new THREE.PerspectiveCamera());
  const interactor = new Interactor();
  const button = new THREE.Object3D(); button.position.set(-0.085, 0.042, 0.07);
  const cube = new THREE.Object3D(); cube.position.set(0.085, 0.042, 0.07);
  button.updateMatrixWorld(); cube.updateMatrixWorld();
  const press = interactor.add(new PinchTarget(button, { radius: 0.055 }));
  const drag = interactor.add(new PinchTarget(cube, { radius: 0.065 }));
  let presses = 0, moves = 0, lost = 0;
  press.on((e: { type: string }) => { if (e.type === 'start') presses++; });
  drag.on((e: { type: string; reason?: string }) => { if (e.type === 'move') moves++; if (e.type === 'end' && e.reason === 'lost') lost++; });
  const feed = (tick: number, empty = false) => {
    const stamp = tick * 1000 / 60;
    input.push({ type: MSG_HANDS, version: PROTOCOL_VERSION, seq: tick, hostTimeMs: stamp, captureTimeMs: stamp,
      trackingHz: 60, capabilities: { pinch: false, grab: false, palm: false }, hands: empty ? [] : generate('motion', tick / 60) }, stamp);
    interactor.update(input.sample(stamp).map((h: unknown) => toSceneHand(h, frame)), 1);
  };
  for (let tick = 0; tick <= 240; tick++) feed(tick);
  assert.ok(presses > 0, 'button engaged by derived pinch');
  assert.ok(moves > 0, 'cube receives derived pinch drag events');
  feed(241, true);
  assert.equal(input.sample(241 * 1000 / 60).length, 0, 'raw empty observation clears immediately');
  assert.ok(lost > 0, 'empty frame releases held target rather than retaining SDK grace');
});

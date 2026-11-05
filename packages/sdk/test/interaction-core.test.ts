import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { Hand } from '../src/hands.ts';
import { Interactor, MOUSE_ID } from '../src/interaction/core/interactor.ts';
import { PinchTarget, PokeTarget, VolumeTarget, type TargetEvent } from '../src/interaction/core/targets.ts';
import type { SceneHand } from '../src/scene-hands.ts';
import { palmQuaternion } from '../src/interaction/grab.ts';

type V = [number, number, number];
const v3 = (p: V) => new THREE.Vector3(...p);

interface FakeHandOptions {
  tip?: V;
  pinch?: V;
  pinching?: boolean;
  grabbing?: boolean;
  coasting?: boolean;
  /** 21 keypoints (world); default: all at the tip */
  points?: THREE.Vector3[];
}

/** A scene hand in world coordinates, as Xrb would hand it to the interactor. */
function hand(id: number, o: FakeHandOptions = {}): SceneHand {
  const tip = v3(o.tip ?? [0, 0, 0.1]);
  const pinch = v3(o.pinch ?? o.tip ?? [0, 0, 0.1]);
  const points = o.points ?? Array.from({ length: 21 }, () => tip.clone());
  const h: Hand = {
    id, handedness: 'right', keypoints: points.map((p) => [p.x, p.y, p.z] as V), rawKeypoints: [],
    pinching: !!o.pinching, pinchStrength: o.pinching ? 1 : 0, grabbing: !!o.grabbing,
    tip: [tip.x, tip.y, tip.z], pinchPoint: [pinch.x, pinch.y, pinch.z], coasting: !!o.coasting, lastSeen: 0,
  };
  return { hand: h, points, tip, pinchPoint: pinch, palm: { position: tip.clone(), quaternion: palmQuaternion(points.length === 21 ? points : Array(21).fill(tip), 'right') } };
}

const square = (half: number) => (x: number, y: number) => Math.abs(x) < half && Math.abs(y) < half;
const record = (t: { on(fn: (e: TargetEvent) => void): unknown }) => {
  const events: TargetEvent[] = [];
  t.on((e) => events.push(e));
  return events;
};
const types = (events: TargetEvent[]) => events.map((e) => e.type);

test('physical sizes: a 5 cm pinch target engages at 4 cm and not at 6 cm in any scene scale', () => {
  for (const [unitsPerMetre, objectScale] of [[1, 1], [3, 1], [1, 2], [0.5, 4]]) {
    const ix = new Interactor();
    const obj = new THREE.Object3D();
    obj.scale.setScalar(objectScale);
    obj.position.set(0.3 * unitsPerMetre, 0, 0);
    obj.updateMatrixWorld();
    const t = ix.add(new PinchTarget(obj, { radius: 0.05 }));
    const events = record(t);
    const at = (metres: number): V => [(0.3 + metres) * unitsPerMetre, 0, 0];
    ix.update([hand(1, { pinch: at(0.06), pinching: false })], unitsPerMetre);
    ix.update([hand(1, { pinch: at(0.06), pinching: true })], unitsPerMetre);
    assert.equal(events.length, 0, `${unitsPerMetre}/${objectScale}: 6 cm does not engage`);
    ix.update([hand(1, { pinch: at(0.06), pinching: false })], unitsPerMetre);
    ix.update([hand(1, { pinch: at(0.04), pinching: true })], unitsPerMetre);
    assert.equal(types(events).join(), 'start', `${unitsPerMetre}/${objectScale}: 4 cm engages`);
    assert.ok(Math.abs(events[0].local.x - 0.04) < 1e-9, 'event position in local metres');
  }
});

test('one target per hand: overlapping pinch targets, the nearest to the pinch point wins', () => {
  const ix = new Interactor();
  const a = ix.add(new PinchTarget(new THREE.Object3D(), { radius: 0.05 }));
  const bObj = new THREE.Object3D();
  bObj.position.x = 0.04;
  const b = ix.add(new PinchTarget(bObj, { radius: 0.05 }));
  const ea = record(a), eb = record(b);
  ix.update([hand(1, { pinch: [0.03, 0, 0] })], 1);
  ix.update([hand(1, { pinch: [0.03, 0, 0], pinching: true })], 1);
  assert.equal(ea.length, 0);
  assert.equal(types(eb).join(), 'start');
  assert.ok(b.state.held && !a.state.held);
});

test('capture: a pressed 3 cm button keeps its finger through a 1.5 cm sideways drift and releases on retract', () => {
  const ix = new Interactor();
  const t = ix.add(new PokeTarget(new THREE.Object3D(), { inside: square(0.015), top: 0.02, travel: 0.009 }));
  const events = record(t);
  const press = (x: number, z: number) => ix.update([hand(1, { tip: [x, 0, z] })], 1);
  press(0, 0.06);  // approach from the front: arms
  press(0, 0.025);
  press(0, 0.013);  // depth 7 mm > 60 % of 9 mm
  assert.equal(types(events).join(), 'start');
  press(0.03, 0.013);  // drifts 1.5 cm outside the outline, still pushed in
  press(0.03, 0.012);
  assert.equal(types(events).join(), 'start,move,move', 'drift keeps the press');
  assert.ok(t.state.held);
  press(0.03, 0.019);  // retracts past the release depth (30 % of travel)
  assert.equal(events.at(-1)!.type, 'end');
  assert.equal(events.at(-1)!.reason, 'release');
  assert.equal(t.state.held, false);
});

test('capture: a 100 ms tracking dropout (coasting hand) does not end a drag', () => {
  const ix = new Interactor();
  const t = ix.add(new PinchTarget(new THREE.Object3D(), { radius: 0.05 }));
  const events = record(t);
  ix.update([hand(1, { pinch: [0.01, 0, 0] })], 1);
  ix.update([hand(1, { pinch: [0.01, 0, 0], pinching: true })], 1);
  ix.update([hand(1, { pinch: [0.02, 0, 0], pinching: true })], 1);
  for (let i = 0; i < 6; i++) ix.update([hand(1, { pinch: [0.02, 0, 0], pinching: true, coasting: true })], 1);  // 6 frames ~ 100 ms
  ix.update([hand(1, { pinch: [0.03, 0, 0], pinching: true })], 1);
  assert.equal(types(events).filter((x) => x === 'start').length, 1, 'one grab');
  assert.equal(types(events).filter((x) => x === 'end').length, 0, 'no release');
  assert.ok(Math.abs(events.at(-1)!.local.x - 0.03) < 1e-9, 'the drag continues where the hand is');
  ix.update([], 1);  // hand really gone
  assert.equal(events.at(-1)!.type, 'end');
  assert.equal(events.at(-1)!.reason, 'lost');
});

test('hysteresis: a fingertip jittering at the press depth gives one press and no flicker', () => {
  const ix = new Interactor();
  const t = ix.add(new PokeTarget(new THREE.Object3D(), { inside: square(0.015), top: 0.02, travel: 0.01 }));
  const events = record(t);
  ix.update([hand(1, { tip: [0, 0, 0.05] })], 1);
  for (let i = 0; i < 60; i++) {
    const noise = (i % 2 ? 1 : -1) * 0.0007;  // ±0.7 mm around the 60 % press depth
    ix.update([hand(1, { tip: [0, 0, 0.02 - 0.006 + noise] })], 1);
  }
  assert.equal(types(events).filter((x) => x === 'start').length, 1);
  assert.equal(types(events).filter((x) => x === 'end').length, 0);
});

test('a poke must arrive from the front: reaching through from behind does not press', () => {
  const ix = new Interactor();
  const t = ix.add(new PokeTarget(new THREE.Object3D(), { inside: square(0.015), top: 0.02, travel: 0.01 }));
  const events = record(t);
  ix.update([hand(1, { tip: [0.05, 0, 0.0] })], 1);   // beside it, behind the surface
  ix.update([hand(1, { tip: [0, 0, 0.0] })], 1);      // slides in from the side, deep
  ix.update([hand(1, { tip: [0, 0, 0.012] })], 1);
  assert.equal(events.length, 0);
});

test('hover: proximity rises from 0 at the hover distance to 1 at the surface, before any press', () => {
  const ix = new Interactor();
  const t = ix.add(new PokeTarget(new THREE.Object3D(), { inside: square(0.02), top: 0.01, travel: 0.008 }));
  const events = record(t);
  let last = -1;
  for (let gap = 0.049; gap >= 0; gap -= 0.007) {
    ix.update([hand(1, { tip: [0.004, 0, 0.01 + gap] })], 1);
    assert.ok(t.state.hovering);
    assert.ok(t.state.proximity > last, `proximity rises (${t.state.proximity} after ${last})`);
    last = t.state.proximity;
  }
  assert.ok(Math.abs(t.state.proximity - 1) < 1e-9);
  assert.ok(Math.abs(t.state.cursor.x - 0.004) < 1e-9, 'cursor at the fingertip');
  assert.equal(events.length, 0);
  ix.update([hand(1, { tip: [0.004, 0, 0.1] })], 1);
  assert.equal(t.state.hovering, false);
  assert.equal(t.state.proximity, 0);
});

test('mouse parity: a mouse drag and a pinch drag give the same events on a pinch target', () => {
  const run = (drive: (ix: Interactor) => void) => {
    const ix = new Interactor();
    const t = ix.add(new PinchTarget(new THREE.Object3D(), { radius: 0.05 }));
    const events = record(t);
    drive(ix);
    return events.map((e) => `${e.type}@${e.local.x.toFixed(3)}`);
  };
  const down = new THREE.Vector3(0, 0, -1);
  const mouse = run((ix) => {
    ix.update([], 1);
    ix.pointerDown(new THREE.Ray(new THREE.Vector3(0.01, 0, 1), down));
    ix.pointerMove(new THREE.Ray(new THREE.Vector3(0.03, 0, 1), down));
    ix.pointerUp();
  });
  const pinch = run((ix) => {
    ix.update([hand(1, { pinch: [0.01, 0, 0] })], 1);
    ix.update([hand(1, { pinch: [0.01, 0, 0], pinching: true })], 1);
    ix.update([hand(1, { pinch: [0.03, 0, 0], pinching: true })], 1);
    ix.update([hand(1, { pinch: [0.03, 0, 0], pinching: false })], 1);
  });
  assert.deepEqual(mouse, ['start@0.010', 'move@0.030', 'end@0.030']);
  assert.deepEqual(pinch, mouse);
});

test('mouse: the nearest target along the ray is taken; a poke target is pressed with full travel', () => {
  const ix = new Interactor();
  const near = ix.add(new PokeTarget(new THREE.Object3D(), { inside: square(0.02), top: 0.02, travel: 0.008 }));
  const farObj = new THREE.Object3D();
  farObj.position.z = -0.1;
  const far = ix.add(new PokeTarget(farObj, { inside: square(0.05), top: 0.02, travel: 0.008 }));
  const en = record(near), ef = record(far);
  ix.update([], 1);
  assert.ok(ix.pointerDown(new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1))));
  assert.equal(types(en).join(), 'start');
  assert.equal(en[0].source, 'mouse');
  assert.equal(en[0].handId, MOUSE_ID);
  assert.equal(en[0].depth, 0.008);
  assert.equal(ef.length, 0);
  ix.pointerUp();
  assert.equal(types(en).join(), 'start,end');
});

test('volume: enough keypoints inside engage it, fewer than the release count let go', () => {
  const ix = new Interactor();
  const t = ix.add(new VolumeTarget(new THREE.Object3D(), { radius: 0.05 }));
  const events = record(t);
  const cluster = (n: number) => Array.from({ length: 21 }, (_, i) => (i < n ? new THREE.Vector3(0.01, 0.01 * (i % 3), 0.01) : new THREE.Vector3(0.5, 0, 0)));
  ix.update([hand(1, { points: cluster(5), tip: [0.5, 0, 0] })], 1);
  assert.equal(events.length, 0);
  assert.ok(t.state.hovering && t.state.proximity < 1, 'partial hover');
  ix.update([hand(1, { points: cluster(7), tip: [0.5, 0, 0] })], 1);
  assert.equal(types(events).join(), 'start');
  assert.equal(events[0].points.length, 7);
  ix.update([hand(1, { points: cluster(5), tip: [0.5, 0, 0] })], 1);
  assert.equal(types(events).join(), 'start,move', '5 inside: still held (release at 4)');
  ix.update([hand(1, { points: cluster(3), tip: [0.5, 0, 0] })], 1);
  assert.equal(events.at(-1)!.type, 'end');
});

test('disabling a target drops its capture; a hand already pinching cannot take a target', () => {
  const ix = new Interactor();
  const t = ix.add(new PinchTarget(new THREE.Object3D(), { radius: 0.05 }));
  const events = record(t);
  ix.update([hand(1, { pinch: [0.5, 0, 0], pinching: true })], 1);  // pinch started far away
  ix.update([hand(1, { pinch: [0.01, 0, 0], pinching: true })], 1);  // moved in while closed
  assert.equal(events.length, 0, 'no engage without a pinch edge');
  ix.update([hand(1, { pinch: [0.01, 0, 0], pinching: false })], 1);
  ix.update([hand(1, { pinch: [0.01, 0, 0], pinching: true })], 1);
  assert.equal(types(events).join(), 'start');
  t.enabled = false;
  ix.update([hand(1, { pinch: [0.02, 0, 0], pinching: true })], 1);
  assert.equal(events.at(-1)!.type, 'end');
  assert.equal(events.at(-1)!.reason, 'disabled');
  assert.equal(t.state.held, false);
});

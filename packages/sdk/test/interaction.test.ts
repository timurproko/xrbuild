import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Trackball } from '../src/interaction/trackball.ts';
import { icosphereVertices, DotShell } from '../src/interaction/dot-shell.ts';
import { GrabRotate, nearestTarget, palmQuaternion, pinchCentre } from '../src/interaction/grab.ts';
import { smoothDamp } from '../src/interaction/smooth-damp.ts';
import { openHand } from './fixtures.ts';

/** A cluster of 8 "keypoints" around `c` (a hand inside the sphere). */
const cluster = (c: THREE.Vector3) => Array.from({ length: 8 }, (_, i) => c.clone().add(new THREE.Vector3((i % 2) * 0.01, ((i >> 1) % 2) * 0.01, (i >> 2) * 0.01)));
const yawOf = (o: THREE.Object3D) => new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ').y;

test('smoothDamp converges without overshoot', () => {
  const cur = new THREE.Vector3(), vel = new THREE.Vector3(), target = new THREE.Vector3(1, 0, 0);
  let prev = 0;
  for (let i = 0; i < 100; i++) {
    smoothDamp(cur, target, vel, 0.15, 0.02, cur);
    assert.ok(cur.x >= prev - 1e-12 && cur.x <= 1 + 1e-9);
    prev = cur.x;
  }
  assert.ok(Math.abs(cur.x - 1) < 1e-3);
});

test('trackball: a hand sweeping around inside the globe spins it the same way, then it coasts to a stop', () => {
  const globe = new THREE.Object3D();
  const tb = new Trackball(globe, { radius: 1, axis: 'y' });
  // Hand circles at radius 0.6 around Y at 90 deg/s for 1 s.
  for (let i = 0; i <= 50; i++) {
    const a = THREE.MathUtils.degToRad(90 * i * 0.02);
    tb.update(0.02, cluster(new THREE.Vector3(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6)));
  }
  assert.ok(tb.touching);
  const turned = THREE.MathUtils.radToDeg(yawOf(globe));
  // Self-limiting loop: the ball follows at about 75 % of the hand (90 deg -> ~55-75 deg incl. smoothing lag).
  assert.ok(turned > 40 && turned < 80, `turned ${turned.toFixed(1)} deg`);
  const before = yawOf(globe);
  for (let i = 0; i < 100; i++) tb.update(0.02, []);  // hand gone
  assert.equal(tb.touching, false);
  const coast = THREE.MathUtils.radToDeg(yawOf(globe) - before);
  assert.ok(coast > 0 && coast < 30, `coasts forward a little: ${coast.toFixed(1)} deg`);
  assert.equal(tb.angularVelocity, 0, 'stops completely');
});

test('trackball axis modes: a locked axis turns only about that axis, and the mode can change live', () => {
  const ball = new THREE.Object3D();
  const tb = new Trackball(ball, { radius: 1, axis: 'x' });
  // Hand sweeps diagonally (around X and Y at once); axis 'x' keeps only the X part.
  for (let i = 0; i <= 50; i++) {
    const a = THREE.MathUtils.degToRad(90 * i * 0.02);
    tb.update(0.02, cluster(new THREE.Vector3(Math.sin(a) * 0.4, Math.sin(a) * 0.4, Math.cos(a) * 0.6)));
  }
  const local = new THREE.Vector3(1, 0, 0).applyQuaternion(ball.quaternion);
  assert.ok(local.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6, 'the X axis itself does not move');
  assert.ok(ball.quaternion.angleTo(new THREE.Quaternion()) > 0.2, 'but the ball turned');
  tb.stop();
  tb.axis = 'z';
  ball.quaternion.identity();
  for (let i = 0; i <= 50; i++) {
    const a = THREE.MathUtils.degToRad(90 * i * 0.02);
    tb.update(0.02, cluster(new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.2)));
  }
  const z = new THREE.Vector3(0, 0, 1).applyQuaternion(ball.quaternion);
  assert.ok(z.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6, 'axis z: turns about Z only');
  assert.ok(ball.quaternion.angleTo(new THREE.Quaternion()) > 0.2);
});

test('trackball needs enough keypoints inside the sphere, and ignores hands outside', () => {
  const globe = new THREE.Object3D();
  const tb = new Trackball(globe, { radius: 1 });
  tb.update(0.02, cluster(new THREE.Vector3(0, 0, 2)));  // outside
  assert.equal(tb.touching, false);
  tb.update(0.02, cluster(new THREE.Vector3(0, 0, 0.5)).slice(0, 4));  // only 4 inside
  assert.equal(tb.touching, false);
  tb.update(0.02, cluster(new THREE.Vector3(0, 0, 0.5)));
  assert.ok(tb.touching);
});

test('dot shell has the 642 dots of a subdivision-3 icosphere and fades out', () => {
  assert.equal(icosphereVertices(3).length, 642);
  assert.equal(icosphereVertices(2).length, 162);
  const shell = new DotShell({ radius: 2 });
  assert.equal(shell.count, 642);
  shell.active = true; shell.update(0.016);
  assert.equal((shell.material as THREE.MeshBasicMaterial).opacity, 1);
  shell.active = false;
  for (let i = 0; i < 60; i++) shell.update(0.016);
  assert.equal(shell.visible, false);
});

test('palm orientation: normal points out of the palm, follows the hand when it turns', () => {
  const kp = openHand([0, 0, 0.2]).map((p) => new THREE.Vector3(...p));
  const q = palmQuaternion(kp, 'left');
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  assert.ok(Math.abs(Math.abs(normal.z) - 1) < 1e-6, 'flat hand facing the panel: normal along z');
  const turned = kp.map((p) => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5));
  const q2 = palmQuaternion(turned, 'left');
  assert.ok(Math.abs(q.angleTo(q2) - 0.5) < 1e-6);
  assert.ok(pinchCentre(kp).distanceTo(kp[4].clone().add(kp[8]).multiplyScalar(0.5)) < 1e-12);
});

test('grab-rotate (desk globe): twisting the palm turns the globe about its axis only', () => {
  const globe = new THREE.Object3D();
  const g = new GrabRotate(globe, { axis: 'y' });
  const palm = new THREE.Quaternion();
  g.begin(palm);
  const twisted = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4));  // twist + tilt
  for (let i = 0; i < 60; i++) g.update(twisted, 0.016);
  const e = new THREE.Euler().setFromQuaternion(globe.quaternion, 'YXZ');
  assert.ok(Math.abs(e.y - 0.6) < 0.01, `yaw ${e.y}`);
  assert.ok(Math.abs(e.x) < 1e-6 && Math.abs(e.z) < 1e-6, 'no tilt');
  g.end();
  const after = globe.quaternion.clone();
  g.update(new THREE.Quaternion(), 0.016);
  assert.ok(globe.quaternion.equals(after), 'stays where it was left');
});

test('pinch select: nearest enabled target within the radius, nothing outside', () => {
  const targets = [
    { id: 'a', position: new THREE.Vector3(0, 0, 0) },
    { id: 'b', position: new THREE.Vector3(0.04, 0, 0) },
    { id: 'c', position: new THREE.Vector3(0.01, 0, 0), enabled: false },
  ];
  assert.equal(nearestTarget(targets, new THREE.Vector3(0.03, 0, 0), 0.06)?.id, 'b');
  assert.equal(nearestTarget(targets, new THREE.Vector3(0.012, 0, 0), 0.06)?.id, 'a', 'disabled target skipped');
  assert.equal(nearestTarget(targets, new THREE.Vector3(0.5, 0, 0), 0.06), null);
});

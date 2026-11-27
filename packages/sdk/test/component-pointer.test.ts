import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ComponentPointer } from '../src/component-pointer.ts';
import { PointerEmulation } from '../src/pointer.ts';
import { DEFAULT_DISPLAY } from '../src/host.ts';
import { openHand } from './fixtures.ts';
import type { Hand } from '../src/hands.ts';

const ray = new THREE.Ray(new THREE.Vector3(0, 0, 6), new THREE.Vector3(0, 0, -1));
const hand = (pinching: boolean): Hand => ({ id: 7, handedness: 'right', keypoints: openHand([0, -0.1, 0]),
  rawKeypoints: openHand([0, -0.1, 0]), pinching, grabbing: false, pinchPoint: [0, 0, 0], coasting: false, lastSeen: 0 });

test('nearest registered visible object wins; parent handlers bubble and unregister cleanly', () => {
  const route = new ComponentPointer(), group = new THREE.Group();
  const near = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const far = new THREE.Mesh(near.geometry, near.material); far.position.z = -2;
  group.add(near, far);
  const calls: string[] = [];
  route.add(group, { onClick: (e) => { assert.equal(e.object, near); calls.push('group'); } });
  const off = route.add(near, { onClick: () => calls.push('mesh') });
  route.dispatch('click', ray, new Event('click'), false);
  assert.deepEqual(calls, ['mesh', 'group']);
  off(); group.visible = false;
  route.dispatch('click', ray, new Event('click'), false);
  assert.equal(calls.length, 2);
  route.clear(); near.geometry.dispose(); (near.material as THREE.Material).dispose();
});

test('captured emulated hand cannot echo a mesh activation; free hand activates once with provenance', () => {
  const route = new ComponentPointer();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const clicks: number[] = [], events: string[] = [];
  route.add(mesh, { onClick: (e) => clicks.push(e.handId!) });
  let captured = true;
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    dispatchEvent(event: Event) {
      events.push(event.type);
      if (['pointermove', 'pointerdown', 'pointerup', 'click'].includes(event.type)) route.dispatch(event.type as 'click', ray, event, false);
      return true;
    },
  };
  const pointer = new PointerEmulation({ element, hitTest: () => element, captured: () => captured,
    createEvent: (type, init) => Object.assign(new Event(type), { clientX: init.clientX, clientY: init.clientY }) });
  pointer.update([hand(true)], [0, 0, 0.6], DEFAULT_DISPLAY);
  captured = false; // SDK releases the physical target before emulated release.
  pointer.update([hand(false)], [0, 0, 0.6], DEFAULT_DISPLAY);
  assert.deepEqual(clicks, []);
  pointer.update([hand(true)], [0, 0, 0.6], DEFAULT_DISPLAY);
  pointer.update([hand(false)], [0, 0, 0.6], DEFAULT_DISPLAY);
  assert.deepEqual(clicks, [7]);
  assert.equal(events.filter((e) => e === 'click').length, 2, 'legacy DOM delivery is unchanged');
  pointer.update([hand(true)], [0, 0, 0.6], DEFAULT_DISPLAY);
  pointer.reset();
  route.dispatch('click', ray, new Event('click'), false);
  assert.deepEqual(clicks, [7], 'retirement cancels, never activates');
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

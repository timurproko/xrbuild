import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { fitIcon, IconStage, loadAppIcon, updateIcon } from '../src/icon-object.ts';

const box = (w: number, h: number, d: number, at: [number, number, number]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  mesh.position.set(...at);
  return mesh;
};

const worldSphere = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
};

test('fitIcon centres the object and fits it into the given diameter', () => {
  const fitted = fitIcon(box(4, 2, 2, [10, -3, 5]), 1);
  const sphere = worldSphere(fitted);
  assert.ok(sphere.center.length() < 1e-9, 'centred on the origin');
  assert.ok(Math.abs(sphere.radius - 0.5) < 1e-9, 'diameter 1');
});

test('the icon stage looks straight at the object through an orthographic camera, with a margin', () => {
  const stage = new IconStage(box(1, 3, 1, [0, 7, 0]), 0.1);
  assert.equal(stage.camera.isOrthographicCamera, true);
  assert.deepEqual([stage.camera.left, stage.camera.right, stage.camera.top, stage.camera.bottom], [-0.5, 0.5, 0.5, -0.5]);
  const forward = stage.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(forward.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9, 'looks down -Z');
  const sphere = worldSphere(stage.pivot);
  assert.ok(sphere.center.length() < 1e-9);
  assert.ok(Math.abs(sphere.radius - 0.4) < 1e-9, 'the bounding sphere leaves a 10% margin on each side');
  assert.ok(stage.scene.children.some((c) => (c as THREE.Light).isLight), 'lit');
});

test('dragging turns the object; the tilt stops at the poles', () => {
  const stage = new IconStage(box(1, 1, 1, [0, 0, 0]));
  stage.turn(256, 0, 512);
  assert.ok(Math.abs(stage.pivot.rotation.y - Math.PI / 2) < 1e-9);
  stage.turn(0, 5000, 512);
  assert.equal(stage.pivot.rotation.x, Math.PI / 2);
});

test('the icon view holds still: drawing never runs the idle motion', () => {
  const object = box(1, 1, 1, [0, 0, 0]);
  const seen: number[] = [];
  object.userData.update = (s: number) => seen.push(s);
  const stage = new IconStage(object);
  const renderer = { setClearColor() {}, render() {} } as unknown as THREE.WebGLRenderer;
  stage.draw(renderer);
  stage.draw(renderer);
  assert.deepEqual(seen, [], 'the idle motion is for launchers');
});

test('middle-drag pans the view with the pointer, scaled by the zoom', () => {
  const stage = new IconStage(box(1, 1, 1, [0, 0, 0]));
  stage.pan(256, 128, 512);
  assert.deepEqual([stage.camera.position.x, stage.camera.position.y], [-0.5, 0.25], 'half a frame left, a quarter up');
  stage.zoom(2);
  stage.pan(256, 0, 512);
  assert.equal(stage.camera.position.x, -0.75, 'a zoomed view pans half as far');
  stage.reset();
  assert.deepEqual(stage.camera.position.toArray(), [0, 0, 3]);
});

test('zoom stays between 0.5x and 4x; reset restores the starting view', () => {
  const stage = new IconStage(box(1, 1, 1, [0, 0, 0]));
  stage.zoom(100);
  assert.equal(stage.camera.zoom, 4);
  stage.zoom(0.001);
  assert.equal(stage.camera.zoom, 0.5);
  stage.turn(100, 50, 512);
  stage.reset();
  assert.equal(stage.camera.zoom, 1);
  assert.deepEqual(stage.pivot.rotation.toArray().slice(0, 3), [0, 0, 0]);
});

test('updateIcon calls the idle motion only when the object has one', () => {
  const object = new THREE.Object3D();
  updateIcon(object, 1);
  const seen: number[] = [];
  object.userData.update = (s: number) => seen.push(s);
  updateIcon(object, 2.5);
  assert.deepEqual(seen, [2.5]);
});

test('loadAppIcon imports icon.js from the app route and returns the fitted object, else null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-icon-'));
  try {
    const three = import.meta.resolve('three');
    await fs.writeFile(path.join(dir, 'icon.js'), `import * as THREE from ${JSON.stringify(three)};
export default function createIcon() { return new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial()); }`);
    const route = `${pathToFileURL(dir).href}/`;
    const icon = await loadAppIcon(route, 2);
    assert.ok(icon);
    assert.ok(Math.abs(icon.scale.x - 1 / 3) < 1e-6, 'the radius-3 sphere fitted to diameter 2 by its vertices, not its box corners');
    assert.equal(await loadAppIcon(`${pathToFileURL(path.join(dir, 'missing')).href}/`), null, 'no icon.js: null');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

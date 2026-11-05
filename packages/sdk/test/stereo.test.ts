import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { nominalEyes, offAxisProjection, panelCropPlanes, PanelFrame, placeEyeCamera, NOMINAL_EYE, StereoRenderer } from '../src/stereo.ts';
import { DEFAULT_DISPLAY } from '../src/host.ts';

// Reference: an independent, straightforward off-axis projection (the textbook form), so the
// SDK provably matches the math shown on the device.
test('immersive crop planes preserve the finite panel window', () => {
  const panel = new PanelFrame();
  panel.update({ mode: 'world', center: new THREE.Vector3(1, 2, 3), scale: 2 }, new THREE.PerspectiveCamera());
  const planes = panelCropPlanes(panel, DEFAULT_DISPLAY);
  const centre = panel.pointToWorld([0, 0, 0]);
  assert.ok(planes.every((plane) => plane.distanceToPoint(centre) < 0));
  assert.ok(planes[1].distanceToPoint(panel.pointToWorld([DEFAULT_DISPLAY.widthM, 0, 0])) > 0, 'right overflow is cropped');
  assert.ok(planes[3].distanceToPoint(panel.pointToWorld([0, DEFAULT_DISPLAY.heightM, 0])) > 0, 'top overflow is cropped');
});

function referenceOffAxis(target: THREE.Matrix4, ex: number, ey: number, ez: number, hw: number, hh: number, near: number, far: number) {
  const s = near / ez;
  const l = (-hw - ex) * s, r = (hw - ex) * s;
  const b = (-hh - ey) * s, t = (hh - ey) * s;
  target.set(
    2 * near / (r - l), 0, (r + l) / (r - l), 0,
    0, 2 * near / (t - b), (t + b) / (t - b), 0,
    0, 0, -(far + near) / (far - near), -2 * far * near / (far - near),
    0, 0, -1, 0,
  );
  return target;
}

const close = (a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-9) => a.elements.every((x, i) => Math.abs(x - b.elements[i]) < eps);

test('off-axis projection matches xrb.js for centred and off-centre eyes', () => {
  const hw = 0.298, hh = 0.168;
  for (const eye of [[0, 0, 0.6], [-0.03, 0.12, 0.65], [0.15, -0.05, 0.3]] as const) {
    const ours = offAxisProjection(new THREE.Matrix4(), [eye[0], eye[1], eye[2]], hw, hh, 0.05, 10);
    const ref = referenceOffAxis(new THREE.Matrix4(), eye[0], eye[1], eye[2], hw, hh, 0.05, 10);
    assert.ok(close(ours, ref), `eye ${eye}`);
  }
});

test('a centred eye gives the symmetric perspective of the panel window', () => {
  const ez = 0.6, hh = 0.168, hw = 0.298;
  const ours = offAxisProjection(new THREE.Matrix4(), [0, 0, ez], hw, hh, 0.1, 100);
  const cam = new THREE.PerspectiveCamera((2 * Math.atan(hh / ez) * 180) / Math.PI, hw / hh, 0.1, 100);
  assert.ok(close(ours, cam.projectionMatrix, 1e-6));
});

test('panel corners project to the edges of the view for any eye position', () => {
  // The window property: the physical panel rectangle always fills the image exactly.
  const d = DEFAULT_DISPLAY;
  const panel = new PanelFrame();
  const head = new THREE.PerspectiveCamera();
  head.position.set(0, 0, 5);
  head.updateMatrixWorld();
  panel.update({ mode: 'camera' }, head);
  const cam = new THREE.PerspectiveCamera();
  for (const eye of [[0, 0, 0.6], [0.12, 0.08, 0.5], [-0.2, -0.05, 0.75]] as const) {
    placeEyeCamera(cam, [eye[0], eye[1], eye[2]], panel, d, 0.1, 100);
    const corner = panel.pointToWorld([d.widthM / 2, d.heightM / 2, 0]).project(cam);
    assert.ok(Math.abs(corner.x - 1) < 1e-6 && Math.abs(corner.y - 1) < 1e-6, `top-right corner for eye ${eye}`);
    const other = panel.pointToWorld([-d.widthM / 2, -d.heightM / 2, 0]).project(cam);
    assert.ok(Math.abs(other.x + 1) < 1e-6 && Math.abs(other.y + 1) < 1e-6, `bottom-left corner for eye ${eye}`);
  }
});

test('camera mapping: nominal viewer sits at the app camera, panel centre at the focus distance', () => {
  const panel = new PanelFrame();
  const head = new THREE.PerspectiveCamera();
  head.position.set(0, 0, 8);
  head.lookAt(0, 0, 0);
  head.updateMatrixWorld();
  panel.update({ mode: 'camera' }, head);
  const eye = panel.pointToWorld(NOMINAL_EYE);
  assert.ok(eye.distanceTo(head.position) < 1e-6);
  const centre = panel.pointToWorld([0, 0, 0]);
  assert.ok(centre.length() < 1e-6, 'focus defaults to the distance to the scene origin');
  assert.ok(Math.abs(panel.scale - 8 / NOMINAL_EYE[2]) < 1e-9);
});

test('orthographic renders directly in mono and perspective eye cameras in stereo', () => {
  const rendered: THREE.Camera[] = [];
  const renderer = { setScissorTest() {}, setViewport() {}, setScissor() {}, setPixelRatio() {}, setSize() {}, render(_scene: THREE.Scene, camera: THREE.Camera) { rendered.push(camera); } } as unknown as THREE.WebGLRenderer;
  const view = new StereoRenderer(renderer, DEFAULT_DISPLAY, false, { width: 800, height: 600 });
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 20); camera.position.z = 6;
  view.render(new THREE.Scene(), camera, nominalEyes());
  assert.equal(rendered.length, 1); assert.equal(rendered[0], camera);
  rendered.length = 0; view.setStereo(true); view.render(new THREE.Scene(), camera, nominalEyes());
  assert.equal(rendered.length, 2); assert.ok(rendered.every((item) => (item as THREE.PerspectiveCamera).isPerspectiveCamera));
});

test('head-coupled parallax: content behind the panel shifts opposite to content in front', () => {
  const d = DEFAULT_DISPLAY;
  const panel = new PanelFrame();
  panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, new THREE.PerspectiveCamera());
  const cam = new THREE.PerspectiveCamera();
  const screenX = (p: THREE.Vector3, eyeX: number) => {
    placeEyeCamera(cam, [eyeX, 0, 0.6], panel, d, 0.01, 10);
    return p.clone().project(cam).x;
  };
  const front = new THREE.Vector3(0, 0, 0.1), behind = new THREE.Vector3(0, 0, -0.1), onGlass = new THREE.Vector3();
  const moveFront = screenX(front, 0.05) - screenX(front, 0);
  const moveBehind = screenX(behind, 0.05) - screenX(behind, 0);
  assert.ok(Math.abs(screenX(onGlass, 0.05) - screenX(onGlass, 0)) < 1e-9, 'content on the glass does not move');
  assert.ok(moveFront < 0 && moveBehind > 0, `front ${moveFront}, behind ${moveBehind}`);
});

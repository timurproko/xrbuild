// Xrb's headset session on a stubbed renderer and WebXR system: backend choice, enter / end, rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Xrb, type XrbView } from '../src/index.ts';
import { wantsAutoEnter, type XrMode } from '../src/webxr.ts';

const g = globalThis as Record<string, unknown>;
g.innerWidth ??= 1280;
g.innerHeight ??= 720;

class FakeSession extends EventTarget {
  inputSources: unknown[] = [];
  async end() {
    this.dispatchEvent(new Event('end'));
  }
}

class FakeXr extends EventTarget {
  readonly requests: { mode: XrMode; init: unknown }[] = [];
  readonly supported: XrMode[];
  constructor(supported: XrMode[]) {
    super();
    this.supported = supported;
  }
  async isSessionSupported(mode: XrMode) {
    return this.supported.includes(mode);
  }
  async requestSession(mode: XrMode, init: unknown) {
    this.requests.push({ mode, init });
    return new FakeSession();
  }
}

let currentXr: FakeXr | null = null;
function setXr(supported: XrMode[] | null) {
  currentXr = supported && new FakeXr(supported);
  Object.defineProperty(globalThis.navigator, 'xr', { value: currentXr ?? undefined, configurable: true });
  return currentXr?.requests ?? [];
}

const pose = (x: number, y: number, z: number) => ({ transform: { position: { x, y, z }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });

function fakeRenderer() {
  let session: FakeSession | null = null;
  const space = new EventTarget();
  const rendered: { camera: THREE.Camera; background: unknown; clearAlpha: number; clippingPlanes: THREE.Plane[] }[] = [];
  let clearAlpha = 1;
  const r = {
    domElement: { style: {}, addEventListener() {}, removeEventListener() {} },
    rendered,
    clippingPlanes: [] as THREE.Plane[],
    loop: null as unknown,
    space,
    xr: {
      enabled: false,
      referenceSpaceType: '',
      get isPresenting() { return !!session; },
      setReferenceSpaceType(t: string) { this.referenceSpaceType = t; },
      async setSession(s: FakeSession) {
        session = s;
        s.addEventListener('end', () => (session = null));
      },
      getSession: () => session,
      getReferenceSpace: () => (session ? space : null),
      getFrame: () => session && {
        session,
        getViewerPose: () => ({ ...pose(0, 1.6, 0), views: [{ eye: 'left', ...pose(-0.03, 1.6, 0) }, { eye: 'right', ...pose(0.03, 1.6, 0) }] }),
        getJointPose: () => null,
      },
    },
    setPixelRatio() {},
    setSize() {},
    setScissorTest() {},
    setViewport() {},
    setScissor() {},
    setClearColor() {},
    getClearAlpha: () => clearAlpha,
    setClearAlpha(a: number) { clearAlpha = a; },
    setAnimationLoop(fn: unknown) { r.loop = fn; },
    render(scene: THREE.Scene, camera: THREE.Camera) { rendered.push({ camera, background: scene.background, clearAlpha, clippingPlanes: [...r.clippingPlanes] }); },
  };
  return r;
}

const tick = () => new Promise((res) => setTimeout(res, 0));

test('without WebXR the page keeps the desktop view and has no headset mode', async () => {
  setXr(null);
  const xrb = new Xrb(fakeRenderer() as unknown as THREE.WebGLRenderer, { pointer: false });
  await tick();
  assert.equal(xrb.xrMode, null);
  assert.equal(xrb.presenting, false);
  assert.equal(xrb.stereo, false);
  await xrb.enterXR();  // nothing to enter
  assert.equal(xrb.presenting, false);
});

test('a headset offering passthrough enters an immersive-ar session with optional hand tracking', async () => {
  const requests = setXr(['immersive-ar', 'immersive-vr']);
  const renderer = fakeRenderer();
  const xrb = new Xrb(renderer as unknown as THREE.WebGLRenderer, { pointer: false, xr: { button: false } });
  await tick();
  assert.equal(xrb.xrMode, 'immersive-ar');
  const views: XrbView[] = [];
  xrb.onView((v) => views.push(v));
  await xrb.enterXR();
  assert.deepEqual(requests, [{ mode: 'immersive-ar', init: { optionalFeatures: ['hand-tracking'] } }]);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.xr.referenceSpaceType, 'local');
  assert.equal(xrb.presenting, true);
  assert.deepEqual(views, [{ stereo: true, switchable: false }]);
  xrb.setStereo(false);  // ignored in a session
  assert.equal(xrb.stereo, true);
  await xrb.exitXR();
  assert.equal(renderer.xr.enabled, false);
  assert.deepEqual(views.at(-1), { stereo: false, switchable: false });
});

test('the app can ask for VR even when passthrough is offered', async () => {
  setXr(['immersive-ar', 'immersive-vr']);
  const xrb = new Xrb(fakeRenderer() as unknown as THREE.WebGLRenderer, { pointer: false, xr: { mode: 'immersive-vr', button: false } });
  await tick();
  assert.equal(xrb.xrMode, 'immersive-vr');
});

test('an orthographic mono camera still renders through a perspective XR camera in-session', async () => {
  setXr(['immersive-ar']);
  const renderer = fakeRenderer();
  const xrb = new Xrb(renderer as unknown as THREE.WebGLRenderer, { pointer: false, xr: { button: false }, mapping: { mode: 'world', center: new THREE.Vector3(0, 0, 0), scale: 10 } });
  await tick();
  await xrb.enterXR();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#123456');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  xrb.render(scene, camera);
  const drawn = renderer.rendered.at(-1)!;
  assert.notEqual(drawn.camera, camera);
  assert.equal((drawn.camera as THREE.PerspectiveCamera).isPerspectiveCamera, true);
  assert.equal(drawn.background, null);
  assert.equal(drawn.clearAlpha, 0);
  assert.equal(drawn.clippingPlanes.length, 4, 'immersive content is cropped to the virtual panel');
  assert.equal(renderer.clippingPlanes.length, 0, 'the app renderer clipping state is restored');
  assert.ok(scene.background instanceof THREE.Color, 'the background is restored after the frame');
  assert.equal(renderer.getClearAlpha(), 1);
  // near / far of the headset camera are in metres (scene units / scale)
  assert.ok(Math.abs((drawn.camera as THREE.PerspectiveCamera).near - 0.01) < 1e-12);
  // eyes come from the headset, in the virtual panel's frame (0.45 m away, 0.15 m above its centre)
  assert.ok(Math.abs(xrb.currentEyes.left[0] + 0.03) < 1e-9);
  assert.ok(Math.abs(xrb.currentEyes.left[2] - 0.45) < 1e-9);
  // the rig puts the head (0, 1.6, 0) at panel (0, 0.15, 0.45) -> scene x10
  const head = new THREE.Vector3(0, 1.6, 0).applyMatrix4(drawn.camera.parent!.matrixWorld);
  assert.ok(head.distanceTo(new THREE.Vector3(0, 1.5, 4.5)) < 1e-9);
  await xrb.exitXR();
});

test('recenter re-anchors the panel on the next frame, and a reference space reset does too', async () => {
  setXr(['immersive-vr']);
  const renderer = fakeRenderer();
  const xrb = new Xrb(renderer as unknown as THREE.WebGLRenderer, { pointer: false, xr: { button: false } });
  await tick();
  await xrb.enterXR();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  xrb.render(scene, camera);
  const panel = (xrb as unknown as { xrPanel: { anchored: boolean } }).xrPanel;
  assert.equal(panel.anchored, true);
  xrb.recenter();
  assert.equal(panel.anchored, false);
  xrb.render(scene, camera);
  assert.equal(panel.anchored, true);
  renderer.space.dispatchEvent(new Event('reset'));
  assert.equal(panel.anchored, false);
  await xrb.exitXR();
});

test('an installed immersive app enters the session at once (autoEnter), without the Enter button', async () => {
  const requests = setXr(['immersive-ar']);
  const renderer = fakeRenderer();
  const xrb = new Xrb(renderer as unknown as THREE.WebGLRenderer, { pointer: false, xr: { button: false, autoEnter: true } });
  for (let i = 0; i < 5 && !xrb.presenting; i++) await tick();
  assert.equal(requests.length, 1);
  assert.equal(xrb.presenting, true);
  await xrb.exitXR();
});

test('the start address ?xrb-xr=enter asks for auto-enter; other pages wait for Enter', () => {
  assert.equal(wantsAutoEnter('?xrb-xr=enter'), true);
  assert.equal(wantsAutoEnter('?a=1&xrb-xr=enter'), true);
  assert.equal(wantsAutoEnter(''), false);
  assert.equal(wantsAutoEnter('?xrb-xr=off'), false);
});

test('without autoEnter the session waits, and a granted session (sessiongranted) starts it', async () => {
  const requests = setXr(['immersive-vr']);
  const xrb = new Xrb(fakeRenderer() as unknown as THREE.WebGLRenderer, { pointer: false, xr: { button: false } });
  await tick();
  assert.equal(requests.length, 0);
  currentXr!.dispatchEvent(new Event('sessiongranted'));
  for (let i = 0; i < 5 && !xrb.presenting; i++) await tick();
  assert.equal(requests.length, 1);
  await xrb.exitXR();
});

test('setAnimationLoop hands the loop to the renderer (the headset drives it in a session)', () => {
  setXr(null);
  const renderer = fakeRenderer();
  const xrb = new Xrb(renderer as unknown as THREE.WebGLRenderer, { pointer: false });
  const fn = () => {};
  xrb.setAnimationLoop(fn);
  assert.equal(renderer.loop, fn);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { appLaunchUrl, appResumeUrl, cameraProjectionFromBuild, cameraProjectionFromLaunch, coverViewSize, createManagedCamera, createXrbApp, panelPreviewRoute, pointerRayFromCamera, PREVIEW_PROJECTION_CHANNEL, resizeManagedCamera } from '../src/index.ts';
import { FakeSocket, projectionMessage } from './fixtures.ts';

const loopback = { hostname: '127.0.0.1', pathname: '/preview/apps/demo/', search: '?xrb-camera=orthographic' };

test('browser views preserve the display aspect by covering and cropping', () => {
  assert.deepEqual(coverViewSize(1920, 1080, 16 / 9), { width: 1920, height: 1080 });
  assert.deepEqual(coverViewSize(1200, 1000, 16 / 9), { width: 1778, height: 1000 });
  assert.deepEqual(coverViewSize(2000, 900, 16 / 9), { width: 2000, height: 1125 });
});

test('managed camera defaults to perspective and only panel previews accept launch projection', () => {
  assert.equal(cameraProjectionFromBuild('', { hostname: 'example.test', pathname: '/apps/demo/' }), 'perspective');
  assert.equal(cameraProjectionFromLaunch('?xrb-camera=orthographic', { hostname: 'example.test', pathname: '/apps/demo/' }), null);
  const launched = new URL(appLaunchUrl('https://example.test/apps/demo/', { returnUrl: 'https://example.test/apps/launcher/', projection: 'orthographic' }));
  assert.equal(cameraProjectionFromLaunch(launched.search, { hostname: launched.hostname, pathname: launched.pathname }), 'orthographic');
  const resumed = new URL(appResumeUrl('https://example.test/apps/launcher/', 'orthographic'));
  assert.equal(cameraProjectionFromLaunch(resumed.search, { href: resumed.href }), 'orthographic');
  assert.equal(cameraProjectionFromLaunch(loopback.search, loopback), 'orthographic');
  assert.equal(cameraProjectionFromBuild(loopback.search, loopback), 'orthographic');
  assert.equal(cameraProjectionFromLaunch('?xrb-camera=parallel', loopback), null);
  assert.equal(panelPreviewRoute(loopback), '/preview/apps/demo/');
  assert.equal(panelPreviewRoute({ hostname: '127.0.0.1', pathname: '/', search: '?xrb-preview-route=%2Fpreview%2Fapps%2Fdemo%2F' }), '/preview/apps/demo/');
  assert.equal(panelPreviewRoute({ hostname: '127.0.0.1', pathname: '/preview/apps/another/', search: '?xrb-preview-route=%2Fpreview%2Flauncher%2F' }), '/preview/launcher/', 'launcher destinations retain the preview run control route');
  assert.equal(panelPreviewRoute({ hostname: '127.0.0.1', pathname: '/apps/demo/' }), null);
  assert.equal(createManagedCamera().isPerspectiveCamera, true);
});

test('managed camera switches projection in place and preserves app-specific pose and framing', () => {
  const camera = createManagedCamera('perspective', { position: [1, 2, 3], target: [0, 0, 0], near: 0.2, far: 40, perspectiveFov: 55 });
  const identity = camera;
  assert.deepEqual(camera.position.toArray(), [1, 2, 3]);
  assert.equal(camera.near, 0.2); assert.equal(camera.far, 40); assert.equal(camera.fov, 55);
  resizeManagedCamera(camera, 1600, 900, 8);
  assert.equal(camera.aspect, 1600 / 900);

  camera.setProjection('orthographic');
  resizeManagedCamera(camera, 1600, 800, 8);
  assert.equal(camera, identity);
  assert.equal(camera.isPerspectiveCamera, false);
  assert.equal((camera as unknown as THREE.OrthographicCamera).isOrthographicCamera, true);
  assert.deepEqual([camera.left, camera.right, camera.top, camera.bottom], [-8, 8, 4, -4]);
  assert.deepEqual(camera.position.toArray(), [1, 2, 3]);
  assert.equal(camera.near, 0.2); assert.equal(camera.far, 40);

  camera.setProjection('perspective');
  resizeManagedCamera(camera, 800, 800, 8);
  assert.equal(camera.isPerspectiveCamera, true);
  assert.equal((camera as unknown as THREE.OrthographicCamera).isOrthographicCamera, false);
  assert.equal(camera.aspect, 1);
});

test('the first host projection is authoritative even when it is Perspective', () => {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const original = { host: g.__XRB_HOST__, socket: g.WebSocket };
  FakeSocket.all.length = 0;
  Object.assign(g, {
    __XRB_HOST__: {
      version: 2, stereo: false, switchable: false,
      display: { widthM: 0.6, heightM: 0.34, tiltRad: 0, pixelsW: 800, pixelsH: 450 },
      eye: { width: 800, height: 450 }, channel: { url: 'ws://127.0.0.1:1/?token=t' }, hostNow: () => 1000,
    },
    WebSocket: FakeSocket,
  });
  const renderer = {
    domElement: { addEventListener() {}, removeEventListener() {} },
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {},
  } as unknown as THREE.WebGLRenderer;
  try {
    const app = createXrbApp(renderer, { projection: 'orthographic', xrb: { pointer: false }, autoStart: false });
    assert.equal(app.projection, 'orthographic');
    FakeSocket.all[0].receive(projectionMessage(false));
    assert.equal(app.projection, 'perspective');
    assert.equal(app.xrb.projection, 'perspective');
    app.dispose();
  } finally {
    if (original.host === undefined) delete g.__XRB_HOST__; else g.__XRB_HOST__ = original.host;
    if (original.socket === undefined) delete g.WebSocket; else g.WebSocket = original.socket;
  }
});

test('orthographic pointer rays follow the managed camera projection', () => {
  const camera = createManagedCamera('orthographic', { position: [0, 0, 6], near: 0.1, far: 20 });
  resizeManagedCamera(camera, 1600, 800, 8);
  const ray = pointerRayFromCamera(camera, 0.25, 0.75);
  assert.ok(ray.origin.distanceTo(new THREE.Vector3(-4, -2, 5.9)) < 1e-9);
  assert.ok(ray.direction.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9);
  assert.ok(ray.at(5.9, new THREE.Vector3()).distanceTo(new THREE.Vector3(-4, -2, 0)) < 1e-9);
});

test('managed orthographic cameras use camera-projected mouse rays', () => {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const original = { width: g.innerWidth, height: g.innerHeight };
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const element = {
    style: {},
    addEventListener: (type: string, listener: (event: PointerEvent) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 800 }),
    setPointerCapture() {},
  };
  const renderer = {
    domElement: element,
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {},
  } as unknown as THREE.WebGLRenderer;
  Object.assign(g, { innerWidth: 1600, innerHeight: 800 });
  try {
    const app = createXrbApp(renderer, { projection: 'orthographic', camera: { orthographicHeight: 8 }, xrb: { pointer: false }, autoStart: false });
    assert.equal(app.camera instanceof THREE.OrthographicCamera, false, 'managed camera keeps stable PerspectiveCamera identity');
    app.xrb.render(app.scene, app.camera);
    const unbind = app.xrb.bindMouse();
    listeners.get('pointermove')?.({ clientX: 400, clientY: 600 } as PointerEvent);
    const actual = app.xrb.interaction.pointer?.ray;
    const expected = pointerRayFromCamera(app.camera, 0.25, 0.75);
    assert.ok(actual);
    assert.ok(actual.origin.distanceTo(expected.origin) < 1e-9);
    assert.ok(actual.direction.distanceTo(expected.direction) < 1e-9);
    unbind();
    app.dispose();
  } finally {
    if (original.width === undefined) delete g.innerWidth; else g.innerWidth = original.width;
    if (original.height === undefined) delete g.innerHeight; else g.innerHeight = original.height;
  }
});

test('stereo mouse rays use the selected eye and its half of the canvas', () => {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const original = { host: g.__XRB_HOST__, socket: g.WebSocket };
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const element = {
    style: {},
    addEventListener: (type: string, listener: (event: PointerEvent) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 450 }),
    setPointerCapture() {},
  };
  const renderer = {
    domElement: element,
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {},
  } as unknown as THREE.WebGLRenderer;
  FakeSocket.all.length = 0;
  Object.assign(g, {
    __XRB_HOST__: {
      version: 2, stereo: true, switchable: false,
      display: { widthM: 0.6, heightM: 0.34, tiltRad: 0, pixelsW: 1600, pixelsH: 450 },
      eye: { width: 800, height: 450 }, channel: { url: 'ws://127.0.0.1:1/?token=t' }, hostNow: () => 1000,
    },
    WebSocket: FakeSocket,
  });
  try {
    const app = createXrbApp(renderer, { xrb: { pointer: false }, autoStart: false });
    app.xrb.currentEyes = { left: [-0.03, 0, 0.6], right: [0.03, 0, 0.6] };
    app.xrb.render(app.scene, app.camera);
    const unbind = app.xrb.bindMouse();
    listeners.get('pointermove')?.({ clientX: 400, clientY: 225 } as PointerEvent);
    const left = app.xrb.interaction.pointer!.ray.origin.clone();
    listeners.get('pointermove')?.({ clientX: 1200, clientY: 225 } as PointerEvent);
    const right = app.xrb.interaction.pointer!.ray.origin.clone();
    assert.ok(left.distanceTo(app.xrb.view.panel.pointToWorld([-0.03, 0, 0.6])) < 1e-9);
    assert.ok(right.distanceTo(app.xrb.view.panel.pointToWorld([0.03, 0, 0.6])) < 1e-9);
    unbind();
    app.dispose();
  } finally {
    if (original.host === undefined) delete g.__XRB_HOST__; else g.__XRB_HOST__ = original.host;
    if (original.socket === undefined) delete g.WebSocket; else g.WebSocket = original.socket;
  }
});

test('managed runtime follows matching preview projection live and disposes the channel', async () => {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const original = { add: g.addEventListener, remove: g.removeEventListener, width: g.innerWidth, height: g.innerHeight, location: g.location, channel: g.BroadcastChannel, fetch: g.fetch };
  const listeners = new Map<string, EventListener>();
  let loop: ((timeMs: number) => void) | null = null;
  const events: string[] = [];
  const projectionRequests: string[] = [];
  let polledProjection = 'orthographic';
  class FakeBroadcastChannel {
    static all: FakeBroadcastChannel[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    closed = false;
    name: string;
    constructor(name: string) { this.name = name; FakeBroadcastChannel.all.push(this); }
    close() { this.closed = true; }
  }
  Object.assign(g, {
    innerWidth: 800,
    innerHeight: 400,
    location: { ...loopback, pathname: '/preview/apps/destination/', search: '?xrb-camera=orthographic&xrb-preview-route=%2Fpreview%2Fapps%2Fdemo%2F&xrb-preview-token=preview-token&xrb-preview-panel=http%3A%2F%2F127.0.0.1%3A5191' },
    BroadcastChannel: FakeBroadcastChannel,
    fetch: async (input: URL) => {
      projectionRequests.push(String(input));
      return { ok: true, json: async () => ({ route: '/preview/apps/demo/', projection: polledProjection }) };
    },
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string, listener: EventListener) => { if (listeners.get(type) === listener) listeners.delete(type); },
  });
  const renderer = {
    domElement: { addEventListener() {}, removeEventListener() {} },
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {},
    setSize() {},
    setScissorTest() {},
    setViewport() {},
    setScissor() {},
    setAnimationLoop(value: typeof loop) { loop = value; },
    render() { events.push('render'); },
  } as unknown as THREE.WebGLRenderer;
  try {
    const app = createXrbApp(renderer, {
      camera: { orthographicHeight: 4 },
      xrb: { pointer: false },
      setup: () => events.push('setup'),
      autoStart: false,
    });
    const identity = app.camera;
    assert.equal(app.projection, 'orthographic');
    assert.equal(app.camera.left, -(32 / 9));
    assert.equal(FakeBroadcastChannel.all[0].name, PREVIEW_PROJECTION_CHANNEL);
    assert.equal(listeners.has('resize'), true);

    FakeBroadcastChannel.all[0].onmessage?.({ data: { route: '/preview/other/', projection: 'perspective' } });
    assert.equal(app.projection, 'orthographic', 'another preview is ignored');
    FakeBroadcastChannel.all[0].onmessage?.({ data: { route: '/preview/apps/demo/', projection: 'perspective' } });
    assert.equal(app.projection, 'perspective');
    FakeBroadcastChannel.all[0].onmessage?.({ data: { route: '/preview/apps/demo/', projection: 'orthographic' } });
    assert.equal(app.projection, 'orthographic');
    FakeBroadcastChannel.all[0].onmessage?.({ data: { route: '/preview/apps/demo/', projection: 'perspective' } });
    assert.equal(app.projection, 'perspective', 'the inherited preview run route follows repeated toggles after navigation');
    listeners.get('message')?.({ origin: 'http://127.0.0.1:5191', data: { route: '/preview/apps/demo/', projection: 'orthographic', token: 'wrong' } } as unknown as Event);
    assert.equal(app.projection, 'perspective', 'another preview token is ignored');
    listeners.get('message')?.({ origin: 'http://127.0.0.1:5191', data: { route: '/preview/apps/demo/', projection: 'orthographic', token: 'preview-token' } } as unknown as Event);
    assert.equal(app.projection, 'orthographic', 'a bounded loopback dev preview accepts its panel signal');
    assert.equal(app.camera, identity);

    polledProjection = 'perspective';
    await new Promise((resolve) => setTimeout(resolve, 280));
    assert.equal(app.projection, 'perspective', 'a managed browser profile polls its token-bounded panel projection');
    assert.match(projectionRequests.at(-1) ?? '', /\/api\/preview\/projection\?route=%2Fpreview%2Fapps%2Fdemo%2F&token=preview-token/);

    app.setFrame(() => events.push('frame'));
    app.start();
    assert.ok(loop);
    loop!(100);
    assert.deepEqual(events, ['setup', 'frame', 'render']);
    app.dispose();
    assert.equal(loop, null);
    assert.equal(listeners.has('resize'), false);
    assert.equal(FakeBroadcastChannel.all[0].closed, true);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete g[key]; else g[key] = value;
    }
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { StrictMode, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { mountXrbApp } from '../src/index.ts';
import { componentRenderer } from '../src/runtime.tsx';
import { fixture, settle } from './fixture.ts';

(globalThis as Record<string, unknown>).innerWidth = 800;
(globalThis as Record<string, unknown>).innerHeight = 450;

test('SDK sample -> Fiber/useFrame -> interaction -> single SDK drawing, clocks reset safely', async () => {
  const f = fixture();
  const events: string[] = [], deltas: number[] = [], times: number[] = [];
  let frames = 0;
  const sample = f.app.xrb.hands.sample.bind(f.app.xrb.hands);
  f.app.xrb.hands.sample = (...args) => { events.push('sample'); return sample(...args); };
  const interaction = f.app.xrb.interaction.update.bind(f.app.xrb.interaction);
  f.app.xrb.interaction.update = (...args) => { events.push('interaction'); return interaction(...args); };
  const draw = f.renderer.render.bind(f.renderer);
  f.renderer.render = (...args) => { events.push('draw'); draw(...args); };
  function Probe() {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((state, delta) => {
      frames++; events.push('component'); deltas.push(delta); times.push(state.clock.elapsedTime);
      assert.equal(state.camera, f.app.camera);
      ref.current!.rotation.y = frames;
    });
    return <mesh ref={ref}><boxGeometry /><meshBasicMaterial /></mesh>;
  }
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready;
  events.length = 0;
  f.tick(1000); f.tick(1016);
  assert.deepEqual(events, ['sample', 'component', 'interaction', 'draw', 'sample', 'component', 'interaction', 'draw']);
  assert.deepEqual(deltas, [0, 0.016]);
  assert.deepEqual(times, [0, 0.016]);
  f.app.stop(); f.app.start(); f.tick(80000);
  assert.equal(deltas.at(-1), 0);
  assert.equal(frames, 3);
  assert.equal(f.calls.filter((e) => e === 'draw').length, 3);
  await m.dispose();
  f.app.dispose();
});

test('Fiber cannot resize, change colour, replace XR loop or lose a borrowed context', async () => {
  const f = fixture(), camera = f.app.camera;
  const guarded = componentRenderer(f.renderer);
  guarded.setSize(1, 1); guarded.setPixelRatio(9); guarded.render(f.app.scene, camera);
  guarded.forceContextLoss(); guarded.dispose(); guarded.xr.setAnimationLoop(() => {});
  assert.equal(f.calls.includes('context.loss'), false);
  let size: { width: number; height: number } | undefined;
  function Probe() {
    size = useThree((s) => s.size);
    useFrame((state) => {
      if (f.app.projection === 'orthographic') assert.equal(state.viewport.width, (camera.right - camera.left) / camera.zoom);
    });
    return <mesh><boxGeometry /><meshBasicMaterial /></mesh>;
  }
  const before = f.calls.length;
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready;
  assert.deepEqual(f.calls.slice(before), ['loop.start']);
  for (const mode of ['orthographic', 'perspective', 'orthographic'] as const) {
    f.app.setProjection(mode);
    const projection = camera.projectionMatrix.clone();
    f.tick(1000);
    assert.equal(f.app.camera, camera);
    // Perspective FOV is deliberately synchronized to the physical SDK panel at draw time.
    if (mode === 'orthographic') assert.deepEqual(camera.projectionMatrix.elements, projection.elements);
  }
  assert.ok(size!.width > 0);
  assert.equal(f.renderer.toneMapping, THREE.NoToneMapping);
  assert.equal(f.renderer.outputColorSpace, THREE.SRGBColorSpace);
  await m.dispose();
  assert.equal(f.calls.includes('context.loss'), false);
  assert.equal(f.calls.includes('lists.dispose'), false);
  assert.equal(f.calls.includes('renderer.dispose'), false);
  assert.equal(f.app.isDisposed, false);
  assert.equal('manual' in camera, false);
  f.app.start(); f.tick(2000);
  assert.equal(f.calls.at(-1), 'draw');
  f.app.dispose();
});

test('Strict Mode replay, updates, duplicate attachment and repeated disposal leave one live owner', async () => {
  const f = fixture();
  let live = 0, frames = 0, disposedResources = 0;
  const observed = new WeakSet<THREE.BufferGeometry>();
  function Probe() {
    useEffect(() => { live++; return () => { live--; }; }, []);
    useFrame(() => frames++);
    return <mesh><boxGeometry onUpdate={(g) => {
      if (!observed.has(g)) { observed.add(g); g.addEventListener('dispose', () => disposedResources++); }
    }} /><meshBasicMaterial /></mesh>;
  }
  const m = mountXrbApp(f.container, <StrictMode><Probe /></StrictMode>, { app: f.app });
  await m.ready; await settle();
  assert.equal(live, 1);
  assert.throws(() => mountXrbApp(f.container, null, { app: f.app }), /unattached/);
  f.tick(1000);
  m.update(<StrictMode><Probe /></StrictMode>);
  await settle(); f.tick(1016);
  assert.equal(frames, 2);
  assert.equal(live, 1);
  const done = m.dispose();
  assert.equal(m.dispose(), done);
  await done; await settle();
  assert.equal(live, 0);
  assert.equal(disposedResources, 1);
  assert.throws(() => m.update(null), /disposed/);
  const replacement = mountXrbApp(f.container, <Probe />, { app: f.app });
  await replacement.ready; f.tick(2000);
  assert.equal(frames, 3);
  await replacement.dispose(); f.app.dispose();
});

test('dispose before configure completion cannot start a retired loop or touch replacement', async () => {
  const f = fixture();
  const m = mountXrbApp(f.container, <mesh />, { app: f.app });
  const done = m.dispose();
  await done;
  assert.equal(f.calls.filter((x) => x === 'loop.start').length, 0);
  const replacement = mountXrbApp(f.container, <mesh />, { app: f.app });
  await replacement.ready;
  assert.equal(f.calls.filter((x) => x === 'loop.start').length, 1);
  await done;
  assert.equal(f.app.isRunning, true);
  await replacement.dispose(); f.app.dispose();
});

test('headset session transitions cannot install a Fiber XR loop; components advance once', async () => {
  const f = fixture();
  let frameCount = 0;
  class Session extends EventTarget { async end() { this.dispatchEvent(new Event('end')); } }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async () => true, requestSession: async () => new Session(),
  } });
  // The SDK discovers XR during creation, so create a new runtime after installing it.
  f.app.dispose();
  const { createXrbApp } = await import('../../sdk/src/index.ts');
  const app = createXrbApp(f.renderer, { autoStart: false, xrb: { pointer: false, xr: { button: false } } });
  const xrFrame = { getViewerPose: () => null } as unknown as XRFrame;
  f.renderer.xr.getFrame = () => xrFrame;
  function Probe() {
    useFrame((_state, _delta, frame) => {
      frameCount++;
      assert.equal(frame, f.renderer.xr.isPresenting ? xrFrame : undefined);
    });
    return null;
  }
  const m = mountXrbApp(f.container, <Probe />, { app });
  await m.ready; await settle();
  const loopStarts = f.calls.filter((x) => x === 'loop.start').length;
  for (let i = 0; i < 2; i++) {
    app.setProjection('orthographic');
    await app.xrb.enterXR();
    (f.renderer.xr as unknown as EventTarget).dispatchEvent(new Event('sessionstart'));
    f.tick(1000 + i * 100);
    assert.equal(app.xrb.presenting, true);
    await app.xrb.exitXR();
    (f.renderer.xr as unknown as EventTarget).dispatchEvent(new Event('sessionend'));
    f.tick(1016 + i * 100);
    assert.equal(app.projection, 'orthographic');
  }
  assert.equal(frameCount, 4);
  assert.equal(f.calls.filter((x) => x === 'loop.start').length, loopStarts);
  assert.equal(f.calls.includes('xr.loop'), false);
  await m.dispose(); app.dispose();
  Object.defineProperty(navigator, 'xr', { configurable: true, value: undefined });
});

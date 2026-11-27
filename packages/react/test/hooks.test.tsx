import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { StrictMode, useRef } from 'react';
import * as THREE from 'three';
import { mountXrbApp, useXrb, useXrbFrame, useXrbHands, useXrbPointer, useXrbTarget } from '../src/index.ts';
import { PinchTarget } from '../../sdk/src/index.ts';
import { fixture, settle } from './fixture.ts';

(globalThis as Record<string, unknown>).innerWidth = 800;
(globalThis as Record<string, unknown>).innerHeight = 450;
function event(type: string, x = 400, y = 225) {
  return Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1 });
}

test('hooks read the current SDK hand sample without a component render per frame', async () => {
  const f = fixture();
  let renders = 0, seen = 0;
  const hand = { id: 42 };
  function Probe() {
    renders++;
    const app = useXrb(), hands = useXrbHands();
    useXrbFrame((frame) => {
      assert.equal(app, f.app);
      assert.equal(frame.xrb.currentHands, hands.current);
      assert.equal(hands.scene, app.xrb.sceneHands);
      assert.equal(hands.current[0].id, 42);
      seen++;
    });
    return null;
  }
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready;
  // A minimal sampling sentinel: scene mapping is separately covered by SDK tests.
  f.app.xrb.hands.sample = () => [];
  // Install a complete SDK hand fixture for both sampling and scene conversion.
  type HandInput = import('../../sdk/src/hands.ts').HandInput;
  const { openHand } = await import('../../sdk/test/fixtures.ts');
  const points = openHand([0, 0, 0]);
  const sample = { ...hand, handedness: 'right', keypoints: points, rawKeypoints: points, pinching: false, grabbing: false,
    pinchPoint: points[8], tip: points[8], coasting: false, lastSeen: 0 };
  f.app.xrb.hands.sample = () => [sample as unknown as ReturnType<HandInput['sample']>[number]];
  f.tick(1000); f.tick(1016);
  assert.equal(seen, 2); assert.equal(renders, 1);
  await m.dispose(); f.app.dispose();
});

test('SDK mesh pointer hooks bubble once, clear on miss and update callbacks without remounting', async () => {
  const f = fixture();
  const calls: string[] = [];
  function Probe({ label }: { label: string }) {
    const group = useRef<THREE.Group>(null), mesh = useRef<THREE.Mesh>(null);
    useXrbPointer(group, { onClick: () => calls.push('parent'), onPointerMissed: () => calls.push('miss') });
    useXrbPointer(mesh, { onClick: (e) => { calls.push(label); e.stopPropagation(); }, onPointerOver: () => calls.push('over') });
    return <group ref={group}><mesh ref={mesh}><boxGeometry /><meshBasicMaterial /></mesh></group>;
  }
  const m = mountXrbApp(f.container, <StrictMode><Probe label="first" /></StrictMode>, { app: f.app });
  await m.ready; f.tick(1000);
  for (const type of ['pointermove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) f.canvas.dispatchEvent(event(type));
  assert.deepEqual(calls, ['over', 'first']);
  m.update(<StrictMode><Probe label="second" /></StrictMode>); await settle();
  f.canvas.dispatchEvent(event('click'));
  f.canvas.dispatchEvent(event('click', 0, 0));
  assert.deepEqual(calls, ['over', 'first', 'second', 'miss']);
  f.canvas.dispatchEvent(event('pointercancel'));
  f.canvas.dispatchEvent(event('click'));
  assert.equal(calls.length, 4);
  await m.dispose(); f.canvas.dispatchEvent(event('click'));
  assert.equal(calls.length, 4); f.app.dispose();
});

test('physical target hook retains capture on callback updates and ends on unmount', async () => {
  const f = fixture();
  const object = new THREE.Object3D();
  const target = new PinchTarget(object, { radius: 0.1 });
  const calls: string[] = [];
  function Probe({ label }: { label: string }) {
    useXrbTarget(target, (e) => calls.push(`${label}:${e.type}:${e.reason ?? ''}`));
    return null;
  }
  const m = mountXrbApp(f.container, <StrictMode><Probe label="first" /></StrictMode>, { app: f.app });
  await m.ready; f.tick(1000);
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 6), new THREE.Vector3(0, 0, -1));
  assert.equal(f.app.xrb.interaction.pointerDown(ray), true);
  m.update(<StrictMode><Probe label="latest" /></StrictMode>); await settle();
  assert.equal(f.app.xrb.interaction.captured(-1), target);
  await m.dispose();
  assert.deepEqual(calls, ['first:start:', 'latest:end:removed']);
  assert.equal(f.app.xrb.interaction.has(target), false);
  assert.equal(f.app.xrb.interaction.captured(-1), null);
  f.app.dispose();
});

test('hooks reject use outside the bridge without starting an SDK runtime', async () => {
  const f = fixture();
  const { createRoot, unmountComponentAtNode } = await import('@react-three/fiber');
  const root = createRoot(f.renderer.domElement);
  const { componentRenderer } = await import('../src/runtime.tsx');
  let error: Error | undefined;
  class Catch extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
    state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(value: Error) { error = value; }
    render() { return this.state.failed ? null : this.props.children; }
  }
  function Probe() { useXrb(); return null; }
  const log = console.error; console.error = () => {};
  try {
    await root.configure({ gl: componentRenderer(f.renderer), frameloop: 'never', dpr: 1 });
    root.render(<Catch><Probe /></Catch>); await settle();
    assert.match(error!.message, /require mountXrbApp/);
    assert.equal(f.app.isRunning, false);
    await new Promise<void>((resolve) => unmountComponentAtNode(f.renderer.domElement, () => resolve()));
  } finally { console.error = log; f.app.dispose(); }
});

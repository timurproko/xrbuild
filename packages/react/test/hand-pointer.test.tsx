import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useRef } from 'react';
import * as THREE from 'three';
import { mountXrbApp, useXrbPointer, useXrbTarget } from '../src/index.ts';
import { createXrbApp, PinchTarget } from '../../sdk/src/index.ts';
import { pointerProvenance } from '../../sdk/src/pointer.ts';
import { openHand } from '../../sdk/test/fixtures.ts';
import type { Hand } from '../../sdk/src/hands.ts';
import { fixture, installPointerEvents } from './fixture.ts';

(globalThis as Record<string, unknown>).innerWidth = 800;
(globalThis as Record<string, unknown>).innerHeight = 450;

for (const mouse of [false, true]) for (const stereo of [false, true]) for (const projection of ['perspective', 'orthographic'] as const) for (const compatibility of [false, true]) {
  test(`hand pointer reaches components once: mouse=${mouse}, stereo=${stereo}, ${projection}, compatibility=${compatibility}`, async (t) => {
    const restoreEvents = installPointerEvents();
    const f = fixture(); f.app.dispose();
    const app = createXrbApp(f.renderer, { autoStart: false, xrb: { mouse, xr: { button: false } } });
    let mount: ReturnType<typeof mountXrbApp> | undefined;
    t.after(async () => { try { await mount?.dispose(); app.dispose(); } finally { restoreEvents(); } });
    app.setProjection(projection); app.xrb.setStereo(stereo);
    const points = openHand([0, 0, 0]); points[8] = [0, 0, 0];
    let pinching = false;
    app.xrb.hands.sample = (): Hand[] => [{ id: 7, handedness: 'right', keypoints: points, rawKeypoints: points,
      pinching, grabbing: false, pinchPoint: [0, 0, 0], coasting: false, lastSeen: 0 }];
    const events: { type: string; handId: number | null; ray: THREE.Ray }[] = [];
    let domHandClicks = 0;
    f.canvas.addEventListener('click', (event) => { if (pointerProvenance(event)) domHandClicks++; });
    function Probe() {
      const ref = useRef<THREE.Mesh>(null);
      useXrbPointer(ref, {
        onPointerDown: (e) => events.push(e), onPointerUp: (e) => events.push(e), onClick: (e) => events.push(e),
      }, compatibility ? { camera: app.camera } : {});
      return <mesh ref={ref}><boxGeometry /><meshBasicMaterial /></mesh>;
    }
    mount = mountXrbApp(f.container, <Probe />, { app });
    await mount.ready;
    f.tick(1000); pinching = true; f.tick(1016); pinching = false; f.tick(1032);
    assert.equal(domHandClicks, 1);
    assert.deepEqual(events.filter((e) => e.handId === 7).map((e) => e.type), ['pointerdown', 'pointerup', 'click']);
    // A centred hand uses the whole-panel ray even when its DOM x is the eye-half boundary.
    assert.equal(app.xrb.pointer!.state.clientX, 400);
    const click = events.find((e) => e.type === 'click')!;
    assert.ok(click.ray.intersectsBox(new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))));
    for (const clientX of stereo && !compatibility ? [200, 600] : [400]) {
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) {
        f.canvas.dispatchEvent(new PointerEvent(type, { clientX, clientY: 225, pointerId: 1, pointerType: 'mouse', button: 0 }));
      }
    }
    const nativeClicks = events.filter((e) => e.type === 'click' && e.handId === null);
    assert.equal(nativeClicks.length, mouse ? (stereo && !compatibility ? 2 : 1) : 0);
    if (mouse && stereo && !compatibility) {
      for (const [index, eye] of [app.xrb.currentEyes.left, app.xrb.currentEyes.right].entries()) {
        assert.ok(nativeClicks[index].ray.origin.distanceTo(app.xrb.toScene(eye)) < 1e-9, 'native Mouse retains its selected-eye ray');
      }
    }
    if (!mouse) {
      assert.equal(app.xrb.interaction.pointer, null, 'Hand-only observation must not enable physical Mouse state');
      assert.equal(app.xrb.cursorObject.visible, false);
      assert.equal(f.canvas.style.cursor, 'none');
    }
  });
}

test('stereo hand positions span the whole panel rather than either native Mouse eye-half', async (t) => {
  const restoreEvents = installPointerEvents();
  const f = fixture(); f.app.dispose();
  const app = createXrbApp(f.renderer, { autoStart: false, xrb: { xr: { button: false } } });
  let mount: ReturnType<typeof mountXrbApp> | undefined;
  t.after(async () => { try { await mount?.dispose(); app.dispose(); } finally { restoreEvents(); } });
  app.xrb.setStereo(true);
  const panelQuarter = app.xrb.display.widthM / 4;
  const sceneQuarter = panelQuarter * app.xrb.metre;
  const points = openHand([0, 0, 0]);
  let x = -panelQuarter, pinching = false;
  app.xrb.hands.sample = (): Hand[] => {
    points[8] = [x, 0, 0];
    return [{ id: 7, handedness: 'right', keypoints: points, rawKeypoints: points, pinching, grabbing: false,
      pinchPoint: [x, 0, 0], coasting: false, lastSeen: 0 }];
  };
  const hits: string[] = [];
  function Probe() {
    const ref = useRef<THREE.Group>(null);
    useXrbPointer(ref, { onClick: (e) => {
      hits.push(e.object.name);
      const left = app.xrb.currentEyes.left, right = app.xrb.currentEyes.right;
      const eye = left.map((value, index) => (value + right[index]) / 2) as [number, number, number];
      assert.ok(e.ray.origin.distanceTo(app.xrb.toScene(eye)) < 1e-9);
    } });
    return <group ref={ref}>
      <mesh name="left" position-x={-sceneQuarter}><boxGeometry /><meshBasicMaterial /></mesh>
      <mesh name="right" position-x={sceneQuarter}><boxGeometry /><meshBasicMaterial /></mesh>
    </group>;
  }
  mount = mountXrbApp(f.container, <Probe />, { app });
  await mount.ready;
  let time = 1000;
  for (const position of [-panelQuarter, panelQuarter]) {
    x = position; pinching = false; f.tick(time); pinching = true; f.tick(time + 16); pinching = false; f.tick(time + 32); time += 48;
  }
  assert.deepEqual(hits, ['left', 'right']);
});

test('Hand-only source loss cancels mesh activation and physical hand capture cannot echo a click', async (t) => {
  const restoreEvents = installPointerEvents();
  const f = fixture(); f.app.dispose();
  const app = createXrbApp(f.renderer, { autoStart: false, xrb: { mouse: false, xr: { button: false } } });
  let mount: ReturnType<typeof mountXrbApp> | undefined;
  t.after(async () => { try { await mount?.dispose(); app.dispose(); } finally { restoreEvents(); } });
  app.xrb.setStereo(true);
  const points = openHand([0, 0, 0]); points[8] = [0, 0, 0];
  let present = true, pinching = false;
  const hand = (): Hand => ({ id: 7, handedness: 'right', keypoints: points, rawKeypoints: points,
    pinching, grabbing: false, pinchPoint: [0, 0, 0], coasting: false, lastSeen: 0 });
  app.xrb.hands.sample = () => present ? [hand()] : [];
  const target = new PinchTarget(new THREE.Object3D(), { radius: 0.1 });
  const lifecycle: string[] = [];
  let clicks = 0;
  function Probe() {
    const ref = useRef<THREE.Mesh>(null);
    useXrbTarget(target, (e) => lifecycle.push(`${e.source}:${e.type}`));
    useXrbPointer(ref, { onClick: () => clicks++ });
    return <mesh ref={ref}><boxGeometry /><meshBasicMaterial /></mesh>;
  }
  mount = mountXrbApp(f.container, <Probe />, { app });
  await mount.ready;
  f.tick(1000); pinching = true; f.tick(1016); pinching = false; f.tick(1032);
  assert.deepEqual(lifecycle, ['pinch:start', 'pinch:end']);
  assert.equal(clicks, 0, 'a captured physical gesture must not activate the mesh');
  target.enabled = false;
  pinching = true; f.tick(1048); present = false; f.tick(1064);
  assert.equal(clicks, 0, 'retired source never clicks');
  present = true; pinching = false; f.tick(1080); pinching = true; f.tick(1096); pinching = false; f.tick(1112);
  assert.equal(clicks, 1, 'a fresh uncaptured gesture still works after cancellation');
});

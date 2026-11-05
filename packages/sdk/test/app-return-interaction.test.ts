import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createXrbApp, type AppCamera } from '../src/index.ts';
import { ReturnControl } from '../src/return-control.ts';
import { FakeSocket } from './fixtures.ts';

for (const host of [false, true]) for (const world of [false, true]) for (const finalProjection of ['perspective', 'orthographic'] as const) {
  test(`${host ? 'desktop' : 'browser'} ${world ? 'metre-scale UI' : 'template'}: framing and X hover/click in ${finalProjection}`, async () => {
    const g = globalThis as typeof globalThis & Record<string, unknown>;
    const keys = ['innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener', 'location', '__XRB_HOST__', 'WebSocket'];
    const originals = new Map(keys.map((key) => [key, g[key]]));
    const listeners = new Map<string, Set<(event: PointerEvent) => void>>();
    let width = 1600, height = 900;
    let drawn: AppCamera;
    let destination = '';
    const element = {
      style: {},
      addEventListener(type: string, listener: (event: PointerEvent) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: (event: PointerEvent) => void) { listeners.get(type)?.delete(listener); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      setPointerCapture() {},
    };
    const renderer = {
      domElement: element,
      xr: { isPresenting: false, enabled: false, getSession: () => null },
      setSize(w: number, h: number) { width = w; height = h; },
      setPixelRatio() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {},
      render(_scene: THREE.Scene, camera: AppCamera) { drawn = camera; camera.updateMatrixWorld(); },
    } as unknown as THREE.WebGLRenderer;
    Object.assign(g, {
      innerWidth: 1600, innerHeight: 900,
      addEventListener() {}, removeEventListener() {},
      location: { href: 'https://example.test/demo/', assign(url: string) { destination = url; } },
      WebSocket: FakeSocket,
      __XRB_HOST__: host ? {
        version: 2, stereo: false, switchable: false,
        display: { widthM: 0.6, heightM: 0.3375, tiltRad: 0, pixelsW: 1600, pixelsH: 900 },
        eye: { width: 1600, height: 900 }, channel: { url: 'ws://127.0.0.1:1/?token=t' }, hostNow: () => 1000,
      } : undefined,
    });
    let app: ReturnType<typeof createXrbApp> | undefined;
    try {
      app = createXrbApp(renderer, {
        camera: world ? { position: [0, 0, 0.6], near: 0.01 } : undefined,
        xrb: { pointer: false, ...(world ? { mapping: { mode: 'world' as const, center: new THREE.Vector3(), scale: 1 } } : {}) },
        autoStart: false,
      });
      // Install the actual control synchronously, avoiding the browser-only lazy import.
      const control = new ReturnControl('https://example.test/launcher/', app.xrb.interaction);
      (app.xrb as unknown as { returnControl: ReturnControl }).returnControl = control;
      const render = () => app!.xrb.render(app!.scene, app!.camera);
      const emit = (type: string, point: THREE.Vector3) => {
        for (const fn of listeners.get(type) ?? []) fn({ clientX: (point.x + 1) * width / 2, clientY: (1 - point.y) * height / 2, pointerId: 1 } as PointerEvent);
      };
      let reference: THREE.Vector3 | undefined;
      for (const projection of ['perspective', 'orthographic', 'perspective', 'orthographic', finalProjection] as const) {
        app.setProjection(projection);
        render();
        const pointOnGlass = app.xrb.toScene([0.08, 0.04, 0]).project(drawn!);
        if (reference) assert.ok(pointOnGlass.clone().sub(reference).setZ(0).length() < 0.002, 'panel-plane content retains its screen size');
        else reference = pointOnGlass;
        const close = app.scene.children.at(-1)!.children[0];
        const center = close.localToWorld(new THREE.Vector3(0, 0, 0.01)).project(drawn!);
        assert.ok(center.x > 0.7 && center.x < 1 && center.y > 0.7 && center.y < 1, 'X stays in the visible corner');
        emit('pointermove', center);
        render();
        assert.equal(app.xrb.interaction.pointer?.target?.state.mouseOver, true, 'runtime binds hover without app setup');
      }
      const close = app.scene.children.at(-1)!.children[0];
      const center = close.localToWorld(new THREE.Vector3(0, 0, 0.01)).project(drawn!);
      emit('pointerdown', center);
      render();
      assert.equal(app.xrb.interaction.pointer?.target?.state.held, true);
      emit('pointerup', center);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(new URL(destination).pathname, '/launcher/', 'release navigates back');
      assert.equal(new URL(destination).searchParams.get('xrb-camera'), finalProjection);
      app.xrb.bindMouse();
      app.xrb.bindMouse();
      assert.equal(listeners.get('pointerdown')?.size, 1, 'legacy explicit binding never duplicates handlers');
      app.dispose();
      app = undefined;
      assert.ok([...listeners.values()].every((set) => set.size === 0), 'dispose removes mouse listeners');
    } finally {
      app?.dispose();
      for (const [key, value] of originals) {
        if (value === undefined) delete g[key]; else g[key] = value;
      }
    }
  });
}

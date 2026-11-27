import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useRef } from 'react';
import * as THREE from 'three';
import { mountXrbApp, useXrbPointer } from '../src/index.ts';
import { createXrbApp } from '../../sdk/src/index.ts';
import { fixture } from './fixture.ts';

(globalThis as Record<string, unknown>).innerWidth = 800;
(globalThis as Record<string, unknown>).innerHeight = 450;

test('SDK eye-half and orthographic rays reach the same registered mesh', async () => {
  const f = fixture(); let clicks = 0;
  function Probe() {
    const mesh = useRef<THREE.Mesh>(null);
    useXrbPointer(mesh, { onClick: () => clicks++ });
    return <mesh ref={mesh}><boxGeometry /><meshBasicMaterial /></mesh>;
  }
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready;
  for (const projection of ['perspective', 'orthographic'] as const) {
    f.app.setProjection(projection); f.app.xrb.setStereo(true); f.tick(1000);
    for (const clientX of [200, 600]) f.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX, clientY: 225 }));
    f.app.xrb.setStereo(false); f.tick(1016);
    f.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: 400, clientY: 225 }));
  }
  assert.equal(clicks, 6);
  await m.dispose(); f.app.dispose();
});

test('SDK mouse-off policy prevents component mesh delivery', async () => {
  const f = fixture(); f.app.dispose();
  const app = createXrbApp(f.renderer, { autoStart: false, xrb: { mouse: false, pointer: false } });
  let clicks = 0;
  function Probe() {
    const mesh = useRef<THREE.Mesh>(null);
    useXrbPointer(mesh, { onClick: () => clicks++ });
    return <mesh ref={mesh}><boxGeometry /><meshBasicMaterial /></mesh>;
  }
  const m = mountXrbApp(f.container, <Probe />, { app });
  await m.ready; f.tick(1000);
  f.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: 400, clientY: 225 }));
  assert.equal(clicks, 0);
  await m.dispose(); app.dispose();
});

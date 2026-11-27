import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mountXrbApp } from '../src/index.ts';
import { fixture, settle } from './fixture.ts';

(globalThis as Record<string, unknown>).innerWidth = 800;
(globalThis as Record<string, unknown>).innerHeight = 450;

test('two SDK stereo eye draws advance components only once and retain per-eye output', async () => {
  const f = fixture();
  f.app.xrb.setStereo(true);
  f.app.setProjection('orthographic');
  let advances = 0;
  function Probe() { useFrame(() => advances++); return null; }
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready;
  f.calls.length = 0;
  f.tick(1000);
  assert.equal(advances, 1);
  assert.equal(f.calls.filter((s) => s === 'draw').length, 2);
  const eye = f.app.xrb.viewSize();
  assert.equal(f.renderer.getSize(new THREE.Vector2()).x, eye.width * 2);
  assert.equal(f.app.projection, 'orthographic');
  await m.dispose(); f.app.dispose();
});

test('icon fast path advances components once without ordinary interaction or a second draw', async () => {
  const f = fixture();
  Object.defineProperty(f.app.xrb, 'icon', { value: { size: 128, interactive: false } });
  (f.app.xrb as unknown as { iconOptions: { autoReady: boolean } }).iconOptions.autoReady = false;
  let advances = 0, interactions = 0;
  f.app.xrb.interaction.update = () => { interactions++; };
  function Probe() { useFrame(() => advances++); return <mesh><boxGeometry /><meshBasicMaterial /></mesh>; }
  const m = mountXrbApp(f.container, <Probe />, { app: f.app });
  await m.ready; f.calls.length = 0;
  f.tick(1000);
  assert.equal(advances, 1);
  assert.equal(interactions, 0);
  assert.equal(f.calls.filter((s) => s === 'draw').length, 1);
  await m.dispose(); f.app.dispose();
});

test('caller scene textures and primitives survive unmount; SDK-owned visuals dispose once', async () => {
  const f = fixture();
  const background = new THREE.Texture();
  f.app.scene.background = background;
  let textureDisposals = 0, primitiveDisposals = 0, handDisposals = 0;
  background.addEventListener('dispose', () => textureDisposals++);
  const primitive = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  primitive.geometry.addEventListener('dispose', () => primitiveDisposals++);
  const handGeometry = (f.app.xrb.handsObject.children[0] as THREE.Mesh).geometry;
  handGeometry.addEventListener('dispose', () => handDisposals++);
  const m = mountXrbApp(f.container, <primitive object={primitive} />, { app: f.app });
  await m.ready; await m.dispose(); await settle();
  assert.equal(textureDisposals, 0);
  assert.equal(primitiveDisposals, 0);
  assert.equal(f.app.scene.background, background);
  f.app.dispose(); f.app.dispose();
  assert.equal(handDisposals, 1);
  background.dispose(); primitive.geometry.dispose(); (primitive.material as THREE.Material).dispose();
});

test('retiring a suspended commit cannot hang disposal or start its loop', async () => {
  const f = fixture();
  const pending = new Promise<never>(() => {});
  function Pending(): React.ReactNode { throw pending; }
  const m = mountXrbApp(f.container, <Pending />, { app: f.app });
  await settle();
  assert.equal(f.app.isRunning, false);
  await m.dispose();
  assert.equal(f.calls.includes('loop.start'), false);
  f.app.dispose();
});

test('cleanup-restored borrowed scene textures are not disposed by Fiber finalization', async () => {
  const f = fixture();
  const texture = new THREE.Texture(); f.app.scene.background = texture;
  let disposed = 0; texture.addEventListener('dispose', () => disposed++);
  function Background() {
    useLayoutEffect(() => {
      f.app.scene.background = new THREE.Color('#0b0f14');
      return () => { f.app.scene.background = texture; };
    }, []);
    return null;
  }
  const m = mountXrbApp(f.container, <Background />, { app: f.app });
  await m.ready; await m.dispose();
  assert.equal(f.app.scene.background, texture); assert.equal(disposed, 0);
  f.app.dispose(); texture.dispose();
});

test('an icon waiting for assets releases resources immediately and never draws when assets finish', async () => {
  const f = fixture();
  let resolve!: () => void;
  const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  object.userData.ready = new Promise<void>((done) => { resolve = done; });
  let releases = 0; object.geometry.addEventListener('dispose', () => releases++);
  (f.app.xrb as unknown as { createIconStage(create: () => THREE.Object3D): void }).createIconStage(() => object);
  await settle();
  f.app.dispose();
  assert.equal(releases, 1);
  const draws = f.calls.filter((x) => x === 'draw').length;
  resolve(); await settle();
  assert.equal(releases, 1); assert.equal(f.calls.filter((x) => x === 'draw').length, draws);
});

test('disposal during asynchronous renderer XR setup retires the late session', async () => {
  const f = fixture(); f.app.dispose();
  let release!: () => void, entered!: () => void, ends = 0;
  const gate = new Promise<void>((done) => { release = done; });
  const ready = new Promise<void>((done) => { entered = done; });
  class Session extends EventTarget { async end() { ends++; this.dispatchEvent(new Event('end')); } }
  const old = (navigator as unknown as { xr?: unknown }).xr;
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async () => true, requestSession: async () => new Session(),
  } });
  const original = f.renderer.xr.setSession.bind(f.renderer.xr);
  f.renderer.xr.setSession = async (session) => { entered(); await gate; await original(session); };
  const { createXrbApp } = await import('../../sdk/src/index.ts');
  const app = createXrbApp(f.renderer, { autoStart: false, xrb: { pointer: false, xr: { button: false } } });
  try {
    await settle(); const entering = app.xrb.enterXR(); await ready;
    app.dispose(); release(); await entering;
    assert.equal(ends, 1); assert.equal(f.renderer.xr.enabled, false); assert.equal(app.xrb.presenting, false);
  } finally { release(); app.dispose(); Object.defineProperty(navigator, 'xr', { configurable: true, value: old }); }
});

test('a late icon factory never draws after SDK disposal', async () => {
  const f = fixture();
  let resolve!: (object: THREE.Object3D) => void;
  const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  let releases = 0; object.geometry.addEventListener('dispose', () => releases++);
  const late = new Promise<THREE.Object3D>((done) => { resolve = done; });
  (f.app.xrb as unknown as { createIconStage(create: () => Promise<THREE.Object3D>): void }).createIconStage(() => late);
  f.app.dispose(); const draws = f.calls.filter((x) => x === 'draw').length;
  resolve(object); await settle();
  assert.equal(releases, 1); assert.equal(f.calls.filter((x) => x === 'draw').length, draws);
});

test('failed component commit rolls back and leaves a borrowed SDK restartable', async () => {
  const f = fixture();
  const original = console.error;
  console.error = () => {};
  try {
    function Broken(): React.ReactNode { throw new Error('component setup failed'); }
    const m = mountXrbApp(f.container, <Broken />, { app: f.app });
    await assert.rejects(m.ready, /component setup failed/);
    await m.dispose();
    assert.equal(f.app.isRunning, false);
    assert.equal(f.calls.includes('context.loss'), false);
    const replacement = mountXrbApp(f.container, null, { app: f.app });
    await replacement.ready; await replacement.dispose();
  } finally { console.error = original; f.app.dispose(); }
});

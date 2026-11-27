import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type * as THREE from 'three';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { createXrbApp } from '../../sdk/src/index.ts';
import { FakeSocket, handsMessage, openHand } from '../../sdk/test/fixtures.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('real fake sidecar draws two mid-detail meshes through standard SDK drawing without app code', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async () => {
  const keys = ['innerWidth', 'innerHeight', '__XRB_HOST__', 'WebSocket', 'location', 'fetch'];
  const g = globalThis as any, previous = Object.fromEntries(keys.map(k => [k, g[k]])), fetcher = fetch;
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); let app: ReturnType<typeof createXrbApp> | null = null;
  const descriptor = await run.start({ owner: 'workspace:fixture', id: 'mesh', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 1, id: 'mesh', label: 'Fixture', program: 'runtime.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], settingsVersion: 1,
      settings: [{ key: 'vertices', label: 'Vertices', type: 'number', min: 3, max: 2859, default: 2859 }] }) }, {});
  try {
    for (let i = 0; i < 200 && run.status === 'Starting'; i++) await wait(10);
    const renderer = { domElement: { style: {}, addEventListener() {}, removeEventListener() {} }, xr: { isPresenting: false, getSession: () => null }, setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {} } as any;
    const host = { version: 2, stereo: false, handMeshRuntimeJson: JSON.stringify(descriptor), display: { widthM: .6, heightM: .34, tiltRad: 0, pixelsW: 1280, pixelsH: 720 }, eye: { width: 1280, height: 720 }, channel: { url: 'ws://fake' }, hostNow: () => performance.now() };
    Object.assign(g, { innerWidth: 1280, innerHeight: 720, WebSocket: FakeSocket, location: { search: '?xrb-hand=native' }, __XRB_HOST__: host,
      fetch: (url: string, init: RequestInit) => fetcher(url, { ...init, headers: { ...init.headers, origin: 'https://app.local' } }) });
    FakeSocket.all.length = 0;
    app = createXrbApp(renderer, { autoStart: false, xrb: { pointer: false, hands: { smoothing: false, prediction: false } } });
    const socket = FakeSocket.all[0]; socket.open();
    const hands = [{ id: 1, keypoints: openHand([-.05, 0, .1]) }, { id: 2, handedness: 0, keypoints: openHand([.05, 0, .1]) }];
    let group: THREE.Object3D | undefined;
    for (let i = 0; i < 80; i++) {
      socket.receive(handsMessage(hands, performance.now())); app.xrb.render(app.scene, app.camera);
      group = app.xrb.handsObject.getObjectByName('xrb-hand-mesh');
      if (group?.children.length === 2) break;
      await wait(5);
    }
    assert.ok(group); assert.equal(group.children.length, 2); assert.equal(app.xrb.handsObject.parent, app.scene);
    for (const child of group.children) assert.equal(((child as THREE.Mesh).geometry.getAttribute('position')).count, 2859);
    const skeleton = structuredClone(app.xrb.currentHands.map(h => h.keypoints));
    await run.stop(); // A sidecar death must not change input, gestures or app availability.
    socket.receive(handsMessage(hands, performance.now())); app.xrb.render(app.scene, app.camera);
    assert.deepEqual(app.xrb.currentHands.map(h => h.keypoints), skeleton);
    socket.receive(handsMessage([], performance.now()));
    assert.equal(group.children.length, 0, 'no-hand invalidation is immediate, not skeleton-grace delayed');
    app.dispose(); app = null;
    // Drawing opt-out keeps the normal input path and never attaches either standard visual.
    app = createXrbApp(renderer, { autoStart: false, handVisual: false, xrb: { pointer: false, hands: { smoothing: false, prediction: false } } });
    const second = FakeSocket.all.at(-1)!; second.open(); second.receive(handsMessage(hands, performance.now())); app.xrb.render(app.scene, app.camera);
    assert.equal(app.xrb.handsObject.parent, null); assert.equal(app.xrb.currentHands.length, 2);
  } finally {
    app?.dispose(); await run.stop();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete g[key]; else g[key] = value; }
  }
});

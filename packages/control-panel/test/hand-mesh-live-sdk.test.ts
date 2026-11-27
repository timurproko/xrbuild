import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
import { createXrbApp, PinchTarget } from '../../sdk/src/index.ts';
import { FakeSocket, handsMessage, openHand } from '../../sdk/test/fixtures.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('modern managed SDK keeps a pinch hold through quality, reprepare, None, replacement and failure', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR, timeout: 15000 }, async () => {
  const keys = ['innerWidth', 'innerHeight', '__XRB_HOST__', 'WebSocket', 'location', 'fetch'];
  const g = globalThis as any, previous = Object.fromEntries(keys.map(k => [k, g[k]])), fetcher = fetch;
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR });
  const p = { owner: 'workspace:fixture', id: 'surface', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'worker.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], settingsVersion: 1, capabilities: MESH_CAPABILITIES,
      settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 9, default: 3, changeMode: 'live' },
        { key: 'device', label: 'Device', type: 'select', default: 'primary', options: ['primary', 'secondary'].map(value => ({ value, label: value })), changeMode: 'reprepare' },
        { key: 'ackDelay', label: 'Delay', type: 'number', min: 0, max: 500, default: 0, changeMode: 'live' }] }) };
  const descriptor = await run.start(p), renderer = { domElement: { style: {}, addEventListener() {}, removeEventListener() {} }, xr: { isPresenting: false, getSession: () => null }, setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {} } as any;
  let app: ReturnType<typeof createXrbApp> | null = null;
  try {
    Object.assign(g, { innerWidth: 1280, innerHeight: 720, WebSocket: FakeSocket, location: { search: '?xrb-hand=native' },
      __XRB_HOST__: { version: 2, stereo: false, handMeshRuntimeJson: JSON.stringify(descriptor), display: { widthM: .6, heightM: .34, tiltRad: 0, pixelsW: 1280, pixelsH: 720 }, eye: { width: 1280, height: 720 }, channel: { url: 'ws://fake' }, hostNow: () => performance.now() },
      fetch: (url: string, init: RequestInit) => fetcher(url, { ...init, headers: { ...init.headers, origin: 'https://app.local' } }) });
    FakeSocket.all.length = 0;
    const makeApp = (handVisual = true) => createXrbApp(renderer, { autoStart: false, handVisual, xrb: { pointer: false, hands: { smoothing: false, prediction: false } } });
    app = makeApp(); let socket = FakeSocket.all.at(-1)!; socket.open();
    const points = openHand([0, 0, .1]);
    const render = () => { socket.receive(handsMessage([{ id: 1, keypoints: points }], performance.now())); app!.xrb.render(app!.scene, app!.camera); };
    const meshCount = () => ((app!.xrb.handsObject.getObjectByName('xrb-hand-mesh')?.children[0] as THREE.Mesh | undefined)?.geometry.getAttribute('position').count ?? 0);
    const until = async (condition: () => boolean) => { for (let i = 0; i < 250; i++) { render(); if (condition()) return; await wait(5); } assert.fail(JSON.stringify(run.state())); };
    await until(() => meshCount() === 3);
    const object = app.scene.clone(false); object.position.copy(app.xrb.sceneHands[0].pinchPoint); app.scene.add(object);
    const target = app.xrb.interaction.add(new PinchTarget(object, { radius: .1 })), events: string[] = [];
    target.on(e => events.push(e.type)); points[4] = [...points[8]]; for (let i = 0; i < 4; i++) render();
    assert.ok(events.includes('start')); const before = structuredClone(app.xrb.currentHands[0].keypoints), at = events.length;
    run.configure(p, { vertices: 6 }, 'quality'); await until(() => meshCount() === 6 && app!.xrb.handMeshState?.appliedGeneration === 2);
    app.xrb.handsObject.applyAppearance({ showJoints: false, showBones: false });
    run.configure(p, { vertices: 9, device: 'secondary', ackDelay: 150 }, 'device');
    await until(() => app!.xrb.handMeshState?.phase === 'Preparing'); assert.equal(meshCount(), 0);
    await until(() => meshCount() === 9); assert.equal(app.xrb.handsObject.children[0].visible, false); assert.equal(app.xrb.handsObject.children[1].visible, false);
    run.configure(null, {}, 'none'); await until(() => app!.xrb.handMeshState?.requestedGeneration === 4 && meshCount() === 0);
    app.xrb.handsObject.applyAppearance({ showJoints: true, showBones: true });
    run.configure({ ...p, owner: 'workspace:replacement' }, {}, 'replacement'); await until(() => meshCount() === 3);
    assert.deepEqual(app.xrb.currentHands[0].keypoints, before); assert.equal(events.slice(at).includes('end'), false);
    (run as any).stage.owned.child.kill();
    await until(() => app!.xrb.handMeshState?.phase === 'Failed' && meshCount() === 0);
    assert.deepEqual(app.xrb.currentHands[0].keypoints, before); assert.equal(events.slice(at).includes('end'), false);
    run.retry(); await until(() => meshCount() === 3);
    // A live standard-visual opt-out may receive geometry, but cannot claim it was drawn.
    app.dispose(); app = makeApp(false); socket = FakeSocket.all.at(-1)!; socket.open();
    await until(() => meshCount() === 3); for (let i = 0; i < 10; i++) { render(); await wait(5); }
    assert.equal(app.xrb.handsObject.parent, null); assert.equal(run.state().drawingGeneration, null); assert.equal(app.xrb.currentHands.length, 1);
    await run.stop(); for (let i = 0; i < 10; i++) { render(); await wait(5); }
    assert.deepEqual(app.xrb.currentHands[0].keypoints, before);
  } finally {
    app?.dispose(); await run.stop();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete g[key]; else g[key] = value; }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createXrbApp, PinchTarget } from '../src/index.ts';
import { handProfile } from '../src/hand-profile.ts';
import { MSG_HAND_PROFILE, MSG_ACK_HAND_PROFILE, encodeProfileControl, decodeProfileControl } from '../src/hand-profile-control.ts';
import { FakeSocket, handsMessage, openHand } from './fixtures.ts';

test('managed native runtime gates initial frames, preserves appearance holds and releases geometry before new contacts', () => {
  const g = globalThis as any, previous = Object.fromEntries(['innerWidth', 'innerHeight', '__XRB_HOST__', 'WebSocket', 'location'].map(k => [k, g[k]]));
  FakeSocket.all.length = 0;
  const runId = 'managed-runtime-123456789';
  Object.assign(g, { innerWidth: 1280, innerHeight: 720, WebSocket: FakeSocket, location: { search: '?xrb-hand=native' },
    __XRB_HOST__: { version: 2, stereo: false, handProfileRunId: runId, display: { widthM: .6, heightM: .34, tiltRad: 0, pixelsW: 1280, pixelsH: 720 }, eye: { width: 1280, height: 720 }, channel: { url: 'ws://fake' }, hostNow: () => performance.now() } });
  const renderer = { domElement: { style: {}, addEventListener() {}, removeEventListener() {} }, xr: { isPresenting: false, getSession: () => null }, setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {} } as any;
  const app = createXrbApp(renderer, { autoStart: false, xrb: { pointer: false, hands: { smoothing: false, prediction: false } } });
  const socket = FakeSocket.all[0]; socket.open();
  const profile = (sequence: number, p = handProfile()) => socket.receive(encodeProfileControl(MSG_HAND_PROFILE, { version: 1, runId, sequence, revision: 'b'.repeat(64), profile: p }));
  const points = openHand([0, 0, .1]);
  const push = () => { socket.receive(handsMessage([{ id: 1, keypoints: points }], performance.now())); app.xrb.render(app.scene, app.camera); };
  try {
    push(); assert.equal(app.xrb.currentHands.length, 0, 'no unadjusted startup contact');
    profile(0); app.xrb.render(app.scene, app.camera); push(); push();
    const object = new THREE.Object3D(); object.position.copy(app.xrb.sceneHands[0].pinchPoint); app.scene.add(object);
    const target = app.xrb.interaction.add(new PinchTarget(object, { radius: .1 })), events: string[] = [];
    target.on(e => events.push(e.type)); points[4] = [...points[8]]; for (let i = 0; i < 4; i++) push();
    assert.ok(events.includes('start'));
    const before = structuredClone(app.xrb.currentHands), eventCount = events.length;
    profile(1, handProfile({ appearance: { showBones: false, opacity: .2 } })); app.xrb.render(app.scene, app.camera);
    assert.equal((app.xrb.handsObject.children[1] as THREE.Mesh).visible, false);
    assert.deepEqual(app.xrb.currentHands[0].keypoints, before[0].keypoints); assert.equal(events.slice(eventCount).includes('end'), false);
    let pointerResets = 0; (app.xrb as any).pointer = { reset() { pointerResets++; }, update() {} };
    profile(3, handProfile({ offsetMm: { x: 100 } })); profile(2); app.xrb.render(app.scene, app.camera);
    assert.equal(app.xrb.currentHands.length, 0); assert.equal(pointerResets, 1); assert.ok(events.includes('end'));
    push(); assert.ok(Math.abs(app.xrb.currentHands[0].keypoints[0][0] - .1) < 1e-6);
    profile(3, handProfile({ offsetMm: { x: 100 } })); app.xrb.render(app.scene, app.camera); assert.equal(pointerResets, 1);
    assert.ok(socket.sent.some(b => !!decodeProfileControl(b, MSG_ACK_HAND_PROFILE)));
    app.dispose(); profile(9); assert.equal(app.xrb.currentHands.length, 0);
    delete g.__XRB_HOST__.handProfileRunId; g.location.search += '&xrb-hand-profile-run=' + runId;
    const oldHostApp = createXrbApp(renderer, { autoStart: false, xrb: { pointer: false } });
    try {
      FakeSocket.all.at(-1)!.receive(handsMessage([{ id: 1 }], performance.now())); oldHostApp.xrb.render(oldHostApp.scene, oldHostApp.camera);
      assert.equal(oldHostApp.xrb.currentHands.length, 0, 'an old host cannot silently bypass managed adjustments; rebuild required');
    } finally { oldHostApp.dispose(); }
  } finally { app.dispose(); for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete g[k]; else g[k] = v; } }
});

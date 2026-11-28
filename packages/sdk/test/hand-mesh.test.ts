import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HandMeshClient, meshRuntime } from '../src/hand-mesh-client.ts';
import { encodeMeshResult, decodeMeshResult, meshPacket, MESH_MAX_BYTES, validMeshFrame, type MeshFrame } from '../src/hand-mesh-protocol.ts';
import { HandVisual } from '../src/hand-visual.ts';
import { HandInput } from '../src/hands.ts';
import { PanelFrame } from '../src/stereo.ts';
import { prepareHandFrame } from '../src/hand-source.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const surface = (id = 1) => ({ id, topology: 'triangle-v1', positions: new Float32Array([0, 0, 0, .01, 0, 0, 0, .01, 0]), indices: new Uint32Array([0, 1, 2]) });

test('binary result codec bounds geometry and supports two mid-detail hands', () => {
  const meshes = [0, 1].map(id => ({ id, topology: 'mid-v1', positions: new Float32Array(2859 * 3), normals: new Float32Array(2859 * 3), indices: Uint32Array.from({ length: 5692 * 3 }, (_, i) => i % 2859) }));
  const bytes = encodeMeshResult({ type: 'result', epoch: 'run', sequence: 1, revision: 0, meshes });
  assert.ok(bytes.length < 300000 && bytes.length < MESH_MAX_BYTES); assert.equal(decodeMeshResult(bytes).meshes.length, 2);
  for (const mesh of [{ ...surface(), positions: new Float32Array([NaN, 0, 0]) }, { ...surface(), indices: new Uint32Array([0, 1, 100]) }, { ...surface(), positions: new Float32Array(16385 * 3) }])
    assert.throws(() => decodeMeshResult(encodeMeshResult({ type: 'result', epoch: 'run', sequence: 1, revision: 0, meshes: [mesh] })));
  assert.throws(() => decodeMeshResult(bytes.subarray(0, bytes.length - 1)));
  assert.throws(() => meshPacket({}, new Uint8Array(MESH_MAX_BYTES)));
});

test('mesh client fences late replies, bounds pending frames and never mutates input or events', async () => {
  let now = 0, respond: ((r: Response) => void) | null = null;
  const sent: MeshFrame[] = [], requests: MeshFrame[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const frame = JSON.parse(init.body as string); requests.push(frame);
    if (url.endsWith('/connect')) return new Response(null, { status: 204 });
    sent.push(frame); return new Promise<Response>(resolve => { respond = resolve; });
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) }, fetcher, () => now);
  await tick();
  const frame = decodeMessage(handsMessage([{ id: 1 }], 0)) as HandsMessage;
  assert.equal(prepareHandFrame(frame), frame);
  const before = structuredClone(frame), a = new HandInput({ smoothing: false, prediction: false }), b = new HandInput({ smoothing: false, prediction: false });
  const ea: string[] = [], eb: string[] = []; a.on(e => ea.push(e.type)); b.on(e => eb.push(e.type));
  a.push(frame, 0); b.push(frame, 0);
  const hands = a.sample(0); client.observed([1]);
  client.update(hands, 8); client.update(hands, 9); client.update(hands, 10);
  assert.equal(sent.length, 1); assert.equal(requests.length, 2, 'one connect and one in flight');
  const reply = (frame: MeshFrame) => new Response(encodeMeshResult({ type: 'result', epoch: frame.epoch, sequence: frame.sequence, revision: frame.revision, meshes: [surface()] }) as BodyInit);
  respond!(reply(sent[0])); await tick(); await tick();
  assert.equal(sent.length, 2); assert.equal(sent[1].sampleMs, 10, 'only newest pending retained');
  assert.equal(client.update(hands, 11).length, 1);
  assert.deepEqual(frame, before); assert.deepEqual(a.sample(0), b.sample(0)); assert.deepEqual(ea, eb);
  now = 101; assert.equal(client.update(hands, 12).length, 0, 'old mesh expires rather than stalls');
  client.invalidate(); respond!(reply(sent[1])); await tick(); await tick();
  assert.equal(client.update(hands, 13).length, 0, 'retired-revision result cannot revive mesh');
  client.observed([]); assert.equal(client.update([], 14).length, 0);
  client.close(); respond?.(new Response(null, { status: 204 }));
  for (const url of ['https://foreign.test/', 'http://127.0.0.1:12/?token=bad', 'http://localhost:12/']) assert.equal(meshRuntime(JSON.stringify({ version: 1, url, token: 'a'.repeat(64) })), null);
});

test('mesh visual maps the final pose once, respects appearance and disposes topology/buffers', () => {
  const visual = new HandVisual(), panel = new PanelFrame(), camera = new THREE.PerspectiveCamera();
  panel.update({ mode: 'world', center: new THREE.Vector3(1, 2, 3), scale: 2 }, camera);
  const original = visual.children.length; visual.updateMeshes([], panel); assert.equal(visual.children.length, original);
  visual.applyAppearance({ boneColorLinear: [.1, .2, .3], opacity: .6 }); visual.updateMeshes([surface()], panel);
  const group = visual.getObjectByName('xrb-hand-mesh')!, mesh = group.children[0] as THREE.Mesh;
  assert.deepEqual((mesh.geometry.getAttribute('position').array as Float32Array), surface().positions);
  assert.deepEqual(group.matrix.elements, panel.toWorld.elements);
  const material = mesh.material as THREE.MeshStandardMaterial; assert.equal(material.opacity, 1); assert.equal(material.transparent, false); assert.equal(material.side, THREE.FrontSide); assert.equal(material.color.g, .2);
  let disposed = false; mesh.geometry.addEventListener('dispose', () => { disposed = true; });
  visual.updateMeshes([], panel); assert.equal(disposed, true); assert.equal(group.children.length, 0);
  visual.disposeMeshes(); assert.equal(visual.children.length, original);
});

test('the default fetch is called the way browsers require, not as a method of the client', async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  // Like Chrome: fetch throws "Illegal invocation" when called with any receiver other than the window.
  globalThis.fetch = function (this: unknown, input: RequestInfo | URL) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    calls.push(String(input)); return Promise.resolve(new Response(null, { status: 204 }));
  } as typeof fetch;
  try {
    const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) });
    for (let i = 0; i < 5 && !calls.length; i++) await tick();
    assert.deepEqual(calls, ['http://127.0.0.1:1234/connect']);
    assert.equal(client.connectError, null, 'the connection is not refused by the browser');
    client.close();
  } finally { globalThis.fetch = original; }
});

test('a viewer can hold mesh results longer, and the frame tells the server within bounds', async () => {
  const sent: any[] = [];
  const fetcher = (async (_url: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) }, fetcher);
  client.setDrawLimits({ maxAgeMs: 500, maxResidualM: .02 });
  client.observed([1]); client.update([], 0); await tick(); await tick();
  const frame = { type: 'frame', epoch: 'e', sequence: 1, revision: 1, sentMs: 0, sampleMs: 0, hands: [] };
  assert.equal(validMeshFrame({ ...frame, maxAgeMs: 500 }), true);
  assert.equal(validMeshFrame({ ...frame, maxAgeMs: 50 }), false, 'never stricter than the default');
  assert.equal(validMeshFrame({ ...frame, maxAgeMs: 5000 }), false, 'bounded');
  assert.equal(validMeshFrame(frame), true, 'absent keeps the 100 ms default');
  client.setDrawLimits({ maxAgeMs: 99999 });
  assert.ok(sent.every(f => f.maxAgeMs === undefined || f.maxAgeMs <= 2000));
  client.close();
});

test('a carried mesh bridges a frame without a fresh mesh, only while the hand is still there', () => {
  let now = 0;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) }, (async () => new Response(null, { status: 204 })) as typeof fetch, () => now);
  client.setDrawLimits({ carryMs: 250 });
  client.update([], 0); // the first update starts the session's generation
  const surface = { id: 1, topology: 't', positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) } as any;
  (client as any).carried.set(1, { surface, at: 0 });
  const hand = { id: 1, coasting: true, handedness: 'left', keypoints: [] } as any;
  now = 100; assert.equal(client.update([hand], now).length, 1, 'a coasting hand keeps its last mesh briefly');
  now = 400; assert.equal(client.update([hand], now).length, 0, 'not beyond the carry time');
  (client as any).carried.set(1, { surface, at: 400 });
  now = 450; assert.equal(client.update([], now).length, 0, 'a hand that left drops its mesh at once');
  client.close();
});

test('a valid result that leaves a hand out keeps its held mesh, fitted to the current pose, until the source-age bound', async () => {
  let now = 0, respond: ((r: Response) => void) | null = null;
  const sent: MeshFrame[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/connect')) return new Response(null, { status: 204 });
    sent.push(JSON.parse(init.body as string)); return new Promise<Response>(resolve => { respond = resolve; });
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) }, fetcher, () => now);
  await tick();
  const input = new HandInput({ smoothing: false, prediction: false });
  input.push(decodeMessage(handsMessage([{ id: 1 }], 0)) as HandsMessage, 0);
  const hands = input.sample(0); client.observed([1]);
  const reply = (frame: MeshFrame, meshes: any[]) => { respond!(new Response(encodeMeshResult({ type: 'result', epoch: frame.epoch, sequence: frame.sequence, revision: frame.revision, meshes }) as BodyInit)); };
  client.update(hands, 0); reply(sent[0], [surface()]); await tick(); await tick();
  assert.equal(client.update(hands, 10).length, 1);
  // A processor that does not refit a repeated sample answers with no mesh for the hand: the held one stays.
  reply(sent[1], []); await tick(); await tick();
  now = 40; const moved = hands.map(h => ({ ...h, keypoints: h.keypoints.map(p => [p[0] + .05, p[1], p[2]] as [number, number, number]) }));
  const held = client.update(moved, 40);
  assert.equal(held.length, 1, 'no flicker on a result without the hand');
  assert.ok(Math.abs((held[0] as any).transform[12] - .05) < 1e-6, 'the held mesh follows the current wrist, not a stale pose');
  // Topology stays cached per hand, so the next result may omit indices.
  reply(sent[2], [{ ...surface(), indices: new Uint32Array(0) }]); await tick(); await tick();
  assert.equal(client.update(moved, 41).length, 1);
  now = 400; assert.equal(client.update(moved, 400).length, 0, 'the held mesh expires on its source age, never refreshed by renders');
  client.close(); respond?.(new Response(null, { status: 204 }));
});

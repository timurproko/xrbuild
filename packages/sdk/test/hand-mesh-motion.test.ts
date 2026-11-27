import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { meshMotion, MESH_MAX_RESIDUAL_M } from '../src/hand-mesh-motion.ts';
import { HandMeshClient } from '../src/hand-mesh-client.ts';
import { HandVisual } from '../src/hand-visual.ts';
import { PanelFrame } from '../src/stereo.ts';
import { MESH_MAX_SOURCE_AGE_MS, encodeMeshResult, type MeshFrame, type MeshPose } from '../src/hand-mesh-protocol.ts';
import { HandInput } from '../src/hands.ts';
import { decodeMessage, type HandsMessage, type Vec3 } from '../src/protocol.ts';
import { handsMessage, openHand } from './fixtures.ts';
const tick = () => new Promise(r => setTimeout(r, 0));
const moved = (points: Vec3[], n: number): Vec3[] => points.map(p => new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 0, 1), n).add(new THREE.Vector3(n, n / 2, -n / 4)).toArray() as Vec3);

for (const handedness of ['left', 'right'] as const) test(`${handedness} wrist compensation follows translation and orientation without drift, input mutation or buffer uploads`, () => {
  const source: MeshPose = { id: 1, handedness, keypoints: openHand([0, 0, 0]) };
  if (handedness === 'left') source.keypoints = source.keypoints.map(([x, y, z]) => [-x, y, z]);
  const before = structuredClone(source), visual = new HandVisual(), panel = new PanelFrame(), camera = new THREE.PerspectiveCamera();
  panel.update({ mode: 'world', center: new THREE.Vector3(1, 2, 3), scale: 2 }, camera);
  const positions = new Float32Array(source.keypoints.flat()), normals = new Float32Array(positions.length); for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
  const surface = { id: 1, topology: 'fixture', positions, normals, indices: new Uint32Array([0, 5, 17]) };
  let version = -1;
  for (let i = 0; i < 100; i++) {
    const current = { ...source, keypoints: moved(source.keypoints, .02 * i) }, motion = meshMotion(source, current)!;
    assert.ok(motion.residualM < 1e-12); visual.updateMeshes([{ ...surface, ...motion }], panel); visual.updateMatrixWorld(true);
    const mesh = visual.getObjectByName('xrb-hand-mesh')!.children[0] as THREE.Mesh;
    const actual = new THREE.Vector3(...source.keypoints[8]).applyMatrix4(mesh.matrixWorld);
    const expected = new THREE.Vector3(...current.keypoints[8]).applyMatrix4(panel.toWorld);
    assert.ok(actual.distanceTo(expected) < 1e-12);
    const attribute = mesh.geometry.getAttribute('position'); if (version !== -1) assert.equal(attribute.version, version, 'rigid renders do not reupload vertices'); version = attribute.version;
    assert.deepEqual(Array.from(attribute.array), Array.from(positions));
  }
  assert.deepEqual(source, before); visual.disposeMeshes();
});

test('post-compensation residual rejects articulation, unsafe anchors, loss/identity and unknown chirality', () => {
  const source: MeshPose = { id: 1, handedness: 'right', keypoints: openHand([0, 0, 0]) };
  const current = { ...source, keypoints: moved(source.keypoints, 1) };
  assert.ok(meshMotion(source, current)!.residualM < 1e-12, 'large raw displacement is removed');
  current.keypoints[8][2] += .02; assert.ok(meshMotion(source, current)!.residualM > MESH_MAX_RESIDUAL_M);
  for (const unsafe of [{ ...source, id: 2 }, { ...source, handedness: 'left' }, { ...source, handedness: 'unknown' }, { ...source, keypoints: Array(21).fill([0, 0, 0]) }, { ...source, keypoints: source.keypoints.map(p => [p[0], NaN, p[2]] as Vec3) }]) assert.equal(meshMotion(source, unsafe), null);
});

test('compensated client uses original snapshot age, not refreshed dispatch or predicted sample time', async t => {
  let now = 0;
  const requests: { frame: MeshFrame; resolve: (r: Response) => void }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => url.endsWith('/connect') ? new Response(null, { status: 204 }) : new Promise<Response>(resolve => requests.push({ frame: JSON.parse(init.body as string), resolve }))) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:12', token: 'a'.repeat(64) }, fetcher, () => now);
  t.after(() => { client.close(); for (const r of requests) r.resolve(new Response(null, { status: 204 })); });
  const input = new HandInput({ smoothing: false, prediction: false }); input.push(decodeMessage(handsMessage([{ id: 1 }], 0)) as HandsMessage, 0);
  const hands = input.sample(0), source = structuredClone(hands);
  const reply = async (i: number) => { const r = requests[i]; r.resolve(new Response(encodeMeshResult({ type: 'result', epoch: r.frame.epoch, revision: r.frame.revision, sequence: r.frame.sequence, meshes: [{ id: 1, topology: 't', positions: new Float32Array(hands[0].keypoints.flat()), indices: new Uint32Array([0, 5, 17]) }] }) as BodyInit)); await tick(); await tick(); };
  await tick(); client.observed([1]); client.update(hands, 8);
  now = 10; client.update(hands, 18); // Queued snapshot, not dispatched until 30.
  now = 30; await reply(0); assert.equal(requests[1].frame.sentMs, 30);
  const current = [{ ...hands[0], keypoints: moved(hands[0].keypoints, .2) }];
  const skin = client.update(current, 38); assert.equal(skin.length, 1); assert.equal(skin[0].sourceAgeMs, 30); assert.ok(skin[0].residualM! < 1e-12);
  now = 90; await reply(1); assert.equal(client.update(current, 98)[0].sourceAgeMs, 80);
  now = 10 + MESH_MAX_SOURCE_AGE_MS + 1; assert.equal(client.update(current, now + 8).length, 0, 'refreshing dispatch did not buy a longer lifetime');
  now = -1; assert.equal(client.update(current, 7).length, 0, 'backwards source clock cannot show a mesh');
  assert.deepEqual(hands, source);
});

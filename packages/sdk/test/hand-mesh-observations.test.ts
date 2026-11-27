import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandInput } from '../src/hands.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
import { HandMeshClient } from '../src/hand-mesh-client.ts';
import { MESH_CAPABILITIES, validMeshFrame, unknownMeshObservations, encodeMeshResult, decodeMeshResult } from '../src/hand-mesh-protocol.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function observation(time: number) { return decodeMessage(handsMessage([{ id: 1 }], time)) as HandsMessage; }

test('sample preserves exact scores, current support and last-supported capture age without refreshing predictions', () => {
  const input = new HandInput({ smoothing: false, prediction: true });
  const first = observation(100); first.hands[0].scores[20] = 0; first.hands[0].scores[19] = .125;
  input.push(first, 100);
  const a = input.sample(108)[0];
  assert.equal(a.observations!.confidence[19], .125); assert.equal(a.observations!.supported[20], false);
  assert.equal(a.observations!.ageMs[20], null); assert.equal(a.observations!.ageMs[19], 8);
  const second = observation(110); second.hands[0].scores[19] = 0; input.push(second, 110);
  assert.equal(input.sample(118)[0].observations!.ageMs[19], 18);
  assert.equal(input.sample(128)[0].observations!.ageMs[19], 28);
  a.observations!.confidence.fill(0); assert.notEqual(input.sample(128)[0].observations!.confidence[0], 0, 'owned snapshot');
  input.reset(150); input.push(first, 150); assert.equal(input.sample(150)[0].observations!.ageMs[20], null);
});

test('modern codec carries bounded unknown evidence and generation; legacy bytes remain legacy', () => {
  const f = { type: 'frame', epoch: 'epoch', sequence: 1, revision: 0, sentMs: 1, sampleMs: 2,
    hands: [{ id: 1, handedness: 'right', keypoints: Array.from({ length: 21 }, () => [0, 0, 0]), observations: unknownMeshObservations() }] };
  assert.equal(validMeshFrame(f), true);
  f.hands[0].observations.ageMs[0] = -1; assert.equal(validMeshFrame(f), false);
  const base = { type: 'result' as const, epoch: 'epoch', sequence: 1, revision: 0, meshes: [] };
  assert.equal(decodeMeshResult(encodeMeshResult(base)).version, undefined);
  assert.equal(decodeMeshResult(encodeMeshResult({ ...base, version: 2, runId: 'run', settingsGeneration: 3 })).settingsGeneration, 3);
  assert.throws(() => decodeMeshResult(encodeMeshResult({ ...base, version: 2, runId: 'run', settingsGeneration: -1 })));
});

test('modern SDK negotiates observations; custom legacy hands remain explicitly unknown', async () => {
  const sent: any[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string); sent.push(body);
    return url.endsWith('/connect') ? Response.json({ protocolVersion: 2, capabilities: MESH_CAPABILITIES, runId: 'run', settingsGeneration: 1 })
      : new Response(null, { status: 204 });
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:12', token: 'a'.repeat(64) }, fetcher);
  try {
    await tick(); const input = new HandInput(); input.push(observation(0), 0);
    const hands = input.sample(1); delete hands[0].observations;
    client.update(hands, 1); await tick();
    assert.deepEqual(sent[0].capabilities, MESH_CAPABILITIES);
    assert.deepEqual(sent[1].hands[0].observations, unknownMeshObservations());
    assert.equal(sent[1].version, 2);
  } finally { client.close(); }
});

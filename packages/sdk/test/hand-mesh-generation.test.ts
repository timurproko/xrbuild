import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandMeshClient } from '../src/hand-mesh-client.ts';
import { MESH_CAPABILITIES, encodeMeshResult, type MeshState } from '../src/hand-mesh-protocol.ts';
import { HandInput } from '../src/hands.ts';
import { handsMessage } from './fixtures.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const surface = () => ({ id: 1, topology: 'same-label', positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) });
test('SDK rejects previous-generation geometry and topology and reports only actually drawable generations', async () => {
  let response: ((r: Response) => void) | null = null;
  const sent: any[] = [];
  const state = (generation: number, phase: MeshState['phase'] = 'Ready'): MeshState => ({ runId: 'run', phase, reason: null, progress: null,
    requestedGeneration: generation, appliedGeneration: phase === 'Ready' ? generation : generation - 1, drawingGeneration: null, savedRevision: `saved-${generation}`, owner: 'workspace:fixture', id: 'surface' });
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/connect')) return Response.json({ protocolVersion: 2, capabilities: MESH_CAPABILITIES, runId: 'run', settingsGeneration: 1, state: state(1) });
    sent.push(JSON.parse(init.body as string)); return new Promise<Response>(resolve => { response = resolve; });
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:12', token: 'a'.repeat(64) }, fetcher, () => 0);
  const input = new HandInput({ smoothing: false, prediction: false });
  input.push(decodeMessage(handsMessage([{ id: 1, at: [0, 0, 0] }], 0)) as HandsMessage, 0);
  const hands = input.sample(0), before = structuredClone(hands);
  const reply = async (generation: number, shownState = state(generation), indices = true) => {
    const frame = sent.at(-1); response!(new Response(encodeMeshResult({ type: 'result', epoch: frame.epoch, sequence: frame.sequence, revision: frame.revision,
      version: 2, runId: 'run', settingsGeneration: generation, meshes: [{ ...surface(), ...(indices ? {} : { indices: new Uint32Array() }) }] }) as BodyInit,
    { headers: { 'x-xrb-mesh-state': JSON.stringify(shownState) } })); await tick(); await tick();
  };
  try {
    await tick(); client.update(hands, 0); await reply(1);
    assert.equal(client.update(hands, 0).length, 1); assert.equal(sent.at(-1).drawingGeneration, 1);
    await reply(1, state(2, 'Preparing'));
    assert.equal(client.update(hands, 0).length, 0); assert.equal(client.state?.requestedGeneration, 2);
    assert.equal(sent.at(-1).settingsGeneration, 2); assert.equal(sent.at(-1).drawingGeneration, null);
    await reply(1, state(2)); // A valid-looking pose from retired settings cannot return.
    assert.equal(client.update(hands, 0).length, 0);
    await reply(2, state(2), false); // Same topology label cannot reuse a retired generation's indices.
    assert.equal(client.update(hands, 0).length, 0);
    await reply(2); assert.equal(client.update(hands, 0, 0, false).length, 1);
    assert.equal(sent.at(-1).drawingGeneration, null, 'visual opt-out cannot acknowledge drawing');
    assert.deepEqual(hands, before);
  } finally { client.close(); response?.(new Response(null, { status: 204 })); }
});

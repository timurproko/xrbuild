import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { HandMeshClient } from '../src/hand-mesh-client.ts';
import { MESH_CAPABILITIES, encodeMeshResult, readMeshPacket, meshPacket, type MeshState } from '../src/hand-mesh-protocol.ts';
import { HandInput } from '../src/hands.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const state = (): MeshState => ({ runId: 'run', phase: 'Ready', reason: null, progress: null, requestedGeneration: 1, appliedGeneration: 1,
  drawingGeneration: 1, savedRevision: null, owner: 'workspace:fixture', id: 'surface' });
async function fixture(t: TestContext) {
  let now = 0;
  const requests: { frame: any; resolve: (r: Response) => void; reject: (e: Error) => void }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/connect')) return Response.json({ protocolVersion: 2, capabilities: MESH_CAPABILITIES, runId: 'run', settingsGeneration: 1, state: { ...state(), drawingGeneration: null } });
    return new Promise<Response>((resolve, reject) => { requests.push({ frame: JSON.parse(init.body as string), resolve, reject }); });
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:12', token: 'a'.repeat(64) }, fetcher, () => now);
  t.after(() => { client.close(); for (const r of requests) r.resolve(new Response(null, { status: 204 })); });
  const input = new HandInput({ smoothing: false, prediction: false }); input.push(decodeMessage(handsMessage([{ id: 1 }], 0)) as HandsMessage, 0);
  const hands = input.sample(0);
  const reply = async (omitResult?: string, omitState?: string) => {
    const request = requests.at(-1)!;
    const bytes = encodeMeshResult({ type: 'result', epoch: request.frame.epoch, sequence: request.frame.sequence, revision: request.frame.revision,
      version: 2, runId: 'run', settingsGeneration: 1, meshes: [{ id: 1, topology: 'triangle', positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }] });
    const packet = readMeshPacket(bytes); if (omitResult) delete packet.meta[omitResult];
    const wire = state() as unknown as Record<string, unknown>; if (omitState) delete wire[omitState];
    request.resolve(new Response(meshPacket(packet.meta, packet.payload) as BodyInit, { headers: { 'x-xrb-mesh-state': JSON.stringify(wire) } }));
    await tick(); await tick();
  };
  await tick(); client.update(hands, 0); await reply();
  assert.equal(client.state?.drawingGeneration, null, 'received geometry/server status alone cannot claim a local draw');
  assert.equal(client.update(hands, 0).length, 1); assert.equal(client.state?.drawingGeneration, 1);
  return { client, hands, requests, reply, now: (value: number) => { now = value; } };
}
for (const field of ['protocolVersion', 'capabilities', 'runId', 'settingsGeneration']) test(`connect must explicitly provide ${field}`, async t => {
  let requests = 0;
  const fetcher = (async () => {
    requests++; const hello: Record<string, unknown> = { protocolVersion: 2, capabilities: MESH_CAPABILITIES, runId: 'run', settingsGeneration: 1, state: state() };
    delete hello[field]; return Response.json(hello);
  }) as typeof fetch;
  const client = new HandMeshClient({ version: 1, url: 'http://127.0.0.1:12', token: 'a'.repeat(64) }, fetcher); t.after(() => client.close());
  await tick(); await tick(); assert.equal(client.state, null); assert.match(client.status, /connection unavailable/);
  assert.deepEqual(client.update([], 0), []); assert.equal(requests, 1, 'failed handshake cannot borrow request fields and dispatch frames');
});
test('SDK drawing diagnostics expire on its injected clock even without another response or render', async t => {
  const f = await fixture(t); f.now(34); assert.equal(f.client.state?.drawingGeneration, null);
  f.now(10000); assert.equal(f.client.update(f.hands, 10000).length, 0); assert.equal(f.client.state?.drawingGeneration, null);
  assert.match(f.client.status, /fallback/);
});
for (const action of ['pose-displacement', 'no-hands', 'visual-opt-out', 'invalidation', 'transport-failure', 'disposal'] as const) {
  test(`${action} clears local drawing evidence, not just drawable geometry`, async t => {
    const f = await fixture(t);
    if (action === 'pose-displacement') {
      const moved = f.hands.map(h => ({ ...h, keypoints: h.keypoints.map(p => [p[0] + .02, p[1], p[2]] as [number, number, number]) }));
      assert.equal(f.client.update(moved, 0).length, 0);
    } else if (action === 'no-hands') assert.equal(f.client.update([], 0).length, 0);
    else if (action === 'visual-opt-out') assert.equal(f.client.update(f.hands, 0, 0, false).length, 1);
    else if (action === 'invalidation') f.client.invalidate();
    else if (action === 'disposal') f.client.close();
    else { f.requests.at(-1)!.reject(new Error('isolated network failure')); await tick(); await tick(); assert.equal(f.client.update(f.hands, 0).length, 0); }
    assert.equal(f.client.state?.drawingGeneration, null);
  });
}
for (const field of ['version', 'runId', 'settingsGeneration']) test(`result must explicitly carry ${field}; it cannot inherit request evidence`, async t => {
  const f = await fixture(t); await f.reply(field);
  assert.equal(f.client.state?.drawingGeneration, null); assert.equal(f.client.update(f.hands, 0).length, 0);
});
for (const field of ['runId', 'phase', 'requestedGeneration', 'appliedGeneration', 'drawingGeneration']) test(`configuration status must explicitly carry ${field}`, async t => {
  const f = await fixture(t); await f.reply(undefined, field);
  assert.equal(f.client.state?.drawingGeneration, null); assert.equal(f.client.update(f.hands, 0).length, 0);
});

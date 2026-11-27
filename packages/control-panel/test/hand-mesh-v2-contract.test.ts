import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { MESH_CAPABILITIES, unknownMeshObservations, decodeMeshResult } from '../../sdk/src/hand-mesh-protocol.ts';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url));
export const modernPlugin = () => ({ owner: 'workspace:fixture', id: 'surface', label: 'Fixture', reason: '', available: true, program: process.execPath,
  declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'runtime.exe', args: [fixture], settingsVersion: 1,
    capabilities: [...MESH_CAPABILITIES], settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 100, default: 3, changeMode: 'live' }] }) });
export function meshFrame(sequence = 0) { return { type: 'frame' as const, epoch: 'consumer', sequence, revision: 0, sentMs: performance.now(), sampleMs: performance.now(),
  hands: [{ id: 1, handedness: 'right', keypoints: Array.from({ length: 21 }, () => [0, 0, 0] as [number, number, number]), observations: unknownMeshObservations() }] }; }

test('modern declaration is opt-in, bounded and rejects unknown capability/change modes', () => {
  const d = modernPlugin().declaration; assert.equal(d.preparationTimeoutMs, 30000); assert.equal(d.settings[0].changeMode, 'live');
  assert.throws(() => handMeshDeclaration({ ...d, capabilities: ['future'] }));
  assert.throws(() => handMeshDeclaration({ ...d, settings: [{ ...d.settings[0], changeMode: 'command' }] }));
  assert.throws(() => handMeshDeclaration({ ...d, preparationTimeoutMs: 120001 }));
  assert.throws(() => handMeshDeclaration({ ...d, version: 1 }));
});

test('actual modern child/consumer negotiate and exchange versioned final poses', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  const descriptor = await run.start(modernPlugin(), {});
  const request = (route: string, body: unknown) => fetch(descriptor.url + route, { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${descriptor.token}` }, body: JSON.stringify(body) });
  const connect = await request('/connect', { ...meshFrame(), protocolVersion: 2, capabilities: MESH_CAPABILITIES });
  const hello = await connect.json(); assert.equal(hello.protocolVersion, 2);
  let result;
  for (let i = 1; i < 60; i++) {
    const r = await request('/frame', { ...meshFrame(i), version: 2, runId: hello.runId, settingsGeneration: 1 });
    if (r.status === 200) { result = decodeMeshResult(new Uint8Array(await r.arrayBuffer())); break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(result, run.status); assert.equal(result.version, 2); assert.equal(result.runId, hello.runId); assert.equal(result.settingsGeneration, 1);
});

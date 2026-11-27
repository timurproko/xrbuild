import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES, unknownMeshObservations, decodeMeshResult } from '../../sdk/src/hand-mesh-protocol.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t: any, version: 1 | 2, capabilities = [...MESH_CAPABILITIES] as string[], modern = true) {
  const p = { owner: 'workspace:fixture', id: 'surface', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version, id: 'surface', label: 'Fixture', program: 'worker.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], settingsVersion: 1,
      ...(version === 2 ? { capabilities } : {}), settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 10, default: 3 }] }) };
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  const d = await run.start(p); let sequence = 0;
  const request = (connect = false) => fetch(d.url + (connect ? '/connect' : '/frame'), { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${d.token}` },
    body: JSON.stringify({ type: 'frame', epoch: 'consumer', sequence: sequence++, revision: 0, sentMs: performance.now(), sampleMs: performance.now(),
      hands: [{ id: 1, handedness: 'right', keypoints: Array.from({ length: 21 }, () => [0, 0, 0]), ...(modern ? { observations: unknownMeshObservations() } : {}) }],
      ...(modern ? { version: 2, runId: run.state().runId, settingsGeneration: run.state().requestedGeneration } : {}), ...(connect && modern ? { protocolVersion: 2, capabilities: MESH_CAPABILITIES } : {}) }) });
  await request(true);
  for (let i = 0; i < 100 && run.state().appliedGeneration === null; i++) await wait(10);
  return { p, run, request };
}
async function result(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 50; i++) { const r = await f.request(); if (r.status === 200) return decodeMeshResult(new Uint8Array(await r.arrayBuffer())); await wait(5); }
  assert.fail(f.run.status);
}
test('legacy processor and consumer retain launch settings, without any claimed live acknowledgement', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, 1, [], false);
  assert.equal((await result(f)).version, undefined);
  f.run.configure(f.p, { vertices: 6 }, 'new-settings'); await wait(20);
  const r = await result(f); assert.equal(r.version, undefined); assert.equal(r.meshes[0].positions.length, 9);
  assert.equal(f.run.state().appliedGeneration, 1); assert.equal(f.run.state().requestedGeneration, 2); assert.match(f.run.status, /relaunch/);
});
test('modern processor requiring observations refuses an old consumer without inventing support', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, 2, [...MESH_CAPABILITIES], false);
  assert.equal((await f.request()).status, 204); assert.match(f.run.status, /observation support/);
});
test('undeclared observation capability is stripped rather than sent to a processor', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, 2, ['live-configure-v1']); const r = await result(f);
  assert.equal(r.version, 2); assert.equal(r.meshes.length, 1);
});

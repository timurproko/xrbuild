import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES, unknownMeshObservations, decodeMeshResult } from '../../sdk/src/hand-mesh-protocol.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const plugin = () => ({ owner: 'workspace:fixture', id: 'surface', label: 'Fixture', reason: '', available: true, program: process.execPath,
  declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'runtime.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], settingsVersion: 1,
    capabilities: [...MESH_CAPABILITIES], settings: [
      { key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 100, default: 3, changeMode: 'live' },
      { key: 'delay', label: 'Delay', type: 'number', min: 0, max: 500, default: 0, changeMode: 'live' },
      { key: 'ackDelay', label: 'Acknowledge delay', type: 'number', min: 0, max: 500, default: 0, changeMode: 'live' },
      { key: 'mode', label: 'Fault', type: 'select', default: 'normal', changeMode: 'live', options: ['normal', 'bad-ack', 'stale-ack'].map(value => ({ value, label: value })) },
    ] }) });
async function ready(run: HandMeshRun, generation = run.state().requestedGeneration) {
  for (let i = 0; i < 200; i++) { if (run.state().phase === 'Ready' && run.state().appliedGeneration === generation) return; await wait(10); }
  assert.fail(JSON.stringify(run.state()));
}
async function fixture(t: any, none = false) {
  const p = plugin(), run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  const descriptor = await run.start(none ? null : p, {}, 'saved-1'); let sequence = 0;
  const frame = () => ({ type: 'frame', epoch: 'consumer', sequence: sequence++, revision: 0, sentMs: performance.now(), sampleMs: performance.now(),
    version: 2, runId: run.state().runId, settingsGeneration: run.state().requestedGeneration,
    hands: [{ id: 1, handedness: 'right', keypoints: Array.from({ length: 21 }, () => [0, 0, 0]), observations: unknownMeshObservations() }] });
  const request = (route = '/frame', extra = {}) => fetch(descriptor.url + route, { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${descriptor.token}` }, body: JSON.stringify({ ...frame(), ...extra }) });
  await request('/connect', { protocolVersion: 2, capabilities: MESH_CAPABILITIES }); await ready(run);
  return { p, run, descriptor, request };
}
async function mesh(f: Awaited<ReturnType<typeof fixture>>, extra = {}) {
  for (let i = 0; i < 40; i++) { const r = await f.request('/frame', extra); if (r.status === 200) return decodeMeshResult(new Uint8Array(await r.arrayBuffer())); await wait(5); }
  assert.fail(f.run.status);
}
test('Stop before gateway listen completion rejects startup without leaving an endpoint', async () => {
  const run = new HandMeshRun(() => ['https://app.local']);
  const rejection = assert.rejects(run.start(null), /cancelled/);
  await run.stop(); await rejection; await wait(10);
  assert.equal(run.server.listening, false); assert.equal(run.state().phase, 'Stopped');
});
test('late launch validation completion cannot revive a stopped run or spawn a processor', async () => {
  let release!: (value: { program: string; cwd: string }) => void;
  const p = { ...plugin(), launch: () => new Promise<{ program: string; cwd: string }>(resolve => { release = resolve; }) };
  const run = new HandMeshRun(() => ['https://app.local']);
  try {
    await run.start(p); await wait(0); assert.ok(release);
    await run.stop(); release({ program: process.execPath, cwd: process.cwd() }); await wait(10);
    assert.equal((run as any).stage, null); assert.equal(run.state().phase, 'Stopped'); assert.equal(run.server.listening, false);
  } finally { await run.stop(); }
});
test('live configure ACKs settings without restarting, coalesces newest and fences old generations', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t), pid = (f.run as any).stage.owned.pid;
  assert.equal((await mesh(f)).meshes[0].positions.length, 9);
  f.run.configure(f.p, { vertices: 6, ackDelay: 80 }, 'saved-2');
  assert.equal(f.run.state().appliedGeneration, 1); assert.equal(f.run.state().phase, 'Preparing');
  f.run.configure(f.p, { vertices: 7 }, 'saved-3'); f.run.configure(f.p, { vertices: 8 }, 'saved-4');
  assert.equal((await f.request('/frame', { settingsGeneration: 1 })).status, 204);
  await ready(f.run, 4);
  assert.equal((f.run as any).stage.owned.pid, pid);
  const result = await mesh(f); assert.equal(result.settingsGeneration, 4); assert.equal(result.meshes[0].positions.length, 24);
  assert.equal(f.run.state().savedRevision, 'saved-4');
  await f.request('/frame', { drawingGeneration: 1 }); assert.equal(f.run.state().drawingGeneration, null);
  await f.request('/frame', { drawingGeneration: 4 }); assert.equal(f.run.state().drawingGeneration, 4);
});
test('None can enable later behind the same gateway, and None drains processor without ending the run', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, true), descriptor = f.run.descriptor;
  assert.equal((f.run as any).stage, null); f.run.configure(f.p, {}, 'enabled'); await ready(f.run, 2);
  assert.equal((await mesh(f)).settingsGeneration, 2); f.run.configure(null, {}, 'disabled'); await ready(f.run, 3);
  assert.equal(f.run.descriptor, descriptor); assert.equal((f.run as any).stage, null);
  assert.equal((await f.request()).status, 204);
});
test('stale acknowledgements cannot advance and foreign ACK fails only mesh without automatic restart', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t); f.run.configure(f.p, { mode: 'stale-ack', ackDelay: 60 }, 'saved-2');
  await wait(20); assert.equal(f.run.state().appliedGeneration, 1); await ready(f.run, 2);
  f.run.configure(f.p, { mode: 'bad-ack' }, 'saved-3');
  for (let i = 0; i < 100 && f.run.state().phase !== 'Failed'; i++) await wait(10);
  assert.equal(f.run.state().phase, 'Failed'); assert.equal(f.run.state().appliedGeneration, 2);
  assert.equal(f.run.state().requestedGeneration, 3); await wait(100); assert.equal(f.run.state().phase, 'Failed');
  assert.ok(f.run.descriptor, 'failure keeps a retryable gateway, not a dead input session');
});
test('replacement drains prior process and unavailable selection cannot become applied None', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t), old = (f.run as any).stage.owned;
  const replacement = { ...f.p, owner: 'workspace:other' }; f.run.configure(replacement, {}, 'replacement'); await ready(f.run, 2);
  assert.notEqual((f.run as any).stage.owned.pid, old.pid);
  assert.throws(() => process.kill(old.pid, 0)); f.run.unavailable('missing'); await wait(100);
  assert.equal(f.run.state().phase, 'Failed'); assert.equal(f.run.state().appliedGeneration, null);
});

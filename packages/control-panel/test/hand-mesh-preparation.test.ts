import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration, meshPreparationAllowance } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
import { HandInput } from '../../sdk/src/hands.ts';
import { handsMessage } from '../../sdk/test/fixtures.ts';
import { decodeMessage, type HandsMessage } from '../../sdk/src/protocol.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function plugin(allowance = 30000) {
  return { owner: 'workspace:fixture', id: 'surface', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'runtime.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))],
      settingsVersion: 1, capabilities: MESH_CAPABILITIES, preparationTimeoutMs: allowance, settings: [
        { key: 'device', label: 'Device', type: 'select', default: 'primary', changeMode: 'reprepare', options: ['primary', 'secondary'].map(value => ({ value, label: value })) },
        { key: 'startDelay', label: 'Startup', type: 'number', min: 0, max: 20000, default: 0, changeMode: 'live' },
        { key: 'ackDelay', label: 'Configure', type: 'number', min: 0, max: 2000, default: 0, changeMode: 'live' },
        { key: 'progress', label: 'Progress', type: 'boolean', default: true, changeMode: 'live' },
        { key: 'mode', label: 'Fault', type: 'select', default: 'normal', changeMode: 'live', options: ['normal', 'no-ack', 'endless-progress', 'early-ready', 'reject'].map(value => ({ value, label: value })) },
      ] }) };
}
async function fixture(t: any, settings = {}, allowance = 30000) {
  const p = plugin(allowance), run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  const descriptor = await run.start(p, settings); let sequence = 0;
  const request = (connect = false) => fetch(descriptor.url + (connect ? '/connect' : '/frame'), { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${descriptor.token}` },
    body: JSON.stringify({ type: 'frame', epoch: 'consumer', sequence: sequence++, revision: 0, sentMs: performance.now(), sampleMs: performance.now(), hands: [],
      version: 2, runId: run.state().runId, settingsGeneration: run.state().requestedGeneration, ...(connect ? { protocolVersion: 2, capabilities: MESH_CAPABILITIES } : {}) }) });
  await request(true); return { p, run, request, descriptor };
}
async function until(f: Awaited<ReturnType<typeof fixture>>, phase: string) {
  for (let i = 0; i < 200; i++) { if (f.run.state().phase === phase) return; await f.request(); await wait(10); } assert.fail(JSON.stringify(f.run.state()));
}
test('preparation allowances are finite and bounded; legacy default is retained', () => {
  assert.equal(meshPreparationAllowance(plugin().declaration), 30000);
  assert.equal(meshPreparationAllowance({ ...plugin().declaration, version: 1 }), 10000);
  for (const preparationTimeoutMs of [0, 999, 120001, Infinity, NaN]) assert.throws(() => meshPreparationAllowance({ ...plugin().declaration, preparationTimeoutMs }));
});
test('actual seventeen-second fake cold preparation remains Preparing after ten seconds and then Ready', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR, timeout: 25000 }, async t => {
  const f = await fixture(t, { startDelay: 17000 }, 22000), start = performance.now(); let checked = false;
  const input = new HandInput({ smoothing: false, prediction: false }), message = decodeMessage(handsMessage([{ id: 1 }], 0)) as HandsMessage;
  input.push(message, 0); const baseline = input.sample(0)[0].keypoints;
  while (f.run.state().phase !== 'Ready') {
    assert.notEqual(f.run.state().phase, 'Failed', f.run.status);
    await f.request(); input.push(message, performance.now()); assert.deepEqual(input.sample(performance.now())[0].keypoints, baseline);
    if (!checked && performance.now() - start > 10500) { checked = true; assert.equal(f.run.state().phase, 'Preparing'); assert.equal(f.run.state().progress, .5); }
    await wait(100);
  }
  assert.equal(checked, true); assert.ok(performance.now() - start >= 16500); assert.equal(f.run.state().appliedGeneration, 1);
});
test('progress never extends hard deadline, and explicit failure retains a bounded reason', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, { mode: 'endless-progress' }, 1000); const start = performance.now();
  await until(f, 'Failed'); assert.match(f.run.state().reason!, /preparation timed out/); assert.ok(performance.now() - start < 2500);
  const rejected = await fixture(t, { mode: 'reject' }); await until(rejected, 'Failed'); assert.equal(rejected.run.state().reason, 'Mesh preparation failed');
});
test('device repreparation keeps the gateway/session, reports progress, and Stop retires a late ACK', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t); await until(f, 'Ready'); const descriptor = f.run.descriptor, pid = (f.run as any).stage.owned.pid;
  f.run.configure(f.p, { device: 'secondary', ackDelay: 250 }, 'device-change');
  assert.equal(f.run.state().phase, 'Preparing'); await wait(160); await f.request(); assert.equal(f.run.state().progress, .5);
  await until(f, 'Ready'); assert.equal(f.run.descriptor, descriptor); assert.equal((f.run as any).stage.owned.pid, pid);
  assert.equal(f.run.state().appliedGeneration, 2);
  f.run.configure(f.p, { device: 'primary', ackDelay: 500 }, 'stop-race'); await f.run.stop(); await wait(550);
  assert.equal(f.run.state().phase, 'Stopped'); assert.equal((f.run as any).stage, null);
});
test('early wrong-generation readiness cannot mark usable preparation', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const f = await fixture(t, { mode: 'early-ready' }, 1000); await until(f, 'Failed'); assert.equal(f.run.state().appliedGeneration, null);
});

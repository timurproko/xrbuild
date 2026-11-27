import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES, meshPacket } from '../../sdk/src/hand-mesh-protocol.ts';
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
const actions = ['None', 'selection', 'setting', 'device', 'Stop'] as const;
function plugin(args: string[] = []) {
  return { owner: 'workspace:fixture', id: 'surface', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'worker.exe',
      args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url)), ...args], settingsVersion: 1, capabilities: MESH_CAPABILITIES, preparationTimeoutMs: 30000,
      settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 10, default: 3, changeMode: 'live' },
        { key: 'device', label: 'Device', type: 'select', default: 'primary', changeMode: 'reprepare', options: ['primary', 'secondary'].map(value => ({ value, label: value })) },
        { key: 'startDelay', label: 'Startup', type: 'number', min: 0, max: 20000, default: 0, changeMode: 'live' },
        { key: 'ackDelay', label: 'Configure', type: 'number', min: 0, max: 20000, default: 0, changeMode: 'live' },
        { key: 'progress', label: 'Progress', type: 'boolean', default: true, changeMode: 'live' }] }) };
}
test('reentrant status controls coalesce before any superseded validator can start', async t => {
  let injected = false, validations = 0;
  const p = { ...plugin(), launch: async () => { validations++; throw new Error('Superseded validator must not start'); } };
  const run = new HandMeshRun(() => ['https://app.local'], status => {
    if (status === 'None' && !injected) { injected = true; run.configure(p); run.configure(null); }
  });
  t.after(() => run.stop()); await run.start(null);
  for (let i = 0; i < 100 && (run.state().phase !== 'Ready' || run.state().appliedGeneration !== 3); i++) await pause();
  assert.equal(validations, 0); assert.equal(run.state().appliedGeneration, 3); assert.equal(run.state().owner, null);
});
for (const action of actions) test(`${action} preempts an unresolved launch validator without waiting for its result`, async t => {
  let calls = 0, release!: (v: { program: string; cwd: string }) => void, oldSignal!: AbortSignal;
  const p = { ...plugin(), launch: (signal?: AbortSignal) => {
    if (++calls > 1) return Promise.reject(new Error('Second validator deliberately fails without creating any process'));
    oldSignal = signal!; return new Promise<{ program: string; cwd: string }>(resolve => { release = resolve; });
  } };
  const run = new HandMeshRun(() => ['https://app.local']); t.after(() => run.stop());
  await run.start(p); assert.ok(release); const descriptor = run.descriptor;
  if (action === 'Stop') await run.stop();
  else if (action === 'None') run.configure(null);
  else run.configure(action === 'selection' ? { ...p, owner: 'workspace:replacement' } : p, action === 'device' ? { device: 'secondary' } : { vertices: 6 });
  for (let i = 0; i < 100 && run.state().phase === 'Preparing'; i++) await pause();
  assert.equal(oldSignal.aborted, true); assert.equal(run.state().phase, action === 'Stop' ? 'Stopped' : action === 'None' ? 'Ready' : 'Failed');
  assert.equal(calls, action === 'Stop' || action === 'None' ? 1 : 2);
  if (action !== 'Stop') assert.equal(run.descriptor, descriptor);
  release({ program: process.execPath, cwd: process.cwd() }); await pause();
  assert.equal((run as any).stage, null, 'late validation cannot spawn or revive the retired stage');
});
for (const preparation of ['startup', 'reprepare'] as const) for (const action of actions) {
  test(`${action} interrupts ${preparation}, drains owned processing and ignores late ACKs`, { skip: !process.env.XRB_TEST_MESH_SUPERVISOR, timeout: 15000 }, async t => {
    // These two cases require the forced job fallback, not a cooperative processor's Stop/EOF handler.
    const uncooperative = preparation === 'startup' && action === 'None' || preparation === 'reprepare' && action === 'setting';
    const p = plugin([uncooperative ? '--ignore-stop' : '--late-ack-on-stop']);
    const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
    const descriptor = await run.start(p, preparation === 'startup' ? { startDelay: 17000 } : {}); let sequence = 0;
    const request = (connect = false) => fetch(descriptor.url + (connect ? '/connect' : '/frame'), { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${descriptor.token}` },
      body: JSON.stringify({ type: 'frame', epoch: 'consumer', sequence: sequence++, revision: 0, sentMs: performance.now(), sampleMs: performance.now(), hands: [],
        version: 2, runId: run.state().runId, settingsGeneration: run.state().requestedGeneration, ...(connect ? { protocolVersion: 2, capabilities: MESH_CAPABILITIES } : {}) }) });
    await request(true);
    const until = async (condition: () => boolean, bound = 8000) => {
      const end = performance.now() + bound;
      while (!condition() && performance.now() < end) { await request(); await pause(); }
      assert.ok(condition(), JSON.stringify(run.state()));
    };
    if (preparation === 'reprepare') {
      await until(() => run.state().phase === 'Ready');
      run.configure(p, { device: 'secondary', ackDelay: 17000 }, 'pending-device');
    }
    await until(() => !!(run as any).stage?.owned?.pid && (run as any).ack?.type === (preparation === 'startup' ? 'ready' : 'configured'));
    const old = (run as any).stage, expected = (run as any).ack, pid = old.owned.pid, previousApplied = run.state().appliedGeneration;
    const started = performance.now();
    if (action === 'Stop') await run.stop();
    else if (action === 'None') { run.configure(null, {}, 'disabled'); assert.equal(run.status, 'Stopping mesh'); }
    else if (action === 'selection') run.configure({ ...p, owner: 'workspace:replacement' }, {}, 'replacement');
    else if (action === 'setting') run.configure(p, { vertices: 6 }, 'new-quality');
    else run.configure(p, { device: preparation === 'startup' ? 'secondary' : 'primary' }, 'new-device');
    if (action !== 'Stop') await until(() => run.state().phase === 'Ready' && run.state().appliedGeneration === run.state().requestedGeneration);
    assert.ok(performance.now() - started < 8000, 'a new control must not wait for the old seventeen-second preparation');
    assert.throws(() => process.kill(pid, 0), 'superseded processor is stopped, not merely hidden');
    if (action === 'Stop') { assert.equal(run.state().phase, 'Stopped'); assert.equal(run.state().appliedGeneration, previousApplied); }
    else {
      assert.equal(run.descriptor, descriptor, 'input session/gateway survive mesh-only preemption');
      assert.equal(run.state().owner, action === 'None' ? null : action === 'selection' ? 'workspace:replacement' : p.owner);
      if (action !== 'None') assert.notEqual((run as any).stage.owned.pid, pid);
    }
    const before = run.state();
    const late = { type: expected.type, version: 2, runId: before.runId, owner: p.owner, id: p.id, settingsVersion: 1,
      settingsGeneration: expected.target.generation, settings: expected.target.values, capabilities: p.declaration.capabilities };
    (run as any).output(old, Buffer.from(meshPacket(late)));
    (run as any).output(old, Buffer.from(meshPacket({ ...late, settingsGeneration: before.requestedGeneration })));
    assert.deepEqual(run.state(), before, 'retired process ACKs cannot advance even if they copy the newest generation');
    await run.stop();
  });
}

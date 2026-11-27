import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration, handMeshSettings, handMeshAppliedSettings } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
function plugin(args: string[] = []) {
  return { owner: 'workspace:fixture', id: 'surface', label: 'Fixture', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Fixture', program: 'worker.exe',
      args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url)), ...args], settingsVersion: 1, capabilities: ['live-configure-v1'],
      settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 10, default: 3, changeMode: 'live' },
        { key: 'enabled', label: 'Enabled', type: 'boolean', default: false, changeMode: 'live' },
        { key: 'choice', label: 'Choice', type: 'select', default: 'economy', changeMode: 'live', options: ['economy', 'detailed'].map(value => ({ value, label: value })) }] }) };
}
async function phase(run: HandMeshRun, value: string) {
  for (let i = 0; i < 300; i++) { if (run.state().phase === value) return; await pause(); }
  assert.fail(JSON.stringify(run.state()));
}
test('default inheritance is configuration input only; applied evidence requires every own field', () => {
  const d = plugin().declaration, defaults = { vertices: 3, enabled: false, choice: 'economy' };
  assert.deepEqual(handMeshSettings(d, {}), defaults); assert.deepEqual(handMeshAppliedSettings(d, defaults), defaults);
  for (const key of Object.keys(defaults)) {
    const partial = { ...defaults } as Record<string, unknown>; delete partial[key];
    assert.throws(() => handMeshAppliedSettings(d, partial));
  }
  assert.throws(() => handMeshAppliedSettings(d, Object.assign(Object.create({ vertices: 3 }), { enabled: false, choice: 'economy' })));
  for (const invalid of [undefined, null, [], {}, { ...defaults, vertices: '3' }, { ...defaults, enabled: 0 }, { ...defaults, extra: 1 }])
    assert.throws(() => handMeshAppliedSettings(d, invalid));
  const zero = { ...d, settings: d.settings.map(s => s.type === 'number' ? { ...s, min: 0, default: 0 } : s) };
  assert.deepEqual(handMeshAppliedSettings(zero, { ...defaults, vertices: 0 }), { ...defaults, vertices: 0 });
  const empty = { ...d, settings: [] }; assert.deepEqual(handMeshAppliedSettings(empty, {}), {});
  assert.throws(() => handMeshAppliedSettings(empty, undefined));
});
test('reprepare cannot acknowledge a reset to a default device by omitting that device', { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
  const base = plugin(['--omit-configured-setting=device', '--retain-configured-settings']);
  const p = { ...base, declaration: handMeshDeclaration({ ...base.declaration, settings: [...base.declaration.settings,
    { key: 'device', label: 'Device', type: 'select', default: 'primary', changeMode: 'reprepare', options: ['primary', 'secondary'].map(value => ({ value, label: value })) }] }) };
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  await run.start(p, { device: 'secondary' }); await phase(run, 'Ready');
  run.configure(p, {}, 'reset-device'); await phase(run, 'Failed');
  assert.equal(run.state().appliedGeneration, 1); assert.equal(run.state().requestedGeneration, 2);
});
for (const kind of ['ready', 'configured'] as const) {
  const required = ['type', 'version', 'runId', 'owner', 'id', 'settingsVersion', 'settingsGeneration', 'settings', ...(kind === 'ready' ? ['capabilities'] : [])];
  for (const fault of [`--empty-${kind}-settings`, `--omit-${kind}-setting=vertices`, ...required.map(key => `--omit-${kind}=${key}`)]) {
    test(`${kind} rejects incomplete application evidence: ${fault}`, { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, async t => {
      const p = plugin([fault, '--retain-configured-settings']);
      const run = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
      const d = await run.start(p, kind === 'ready' ? {} : { vertices: 6, enabled: true, choice: 'detailed' });
      let sequence = 0;
      const request = (connect = false) => fetch(d.url + (connect ? '/connect' : '/frame'), { method: 'POST', headers: { origin: 'https://app.local', authorization: `Bearer ${d.token}` },
        body: JSON.stringify({ type: 'frame', epoch: 'consumer', sequence: sequence++, revision: 0, sentMs: performance.now(), sampleMs: performance.now(),
          version: 2, runId: run.state().runId, settingsGeneration: run.state().requestedGeneration,
          hands: [{ id: 1, handedness: 'right', keypoints: Array.from({ length: 21 }, () => [0, 0, 0]) }], ...(connect ? { protocolVersion: 2, capabilities: MESH_CAPABILITIES } : {}) }) });
      await request(true);
      if (kind === 'configured') {
        await phase(run, 'Ready'); assert.equal(run.state().appliedGeneration, 1);
        run.configure(p, {}, 'reset-defaults'); // Faulty worker retains six vertices, but incompletely ACKs defaults.
      }
      await phase(run, 'Failed');
      assert.equal(run.state().appliedGeneration, kind === 'ready' ? null : 1);
      assert.equal(run.state().requestedGeneration, kind === 'ready' ? 1 : 2);
      assert.equal((await request()).status, 204, 'unacknowledged geometry is never accepted');
      await run.stop(); assert.equal(run.state().phase, 'Stopped');
    });
  }
}

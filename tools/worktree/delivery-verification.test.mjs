import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyContractInstallation } from './delivery-contract.mjs';
import { verifySharedCases, assessCoverage } from './delivery-verification.mjs';
import { deliveryCaseBindings } from './delivery-case-bindings.mjs';
import { deliveryAuthority, performDeliveryOperation, implementationScratch, reconciliationGate } from './delivery-decisions.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = verifyContractInstallation({ root }).cases;

test('all 50 frozen cases invoke repository boundaries; unsupported C39 is incomplete, not passing conformance', async () => {
  const result = await verifySharedCases({ root, bindings: deliveryCaseBindings });
  assert.deepEqual(result.failures, []);
  assert.equal(result.cases.length, 50); assert.equal(result.coverage.complete, true);
  assert.equal(result.passed, 49); assert.equal(result.complete, false);
  assert.deepEqual(result.incomplete.map(row => row.id), ['C39']);
  assert.match(result.incomplete[0].reason, /Compatible released.*unavailable/);
  assert.ok(result.cases.every(row => row.boundaries.length > 0));
});

test('C46/C47 guard: missing/duplicate cases, skipped cases and expected-result-only adapters cannot certify conformance', async () => {
  const records = fixtures.map(({ id }) => ({ id, status: 'passed' }));
  assert.equal(assessCoverage(records).complete, true);
  assert.equal(assessCoverage(records.slice(1)).complete, false);
  assert.equal(assessCoverage([...records, records[0]]).complete, false);
  assert.equal(assessCoverage([{ ...records[0], status: 'skipped' }, ...records.slice(1)]).complete, false);
  const fixture = fixtures.find(item => item.id === 'C15');
  const result = await verifySharedCases({ root, cases: [fixture], bindings: { C15: () => ({ observation: structuredClone(fixture.expect) }) } });
  assert.equal(result.complete, false); assert.equal(result.passed, 0);
  assert.match(result.failures[0].reason, /required implementation boundaries/);
  assert.equal(result.coverage.missing.length, 49);
});

test('assertion gaps and modified fixture expectations fail even after a real boundary call', async () => {
  const fixture = fixtures.find(item => item.id === 'C15');
  const result = await verifySharedCases({ root, cases: [fixture], bindings: { C15: async ctx => {
    await ctx.call('body', '', ''); return { observation: { accepted: true } };
  } } });
  assert.match(result.failures[0].reason, /Observed assertions differ/);
  const changed = structuredClone(fixture); changed.expect.accepted = false;
  const drift = await verifySharedCases({ root, cases: [changed], bindings: deliveryCaseBindings });
  assert.match(drift.failures[0].reason, /changed without approval/);
});

test('operation authority cannot smuggle merge/deletion or assume unknown framework approval', async () => {
  const unknown = deliveryAuthority({ kind: 'deliver-approved', scopePresented: true });
  assert.deepEqual(unknown.allowed, []);
  for (const operation of ['merge', 'delete-remote', 'auto-merge']) {
    let writes = 0; const result = await performDeliveryOperation({ authority: { allowed: [operation] }, operation, action: () => writes++ });
    assert.equal(result.performed, false); assert.equal(writes, 0);
  }
  const failed = await performDeliveryOperation({ authority: { allowed: ['push'] }, operation: 'push', targetedCheckFailed: true, action: () => assert.fail('no failing publication') });
  assert.equal(failed.failureDisclosed, true);
});

test('scratch rejects linked/cross-checkout paths; reconciliation cannot reuse an old checkpoint head', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-scratch-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.artifacts')); fs.mkdirSync(path.join(root, 'other'));
  fs.symlinkSync(path.join(root, 'other'), path.join(root, '.artifacts', 'linked'), 'junction');
  assert.throws(() => implementationScratch(root, 'linked/payload.json'), /Linked/);
  assert.throws(() => implementationScratch(root, '../other/payload.json'), /owning artifacts/);
  assert.equal(reconciliationGate({ implementationStarted: true, contractChanged: true, reconciliationRecorded: true, inspectedHead: 'old', currentHead: 'new' }).allowed, false);
  assert.equal(reconciliationGate({ materialConflict: true, refinementApproved: true }).allowed, false, 'A caller flag is not an approved contract refinement');
});

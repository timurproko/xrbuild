import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { attemptOneShot, candidateBinding, consumeDecision, evaluateIntegration, initializeDecisionLedger, inspectPersonalArm, verifyPersonalArm, githubIntegrationBackend } from './integrate.mjs';
const repository = 'timurproko/xrbuild', head = 'a'.repeat(40), base = 'b'.repeat(40), finalized = 'c'.repeat(40);
const tasks = '- [x] Implement and verify changed behavior.\n';
const body = `## Proposal\n\nDeliver the reviewed behavior.\n\n## Implementation\n\n- [x] Implement the reviewed behavior.\n\n## Acceptance\n\n- The reviewed behavior preserves the required state.\n\n## Automation\n\n\`\`\`openspec-implementation\n{"version":1,"change":"fixture","archive":"openspec/changes/archive/2026-11-13-fixture","finalizedHead":"${finalized}"}\n\`\`\`\n`;
const pull = overrides => ({ number: 1, node_id: 'PR_fixture', state: 'open', draft: false, body, labels: [], mergeable: true, mergeable_state: 'clean',
  head: { ref: 'chore/fixture', sha: head, repo: { full_name: repository } }, base: { ref: 'main', sha: base, repo: { full_name: repository } }, ...overrides });
const evidence = overrides => ({ tasks, trustedPolicy: true, protectionVerified: true, threadsResolved: true, archiveVerified: true,
  checks: [{ name: 'CI required', head_sha: head, status: 'completed', conclusion: 'success', app: { id: 15368 } }], ...overrides });
const actor = { type: 'User', login: 'maintainer', permission: 'write' };
const decision = (pr = pull()) => ({ version: 1, operation: 'merge-once', confirmation: 'merge this exact candidate once', actor: actor.login, decisionId: randomUUID(), expected: candidateBinding(pr) });
const cases = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url))).cases;
const shared = id => { const value = cases.find(item => item.id === id); assert.ok(value); return value; };

function boundary({ pr = pull(), gates = evidence(), credential = actor, readCandidate, consume, mergeResult = { merged: true } } = {}) {
  const mutations = [], consumed = new Set();
  return { mutations, consumed, options: {
    readCandidate: readCandidate ?? (() => pr), readEvidence: () => gates, readActor: () => credential,
    consumeDecision: consume ?? (request => { if (consumed.has(request.decisionId)) return false; consumed.add(request.decisionId); return true; }),
    merge: payload => { mutations.push(payload); return mergeResult; },
  } };
}

test('C23: implementation approval/green CI never substitutes for a fresh explicit exact request', async () => {
  const f = boundary(); await attemptOneShot({ ...f.options, request: null });
  assert.deepEqual({ mergeCalls: f.mutations.length, agentAutoMergeArms: f.mutations.filter(item => item.auto_merge).length }, shared('C23').expect);
});

test('C24: authorized one-shot uses exactly one protected expected-head squash, without a manual-test gate', async () => {
  const f = boundary(), request = decision();
  const result = await attemptOneShot({ ...f.options, request });
  assert.equal(result.status, 'merged');
  assert.deepEqual({ protectedSquashCalls: f.mutations.filter(item => item.merge_method === 'squash').length,
    expectedHeadEnforced: f.mutations[0]?.sha === request.expected.head,
    adminBypass: f.mutations.some(item => item.admin || item.force || item.bypass), manualTestRequired: Object.hasOwn(request, 'manualTest') }, shared('C24').expect);
  assert.equal(result.futureAuthority, false);
});

test('C25: pending checks burn durable decisions; later green cannot reuse them or schedule a retry', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-ledger-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ledger = initializeDecisionLedger(path.join(root, 'decisions')), request = decision();
  let gates = evidence({ checks: [{ name: 'CI required', head_sha: head, status: 'in_progress', conclusion: null, app: { id: 15368 } }] });
  const f = boundary({ consume: input => consumeDecision(ledger, input) });
  const result = await attemptOneShot({ ...f.options, readEvidence: () => gates, request });
  assert.deepEqual({ mergeCalls: f.mutations.length, waitOrPollCalls: f.mutations.filter(item => item.wait || item.poll).length,
    autoMergeArms: f.mutations.filter(item => item.auto_merge).length, retainedFutureAuthority: result.futureAuthority }, shared('C25').expect);
  gates = evidence();
  assert.equal((await attemptOneShot({ ...f.options, readEvidence: () => gates, request })).status, 'blocked');
  assert.equal(f.mutations.length, 0);
  assert.equal((await attemptOneShot({ ...f.options, readEvidence: () => gates, request: decision() })).status, 'merged');
  assert.equal(f.mutations.length, 1);
  assert.throws(() => initializeDecisionLedger(path.join(root, '.artifacts')), /durable tool state/);
});

test('C26: xrbuild retains non-strict base currency even when head is behind the current authorized base', () => {
  const pr = pull({ mergeable_state: 'behind' }), result = evaluateIntegration(pr, evidence(), candidateBinding(pr));
  assert.deepEqual({ eligible: result.status === 'eligible', newStrictBaseGateApplied: result.strictBaseGateApplied }, shared('C26').expectByRepository.xrbuild);
});

test('C27: head/base/body/acceptance changes invalidate previous decisions before a mutation', async () => {
  for (const mutate of [pr => pr.head.sha = 'd'.repeat(40), pr => pr.base.sha = 'd'.repeat(40), pr => pr.body += '\nClarification.', pr => pr.body = pr.body.replace('required state.', 'different state.')]) {
    const original = pull(), changed = structuredClone(original); mutate(changed);
    const f = boundary({ pr: changed }); const result = await attemptOneShot({ ...f.options, request: decision(original) });
    assert.deepEqual({ previousAuthorityValid: f.mutations.length > 0, freshDecisionRequired: /fresh decision/.test(result.reason) }, shared('C27').expect);
  }
});

test('bot credentials, unverified policy/protection/archive, wrong checks and ambiguous mergeability block without bypass', async () => {
  for (const setup of [
    { credential: { ...actor, type: 'Bot' } }, { credential: { ...actor, workflow: true } }, { credential: { ...actor, permission: 'read' } },
    { gates: evidence({ threadsResolved: false }) }, { gates: evidence({ trustedPolicy: false }) }, { gates: evidence({ protectionVerified: false }) }, { gates: evidence({ archiveVerified: false }) },
    { pr: pull({ labels: [{ name: 'delivery-hold' }] }) }, { pr: pull({ draft: true }) }, { pr: pull({ mergeable: null }) },
    { gates: evidence({ tasks: '- [ ] Required work remains.' }) }, { gates: evidence({ checks: [] }) },
    { gates: evidence({ checks: [{ name: 'CI required', head_sha: base, status: 'completed', conclusion: 'success', app: { id: 15368 } }] }) },
  ]) {
    const f = boundary(setup); assert.equal((await attemptOneShot({ ...f.options, request: decision() })).status, 'blocked'); assert.equal(f.mutations.length, 0);
  }
  let reads = 0;
  const f = boundary({ readCandidate: () => ++reads < 3 ? pull() : pull({ labels: [{ name: 'delivery-hold' }] }) });
  assert.equal((await attemptOneShot({ ...f.options, request: decision() })).status, 'blocked'); assert.equal(f.mutations.length, 0);
  const rejected = boundary({ mergeResult: { merged: false } });
  assert.equal((await attemptOneShot({ ...rejected.options, request: decision() })).futureAuthority, false); assert.equal(rejected.mutations.length, 1);
});

test('C28: native human toggle without exact verified evidence is not acceptance and cannot be blindly cancelled', () => {
  const result = inspectPersonalArm(pull({ auto_merge: { enabled_by: { login: actor.login, type: 'User' }, enabled_at: '2026-11-13T12:00:00Z' } }));
  assert.deepEqual({ acceptanceInferred: result.acceptanceInferred, unrelatedHumanArmCancelled: result.unrelatedHumanArmCancelled,
    safePauseOrContinuationPromised: result.continuationPromised, blockerReported: result.status === 'blocked' }, shared('C28').expect);
});

test('personal-arm evidence is read from the authorized human, bound to exact candidate/acceptance/native arm, and freshly re-read', async () => {
  const pr = pull({ auto_merge: { enabled_by: { login: actor.login, type: 'User' }, enabled_at: '2026-11-13T12:00:00Z' } });
  const data = { version: 1, operation: 'personal-auto-merge', binding: candidateBinding(pr), enabledAt: pr.auto_merge.enabled_at };
  const comment = { id: 10, user: { login: actor.login, type: 'User' }, issue_url: `https://api.github.com/repos/${repository}/issues/1`, body: JSON.stringify(data) };
  const options = { number: 1, approvalComment: 10, readCandidate: () => pr, readComment: () => comment, readPermission: () => ({ permission: 'write' }), readArchiveEvidence: () => ({ archiveVerified: true, tasks }) };
  assert.equal((await verifyPersonalArm(options)).status, 'bound');
  for (const changed of [pull({ ...pr, body: pr.body + '\nChanged' }), pull({ ...pr, base: { ...pr.base, sha: head } }), pull({ ...pr, head: { ...pr.head, sha: base } })]) {
    assert.equal((await verifyPersonalArm({ ...options, readCandidate: () => changed })).status, 'blocked');
  }
  let reads = 0;
  assert.equal((await verifyPersonalArm({ ...options, readComment: () => ++reads === 1 ? comment : { ...comment, body: '{}' } })).status, 'blocked');
  assert.equal((await verifyPersonalArm({ ...options, readArchiveEvidence: () => null })).status, 'blocked');
  assert.equal((await verifyPersonalArm({ ...options, readCandidate: () => { throw Error('unavailable'); } })).status, 'blocked');
  assert.equal(inspectPersonalArm(undefined).status, 'blocked');
  assert.equal(inspectPersonalArm({ ...pr, body: pr.body + pr.body }, { ...data, actor, verified: true, archiveVerified: true }).status, 'blocked');
  assert.equal(inspectPersonalArm(pr, { ...data, actor, verified: true, archiveVerified: true }).continuationPromised, false, 'recognition is not an unattended native-merge guarantee');
});

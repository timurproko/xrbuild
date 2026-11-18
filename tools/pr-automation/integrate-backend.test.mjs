import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { githubIntegrationBackend, attemptOneShot, candidateBinding } from './integrate.mjs';

const repository = 'timurproko/xrbuild', H = 'a'.repeat(40), B = 'b'.repeat(40), F = 'c'.repeat(40);
const tasks = '- [x] Implement and test the reviewed behavior.\n';
const body = `## Proposal\n\nPreserve reviewed state.\n\n## Implementation\n\n- [x] Implement reviewed state preservation.\n\n## Acceptance\n\n- Reviewed state survives continuation.\n\n## Automation\n\n\`\`\`openspec-implementation\n{"version":1,"change":"fixture","archive":"openspec/changes/archive/2026-11-13-fixture","finalizedHead":"${F}"}\n\`\`\`\n`;
const pr = { number: 1, node_id: 'PR_fixture', state: 'open', draft: false, body, labels: [], mergeable: true, mergeable_state: 'behind',
  head: { sha: H, ref: 'chore/fixture', repo: { full_name: repository } }, base: { sha: B, ref: 'main', repo: { full_name: repository } } };
const governance = JSON.parse(fs.readFileSync(new URL('../../config/github-repository-governance.json', import.meta.url)));

function remote(overrides = {}) {
  const calls = []; let actorReads = 0;
  const request = async (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (options.method === 'PUT') return { merged: true };
    if (endpoint === 'user') return { login: 'maintainer', type: overrides.bot ? 'Bot' : 'User' };
    if (endpoint.endsWith('/permission')) return { permission: overrides.revoke && ++actorReads > 1 ? 'read' : 'write' };
    if (endpoint.endsWith('/pulls/1')) return structuredClone(pr);
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: B } };
    if (endpoint.includes('/contents/')) {
      const file = endpoint.split('/contents/')[1].split('?')[0];
      if (file === 'openspec/changes/fixture/tasks.md') {
        if (overrides.active) return { encoding: 'base64', content: Buffer.from(tasks).toString('base64') };
        throw Object.assign(Error('active artifacts unavailable'), { status: overrides.activeError ?? 404 });
      }
      const content = file.startsWith('openspec/changes/archive/') ? tasks : fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      return { encoding: 'base64', content: Buffer.from(content + (overrides.policyDrift && file === 'docs/delivery-rules.md' ? '\n' : '')).toString('base64') };
    }
    if (endpoint.includes('/compare/')) return { status: 'ahead' };
    if (endpoint.includes('/check-runs?')) return { total_count: 1, check_runs: [{ name: 'CI required', head_sha: H, status: 'completed', conclusion: 'success', app: { id: overrides.wrongApp ? 1 : 15368 } }] };
    if (endpoint.includes('/rulesets?')) return [{ id: 1, name: 'protect-main', enforcement: 'active' }];
    if (endpoint.endsWith('/rulesets/1')) return { ...structuredClone(governance.rulesets[0]), bypass_actors: overrides.bypass ? [{ actor_id: 1 }] : [] };
    if (endpoint.endsWith('/branches/main/protection')) {
      if (overrides.classic) return { required_status_checks: { strict: true } };
      throw Object.assign(Error('No classic protection'), { status: 404 });
    }
    if (endpoint.endsWith('/rules/branches/main')) {
      const rules = structuredClone(governance.rulesets[0].rules);
      if (overrides.strict) rules.find(rule => rule.type === 'required_status_checks').parameters.strict_required_status_checks_policy = true;
      if (overrides.unknownRule) rules.push({ type: 'unverified_additional_gate' });
      return rules;
    }
    if (endpoint === 'graphql') return { data: { repository: { pullRequest: { id: pr.node_id, reviewThreads: {
      totalCount: 1, pageInfo: { hasNextPage: Boolean(overrides.moreThreads) }, nodes: [{ isResolved: !overrides.unresolved }],
    } } } } };
    throw Error('Unexpected isolated backend endpoint');
  };
  const backend = githubIntegrationBackend({ number: 1, request });
  const input = { version: 1, operation: 'merge-once', confirmation: 'merge this exact candidate once', actor: 'maintainer', decisionId: randomUUID(), expected: candidateBinding(pr) };
  return { backend, calls, input };
}

const manualRuntime = action => async () => {
  const before = process.env.GITHUB_ACTIONS; process.env.GITHUB_ACTIONS = 'false';
  try { await action(); } finally { if (before === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = before; }
};

test('GitHub backend reads immutable trusted policy/archive/protection/thread evidence and emits only one expected-head squash', manualRuntime(async () => {
  const f = remote(), candidate = await f.backend.readCandidate(), evidence = await f.backend.readEvidence(candidate);
  assert.equal(evidence.archiveVerified, true); assert.equal(evidence.protectionVerified, true); assert.equal(evidence.threadsResolved, true); assert.equal(evidence.trustedPolicy, true);
  assert.equal((await attemptOneShot({ ...f.backend, request: f.input, consumeDecision: () => true })).status, 'merged');
  const writes = f.calls.filter(call => call.method === 'PUT');
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].body, { sha: H, merge_method: 'squash' });
  assert.ok(f.calls.filter(call => call.method === 'POST').every(call => call.endpoint === 'graphql'), 'GraphQL requests are read-only queries, not merge/arm mutations');
}));

test('backend fails closed on protection drift, unresolved/incomplete threads, archive uncertainty and credential races', manualRuntime(async () => {
  for (const failure of [{ classic: true }, { strict: true }, { unknownRule: true }, { bypass: true }, { unresolved: true }, { moreThreads: true },
    { active: true }, { activeError: 403 }, { policyDrift: true }, { wrongApp: true }, { bot: true }, { revoke: true }]) {
    const f = remote(failure);
    assert.equal((await attemptOneShot({ ...f.backend, request: f.input, consumeDecision: () => true })).status, 'blocked', JSON.stringify(failure));
    assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0, JSON.stringify(failure));
  }
}));

test('workflow execution cannot borrow a human PAT or initialize the one-shot CLI ledger', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-workflow-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = process.env.GITHUB_ACTIONS; process.env.GITHUB_ACTIONS = 'true';
  try {
    const f = remote();
    assert.equal((await attemptOneShot({ ...f.backend, request: f.input, consumeDecision: () => true })).status, 'blocked');
    assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0);
    const ledger = path.join(root, 'decisions');
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./integrate.mjs', import.meta.url)), '--init-ledger', ledger], { encoding: 'utf8', env: { ...process.env } });
    assert.equal(child.status, 1); assert.match(child.stderr, /integration blocked/); assert.equal(fs.existsSync(ledger), false);
  } finally { if (before === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = before; }
});

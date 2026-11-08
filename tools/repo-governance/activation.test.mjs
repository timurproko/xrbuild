import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CONFIG_PATH, CONFIRM, run } from './governance.mjs';
import { inspectActivation, activationReport } from './activation.mjs';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')), repo = 'owner/xrbuild';
function fixture() {
  const writes = [], lines = [], state = { repository: { ...config.repository, full_name: repo, default_branch: 'main', permissions: { admin: true } },
    rulesets: [{ ...structuredClone(config.rulesets[0]), id: 7 }], permissions: structuredClone(config.actions), actions: { enabled: false },
    workflows: Object.keys(config.automation.workflows).map((path, i) => ({ id: i + 1, path, state: 'active' })),
    variables: [{ name: 'XRB_BOT_APP_ID', value: '1234' }], secrets: [{ name: 'XRB_BOT_PRIVATE_KEY' }], missing: new Set(), deny: new Map() };
  const api = (method, p, body) => {
    if (state.deny.has(p)) throw state.deny.get(p);
    if (method !== 'GET') {
      writes.push({ method, p, body });
      if (p === `repos/${repo}`) Object.assign(state.repository, body);
      else if (p.endsWith('/actions/permissions/workflow')) Object.assign(state.permissions, body);
      else if (p.endsWith('/actions/permissions')) Object.assign(state.actions, body);
      else if (/\/actions\/workflows\/\d+\//.test(p)) state.workflows.find(w => p.includes(`/${w.id}/`)).state = p.endsWith('/enable') ? 'active' : 'disabled_manually';
      else if (p.endsWith('/rulesets')) state.rulesets.push({ id: 8, ...structuredClone(body) });
      else if (p.includes('/rulesets/')) Object.assign(state.rulesets.find(r => p.endsWith(`/${r.id}`)), body);
      return {};
    }
    if (p === `repos/${repo}`) return state.repository;
    if (p.endsWith('/rulesets')) return state.rulesets;
    if (p.includes('/rulesets/')) return state.rulesets.find(r => p.endsWith(`/${r.id}`));
    if (p.includes('/branches/')) throw new Error('404 Not Found');
    if (p.endsWith('/actions/permissions/workflow')) return state.permissions;
    if (p.endsWith('/actions/permissions')) return state.actions;
    if (p.includes('/actions/workflows?')) return { workflows: state.workflows, total_count: state.workflows.length };
    if (p.includes('/actions/variables?')) return { variables: state.variables };
    if (p.includes('/actions/secrets?')) return { secrets: state.secrets };
    if (p.includes('/contents/')) { if (state.missing.has(p.split('/contents/')[1].split('?')[0])) throw new Error('404 Not Found'); return { type: 'file' }; }
    if (p.includes('/labels')) return config.labels;
    throw new Error(`Unexpected query ${p}`);
  };
  const command = (name, confirm = true) => run([name, ...(confirm ? ['--confirm', CONFIRM] : [])], { api, repo, config, out: line => lines.push(line) });
  return { state, api, writes, lines, command };
}

test('preflight is read-only and never exposes variable values or secret material', () => {
  const f = fixture(); assert.equal(f.command('preflight'), 0); assert.deepEqual(f.writes, []);
  assert.doesNotMatch(f.lines.join('\n'), /1234|PRIVATE_KEY|private-key/);
  assert.equal(activationReport(inspectActivation({ ...f, repo, config })).enforcementVerified, false);
});

test('protection can be installed independently of missing bot configuration without enabling Actions', () => {
  const f = fixture(); f.state.variables = []; f.state.secrets = []; f.state.rulesets = [];
  assert.equal(f.command('protect'), 0); assert.equal(f.state.rulesets[0].bypass_actors.length, 0);
  assert.equal(f.state.actions.enabled, false); assert.match(f.lines.at(-1), /partial/);
  assert.equal(f.writes.some(write => write.p.includes('/actions/workflows/')), false);
});

test('CI-only activation enables just reviewed CI and explicitly disables dormant privileged/unrelated workflows', () => {
  const f = fixture(); f.state.variables = []; f.state.secrets = [];
  assert.equal(f.command('activate-ci'), 0); assert.equal(f.state.actions.enabled, true);
  assert.deepEqual(f.state.workflows.filter(w => w.state === 'active').map(w => w.path), ['.github/workflows/ci.yml']);
  assert.match(f.lines.at(-1), /partial/);
});

test('full activation is idempotent but does not certify App permissions or exact-head events', () => {
  const f = fixture(); assert.equal(f.command('activate'), 0); const count = f.writes.length;
  assert.equal(f.command('activate'), 0); assert.equal(f.writes.length, count);
  assert.match(f.lines.at(-1), /configured-not-certified/); assert.match(f.lines.at(-1), /canary/);
  assert.equal(f.writes.some(write => /visibility|billing|pulls/.test(write.p)), false);
});

test('missing bot configuration blocks full activation without writes', () => {
  const f = fixture(); f.state.secrets = []; assert.equal(f.command('activate'), 2);
  assert.deepEqual(f.writes, []); assert.match(f.lines.join('\n'), /bot-configuration-required/);
});

test('private-plan denial is not confused with missing protection and never changes visibility or billing', () => {
  const f = fixture(), error = new Error('403'); error.stdout = JSON.stringify({ message: 'Upgrade to GitHub Pro or make this repository public to enable this feature.' });
  f.state.deny.set(`repos/${repo}/rulesets`, error); f.state.deny.set(`repos/${repo}/branches/main/protection`, error);
  assert.equal(f.command('protect'), 2); assert.deepEqual(f.writes, []); assert.match(f.lines.join('\n'), /protection-plan-required/);
});

test('permission, missing and unknown failures never certify protection', () => {
  for (const message of ['403 Forbidden', '404 Not Found', 'connection failed']) {
    const f = fixture(); f.state.deny.set(`repos/${repo}/rulesets`, new Error(message));
    assert.equal(f.command('protect'), 2); assert.deepEqual(f.writes, []); assert.match(f.lines.join('\n'), /protection-unverified/);
  }
});

test('unreviewed active workflows and absent trusted main policy block activation', () => {
  const f = fixture(); f.state.workflows.push({ id: 99, path: '.github/workflows/unknown.yml', state: 'active' });
  assert.equal(f.command('activate'), 2); assert.deepEqual(f.writes, []);
  const g = fixture(); g.state.missing.add('tools/pr-automation/promote.mjs');
  assert.equal(g.command('activate'), 2); assert.deepEqual(g.writes, []); assert.match(g.lines.join('\n'), /trusted-policy-bootstrap/);
});

test('unknown repository identity, admin authority or administrator bypass blocks before writes', () => {
  for (const mutate of [f => f.state.repository.full_name = 'other/xrbuild', f => f.state.repository.permissions.admin = false]) {
    const f = fixture(); mutate(f); assert.equal(f.command('protect'), 2); assert.deepEqual(f.writes, []);
  }
  const f = fixture(), unsafe = structuredClone(config); unsafe.rulesets[0].bypass_actors = [{ actor_id: 5 }];
  assert.equal(run(['protect', '--confirm', CONFIRM], { api: f.api, repo, config: unsafe, out: () => {} }), 2); assert.deepEqual(f.writes, []);
  for (const mutate of [c => c.rulesets[0].conditions.ref_name.include = ['refs/heads/other'], c => c.rulesets[0].conditions.ref_name.exclude = ['refs/heads/main'],
    c => c.rulesets[0].rules.find(r => r.type === 'pull_request').parameters.allowed_merge_methods = ['merge']]) {
    const wrong = structuredClone(config); mutate(wrong);
    assert.equal(run(['protect', '--confirm', CONFIRM], { api: f.api, repo, config: wrong, out: () => {} }), 2); assert.deepEqual(f.writes, []);
  }
});

test('protection refuses to lock bootstrap behind a CI workflow absent from main', () => {
  const f = fixture(); f.state.missing.add('.github/workflows/ci.yml');
  assert.equal(f.command('protect'), 2); assert.deepEqual(f.writes, []); assert.match(f.lines.join('\n'), /trusted-policy-bootstrap/);
});

test('activation without confirmation is dry-run only and readback failure stays partial', () => {
  const f = fixture(); assert.equal(f.command('activate', false), 0); assert.deepEqual(f.writes, []);
  const g = fixture(); g.state.deny.set(`repos/${repo}/actions/workflows/2/disable`, new Error('rejected'));
  assert.equal(g.command('activate-ci'), 2); assert.match(g.lines.at(-1), /partial-or-blocked/); assert.equal(g.state.actions.enabled, false);
});

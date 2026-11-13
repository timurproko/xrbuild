import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashOf } from '../name-guard/name-guard.mjs';
import { planPath, publishPlan, validatePlan } from './publish-plan.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), T = 'd'.repeat(40), U = 'e'.repeat(40);
const banned = new Set([hashOf('restrictedword')]);
const prefix = 'openspec/changes/public-plan/';
function payload() {
  return {
    repository: 'example/public-core', base: 'main', head: 'docs/public-plan', change: 'public-plan',
    title: 'docs(openspec): propose public plan', publicReviewed: true,
    body: '## Proposal\n\nA real public plan.\n\n## Implementation\n\n- [ ] Support portable planning.\n\n## Automation\n\n<details>\n<summary>Link</summary>\n\n```openspec-implementation\n{"version":1,"change":"public-plan"}\n```\n\n</details>\n',
    files: ['proposal.md', 'design.md', 'tasks.md'].map(name => ({ path: prefix + name, content: name === 'tasks.md' ? '- [ ] Implement the proposal; verify focused fixtures.\n' : '# Public plan\n\nReviewed public content.\n' })),
  };
}

function service({ existing = null, pulls = [], comparison, sameTree = false, beforeRef, failPull = false, raceUpdate = false } = {}) {
  let head = existing, createdPr;
  const calls = [];
  const request = async (endpoint, options = {}) => {
    const { method = 'GET', body } = options;
    calls.push({ endpoint, method, body });
    const route = endpoint.replace('repos/example/public-core', '');
    if (route === '') return { full_name: 'example/public-core', private: false };
    if (route === '/git/ref/heads/main') return { object: { sha: A } };
    if (route === '/git/ref/heads/docs%2Fpublic-plan') {
      if (beforeRef) head = beforeRef(calls, head);
      if (!head) throw Object.assign(new Error('missing'), { status: 404 });
      return { object: { sha: head } };
    }
    if (route.startsWith('/compare/')) return comparison ?? { status: 'ahead', files: [{ filename: prefix + 'proposal.md' }] };
    if (route === `/git/commits/${A}` || route === `/git/commits/${B}`) return { tree: { sha: T } };
    if (route === '/git/trees' && method === 'POST') return { sha: sameTree ? T : U };
    if (route === '/git/commits' && method === 'POST') return { sha: C };
    if (route === '/git/refs' && method === 'POST') { assert.equal(head, null); head = body.sha; return {}; }
    if (route === '/git/refs/heads/docs%2Fpublic-plan' && method === 'PATCH') {
      assert.equal(body.force, false);
      if (raceUpdate) throw new Error('non-fast-forward');
      head = body.sha; return {};
    }
    if (route.startsWith('/pulls?')) return pulls;
    if (route === '/pulls' && method === 'POST') {
      if (failPull) throw new Error('PR service unavailable');
      createdPr = { number: 19, state: 'open', draft: body.draft, title: body.title, body: body.body,
        head: { sha: head, ref: body.head, repo: { full_name: 'example/public-core' } }, base: { ref: body.base } };
      return createdPr;
    }
    if (route === '/pulls/19') return createdPr;
    throw new Error(`Unexpected mock request: ${method} ${route}`);
  };
  return { request, calls, head: () => head };
}
const publish = (plan, api) => publishPlan(plan, { request: api.request, banned });
const refWrites = api => api.calls.filter(call => call.method !== 'GET' && /\/git\/refs(?:\/|$)/.test(call.endpoint));

test('planning publication needs no cwd, worktree, dependencies or runtime and creates only a real draft', async () => {
  const plan = payload(), api = service();
  const result = await publish(plan, api);
  assert.deepEqual(result, { repository: plan.repository, branch: plan.head, change: plan.change, head: C, pr: 19, publication: 'verified', reused: false });
  const commit = api.calls.find(call => call.endpoint.endsWith('/git/commits') && call.method === 'POST');
  assert.deepEqual(commit.body.parents, [A]);
  const tree = api.calls.find(call => call.endpoint.endsWith('/git/trees'));
  assert.deepEqual(tree.body.tree.map(file => file.path), plan.files.map(file => file.path));
  assert.ok(tree.body.tree.every(file => file.mode === '100644' && file.type === 'blob'));
  assert.deepEqual(refWrites(api).map(call => call.body), [{ ref: 'refs/heads/docs/public-plan', sha: C }]);
  assert.equal(api.calls.find(call => call.endpoint.endsWith('/pulls') && call.method === 'POST').body.draft, true);
  assert.equal(api.calls.some(call => call.method === 'DELETE'), false);
});

test('allowlist excludes private inputs, framework, generated skills, traversal and unrelated changes before remote access', async () => {
  for (const filename of ['.xrbuild/plan.md', '.claude/skills/openspec-apply-change/SKILL.md', 'openspec/config.yaml',
    prefix + '../other/proposal.md', prefix + 'specs/../../framework.md', prefix + 'extra.md', 'README.md', prefix + 'specs/a/b/spec.md']) {
    const plan = payload(), api = service();
    plan.files.push({ path: filename, content: 'not selected' });
    await assert.rejects(publish(plan, api), /Only unique text artifacts/);
    assert.equal(api.calls.length, 0);
  }
  assert.equal(planPath('public-plan', prefix + 'specs/public-contract/spec.md'), true);
  assert.equal(planPath('public-plan', prefix + '.openspec.yaml'), true);
});

test('payload review, naming and credential boundaries fail before requests without echoing content', async () => {
  const edits = [
    plan => { plan.publicReviewed = false; },
    plan => { plan.files[0].content = 'restrictedword'; },
    plan => { plan.body += '\n' + 'ghp_' + 'z'.repeat(30); },
    plan => { plan.files[1].content = 'https://name:password@example.invalid'; },
    plan => { plan.files.push({ ...plan.files[0] }); },
    plan => { plan.files[0].path = prefix + 'proposal.md\0'; },
    plan => { plan.files[0].content = 'binary\0text'; },
    plan => { plan.files[0].content = 'x'.repeat(1024 * 1024); },
    plan => { plan.sourceDirectory = '/unrelated/checkout'; },
    plan => { plan.files[0].source = '/private/input'; },
    plan => { plan.head = 'main'; },
    plan => { plan.base = 'bad..ref'; },
    plan => { plan.repository = '../other'; },
  ];
  for (const change of edits) {
    const plan = payload(), api = service(); change(plan);
    await assert.rejects(publish(plan, api));
    assert.equal(api.calls.length, 0);
  }
  assert.throws(() => validatePlan(payload(), new Set()), /nonempty/);
  // A public contract may discuss preservation; a mention is not itself a private source export.
  const plan = payload(); plan.files[0].content += '\nNever export .xrbuild/ history.';
  assert.doesNotThrow(() => validatePlan(plan, banned));
});

test('planning-only snapshots reject completed tasks/outcomes, finalized links and acceptance', () => {
  const edits = [
    plan => { plan.files[2].content = '- [x] Finished\n'; },
    plan => { plan.body = plan.body.replace('[ ]', '[x]'); },
    plan => { plan.body = plan.body.replace('## Automation', '## Acceptance\n\n- Done\n\n## Automation'); },
    plan => { plan.body = plan.body.replace('"change":"public-plan"', '"change":"other-plan"'); },
    plan => { plan.body = plan.body.replace('"version":1', '"version":2'); },
    plan => { plan.body = plan.body.replace('"version":1', '"archive":"old", "version":1'); },
    plan => { plan.files = plan.files.slice(0, 2); },
  ];
  for (const change of edits) { const plan = payload(); change(plan); assert.throws(() => validatePlan(plan, banned)); }
});

test('existing branch requires explicit expected head; stale base/head never overwrite a task', async () => {
  const plan = payload(), api = service({ existing: B });
  await assert.rejects(publish(plan, api), /retry with expectedHead/);
  assert.equal(refWrites(api).length, 0);
  plan.expectedHead = A;
  await assert.rejects(publish(plan, api), /changed/);
  plan.expectedHead = B; plan.expectedBase = B;
  await assert.rejects(publish(plan, api), /Base candidate changed/);
  assert.equal(refWrites(api).length, 0);
  await assert.rejects(publish({ ...payload(), expectedHead: B }, service()), /missing/);
});

test('expected-head updates preserve history and only non-force publish a planning descendant', async () => {
  const plan = { ...payload(), expectedHead: B }, api = service({ existing: B });
  await publish(plan, api);
  const commit = api.calls.find(call => call.endpoint.endsWith('/git/commits') && call.method === 'POST');
  assert.deepEqual(commit.body.parents, [B]);
  assert.deepEqual(refWrites(api).map(call => call.body), [{ sha: C, force: false }]);
});

test('implementation, rename escapes, truncated evidence and divergence refuse planning-only updates', async () => {
  for (const comparison of [
    { status: 'diverged', files: [] },
    { status: 'ahead', files: [{ filename: 'src/code.ts' }] },
    { status: 'ahead', files: [{ filename: prefix + 'proposal.md', previous_filename: '.claude/skills/openspec-apply-change/SKILL.md' }] },
    { status: 'ahead', files: Array(300).fill({ filename: prefix + 'proposal.md' }) },
    { status: 'ahead' },
  ]) {
    const api = service({ existing: B, comparison });
    await assert.rejects(publish({ ...payload(), expectedHead: B }, api), /outside the selected plan/);
    assert.equal(refWrites(api).length, 0);
  }
});

test('pre-publication head race makes no ref write; API fast-forward guard handles later races', async () => {
  const plan = { ...payload(), expectedHead: B };
  const api = service({ existing: B, beforeRef: (calls, head) => calls.filter(call => call.endpoint.endsWith('ref/heads/docs%2Fpublic-plan')).length > 1 ? A : head });
  await assert.rejects(publish(plan, api), /Refs changed/);
  assert.equal(refWrites(api).length, 0);
  const late = service({ existing: B, raceUpdate: true });
  await assert.rejects(publish(plan, late), /non-fast-forward/);
  assert.equal(late.head(), B);
});

test('partial PR publication preserves ref and retry discovers the same draft without another commit', async () => {
  const plan = payload(), failed = service({ failPull: true });
  await assert.rejects(publish(plan, failed), new RegExp(`retained at ${C}.*expectedHead=${C}`));
  assert.equal(failed.head(), C);
  const pr = { number: 19, state: 'open', draft: true, title: plan.title, body: plan.body,
    head: { repo: { full_name: plan.repository }, ref: plan.head, sha: B }, base: { ref: plan.base } };
  const resumed = service({ existing: B, sameTree: true, pulls: [pr] });
  const result = await publish({ ...plan, expectedHead: B }, resumed);
  assert.equal(result.pr, 19);
  assert.equal(result.reused, true);
  assert.equal(refWrites(resumed).length, 0);
  assert.equal(resumed.calls.some(call => call.endpoint.endsWith('/git/commits') && call.method === 'POST'), false);
});

test('duplicate/mismatched/closed existing PRs preserve all remote metadata rather than creating another PR', async () => {
  const plan = { ...payload(), expectedHead: B };
  const pr = { number: 19, state: 'open', draft: true, title: plan.title, body: plan.body,
    head: { repo: { full_name: plan.repository }, ref: plan.head, sha: B }, base: { ref: plan.base } };
  for (const pulls of [[pr, pr], [{ ...pr, state: 'closed' }], [{ ...pr, body: 'concurrent update' }], [{ ...pr, draft: false }]]) {
    const api = service({ existing: B, sameTree: true, pulls });
    await assert.rejects(publish(plan, api), /inspect the existing PR/);
    assert.equal(refWrites(api).length, 0);
    assert.equal(api.calls.some(call => call.method !== 'GET' && call.endpoint.includes('/pulls')), false);
  }
});

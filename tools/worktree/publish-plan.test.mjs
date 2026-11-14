import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
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

function service({ existing = null, pulls = [], comparison, sameTree = false, beforeRef, beforeWrite,
  failPull = false, lostWriteResponse = false, mutationErrors = false, invalidMutation = false } = {}) {
  let head = existing, createdPr, parentTree = T;
  const calls = [], commits = new Map([[A, []], [B, [A]], ['f'.repeat(40), [B]]]);
  const ancestor = (parent, tip) => parent === tip || (commits.get(tip) ?? []).some(value => ancestor(parent, value));
  const atWrite = () => { if (beforeWrite) head = beforeWrite(head, value => { head = value; }); };
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
    if ([A, B, C].some(sha => route === `/git/commits/${sha}`)) { parentTree = route.endsWith(C) ? U : T; return { tree: { sha: parentTree } }; }
    if (route === '/git/trees' && method === 'POST') return { sha: sameTree ? parentTree : U };
    if (route === '/git/commits' && method === 'POST') { commits.set(C, body.parents); return { sha: C }; }
    if (route === '/git/refs' && method === 'POST') {
      atWrite(); if (head !== null) throw new Error('ref already exists');
      head = body.sha; if (lostWriteResponse) throw new Error('response lost'); return {};
    }
    if (route === '/git/refs/heads/docs%2Fpublic-plan' && method === 'PATCH') {
      // Deliberately model real non-force REST semantics, not an invented expected-head check.
      // Reverting the implementation to PATCH must reproduce the ancestor-rewind overwrite.
      atWrite(); if (!head || body.force || !ancestor(head, body.sha)) throw new Error('non-fast-forward');
      head = body.sha; return {};
    }
    if (route === 'graphql' && method === 'POST') {
      atWrite(); const input = body.variables.input;
      if (head !== input.expectedHeadOid) return { errors: [{ message: 'expectedHeadOid mismatch' }] };
      if (mutationErrors) return { errors: [{ message: 'rejected' }] };
      if (invalidMutation) return { data: { createCommitOnBranch: { commit: null } } };
      commits.set(C, [head]); head = C;
      if (lostWriteResponse) throw new Error('response lost after commit');
      return { data: { createCommitOnBranch: { commit: { oid: C } } } };
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
const refWrites = api => api.calls.filter(call => call.method !== 'GET' && (call.endpoint === 'graphql' || /\/git\/refs(?:\/|$)/.test(call.endpoint)));

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
  const portable = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url), 'utf8'))
    .cases.find(item => item.id === 'C33');
  assert.ok(portable);
  assert.deepEqual({ localRegistrationRequired: api.calls.some(call => /handoff|worktree/.test(call.endpoint)),
    inventedLocalPath: ['worktree', 'path', 'cwd'].some(key => Object.hasOwn(result, key)),
    branchAndPrReported: result.branch === plan.head && Number.isSafeInteger(result.pr) }, portable.expect);
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

test('existing planning branches use server-side expectedHeadOid commit publication, never a REST ref PATCH', async () => {
  const plan = { ...payload(), expectedHead: B }, api = service({ existing: B });
  assert.equal((await publish(plan, api)).head, C);
  const writes = refWrites(api); assert.equal(writes.length, 1); assert.equal(writes[0].endpoint, 'graphql');
  assert.match(writes[0].body.query, /createCommitOnBranch/);
  assert.deepEqual(writes[0].body.variables.input, {
    branch: { repositoryNameWithOwner: plan.repository, branchName: plan.head }, expectedHeadOid: B,
    message: { headline: 'docs(openspec): propose public-plan' },
    fileChanges: { additions: plan.files.map(file => ({ path: file.path, contents: Buffer.from(file.content).toString('base64') })) },
  });
  assert.equal(api.calls.some(call => call.method === 'PATCH' || call.endpoint.endsWith('/git/commits') && call.method === 'POST'), false);
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

test('pre-publication head race makes no ref write', async () => {
  const plan = { ...payload(), expectedHead: B };
  const api = service({ existing: B, beforeRef: (calls, head) => calls.filter(call => call.endpoint.endsWith('ref/heads/docs%2Fpublic-plan')).length > 1 ? A : head });
  await assert.rejects(publish(plan, api), /Refs changed/);
  assert.equal(refWrites(api).length, 0);
});

test('atomic expected head rejects write-boundary rewinds, deletion/recreation and forward movement after the final observation', async () => {
  for (const race of ['rewind', 'recreate-at-ancestor', 'advance', 'delete']) {
    const actorHead = race === 'advance' ? 'f'.repeat(40) : race === 'delete' ? null : A;
    const events = []; let api;
    api = service({ existing: B, beforeWrite: (current, select) => {
      assert.equal(current, B);
      assert.equal(api.calls.filter(call => call.endpoint.endsWith('/git/ref/heads/docs%2Fpublic-plan')).length, 2,
        'The competing actor acts after both observations, not at an initial stale read');
      if (race === 'recreate-at-ancestor') { select(null); events.push('deleted'); select(A); events.push('recreated'); }
      return actorHead;
    } });
    await assert.rejects(publish({ ...payload(), expectedHead: B }, api), /unverified/);
    assert.equal(api.head(), actorHead, 'The atomic server rejects stale input without replacing the actor-selected state');
    assert.equal(refWrites(api).length, 1); assert.equal(refWrites(api)[0].endpoint, 'graphql');
    assert.equal(api.calls.some(call => call.method === 'PATCH' || call.method === 'DELETE' || call.endpoint.endsWith('/pulls') && call.method === 'POST'), false);
    if (race === 'recreate-at-ancestor') assert.deepEqual(events, ['deleted', 'recreated']);
  }
});

test('new refs remain create-only when another actor creates the name at the write boundary', async () => {
  const api = service({ beforeWrite: () => A });
  await assert.rejects(publish(payload(), api), /unverified/); assert.equal(api.head(), A);
  assert.deepEqual(refWrites(api).map(call => call.method), ['POST']);
  assert.equal(api.calls.some(call => call.endpoint === 'graphql' || call.method === 'PATCH' || call.method === 'DELETE'), false);
});

test('lost ref/atomic-commit responses report uncertain publication and resume the same head without duplicate commits', async () => {
  for (const existing of [null, B]) {
    const plan = payload(), failed = service({ existing, lostWriteResponse: true });
    await assert.rejects(publish({ ...plan, ...(existing ? { expectedHead: existing } : {}) }, failed), new RegExp(`unverified.*observed at ${C}.*expectedHead=${C}`));
    assert.equal(failed.head(), C); assert.equal(failed.calls.some(call => call.endpoint.endsWith('/pulls') && call.method === 'POST'), false);
    assert.equal(failed.calls.some(call => call.method === 'DELETE'), false);
    const resumed = service({ existing: C, sameTree: true });
    assert.equal((await publish({ ...plan, expectedHead: C }, resumed)).head, C);
    assert.equal(refWrites(resumed).length, 0);
    assert.equal(resumed.calls.some(call => call.endpoint.endsWith('/git/commits') && call.method === 'POST'), false);
  }
});

test('post-publication ref movement reports the observed tip, not the stale candidate as the retained branch', async () => {
  const api = service({ existing: B, beforeRef: (calls, head) => calls.filter(call => call.endpoint.endsWith('/git/ref/heads/docs%2Fpublic-plan')).length >= 3 ? A : head });
  await assert.rejects(publish({ ...payload(), expectedHead: B }, api), new RegExp(`unverified.*observed at ${A}.*expectedHead=${A}.*Candidate commit ${C}`));
  assert.equal(api.head(), A); assert.equal(refWrites(api).length, 1);
});

test('GraphQL errors and missing commit identity never claim verified publication or fall back to PATCH', async () => {
  for (const flags of [{ mutationErrors: true }, { invalidMutation: true }]) {
    const api = service({ existing: B, ...flags });
    await assert.rejects(publish({ ...payload(), expectedHead: B }, api), /unverified/); assert.equal(api.head(), B);
    assert.equal(api.calls.some(call => call.method === 'PATCH' || call.method === 'DELETE' || call.endpoint.endsWith('/pulls') && call.method === 'POST'), false);
  }
});

test('partial PR publication preserves ref and retry discovers the same draft without another commit', async () => {
  const plan = payload(), failed = service({ failPull: true });
  await assert.rejects(publish(plan, failed), new RegExp(`observed at ${C}.*expectedHead=${C}`));
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

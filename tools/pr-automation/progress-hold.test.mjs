import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { inspectBodyProgress, parseLink, writeLink } from './pr-body.mjs';
import { reconcile, candidate } from './promote.mjs';
import { reconcileFinalization } from './finalize.mjs';
import { refreshReadyPullRequests } from './ready-pull-request-refresh.mjs';
import { reconcileDocumentation } from './docs-auto-merge.mjs';
import { checkDelivery } from './delivery.mjs';
import { inspectLocalBody } from './inspect-body.mjs';

const repository = 'example/project', head = 'a'.repeat(40), base = 'b'.repeat(40), finalized = 'c'.repeat(40);
const tasks = '- [x] Implement and cover the behavior.\n';
export const completeBody = `## Proposal\n\nImprove coverage and testing of [links](https://example.invalid).\n\n## Implementation\n\n- [x] Cover the changed behavior.\n\n## Acceptance\n\n- The focused testing path preserves coverage and links.\n\n## Automation\n\n<details>\n<summary>Link</summary>\n\n\`\`\`openspec-implementation\n{"version":1,"change":"fixture"}\n\`\`\`\n\n</details>\n`;
const pull = overrides => ({ number: 1, node_id: 'PR_fixture', state: 'open', draft: true, labels: [], body: completeBody,
  base: { ref: 'main', sha: base, repo: { full_name: repository } }, head: { ref: 'chore/fixture', sha: head, repo: { full_name: repository } }, ...overrides });
const cases = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url))).cases;
const fixture = id => { const value = cases.find(item => item.id === id); assert.ok(value); return value; };

test('C15/C16: one outcome, many outcomes, coverage/testing/links and lengthy meaningful prose are valid', () => {
  const one = fixture('C15'), many = fixture('C16');
  const single = inspectBodyProgress(completeBody, tasks);
  assert.deepEqual(inspectLocalBody({ body: completeBody, tasks }), single, 'local and trusted inspection share the body validator');
  assert.equal(single.status === 'complete', one.expect.accepted);
  assert.equal(single.reason?.includes('second') ?? false, one.expect.inventedOutcomeRequired);
  assert.equal(single.reason?.includes('testing') ?? false, one.expect.testingVocabularyRejected);
  const body = completeBody.replace('- [x] Cover the changed behavior.', Array.from({ length: many.given.meaningfulOutcomes }, (_, i) => `- [x] Deliver behavior ${i} with [coverage](https://example.invalid).`).join('\n'))
    .replace('- The focused testing path preserves coverage and links.', Array.from({ length: 12 }, (_, i) => `- Scenario ${i} retains testing/coverage evidence. ${'Meaningful linked notation remains supported. '.repeat(40)}`).join('\n'));
  const result = inspectBodyProgress(body, tasks);
  assert.equal(result.status !== 'complete', many.expect.styleOnlyRejection);
  assert.equal(result.reason?.includes('count') ?? false, many.expect.outcomeCountRejection);
});

test('malformed metadata, ambiguous headings/fences, missing tasks and unfinished outcomes still block', () => {
  for (const body of [completeBody.replace('"version":1', '"version":99'), completeBody + '\n## Implementation\n',
    completeBody + '\n```openspec-implementation\n{"version":1,"change":"fixture"}\n```\n',
    completeBody.replace('## Acceptance', '## Wrong'), completeBody.replace('- The focused', '- [x] The focused')]) {
    assert.equal(inspectBodyProgress(body, tasks).status, 'blocked');
  }
  assert.equal(inspectBodyProgress(completeBody, '').status, 'blocked');
  assert.equal(inspectBodyProgress(completeBody, '- [ ] Implement it.').status, 'blocked');
  assert.equal(inspectBodyProgress(completeBody.replace('[x]', '[ ]'), tasks).status, 'incomplete');
  assert.equal(parseLink('````text\n```openspec-implementation\n{"version":1,"change":"fixture"}\n```\n````').linked, false);
  assert.equal(parseLink('```openspec-implementation\n{}').error.includes('unterminated'), true);
  const example = completeBody.replace('## Proposal\n', '## Proposal\n\n```text\n## Acceptance\n- [ ] Example, not a real outcome.\n```\n');
  assert.equal(inspectBodyProgress(example, tasks).status, 'complete');
  assert.equal(inspectBodyProgress(completeBody.replace('## Acceptance', '<!-- hidden\n## Acceptance'), tasks).status, 'blocked');
  const notation = completeBody.replace('Improve coverage', 'Inline `<!--` and fenced examples are notation.\n\n```html\n<!--\n```\n\nImprove coverage');
  assert.equal(inspectBodyProgress(notation, tasks).status, 'complete');
});

test('C17/C20: malformed linkage or head races never call the trusted ready mutation', async () => {
  let mutations = 0, reads = 0;
  const options = { number: 1, repository, repo: '.', read: () => tasks, head: () => head, ready: () => { mutations++; } };
  const malformed = await reconcile({ ...options, get: () => pull({ body: completeBody.replace('"version":1', '"version":8') }) });
  const c17 = fixture('C17');
  assert.deepEqual({ promoted: malformed.status === 'promoted', finalizationWrites: mutations, blockerReported: malformed.status === 'blocked' }, c17.expect);
  const raced = await reconcile({ ...options, get: () => ++reads === 1 ? pull() : pull({ head: { ...pull().head, sha: finalized } }) });
  const c20 = fixture('C20');
  assert.deepEqual({ promoted: raced.status === 'promoted', staleSnapshotUsed: mutations > 0 }, c20.expect);
});

test('C21: hold pauses all four controllers, and a hold introduced immediately before mutation is respected', async () => {
  const expected = fixture('C21').expect, writes = { promotionWrites: 0, finalizationWrites: 0, automaticRefreshWrites: 0, automationOwnedMergeWrites: 0 };
  const held = pull({ labels: [{ name: 'delivery-hold' }] });
  await reconcile({ number: 1, repository, head: () => head, read: () => tasks, get: () => held, ready: () => { writes.promotionWrites++; } });
  await reconcileFinalization({ number: 1, repository, get: () => ({ ...held, draft: false }), head: () => head,
    finalize: () => { writes.finalizationWrites++; }, push: () => { writes.finalizationWrites++; }, update: () => { writes.finalizationWrites++; } });
  await refreshReadyPullRequests({ repository, request: async (path, options) => {
    if (options?.method) writes.automaticRefreshWrites++;
    return { body: path.includes('/pulls?') ? [{ number: 1 }] : { ...held, draft: false } };
  } });
  await reconcileDocumentation({ number: 1, repository, get: () => ({ ...held, draft: false, body: '', auto_merge: null }), readFiles: () => [{ filename: 'README.md' }], mutate: () => { writes.automationOwnedMergeWrites++; } });
  assert.deepEqual(writes, expected);
  let reads = 0;
  const result = await reconcile({ number: 1, repository, head: () => head, read: () => tasks,
    get: () => ++reads === 1 ? pull() : held, ready: () => { writes.promotionWrites++; } });
  assert.equal(result.status, 'skipped'); assert.deepEqual(writes, expected);
  assert.equal(checkDelivery({ body: '', labels: ['delivery-hold'], changed: [], headPaths: [] }).ok, false);
});

test('finalizer rechecks hold before archive, push and final-head body mutation', async () => {
  for (const at of [2, 3, 4]) {
    let reads = 0, localHead = head; const writes = [];
    const result = await reconcileFinalization({ repository, number: 1, head: () => localHead,
      get: () => pull({ draft: false, head: { ...pull().head, sha: reads >= 3 ? finalized : head }, labels: ++reads === at ? [{ name: 'delivery-hold' }] : [] }),
      finalize: () => { writes.push('archive'); localHead = finalized; return { status: 'finalized', commit: finalized, archive: 'openspec/changes/archive/2026-11-13-fixture' }; },
      push: () => writes.push('push'), update: () => writes.push('body') });
    assert.equal(result.status, 'skipped');
    assert.deepEqual(writes, at === 2 ? [] : at === 3 ? ['archive'] : ['archive', 'push']);
  }
});

test('refresh/docs re-read a newly introduced hold, and release evaluates the fresh candidate', async () => {
  let reads = 0, writes = 0;
  const options = { repository, request: async (path, options) => {
    if (options?.method) { writes++; return { status: 202 }; }
    if (path.includes('/pulls?')) return { body: [{ number: 1 }] };
    if (path.includes('/git/ref/')) return { body: { object: { sha: base } } };
    if (path.includes('/compare/')) return { body: { behind_by: 1 } };
    return { body: pull({ draft: false, labels: ++reads === 2 ? [{ name: 'delivery-hold' }] : [] }) };
  } };
  assert.equal((await refreshReadyPullRequests(options))[0].disposition, 'deferred'); assert.equal(writes, 0);
  reads = 2;
  assert.equal((await refreshReadyPullRequests(options))[0].disposition, 'updated'); assert.equal(writes, 1);
  reads = 0;
  assert.equal((await reconcileDocumentation({ number: 1, repository, get: () => pull({ draft: false, body: '', labels: ++reads === 2 ? [{ name: 'delivery-hold' }] : [] }),
    readFiles: () => [{ filename: 'README.md' }], mutate: () => { writes++; } })).status, 'deferred');
  assert.equal(writes, 1);
});

test('C22: released finalized draft uses current archive/history; no active artifacts or merge authority are recreated', async () => {
  const link = { version: 1, change: 'fixture', archive: 'openspec/changes/archive/2026-11-13-fixture', finalizedHead: finalized };
  const body = writeLink(completeBody, link); let reads = 0, ready = 0; const paths = [];
  const result = await reconcile({ number: 1, repository, head: () => head, get: () => { reads++; return pull({ body }); },
    read: path => { paths.push(path); return path === `${link.archive}/tasks.md` ? tasks : null; }, ancestor: ref => ref === finalized,
    ready: () => { ready++; } });
  assert.deepEqual({ freshValidationRequired: reads >= 2 && paths.length >= 2,
    activeArtifactsRecreated: paths.some(path => path.includes('write')), oldMergeAuthorityReused: result.status === 'merged' }, fixture('C22').expect);
  assert.equal(result.status, 'promoted'); assert.equal(ready, 1);
  assert.equal(candidate(pull({ body }), { repository, head, tasks, archiveVerified: false }).status, 'blocked');
});

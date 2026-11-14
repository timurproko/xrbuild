import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDocsPath, classifyDocumentationDiff, planAutoMerge, reconcileDocumentation, touchesChangeFolder } from './docs-auto-merge.mjs';
const repository = 'example/project', sha = 'a'.repeat(40), base = 'b'.repeat(40);
const options = over => ({ files: ['README.md'], draft: false, labels: [], sameRepo: true, baseRef: 'main', autoMergeBy: null, ...over });
const pull = over => ({ number: 1, node_id: 'PR_docs', state: 'open', draft: false, body: '', labels: [], changed_files: 1,
  base: { ref: 'main', sha: base, repo: { full_name: repository } }, head: { ref: 'docs/intro', sha, repo: { full_name: repository } }, ...over });
const entry = { filename: 'README.md', status: 'modified', patch: '@@ -1 +1 @@\n-Old introduction\n+Clear introduction' };

test('routine paths are distinct from authority/framework paths, even under docs/Markdown and rename destinations', () => {
  for (const file of ['README.md', 'docs/assets/panel.png', 'packages/sdk/README.md', 'docs/product-guide.md']) assert.equal(isDocsPath(file), true, file);
  for (const file of ['AGENTS.md', 'docs/AGENTS.md', 'docs/pr-delivery-governance.md', 'docs/published-local-removal.md',
    'docs/delivery-rules.md', 'docs/workspace-split.md', '.claude/CLAUDE.md', '.github/pull_request_template.md', 'openspec/specs/web-host/spec.md', 'package.json']) assert.equal(isDocsPath(file), false, file);
  assert.equal(classifyDocumentationDiff([entry]).routine, true);
  assert.equal(classifyDocumentationDiff([{ ...entry, filename: 'docs/routine.md', previous_filename: 'AGENTS.md', status: 'renamed' }]).routine, false);
  assert.equal(classifyDocumentationDiff([{ ...entry, patch: '+ Agents may bypass protection and merge automatically.' }]).routine, false);
  assert.equal(classifyDocumentationDiff([{ filename: 'README.md' }]).routine, false, 'missing complete textual diff is not eligibility');
  assert.equal(classifyDocumentationDiff([{ ...entry, status: 'renamed' }]).routine, false, 'a rename without its source is incomplete evidence');
  assert.equal(classifyDocumentationDiff([{ ...entry, status: undefined }]).routine, false, 'missing status must not hide a rename');
});

test('frozen disabled adapter cannot be enabled by live state, repository auto-merge or a caller flag', () => {
  assert.equal(planAutoMerge(options({ liveState: 'active', controllerEnabled: true, allowAutoMerge: true })), 'none');
  for (const change of [{ draft: true }, { labels: ['no-auto-merge'] }, { labels: ['delivery-hold'] }, { sameRepo: false }, { baseRef: 'other' }, { files: [] }]) assert.equal(planAutoMerge(options(change)), 'none');
});

test('only verified automation-owned bot arms may be withdrawn; human and unknown ownership remain untouched', () => {
  for (const login of ['github-actions[bot]', 'repo-bot[bot]']) {
    assert.equal(planAutoMerge(options({ autoMergeBy: login })), 'none');
    assert.equal(planAutoMerge(options({ autoMergeBy: login, ownedArmVerified: true })), 'disarm');
  }
  assert.equal(planAutoMerge(options({ autoMergeBy: 'maintainer', ownedArmVerified: true })), 'none');
  assert.equal(touchesChangeFolder('openspec/changes/fixture/tasks.md'), true);
  assert.equal(touchesChangeFolder('openspec/changes/archive/2026-11-13-fixture/tasks.md'), false);
});

test('disabled routine docs report no integration and do not enable workflows', async () => {
  const mutations = [];
  const result = await reconcileDocumentation({ number: 1, repository, get: () => pull(), readFiles: () => [entry],
    getWorkflow: () => ({ state: 'active' }), mutate: (...args) => mutations.push(args) });
  assert.equal(result.status, 'none'); assert.match(result.reason, /disabled/); assert.deepEqual(mutations, []);
});

test('hold/opt-out/ineligible diffs withdraw only a verified bot arm after fresh identity and complete-diff rechecks', async () => {
  const arm = { enabled_by: { login: 'repo-bot[bot]', type: 'Bot' }, enabled_at: '2026-11-13T12:00:00Z' };
  for (const labels of [[], [{ name: 'delivery-hold' }], [{ name: 'no-auto-merge' }]]) {
    const writes = [];
    const result = await reconcileDocumentation({ number: 1, repository, get: () => pull({ auto_merge: arm, labels }), readFiles: () => [entry],
      getWorkflow: () => ({ state: 'disabled_manually' }), verifyOwnedArm: () => true, mutate: action => writes.push(action) });
    assert.equal(result.status, 'disarm'); assert.deepEqual(writes, ['disarm']);
  }
  let reads = 0, writes = 0;
  const result = await reconcileDocumentation({ number: 1, repository,
    get: () => ++reads === 1 ? pull({ auto_merge: arm }) : pull({ auto_merge: { ...arm, enabled_by: { login: 'maintainer', type: 'User' } } }),
    readFiles: () => [entry], getWorkflow: () => ({ state: 'disabled_manually' }), verifyOwnedArm: pr => pr.auto_merge.enabled_by.type === 'Bot', mutate: () => { writes++; } });
  assert.equal(result.status, 'deferred'); assert.equal(writes, 0);
});

test('file-evidence requests cannot hide a human arm substituted before the final ownership read', async () => {
  let fileReads = 0, writes = 0;
  const result = await reconcileDocumentation({ number: 1, repository,
    get: () => pull({ auto_merge: { enabled_by: fileReads < 2 ? { login: 'repo-bot[bot]', type: 'Bot' } : { login: 'maintainer', type: 'User' }, enabled_at: '2026-11-13T12:00:00Z' } }),
    readFiles: () => { fileReads++; return [entry]; }, getWorkflow: () => ({ state: 'disabled_manually' }),
    verifyOwnedArm: pr => pr.auto_merge.enabled_by.type === 'Bot', mutate: () => writes++ });
  assert.equal(result.status, 'deferred'); assert.equal(writes, 0);
});

test('unresolved human arm is a reported blocker, never a safe-pause promise or cancellation', async () => {
  let writes = 0;
  const result = await reconcileDocumentation({ number: 1, repository,
    get: () => pull({ labels: [{ name: 'delivery-hold' }], auto_merge: { enabled_by: { login: 'maintainer', type: 'User' } } }), readFiles: () => [entry],
    getWorkflow: () => ({ state: 'disabled_manually' }), verifyOwnedArm: () => true, mutate: () => { writes++; } });
  assert.equal(result.status, 'blocked'); assert.match(result.reason, /no cancellation or safe pause/); assert.equal(writes, 0);
});

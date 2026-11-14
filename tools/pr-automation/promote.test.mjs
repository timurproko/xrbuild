import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkDelivery } from './delivery.mjs';
import { finalizeChange } from './finalize.mjs';
import { candidate, inspectProgress, reconcile, sameSnapshot } from './promote.mjs';

const repository = 'owner/project';
const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const tasks = '# Tasks\n- [x] first; verify unit tests\n- [x] second; verify integration test\n';
const body = `## Proposal\n\nImprove the delivery path.\n\n## Implementation\n\n- [x] Deliver one change.\n- [x] Preserve existing work.\n\n## Acceptance\n\n- Completed changes become ready.\n\n## Automation\n\n\`\`\`openspec-implementation\n{"version":1,"change":"sample-change"}\n\`\`\`\n`;
const pr = { number: 9, node_id: 'PR_test', state: 'open', draft: true, labels: [], body,
  base: { ref: 'main', sha: base, repo: { full_name: repository } },
  head: { ref: 'ci/sample-change', sha, repo: { full_name: repository } } };

test('completion needs valid structure, meaningful checked outcomes, plain acceptance and detailed tasks', () => {
  assert.deepEqual(inspectProgress(body, tasks), { status: 'complete' });
  const detailed = body.replace('- [x] Preserve existing work.', '- [x] Preserve existing work.\n- [x] Cover routing.\n- [x] Cover diagnostics.\n- [x] Cover empty states.\n- [x] Cover package setup.');
  assert.deepEqual(inspectProgress(detailed, tasks), { status: 'complete' }, 'two to five outcomes are recommended, not a hard maximum');
  assert.equal(inspectProgress(body.replace('[x] Preserve', '[ ] Preserve'), tasks).status, 'incomplete');
  assert.equal(inspectProgress(body, tasks.replace('[x] second', '[ ] second')).status, 'blocked');
  assert.equal(inspectProgress(body.replace('- Completed changes', '- Device-only inspection remains for the maintainer'), tasks).status, 'complete');
  assert.equal(inspectProgress(body, '').status, 'blocked');
  assert.equal(inspectProgress(body.replace('- Completed changes', '- [x] Completed changes'), tasks).status, 'blocked');
  assert.equal(inspectProgress(body.replace('## Acceptance', '## Other'), tasks).status, 'blocked');
});

test('only exact-head, same-repository linked implementation drafts are candidates', () => {
  assert.deepEqual(candidate(pr, { repository, head: sha, tasks }), { status: 'complete' });
  assert.equal(candidate(pr, { repository, head: base, tasks }).status, 'skipped');
  assert.equal(candidate({ ...pr, head: { ...pr.head, repo: { full_name: 'other/project' } } }, { repository, head: sha, tasks }).status, 'skipped');
  assert.equal(candidate({ ...pr, body: body.replace('[x]', 'x') }, { repository, head: sha, tasks }).status, 'blocked');
  assert.equal(candidate({ ...pr, body: body.replace('## Acceptance', '## More') }, { repository, head: sha, tasks }).status, 'blocked');
  assert.equal(candidate({ ...pr, body: body.replaceAll('[x]', '') }, { repository, head: sha, tasks }).status, 'skipped', 'legacy plain bullets are not auto-promoted');
  assert.equal(candidate({ ...pr, body: body.replace('"version":1', '"version":7') }, { repository, head: sha, tasks }).status, 'blocked');
  assert.equal(candidate(pr, { repository, head: sha, tasks: null }).status, 'blocked');
});

test('promotion rechecks head and body before the App mutation; incomplete never calls ready', async () => {
  let calls = 0;
  const opts = { number: 9, repository, repo: '.', head: () => sha, read: () => tasks, ready: () => { calls++; } };
  assert.equal((await reconcile({ ...opts, get: () => pr })).status, 'promoted');
  assert.equal(calls, 1);
  assert.equal((await reconcile({ ...opts, inspectOnly: true, get: () => pr })).status, 'complete');
  assert.equal(calls, 1, 'read-only inspection never mints or uses mutation authority');
  assert.equal((await reconcile({ ...opts, read: () => tasks.replace('[x] second', '[ ] second'), get: () => pr })).status, 'blocked');
  assert.equal(calls, 1);
  assert.equal((await reconcile({ ...opts, get: () => ({ ...pr, body: body.replace('[x] Preserve', '[ ] Preserve') }) })).status, 'incomplete');
  assert.equal(calls, 1);
  let requests = 0;
  assert.equal((await reconcile({ ...opts, get: () => ++requests === 1 ? pr : { ...pr, body: body + 'changed' } })).status, 'skipped');
  assert.equal(calls, 1);
  assert.equal(sameSnapshot(pr, { ...pr, head: { ...pr.head, sha: base } }), false);
});

test('a completed draft promotes, finalizes in its own branch, and Delivery accepts the resulting exact head', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'promote-flow-'));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const write = (file, text) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
  try {
    git('init', '--quiet', '-b', 'main');
    write('openspec/config.yaml', 'schema: spec-driven\n');
    write('openspec/specs/demo/spec.md', '# demo Specification\n\n## Purpose\n\nA demo capability that demonstrates the local finalization and delivery workflow.\n\n## Requirements\n\n### Requirement: Existing\nThe demo SHALL exist.\n\n#### Scenario: Exists\n- **WHEN** opened\n- **THEN** it exists\n');
    write('openspec/changes/sample-change/proposal.md', '## Why\n\nThe demo needs an addition.\n\n## What Changes\n\n- Add a thing.\n');
    write('openspec/changes/sample-change/tasks.md', tasks);
    write('openspec/changes/sample-change/specs/demo/spec.md', '## ADDED Requirements\n\n### Requirement: Thing\nThe demo SHALL have a thing.\n\n#### Scenario: Thing\n- **WHEN** opened\n- **THEN** the thing is shown\n');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '-m', 'implementation');
    const head = git('rev-parse', 'HEAD');
    const pull = { ...pr, head: { ...pr.head, sha: head } };
    const promoted = await reconcile({ number: 9, repository, repo, head: () => git('rev-parse', 'HEAD'),
      get: () => pull, read: (ref) => git('show', `HEAD:${ref}`), ready: () => {} });
    assert.equal(promoted.status, 'promoted');
    const result = finalizeChange({ repo, change: 'sample-change', author: 'test-bot[bot] <test@example.invalid>' });
    assert.equal(result.status, 'finalized');
    assert.notEqual(result.commit, head);
    const paths = git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'openspec/changes').split('\n');
    const verdict = checkDelivery({ body, labels: [], headPaths: paths, changed: paths,
      read: ref => git('show', `HEAD:${ref}`), ancestor: ref => { try { git('merge-base', '--is-ancestor', ref, 'HEAD'); return true; } catch { return false; } } });
    assert.deepEqual(verdict.problems, []);
    assert.equal(verdict.ok, true);
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    assert.match(ci, /name: CI required/);
    assert.match(ci, /needs: \[readiness, changes, names, openspec, delivery, node, embedded, native\]/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('workflow consumes only the base script, checks exact head and does not grant merge permission', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/openspec-finalization.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node base\/tools\/pr-automation\/promote\.mjs --repo head/);
  assert.match(workflow, /ref: \$\{\{ steps\.candidate\.outputs\.head \}\}/);
  assert.match(workflow, /--jq \.head\.sha/);
  assert.ok(workflow.indexOf('id: inspect') < workflow.indexOf('id: bot'));
  assert.match(workflow, /--inspect/);
  assert.match(workflow, /steps\.inspect\.outputs\.status == 'complete'/);
  assert.match(workflow, /--ignore-scripts/);
  assert.match(workflow, /types: \[opened, ready_for_review, synchronize, reopened, edited, converted_to_draft, labeled, unlabeled\]/);
  assert.match(workflow, /!github\.event\.pull_request\.draft/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /gh pr merge|enablePullRequestAutoMerge/);
});

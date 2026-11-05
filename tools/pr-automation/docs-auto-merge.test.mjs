import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPT_OUT_LABEL, isDocsPath, planAutoMerge, touchesChangeFolder } from './docs-auto-merge.mjs';

const pr = (over = {}) => ({ files: ['README.md'], draft: false, labels: [], sameRepo: true, baseRef: 'main', autoMergeBy: null, ...over });

test('docs are docs/, openspec/ and Markdown outside agent and CI configuration', () => {
  for (const f of ['README.md', 'docs/assets/panel.png', 'openspec/specs/web-host/spec.md', 'packages/sdk/README.md', 'third_party/README.md']) {
    assert.ok(isDocsPath(f), f);
  }
  for (const f of ['.claude/CLAUDE.md', '.github/pull_request_template.md', 'packages/sdk/src/index.ts', 'package.json', 'docs.ts']) {
    assert.ok(!isDocsPath(f), f);
  }
});

test('a ready docs-only PR to main is armed, once', () => {
  assert.equal(planAutoMerge(pr({ files: ['README.md', 'openspec/changes/x/proposal.md'] })), 'arm');
  assert.equal(planAutoMerge(pr({ autoMergeBy: 'github-actions[bot]' })), 'none');
});

test('drafts, the opt-out label, forks, other bases and empty PRs are not armed', () => {
  assert.equal(planAutoMerge(pr({ draft: true })), 'none');
  assert.equal(planAutoMerge(pr({ labels: [OPT_OUT_LABEL] })), 'none');
  assert.equal(planAutoMerge(pr({ sameRepo: false })), 'none');
  assert.equal(planAutoMerge(pr({ baseRef: 'release' })), 'none');
  assert.equal(planAutoMerge(pr({ files: [] })), 'none');
});

test('one non-docs file (a rename source counts) makes the PR ineligible', () => {
  assert.equal(planAutoMerge(pr({ files: ['README.md', 'packages/sdk/src/index.ts'] })), 'none');
  assert.equal(planAutoMerge(pr({ files: ['docs/guide.md', 'tools/guide.mjs'] })), 'none');
});

test('a PR that links a change or edits an active change folder is never armed', () => {
  assert.equal(planAutoMerge(pr({ files: ['openspec/changes/x/proposal.md'], linksChange: true })), 'none');
  assert.equal(planAutoMerge(pr({ files: ['openspec/changes/x/proposal.md'], touchesChange: true })), 'none');
  assert.equal(planAutoMerge(pr({ linksChange: true, autoMergeBy: 'github-actions[bot]' })), 'disarm');
  assert.ok(touchesChangeFolder('openspec/changes/x/tasks.md'));
  assert.ok(!touchesChangeFolder('openspec/changes/archive/2026-10-11-x/tasks.md'));
  assert.ok(!touchesChangeFolder('openspec/specs/web-host/spec.md'));
});

test('auto-merge the App armed is removed when the PR stops qualifying', () => {
  process.env.BOT_LOGIN = 'repo-bot[bot]';
  try {
    assert.equal(planAutoMerge(pr({ files: ['package.json'], autoMergeBy: 'repo-bot[bot]' })), 'disarm');
  } finally {
    delete process.env.BOT_LOGIN;
  }
  assert.equal(planAutoMerge(pr({ files: ['package.json'], autoMergeBy: 'repo-bot[bot]' })), 'none', 'an unknown login counts as a person');
});

test('auto-merge the bot armed is removed when the PR stops qualifying; a person\'s is kept', () => {
  const code = ['packages/sdk/src/index.ts'];
  assert.equal(planAutoMerge(pr({ files: code, autoMergeBy: 'github-actions[bot]' })), 'disarm');
  assert.equal(planAutoMerge(pr({ draft: true, autoMergeBy: 'github-actions[bot]' })), 'disarm');
  assert.equal(planAutoMerge(pr({ labels: [OPT_OUT_LABEL], autoMergeBy: 'github-actions[bot]' })), 'disarm');
  assert.equal(planAutoMerge(pr({ files: code, autoMergeBy: 'maintainer' })), 'none');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnarchived, issueBody, planIssue } from './reconcile.mjs';

const linked = (number, change) => ({ number, body: `\`\`\`openspec-implementation\n{"version":1,"change":"${change}"}\n\`\`\`` });

test('only active changes a merged PR links are listed', () => {
  const list = findUnarchived({
    active: new Set(['missed', 'planned', 'twice']),
    mergedPrs: [linked(7, 'missed'), linked(9, 'twice'), linked(4, 'twice'), linked(3, 'archived-ok'), { number: 5, body: 'no link' }],
  });
  assert.deepEqual(list, [{ change: 'missed', prs: [7] }, { change: 'twice', prs: [4, 9] }]);
});

test('the issue is created, updated in place, left alone when unchanged and closed when clean', () => {
  const list = [{ change: 'missed', prs: [7] }];
  const body = issueBody(list);
  assert.match(body, /`openspec\/changes\/missed\/`, merged in #7/);
  assert.deepEqual(planIssue({ list, issue: null }), { action: 'create', body });
  assert.deepEqual(planIssue({ list, issue: { number: 1, body: 'old' } }), { action: 'update', body });
  assert.deepEqual(planIssue({ list, issue: { number: 1, body } }), { action: 'none' });
  assert.deepEqual(planIssue({ list: [], issue: { number: 1, body } }), { action: 'close' });
  assert.deepEqual(planIssue({ list: [], issue: null }), { action: 'none' });
});

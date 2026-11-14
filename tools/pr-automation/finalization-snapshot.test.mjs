import assert from 'node:assert/strict';
import test from 'node:test';
import { sameFinalizationSnapshot } from './finalize.mjs';
const original = { number: 1, node_id: 'PR_fixture', state: 'open', draft: false, labels: [], body: 'human text',
  base: { ref: 'main', sha: 'b'.repeat(40), repo: { full_name: 'owner/project' } },
  head: { ref: 'chore/task', sha: 'a'.repeat(40), repo: { full_name: 'owner/project' } } };

test('publishing requires the exact same PR snapshot before push and final-head body update', () => {
  assert.equal(sameFinalizationSnapshot(original, structuredClone(original)), true);
  for (const mutate of [p => p.body += 'new human edit', p => p.state = 'closed', p => p.draft = true,
    p => p.head.sha = 'c'.repeat(40), p => p.base.sha = 'd'.repeat(40), p => p.head.repo.full_name = 'foreign/project', p => p.node_id = 'other']) {
    const changed = structuredClone(original); mutate(changed); assert.equal(sameFinalizationSnapshot(original, changed), false);
  }
  const pushed = structuredClone(original); pushed.head.sha = 'c'.repeat(40);
  assert.equal(sameFinalizationSnapshot(original, pushed, pushed.head.sha), true);
  pushed.body = 'concurrent text'; assert.equal(sameFinalizationSnapshot(original, pushed, pushed.head.sha), false);
});

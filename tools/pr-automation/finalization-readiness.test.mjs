import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileFinalization } from './finalize.mjs';
import { parseLink, writeLink } from './pr-body.mjs';

const repository = 'example/project', H = 'a'.repeat(40), B = 'b'.repeat(40), F = 'c'.repeat(40);
const archive = 'openspec/changes/archive/2026-11-14-sample';
const tasks = '- [x] Implement and test the behavior.\n';
const body = '## Proposal\n\nPreserve completed work.\n\n## Implementation\n\n- [x] Deliver the behavior.\n\n## Acceptance\n\n- The changed behavior preserves existing work.\n\n## Automation\n\n```openspec-implementation\n{"version":1,"change":"sample"}\n```\n';
function fixture({ text = body, detailed = tasks, already = false } = {}) {
  let localHead = H, remoteHead = H;
  const writes = [], taskReads = []; let finalizeCalls = 0, gets = 0;
  const pull = () => ({ number: 19, node_id: 'PR_sample', state: 'open', draft: false, labels: [], body: text,
    base: { ref: 'main', sha: B, repo: { full_name: repository } },
    head: { ref: 'chore/sample', sha: remoteHead, repo: { full_name: repository } } });
  const options = { repository, number: 19, get: () => { gets++; return pull(); }, head: () => localHead,
    readTasks: link => { taskReads.push(structuredClone(link)); return detailed; },
    finalize: () => { finalizeCalls++; if (already) return { status: 'already', archive };
      writes.push('archive'); localHead = F; return { status: 'finalized', archive, commit: F }; },
    push: (ref, sha) => { assert.equal(ref, 'chore/sample'); assert.equal(sha, F); writes.push('push'); remoteHead = F; },
    update: updated => { writes.push('body'); text = updated; },
  };
  return { options, writes, taskReads, pull, gets: () => gets, finalizeCalls: () => finalizeCalls };
}
const invalidBodies = [
  body.replace('[x]', '[ ]'),
  body.replace('## Acceptance\n\n- The changed behavior preserves existing work.\n\n', ''),
  body.replace('[x]', '[ ]').replace('## Acceptance\n\n- The changed behavior preserves existing work.\n\n', ''),
  body.replace('- The changed behavior', '- [x] The changed behavior'),
];

test('manually readied incomplete/invalid candidates never archive, push or update their body despite completed tasks', async () => {
  for (const text of invalidBodies) {
    const f = fixture({ text }); const result = await reconcileFinalization(f.options);
    assert.equal(result.status, 'blocked'); assert.ok(result.reason);
    assert.equal(f.finalizeCalls(), 0); assert.deepEqual(f.writes, []);
  }
});

test('already-ready candidates edited back to incomplete are validated anew, including archived repair', async () => {
  for (const already of [false, true]) for (const text of invalidBodies) {
    const link = { version: 1, change: 'sample', archive, finalizedHead: H };
    const f = fixture({ text: already ? writeLink(text, link) : text, already });
    const result = await reconcileFinalization(f.options);
    assert.equal(result.status, 'blocked'); assert.equal(f.finalizeCalls(), 0); assert.deepEqual(f.writes, []);
  }
});

test('missing/open tasks and unavailable archive/history evidence block even a complete body', async () => {
  for (const detailed of [null, '', '- [ ] Still unfinished.\n']) {
    const f = fixture({ detailed }); const result = await reconcileFinalization(f.options);
    assert.equal(result.status, 'blocked'); assert.equal(f.finalizeCalls(), 0); assert.deepEqual(f.writes, []);
  }
  const f = fixture({ already: true }); f.options.readTasks = () => { throw new Error('Unverified archive/history'); };
  assert.match((await reconcileFinalization(f.options)).reason, /Unverified archive/); assert.deepEqual(f.writes, []);
  delete f.options.readTasks;
  assert.equal((await reconcileFinalization(f.options)).status, 'blocked'); assert.equal(f.finalizeCalls(), 0);
});

test('body or tasks edited after initial validation prevent all archive/publication mutations', async () => {
  for (const kind of ['body', 'tasks']) {
    const f = fixture(); let reads = 0;
    if (kind === 'body') f.options.get = () => { const pr = f.pull(); if (++reads > 1) pr.body = pr.body.replace('[x]', '[ ]'); return pr; };
    else f.options.readTasks = () => ++reads === 1 ? tasks : '- [ ] Reopened task.\n';
    const result = await reconcileFinalization(f.options);
    assert.equal(result.status, 'skipped'); assert.equal(f.finalizeCalls(), 0); assert.deepEqual(f.writes, []);
  }
});

test('valid current readiness finalizes and uses archived tasks for exact-head publication checks', async () => {
  const f = fixture(); const result = await reconcileFinalization(f.options);
  assert.equal(result.status, 'finalized'); assert.deepEqual(f.writes, ['archive', 'push', 'body']);
  assert.ok(f.taskReads.slice(2).every(link => link.archive === archive && link.finalizedHead === F));
  assert.deepEqual(parseLink(f.pull().body).link, { version: 1, change: 'sample', archive, finalizedHead: F });
});

test('valid already-finalized repair reads archived tasks and only repairs metadata; invalid repair writes nothing', async () => {
  const f = fixture({ already: true }); const result = await reconcileFinalization(f.options);
  assert.equal(result.status, 'already'); assert.deepEqual(f.writes, ['body']);
  assert.equal(f.taskReads.at(-1).archive, archive);
  const invalid = fixture({ already: true, text: invalidBodies[0] });
  assert.equal((await reconcileFinalization(invalid.options)).status, 'blocked'); assert.deepEqual(invalid.writes, []);
});

test('fresh body/hold/local-head changes still block already-finalized body repair', async () => {
  for (const kind of ['body', 'hold', 'head']) {
    const f = fixture({ already: true }); let reads = 0;
    if (kind === 'head') f.options.head = () => ++reads <= 2 ? H : F;
    else f.options.get = () => { const pr = f.pull(); if (++reads > 2) {
      if (kind === 'body') pr.body = pr.body.replace('[x]', '[ ]'); else pr.labels = [{ name: 'delivery-hold' }];
    } return pr; };
    assert.equal((await reconcileFinalization(f.options)).status, 'skipped'); assert.deepEqual(f.writes, []);
  }
});

test('changed archived tasks after local finalization prevent push, rather than publishing invalid completion', async () => {
  const f = fixture(); f.options.readTasks = link => link.archive ? '- [ ] Reopened task.\n' : tasks;
  assert.equal((await reconcileFinalization(f.options)).status, 'skipped'); assert.deepEqual(f.writes, ['archive']);
});

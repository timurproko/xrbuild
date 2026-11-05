import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IN_PROGRESS_LABEL, changesInTree, checkDelivery } from './delivery.mjs';

const link = (change) => `## Automation\n\n\`\`\`openspec-implementation\n{"version":1,"change":"${change}"}\n\`\`\`\n`;
const active = (name) => [`openspec/changes/${name}/proposal.md`, `openspec/changes/${name}/tasks.md`];
const archived = (name) => [`openspec/changes/archive/2026-10-11-${name}/proposal.md`];
const run = (over) => checkDelivery({ body: '', labels: [], changed: [], headPaths: [], ...over });

test('the tree gives active and archived change names', () => {
  const { active: a, archived: z } = changesInTree([...active('x'), ...archived('y'), 'openspec/changes/archive/notes.md', 'openspec/specs/s/spec.md']);
  assert.deepEqual([...a], ['x']);
  assert.deepEqual([...z], ['y']);
});

test('a PR that links nothing and touches no change passes', () => {
  assert.deepEqual(run({ changed: ['packages/sdk/src/index.ts'], headPaths: active('planned') }), { ok: true, problems: [], notes: [] });
});

test('a linked change still active is awaiting finalization', () => {
  const v = run({ body: link('x'), changed: [...active('x'), 'tools/a.mjs'], headPaths: active('x') });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /^awaiting finalization: openspec\/changes\/x\//);
  assert.equal(v.problems.length, 1, 'the linked change is not also reported as an undelivered edit');
});

test('a linked change archived at the head passes, whatever commits came after', () => {
  const v = run({ body: link('x'), changed: [...active('x'), ...archived('x'), 'openspec/specs/s/spec.md', 'tools/a.mjs'], headPaths: archived('x') });
  assert.equal(v.ok, true);
  assert.deepEqual(v.notes, ['change "x" is finalized']);
});

test('a linked change that does not exist fails', () => {
  assert.match(run({ body: link('nope'), headPaths: active('x') }).problems[0], /neither active nor archived/);
});

test('a malformed block fails with the parser\'s reason', () => {
  const v = run({ body: '```openspec-implementation\n{"version":3,"change":"x"}\n```' });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /version 3/);
});

test('editing an active change folder without delivering it fails, unless the PR is labelled in progress', () => {
  const plan = { changed: active('y'), headPaths: [...active('y')] };
  const v = run(plan);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /changes openspec\/changes\/y\/ without delivering it/);
  const labelled = run({ ...plan, labels: [IN_PROGRESS_LABEL] });
  assert.equal(labelled.ok, true);
  assert.match(labelled.notes[0], /allowed by the openspec-in-progress label/);
});

test('a linked, finalized PR that also edits another active change still needs the label', () => {
  const v = run({ body: link('x'), changed: [...archived('x'), ...active('y')], headPaths: [...archived('x'), ...active('y')] });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /openspec\/changes\/y\//);
});

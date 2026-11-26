import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactUpdateResult } from '../src/update-result.ts';
import { UpdateFailure, type RepoOutcome, type UpdateResult } from '../src/update.ts';
import { JobFailure, JobRunner } from '../src/jobs.ts';
import { rebuildPresentation } from '../ui/rebuild-dialog.js';

const repo = (role: 'core' | 'workspace', extra: Partial<RepoOutcome> = {}): RepoOutcome => ({ role, roles: [role], dir: `/fixture/${role}`,
  state: 'updated', from: '1234567'.padEnd(40, 'a'), to: 'abcdef0'.padEnd(40, 'b'), commits: 1, fetched: true, defaultBranch: 'main',
  updateFrom: '1234567'.padEnd(40, 'a'), pending: false, marker: null, error: null, step: null, ...extra });

for (const restart of [false, true]) test(`compact success result with restart=${restart}`, () => {
  const repositories = [repo('core'), repo('workspace', { state: 'up-to-date' })];
  const result = compactUpdateResult(repositories, [], restart);
  assert.equal(result.title, restart ? 'Updated, restart needed' : 'Updated');
  assert.deepEqual(result.repositoryLines, ['Core: 1234567 → abcdef0.', 'Workspace: already up to date.']);
  assert.equal(result.summary.split('\n').length, restart ? 3 : 2);
  assert.doesNotMatch(result.summary, /[0-9a-f]{40}/);
});

test('partial result identifies the successful source, blocking paths and only genuine pending steps', () => {
  const repositories = [repo('core'), repo('workspace', { state: 'failed', error: 'Pull: Workspace: Incoming source changes would overwrite local work in "plugins/tracker/src/main.cpp"; preserve or reconcile that file and retry Update.' })];
  const result = compactUpdateResult(repositories, [{ id: 'workspace-build', label: 'Workspace plugins', state: 'deferred', reason: 'workspace source needs attention' }], true);
  assert.equal(result.title, 'Core updated; workspace needs attention');
  assert.match(result.repositoryLines[1]!, /plugins\/tracker\/src\/main.cpp/);
  assert.match(result.nextAction, /Workspace plugins/); assert.match(result.nextAction, /Restart/);
  assert.equal(result.summary.split('\n').length, 3);
  const shown = rebuildPresentation({ id: 1, kind: 'update', state: 'failed', result: { ...result, restartRequired: true, repositories }, lines: ['full detailed output'] });
  assert.equal(shown.title, result.title); assert.equal(shown.outputHidden, true); assert.equal(shown.output, '');
  assert.equal(shown.succeeded, false); assert.equal(shown.viewJobDisabled, false);
});

test('retained personal defaults are a success with one inspection/adoption line, not an attention result', () => {
  const repositories = [repo('core', { state: 'up-to-date' }), repo('workspace', { retained: ['xrb-plugins.json', 'pnpm-lock.yaml', 'projects/Unsorted/demo/app.txt'] })];
  const result = compactUpdateResult(repositories, [], false);
  assert.equal(result.title, 'Updated'); assert.match(result.repositoryLines[1]!, /kept local.*upstream defaults skipped/);
  assert.match(result.nextAction, /git show REV:PATH/); assert.match(result.nextAction, /explicitly adopt/);
  assert.equal(result.summary.split('\n').length, 3);
});

test('new UI renders old-server repository outcomes without its repeated full-hash paragraph', () => {
  const repositories = [repo('core'), repo('workspace', { state: 'failed', error: 'Pull: Workspace: Source conflict in a.txt; preserve it and retry Update.' })];
  const shown = rebuildPresentation({ id: 2, kind: 'update', state: 'failed', result: { repositories, restartRequired: true, summary: 'old duplicated full-hash summary' }, lines: ['old summary'] });
  assert.match(shown.message, /Core: 1234567 → abcdef0/); assert.doesNotMatch(shown.message, /full-hash summary|[0-9a-f]{40}/);
  assert.equal(shown.message.split('\n').length, 3); assert.equal(shown.outputHidden, true);
});

test('Update owns one terminal output record while unrelated JobFailure behavior remains unchanged', async () => {
  const repositories = [repo('core'), repo('workspace', { state: 'failed' })];
  const presentation = compactUpdateResult(repositories, [], true);
  const result: UpdateResult = { ...presentation, state: 'failed', repositories, steps: [], coreDependencies: 'unchanged', rebuilt: [],
    restartRequired: true, lastLine: 'Restart required: Update did not restart the panel.' };
  const jobs = new JobRunner();
  const job = jobs.start('update', null, 'update', async ctx => {
    ctx.line(`Update result: ${result.title}`);
    ctx.line(`Core: ${repositories[0]!.from} → ${repositories[0]!.to}`);
    ctx.line(result.lastLine); throw new UpdateFailure(result);
  });
  await jobs.wait(job);
  assert.equal(job.error, result.title); assert.equal(job.lines.length, 3); assert.equal(job.lines.at(-1), result.lastLine);
  assert.equal(job.lines.filter(line => line.startsWith('Core:')).length, 1);
  const other = jobs.start('host-rebuild', null, 'rebuild', async () => { throw new JobFailure('compile failed', {}, 'Retry Rebuild.'); });
  await jobs.wait(other);
  assert.deepEqual(other.lines, ['FAILED: compile failed', 'Retry Rebuild.']);
});

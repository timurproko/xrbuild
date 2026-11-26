import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { finishUpdateWork, type BuildScope, type FollowupDeps } from '../src/update-followup.ts';
import type { RepoOutcome } from '../src/update.ts';

async function setup(t: TestContext) {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'xrb-followup-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repos: RepoOutcome[] = [];
  for (const role of ['core', 'workspace'] as const) {
    const dir = path.join(root, role); await fs.mkdir(path.join(dir, '.git'), { recursive: true });
    const marker = path.join(dir, '.git', 'pending'); await fs.writeFile(marker, '{}');
    repos.push({ role, roles: [role], dir, state: 'updated', from: 'a'.repeat(40), to: 'b'.repeat(40), updateFrom: 'a'.repeat(40),
      pending: true, marker, commits: 1, fetched: true, defaultBranch: 'main', error: null, step: null });
  }
  const calls: string[] = [], lines: string[] = [];
  const ctx = { line: (line: string) => lines.push(line), async run() { assert.fail('unexpected process'); } };
  const deps: FollowupDeps = {
    git: async args => ({ code: 0, output: `.git/${args.at(-1)}` }),
    prepareCore: async () => { calls.push('dependencies'); return 'prepared'; },
    prepareComponents: async () => { calls.push('components'); },
    build: async (scope: BuildScope) => { calls.push(scope); return [scope]; },
  };
  return { repos, calls, lines, ctx, deps };
}

test('workspace source refusal does not defer core dependencies, components or core builds', async t => {
  const f = await setup(t); f.repos[1]!.state = 'failed'; f.repos[1]!.pending = false;
  const result = await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, ['dependencies', 'components', 'core']);
  assert.equal(result.coreDependencies, 'prepared'); assert.equal(f.repos[0]!.pending, false);
  assert.equal(result.steps.find(step => step.id === 'workspace-build')!.state, 'deferred');
  assert.match(result.steps.find(step => step.id === 'workspace-build')!.reason!, /workspace source/);
  // When the workspace is repaired, the completed independent core build is reused.
  f.repos[1]!.state = 'updated'; f.repos[1]!.pending = true; f.calls.length = 0;
  await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, ['components', 'workspace']); assert.ok(f.repos.every(repo => !repo.pending));
});

test('core source refusal leaves workspace advancement intact but defers builds consuming its SDK', async t => {
  const f = await setup(t); f.repos[0]!.state = 'failed'; f.repos[0]!.pending = false;
  const result = await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, []); assert.equal(f.repos[1]!.pending, true);
  assert.equal(result.coreDependencies, 'deferred'); assert.ok(result.steps.every(step => step.state === 'deferred'));
});

test('all-good update uses one combined native boundary and clears completed markers', async t => {
  const f = await setup(t);
  const result = await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, ['dependencies', 'components', 'all']); assert.deepEqual(result.rebuilt, ['all']);
  assert.ok(f.repos.every(repo => !repo.pending));
  for (const repo of f.repos) assert.equal(await fs.stat(repo.marker!).then(() => true, () => false), false);
});

test('component failure does not hold back independent native work, and retry retains only unfinished preparation', async t => {
  const f = await setup(t); let fail = true;
  f.deps.prepareComponents = async () => { f.calls.push('components'); if (fail) throw new Error('component download failed'); };
  const first = await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, ['dependencies', 'components', 'all']);
  assert.equal(first.steps.find(step => step.id === 'components')!.state, 'failed');
  assert.equal(f.repos[0]!.pending, true); assert.equal(f.repos[1]!.pending, false);
  fail = false; f.calls.length = 0;
  await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.deepEqual(f.calls, ['dependencies', 'components']); assert.ok(f.repos.every(repo => !repo.pending));
});

test('dependency failure names actual dependents and preserves retry markers', async t => {
  const f = await setup(t); f.deps.prepareCore = async () => { throw new Error('frozen lock mismatch'); };
  const result = await finishUpdateWork(f.repos, f.ctx, f.deps);
  assert.equal(result.coreDependencies, 'failed'); assert.deepEqual(f.calls, []);
  assert.match(result.steps[0]!.reason!, /frozen lock/); assert.ok(f.repos.every(repo => repo.pending));
  assert.ok(result.steps.slice(1).every(step => step.state === 'deferred' && step.reason));
});

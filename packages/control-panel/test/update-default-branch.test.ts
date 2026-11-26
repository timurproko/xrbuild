import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fastForward, runGit, UpdateError, type GitRunner } from '../src/update.ts';
import { ENV, fixture, git, snapshot } from './helpers/update-fixture.ts';

const options = { role: 'core' as const, lfs: 'optional' as const, marker: 'xrb-test-update' };
const hasLfs = (await runGit(['lfs', 'version'], process.cwd())).code === 0;

test('real LFS exclusions remain pointers while included files hydrate', { skip: !hasLfs && 'Git LFS unavailable' }, async t => {
  const f = await fixture(t);
  git(f.core.publisher, 'lfs', 'install', '--local'); git(f.core.publisher, 'lfs', 'track', '*.bin');
  await f.core.publish('a.bin', 'included content\n'); await f.core.publish('b.bin', 'excluded content\n');
  git(f.core.checkout, 'config', 'lfs.fetchexclude', 'b.bin');
  const real: GitRunner = (args, cwd, opts) => runGit(args, cwd, { ...opts, env: { ...ENV, ...opts?.env } });
  await fastForward(f.core.checkout, f.ctx, { ...options, git: real });
  assert.equal(await fs.readFile(path.join(f.core.checkout, 'a.bin'), 'utf8'), 'included content\n');
  assert.match(await fs.readFile(path.join(f.core.checkout, 'b.bin'), 'utf8'), /^version https:\/\/git-lfs.github.com\/spec\/v1/);
});

test('fresh default fetch advances stale core refs, including non-main defaults and narrow refspecs', async t => {
  for (const branch of ['main', 'stable']) await t.test(branch, async t => {
    const f = await fixture(t, branch), before = f.core.head();
    const target = await f.core.publish();
    assert.equal(git(f.core.checkout, 'rev-parse', `origin/${branch}`), before);
    git(f.core.checkout, 'config', 'remote.origin.fetch', '+refs/heads/unused:refs/remotes/origin/unused');
    const result = await fastForward(f.core.checkout, f.ctx, { ...options, git: f.runner });
    assert.equal(result.before, before); assert.equal(result.to, target); assert.equal(f.core.head(), target);
    assert.equal(result.defaultBranch, branch); assert.equal(result.fetched, true);
    assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 1);
    assert.ok(f.calls.some(call => call.args.includes(`refs/heads/${branch}:refs/remotes/origin/${branch}`)));
  });
});

test('default rename is discovered despite stale origin HEAD and removed upstream', async t => {
  const f = await fixture(t, 'develop');
  git(f.core.publisher, 'push', '-q', 'origin', 'HEAD:main');
  git(f.core.remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(f.core.publisher, 'push', '-q', 'origin', '--delete', 'develop');
  const before = await snapshot(f.core.checkout);
  await assert.rejects(fastForward(f.core.checkout, f.ctx, { ...options, git: f.runner }), error => {
    assert.ok(error instanceof UpdateError); assert.equal(error.defaultBranch, 'main');
    assert.match(error.message, /removed or non-default upstream.*switch safely to main/); return true;
  });
  assert.deepEqual(await snapshot(f.core.checkout), before);
});

for (const state of ['unstaged', 'staged', 'untracked', 'deleted', 'detached', 'no-upstream', 'other-upstream', 'other-remote', 'ahead', 'diverged']) {
  test(`unsafe ${state} refuses without changing HEAD, branch, index or files`, async t => {
    const f = await fixture(t);
    if (state !== 'ahead') await f.core.publish('other.txt');
    if (state === 'unstaged' || state === 'staged') {
      await fs.writeFile(path.join(f.core.checkout, 'shared.txt'), 'local\n');
      if (state === 'staged') git(f.core.checkout, 'add', '.');
    }
    if (state === 'untracked') await fs.writeFile(path.join(f.core.checkout, 'new.txt'), 'local\n');
    if (state === 'deleted') await fs.rm(path.join(f.core.checkout, 'other.txt'));
    if (state === 'detached') git(f.core.checkout, 'checkout', '-q', '--detach');
    if (state === 'no-upstream') git(f.core.checkout, 'branch', '--unset-upstream');
    if (state === 'other-upstream') git(f.core.checkout, 'config', 'branch.main.merge', 'refs/heads/other');
    if (state === 'other-remote') git(f.core.checkout, 'config', 'branch.main.remote', 'elsewhere');
    if (state === 'ahead' || state === 'diverged') {
      await fs.writeFile(path.join(f.core.checkout, 'shared.txt'), 'local commit\n');
      git(f.core.checkout, 'commit', '-qam', 'local');
    }
    const before = await snapshot(f.core.checkout);
    await assert.rejects(fastForward(f.core.checkout, f.ctx, { ...options, git: f.runner }), /retry.*Update/);
    assert.deepEqual(await snapshot(f.core.checkout), before);
    assert.ok(!f.calls.some(({ args }) => args.includes('merge') || ['reset', 'stash', 'checkout', 'switch'].includes(args[0]!)));
  });
}

test('failed discovery/fetch and invalid remote HEAD never become up-to-date', async t => {
  for (const state of ['discovery', 'fetch', 'missing-default', 'invalid-count']) await t.test(state, async t => {
    const f = await fixture(t), before = await snapshot(f.core.checkout);
    if (state === 'missing-default') git(f.core.remote, 'symbolic-ref', 'HEAD', 'refs/heads/missing');
    const runner: GitRunner = (args, cwd, opts) => {
      if (args[0] === (state === 'discovery' ? 'ls-remote' : state === 'fetch' ? 'fetch' : 'unused')) return Promise.resolve({ code: 1, output: 'offline' });
      if (state === 'invalid-count' && args[0] === 'rev-list') return Promise.resolve({ code: 1, output: '' });
      return f.runner(args, cwd, opts);
    };
    await assert.rejects(fastForward(f.core.checkout, f.ctx, { ...options, git: runner }), /retry Update/);
    assert.deepEqual(await snapshot(f.core.checkout), before);
  });
});

test('LFS download uses the captured target even if remote advances afterwards', async t => {
  const f = await fixture(t), target = await f.workspace.publish();
  let next = '';
  const runner: GitRunner = async (args, cwd, opts) => {
    if (args[0] === 'lfs' && args[1] === 'fetch') {
      assert.deepEqual(args, ['lfs', 'fetch', 'origin', target]); next = await f.workspace.publish('other.txt');
    }
    return f.runner(args, cwd, opts);
  };
  await fastForward(f.workspace.checkout, f.ctx, { ...options, role: 'workspace', lfs: 'required', git: runner });
  assert.equal(f.workspace.head(), target); assert.notEqual(target, next);
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 1);
  assert.ok(f.calls.some(call => call.args.join(' ') === `-c merge.autostash=false merge --ff-only --no-edit ${target}`));
});

test('LFS failure or local edit during download leaves HEAD untouched', async t => {
  for (const state of ['lfs-failure', 'local-edit']) await t.test(state, async t => {
    const f = await fixture(t), before = f.workspace.head(); await f.workspace.publish();
    const runner: GitRunner = async (args, cwd, opts) => {
      if (args[0] === 'lfs' && args[1] === 'fetch') {
        if (state === 'lfs-failure') return { code: 1, output: 'offline' };
        await fs.writeFile(path.join(cwd, 'shared.txt'), 'concurrent edit\n');
      }
      return f.runner(args, cwd, opts);
    };
    await assert.rejects(fastForward(f.workspace.checkout, f.ctx, { ...options, role: 'workspace', lfs: 'required', git: runner }), /[Uu]pdate/);
    assert.equal(f.workspace.head(), before);
    if (state === 'local-edit') assert.equal(await fs.readFile(path.join(f.workspace.checkout, 'shared.txt'), 'utf8'), 'concurrent edit\n');
  });
});

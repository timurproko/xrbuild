import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { enter, linkThirdParty, linkWorktreeDependencies, taskWorktrees, unlinkThirdParty, unlinkWorktreeDependencies, worktreeName } from './worktree.mjs';
import { taskBranch } from './claude-create.mjs';

test('a branch is <type>/<short-desc>; the worktree is named after the description', () => {
  assert.equal(worktreeName('fix/hand-jitter'), 'hand-jitter');
  assert.equal(worktreeName('feature/ui-kit-slider2'), 'ui-kit-slider2');
  for (const bad of ['hand-jitter', 'Fix/x', 'fix/Hand', 'wip/x', 'fix/a/b', 'fix/-x']) {
    assert.throws(() => worktreeName(bad), /type/, bad);
  }
});

test('third_party entries are linked, not copied, and unlinking leaves the originals', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
  const from = path.join(tmp, 'primary', 'third_party');
  const to = path.join(tmp, 'wt', 'third_party');
  fs.mkdirSync(path.join(from, 'cef', 'include'), { recursive: true });
  fs.writeFileSync(path.join(from, 'cef', 'include', 'cef.h'), 'header');
  fs.writeFileSync(path.join(from, 'README.md'), 'tracked');
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, 'README.md'), 'tracked');

  assert.deepEqual(linkThirdParty(from, to), ['cef']);
  assert.ok(fs.lstatSync(path.join(to, 'cef')).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(to, 'cef', 'include', 'cef.h'), 'utf8'), 'header');
  assert.deepEqual(linkThirdParty(from, to), [], 'already linked entries are kept');

  assert.deepEqual(unlinkThirdParty(to), ['cef']);
  assert.ok(!fs.existsSync(path.join(to, 'cef')));
  assert.equal(fs.readFileSync(path.join(from, 'cef', 'include', 'cef.h'), 'utf8'), 'header', 'the original is untouched');
  assert.equal(fs.readFileSync(path.join(to, 'README.md'), 'utf8'), 'tracked');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a materialized workspace dependency is kept instead of being replaced by a primary link', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
  const primary = path.join(tmp, 'primary'), wt = path.join(tmp, 'wt');
  const rel = path.join('.xrbuild', 'third_party', 'runtime');
  fs.mkdirSync(path.join(primary, rel), { recursive: true });
  fs.mkdirSync(path.join(wt, rel), { recursive: true });
  fs.writeFileSync(path.join(primary, rel, 'plugin.dll'), 'primary');
  fs.writeFileSync(path.join(wt, rel, 'plugin.dll'), 'materialized');
  assert.equal(linkWorktreeDependencies(primary, wt, () => {})['.xrbuild/third_party'], undefined);
  assert.equal(fs.readFileSync(path.join(wt, rel, 'plugin.dll'), 'utf8'), 'materialized');
  assert.ok(!fs.lstatSync(path.join(wt, rel)).isSymbolicLink());
  assert.equal(unlinkWorktreeDependencies(wt)['.xrbuild/third_party'], undefined);
  assert.equal(fs.readFileSync(path.join(wt, rel, 'plugin.dll'), 'utf8'), 'materialized');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('removing a worktree folder that still holds a junction removes the link, not its target', () => {
  // Cleanup deletes a finished checkout with a recursive remove; a junction left in it must not take the target along.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
  const target = path.join(tmp, 'primary', 'cef');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'libcef.dll'), 'binary');
  const wt = path.join(tmp, 'wt');
  fs.mkdirSync(path.join(wt, 'node_modules'), { recursive: true });
  fs.symlinkSync(target, path.join(wt, 'node_modules', 'cef'), 'junction');
  fs.rmSync(wt, { recursive: true, force: true });
  assert.ok(!fs.existsSync(wt));
  assert.equal(fs.readFileSync(path.join(target, 'libcef.dll'), 'utf8'), 'binary');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('nothing fetched in the primary checkout links nothing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
  assert.deepEqual(linkThirdParty(path.join(tmp, 'missing'), path.join(tmp, 'wt')), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('only core dependencies are linked; the private workspace is never shared', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
  const primary = path.join(tmp, 'primary'), wt = path.join(tmp, 'wt');
  fs.mkdirSync(path.join(primary, 'third_party', 'browser'), { recursive: true });
  fs.mkdirSync(path.join(primary, '.xrbuild', 'third_party', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(primary, 'third_party', 'browser', 'core.dll'), 'core');
  fs.writeFileSync(path.join(primary, '.xrbuild', 'third_party', 'runtime', 'plugin.dll'), 'plugin');

  assert.deepEqual(linkWorktreeDependencies(primary, wt, () => {}), { third_party: ['browser'] });
  assert.ok(fs.lstatSync(path.join(wt, 'third_party', 'browser')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(wt, '.xrbuild')));
  assert.deepEqual(unlinkWorktreeDependencies(wt), { third_party: ['browser'] });
  assert.equal(fs.readFileSync(path.join(primary, '.xrbuild', 'third_party', 'runtime', 'plugin.dll'), 'utf8'), 'plugin');
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A primary checkout with one task worktree per given branch under .worktrees/. */
function repoWith(branches) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-repo-'));
  const g = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'pipe' }).toString().trim();
  g('init', '--quiet', '-b', 'develop');
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n.artifacts/\nthird_party/*\n.xrbuild/\n');
  g('add', '-A');
  g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '-m', 'init');
  for (const b of branches) g('worktree', 'add', '--quiet', '-b', b, path.join(root, '.worktrees', worktreeName(b)));
  return { root, g };
}

test('enter creates a branch from origin/develop and reuses only that clean registered checkout', () => {
  const { root, g } = repoWith([]);
  g('update-ref', 'refs/remotes/origin/develop', g('rev-parse', 'HEAD'));
  fs.mkdirSync(path.join(root, 'third_party', 'browser'), { recursive: true });
  fs.mkdirSync(path.join(root, '.xrbuild', 'third_party', 'runtime'), { recursive: true });
  let installs = 0;
  const options = { root, fetch: false, installFn: (dir) => { installs++; fs.mkdirSync(path.join(dir, 'node_modules')); }, log: () => {} };
  const dir = enter('chore/task-setup', options);
  assert.equal(dir, path.join(root, '.worktrees', 'task-setup'));
  assert.equal(g('branch', '--show-current'), 'develop', 'primary remains on develop');
  assert.equal(taskWorktrees(root).find((w) => w.name === 'task-setup').branch, 'chore/task-setup');
  assert.ok(fs.lstatSync(path.join(dir, 'third_party', 'browser')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(dir, '.xrbuild')));
  fs.mkdirSync(path.join(root, 'third_party', 'added'));
  assert.equal(enter('chore/task-setup', options), dir);
  assert.ok(fs.lstatSync(path.join(dir, 'third_party', 'added')).isSymbolicLink(), 're-entry links newly fetched core dependencies');
  assert.ok(!fs.existsSync(path.join(dir, '.xrbuild')), 're-entry does not provision private data');
  assert.equal(installs, 1, 'no second install on reuse');
  assert.equal(taskBranch('chore--task-setup'), 'chore/task-setup');
  assert.throws(() => taskBranch('chore--../nope'), /worktree name/);
  assert.throws(() => enter('fix/task-setup', options), /belongs to chore\/task-setup/);
  fs.writeFileSync(path.join(dir, 'new-file'), 'uncommitted');
  assert.throws(() => enter('chore/task-setup', options), /dirty/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Claude Code hook re-enters a registered task and prints its path last', () => {
  const { root } = repoWith(['chore/hook-check']);
  const dir = path.join(root, '.worktrees', 'hook-check');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  const hook = new URL('./claude-create.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(hook)], { input: JSON.stringify({ name: 'chore--hook-check', cwd: root }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.realpathSync.native(result.stdout.trim()).toLowerCase(), fs.realpathSync.native(dir).toLowerCase());
  fs.rmSync(root, { recursive: true, force: true });
});

test('failed install leaves a registered checkout that enter can repair; unregistered collision is refused', () => {
  const { root, g } = repoWith([]);
  g('update-ref', 'refs/remotes/origin/develop', g('rev-parse', 'HEAD'));
  assert.throws(() => enter('chore/needs-deps', { root, fetch: false, log: () => {}, installFn: () => { throw new Error('offline'); } }), /retry with worktree enter/);
  assert.equal(taskWorktrees(root).find((w) => w.name === 'needs-deps').branch, 'chore/needs-deps');
  const dir = enter('chore/needs-deps', { root, log: () => {}, installFn: (cwd) => fs.mkdirSync(path.join(cwd, 'node_modules')) });
  assert.ok(fs.existsSync(path.join(dir, 'node_modules')));
  fs.mkdirSync(path.join(root, '.worktrees', 'collision'));
  assert.throws(() => enter('chore/collision', { root, fetch: false }), /not a registered task worktree/);
  fs.rmSync(root, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { classify, enter, handoff, linkThirdParty, linkWorktreeDependencies, remove, sweep, taskWorktrees, unlinkThirdParty, unlinkWorktreeDependencies, worktreeName } from './worktree.mjs';
import { taskBranch } from './claude-create.mjs';
import { contextEnvironment } from './portable-context.mjs';

test('a branch is <type>/<short-desc>; the worktree is named after the description', () => {
  assert.equal(worktreeName('fix/hand-jitter'), 'hand-jitter');
  assert.equal(worktreeName('feat/ui-kit-slider2'), 'ui-kit-slider2');
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

test('isolated fixture teardown unlinks a junction without deleting its target', () => {
  // Production removal now refuses unknown links; recursive teardown here is only test-owned storage.
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

test('states: dirty wins, then the PR decides; no PR is active work', () => {
  assert.equal(classify({ dirty: true, pr: 'MERGED' }), 'dirty');
  assert.equal(classify({ dirty: false, pr: 'unknown' }), 'unknown');
  assert.equal(classify({ dirty: false, pr: 'MERGED' }), 'merged');
  assert.equal(classify({ dirty: false, pr: 'CLOSED' }), 'closed');
  assert.equal(classify({ dirty: false, pr: 'OPEN' }), 'active');
  assert.equal(classify({ dirty: false, pr: null }), 'active');
});

/** A primary checkout with one task worktree per given branch under .worktrees/. */
function repoWith(branches) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-repo-'));
  const g = (...a) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-C', root, ...a], { env: contextEnvironment(), stdio: 'pipe' }).toString().trim();
  g('init', '--quiet', '-b', 'main');
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n.artifacts/\nthird_party/*\n.xrbuild/\n');
  g('add', '-A');
  g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '-m', 'init');
  for (const b of branches) g('worktree', 'add', '--quiet', '-b', b, path.join(root, '.worktrees', worktreeName(b)));
  return { root, g };
}

test('explicit setup links only public dependencies; verified dirty resume never resets or installs implicitly', () => {
  const { root, g } = repoWith([]);
  g('update-ref', 'refs/remotes/origin/main', g('rev-parse', 'HEAD'));
  fs.mkdirSync(path.join(root, 'third_party', 'browser'), { recursive: true });
  fs.mkdirSync(path.join(root, '.xrbuild', 'third_party', 'runtime'), { recursive: true });
  let installs = 0;
  const options = { root, identify: () => 'timurproko/xrbuild',
    refresh: () => ({ base: g('rev-parse', 'HEAD'), remote: null }), acquireOwnership: () => true,
    installFn: dir => { installs++; fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true }); }, log: () => {} };
  const dir = enter('ci/task-setup', { ...options, install: true });
  assert.equal(fs.realpathSync.native(dir), fs.realpathSync.native(path.join(root, '.worktrees', 'task-setup')));
  assert.equal(g('branch', '--show-current'), 'main', 'primary remains on main');
  assert.equal(taskWorktrees(root).find((w) => w.name === 'task-setup').branch, 'ci/task-setup');
  assert.ok(fs.lstatSync(path.join(dir, 'third_party', 'browser')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(dir, '.xrbuild')));
  fs.mkdirSync(path.join(root, 'third_party', 'added'));
  assert.equal(enter('ci/task-setup', options), dir);
  assert.ok(!fs.existsSync(path.join(dir, 'third_party', 'added')), 're-entry does not implicitly set up dependencies');
  enter('ci/task-setup', { ...options, install: true });
  assert.ok(fs.lstatSync(path.join(dir, 'third_party', 'added')).isSymbolicLink(), 'explicit setup links newly fetched public dependencies');
  assert.ok(!fs.existsSync(path.join(dir, '.xrbuild')), 're-entry does not provision private data');
  assert.equal(installs, 2, 'only the two explicit setup requests installed');
  assert.equal(taskBranch('ci--task-setup'), 'ci/task-setup');
  assert.throws(() => taskBranch('ci--../nope'), /worktree name/);
  assert.throws(() => enter('fix/task-setup', options), /not the selected registered task checkout/);
  fs.writeFileSync(path.join(dir, 'new-file'), 'uncommitted');
  assert.equal(enter('ci/task-setup', options), dir);
  assert.equal(fs.readFileSync(path.join(dir, 'new-file'), 'utf8'), 'uncommitted');
  fs.rmSync(root, { recursive: true, force: true });
});

test('Claude Code hook preserves a registered checkout when repository ownership is unverifiable', () => {
  const { root } = repoWith(['ci/hook-check']);
  const dir = path.join(root, '.worktrees', 'hook-check');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  const hook = new URL('./claude-create.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(hook)], { input: JSON.stringify({ name: 'ci--hook-check', cwd: root }), encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules')));
  assert.ok(fs.existsSync(path.join(dir, '.git')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('failed install leaves a registered checkout that enter can repair; unregistered collision is refused', () => {
  const { root, g } = repoWith([]);
  g('update-ref', 'refs/remotes/origin/main', g('rev-parse', 'HEAD'));
  const options = { root, log: () => {}, identify: () => 'timurproko/xrbuild',
    refresh: () => ({ base: g('rev-parse', 'HEAD'), remote: null }), acquireOwnership: () => true };
  assert.throws(() => enter('ci/needs-deps', { ...options, install: true, installFn: () => { throw new Error('offline'); } }), /checkout\/history preserved/);
  assert.equal(taskWorktrees(root).find((w) => w.name === 'needs-deps').branch, 'ci/needs-deps');
  const dir = enter('ci/needs-deps', { ...options, install: true, installFn: cwd => fs.mkdirSync(path.join(cwd, 'node_modules')) });
  assert.ok(fs.existsSync(path.join(dir, 'node_modules')));
  fs.mkdirSync(path.join(root, '.worktrees', 'collision'));
  assert.throws(() => enter('ci/collision', options), /not the selected registered task checkout/);
  assert.throws(() => enter('ci/new-task', { ...options, fetch: false }), /Fetch cannot be disabled/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('sweep lists every state but missing trusted ownership prevents removal even for merged clean work', () => {
  const { root, g } = repoWith(['feat/merged', 'feat/dirty', 'feat/open', 'feat/closed', 'feat/unknown', 'feat/dirty-merged']);
  fs.writeFileSync(path.join(root, '.worktrees', 'dirty', 'wip.txt'), 'x');
  fs.writeFileSync(path.join(root, '.worktrees', 'dirty-merged', 'wip.txt'), 'x');
  const states = { 'feat/merged': 'MERGED', 'feat/dirty': 'OPEN', 'feat/open': 'OPEN', 'feat/closed': 'CLOSED', 'feat/unknown': 'unknown', 'feat/dirty-merged': 'MERGED' };
  const prState = (b) => states[b];
  const quiet = () => {};
  const rows = sweep({ root, prState, log: quiet });
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.name, r.state])), { merged: 'merged', dirty: 'dirty', open: 'active', closed: 'closed', unknown: 'unknown', 'dirty-merged': 'dirty' });
  assert.equal(taskWorktrees(root).length, 6, 'without --apply nothing is removed');

  const applied = sweep({ root, prState, apply: true, log: quiet });
  assert.equal(applied.find(row => row.name === 'merged').cleanup, 'blocked');
  assert.match(applied.find(row => row.name === 'merged').reason, /ownership adapter unavailable/);
  assert.equal(taskWorktrees(root).length, 6);
  assert.ok(fs.existsSync(path.join(root, '.worktrees', 'merged')));
  assert.notEqual(g('branch', '--list', 'feat/merged'), '', 'local refs remain intact without verified disposal');
  fs.rmSync(root, { recursive: true, force: true });
});

test('cleanup preserves private clones, unversioned workspaces, links and marked artifacts', () => {
  for (const kind of ['clone', 'folder', 'link', 'marker']) {
    const { root, g } = repoWith(['feat/protected']);
    const dir = path.join(root, '.worktrees', 'protected');
    const workspace = path.join(dir, '.xrbuild');
    try {
      if (kind === 'marker') {
        fs.mkdirSync(path.join(dir, '.artifacts'));
        fs.writeFileSync(path.join(dir, '.artifacts', 'KEEP'), 'private backup');
      } else if (kind === 'link') {
        const target = path.join(root, 'third_party', 'private');
        fs.mkdirSync(target, { recursive: true });
        fs.symlinkSync(target, workspace, 'junction');
      } else {
        fs.mkdirSync(workspace);
        fs.writeFileSync(path.join(workspace, 'uncommitted.txt'), 'private');
        if (kind === 'clone') execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'init', '--quiet', workspace], { env: contextEnvironment() });
      }
      assert.equal(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { env: contextEnvironment() }).toString(), '');
      const opts = { root, prState: () => 'MERGED', log: () => {} };
      assert.throws(() => remove('protected', opts), /preserved separately/);
      assert.equal(sweep({ ...opts, apply: true })[0].state, 'dirty');
      assert.ok(fs.existsSync(dir));
      assert.notEqual(g('branch', '--list', 'feat/protected'), '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('legacy discard and PR state cannot substitute for verified local-only cleanup authority', t => {
  const { root, g } = repoWith(['feat/closed', 'feat/open', 'feat/merged']);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const states = { 'feat/closed': 'CLOSED', 'feat/open': 'OPEN', 'feat/merged': 'MERGED' };
  const opts = { root, prState: (b) => states[b], log: () => {} };
  assert.throws(() => remove('closed', opts), /ownership adapter unavailable/);
  for (const name of ['open', 'merged', 'closed']) {
    assert.throws(() => remove(name, { ...opts, discard: true }), /separate supported adapter/);
    assert.ok(fs.existsSync(path.join(root, '.worktrees', name)));
    assert.notEqual(g('branch', '--list', `feat/${name}`), '', 'no ref deletion is inferred from discard or PR state');
  }
  assert.throws(() => remove('nope', opts), /no worktree/);
});

test('handoff records the worktree in .artifacts/handoff.json and returns the report skeleton', () => {
  const { root, g } = repoWith(['feat/thing']);
  const report = handoff('thing', { root, change: 'add-thing', pr: '12', now: new Date('2026-10-11T08:00:00Z'), identify: () => 'timurproko/xrbuild' });
  const dir = path.join(root, '.worktrees', 'thing');
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.artifacts', 'handoff.json'), 'utf8'));
  assert.equal(record.branch, 'feat/thing');
  assert.equal(record.change, 'add-thing');
  assert.equal(record.pr, 12);
  assert.equal(record.head, g('rev-parse', 'HEAD'));
  assert.equal(record.time, '2026-10-11T08:00:00.000Z');
  assert.equal(record.publicationVerified, false, 'missing remote proof is reported, not inferred');
  assert.equal(record.unpublishedWork, true);
  assert.match(report, /Repository: timurproko\/xrbuild/);
  assert.match(report, /Branch and PR: feat\/thing, #12 \(change add-thing\)/);
  assert.match(report, /Publication: unverified/);
  assert.match(report, /Unfinished work and gaps:/);
  assert.equal(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { env: contextEnvironment() }).toString(), '', '.artifacts/ is ignored');
  fs.rmSync(root, { recursive: true, force: true });
});

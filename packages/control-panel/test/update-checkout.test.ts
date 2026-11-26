import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkoutFetchedCommit, resumeProtectedCheckout, CHECKOUT_JOURNAL, CheckoutRefusal } from '../src/update-checkout.ts';
import { fixture, git, snapshot, ENV } from './helpers/update-fixture.ts';
import type { GitRunner } from '../src/update.ts';

async function setup(t: Parameters<typeof fixture>[0]) {
  const f = await fixture(t), repo = f.workspace;
  const put = async (root: string, file: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), text);
  };
  for (const file of ['xrb-plugins.json', 'xrb-panel.json', 'pnpm-lock.yaml', 'projects/kept/app.txt', 'config/local.json']) await put(repo.publisher, file, 'base\n');
  await repo.publish('other.txt', 'base\n');
  git(repo.checkout, 'fetch', '-q', 'origin'); git(repo.checkout, 'merge', '-q', '--ff-only', 'origin/main');
  const before = repo.head();
  const update = async (runner: GitRunner = f.runner, workspace = true) => {
    git(repo.checkout, 'fetch', '-q', 'origin');
    const target = git(repo.checkout, 'rev-parse', 'origin/main');
    return checkoutFetchedCommit(repo.checkout, { git: runner, workspace, before, target, branch: 'main', line: f.ctx.line,
      ensureUnchanged: async () => { assert.equal(repo.head(), before); } });
  };
  return { ...f, repo, put, before, update };
}

for (const staged of [false, true]) test(`plain Git accepts unrelated ${staged ? 'staged' : 'unstaged'} source edits`, async t => {
  const f = await setup(t);
  await f.put(f.repo.checkout, 'shared.txt', 'my edit\n');
  if (staged) git(f.repo.checkout, 'add', 'shared.txt');
  await f.put(f.repo.checkout, 'new.txt', 'untracked\n');
  const target = await f.repo.publish('other.txt', 'remote\n');
  assert.deepEqual(await f.update(), []); assert.equal(f.repo.head(), target);
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'shared.txt'), 'utf8'), 'my edit\n');
  assert.equal(git(f.repo.checkout, 'diff', '--cached', '--name-only'), staged ? 'shared.txt' : '');
  assert.ok(f.lines.some(line => line.includes('ordinary Git fast-forward')));
});

for (const kind of ['modified', 'staged', 'untracked', 'ignored']) test(`refuses real ${kind} source collisions without altering the index/worktree`, async t => {
  const f = await setup(t), file = ['untracked', 'ignored'].includes(kind) ? 'incoming.txt' : 'shared.txt';
  await f.put(f.repo.checkout, file, 'local\n');
  if (kind === 'staged') git(f.repo.checkout, 'add', file);
  if (kind === 'ignored') await f.put(f.repo.checkout, '.git/info/exclude', 'incoming.txt\n');
  await f.repo.publish(file, 'remote\n');
  const before = await snapshot(f.repo.checkout);
  await assert.rejects(f.update(), error => error instanceof CheckoutRefusal && error.message.includes(file));
  assert.deepEqual(await snapshot(f.repo.checkout), before);
  assert.equal(await fs.readFile(path.join(f.repo.checkout, file), 'utf8'), 'local\n');
});

test('native fast-forward cannot satisfy local-wins; projected transaction preserves exact ordinary-use state', async t => {
  const f = await setup(t);
  for (const file of ['xrb-plugins.json', 'xrb-panel.json', 'pnpm-lock.yaml', 'projects/kept/app.txt', 'config/local.json']) {
    await f.put(f.repo.checkout, file, `personal ${file}\n`);
    await f.put(f.repo.publisher, file, `remote ${file}\n`);
  }
  await f.put(f.repo.checkout, 'projects/.gitkeep', '');
  await f.put(f.repo.checkout, 'projects/Unsorted/new/app.txt', 'my new project\n');
  await f.put(f.repo.publisher, 'projects/Unsorted/new/app.txt', 'incoming collision\n');
  const target = await f.repo.publish('shared.txt', 'remote source\n');
  git(f.repo.checkout, 'fetch', '-q', 'origin');
  assert.throws(() => git(f.repo.checkout, '-c', 'merge.autostash=false', 'merge', '--ff-only', target), /Command failed/);
  const retained = await f.update();
  assert.ok(retained.includes('xrb-plugins.json')); assert.ok(retained.includes('pnpm-lock.yaml'));
  assert.equal(f.repo.head(), target);
  for (const file of ['xrb-plugins.json', 'xrb-panel.json', 'pnpm-lock.yaml', 'projects/kept/app.txt', 'config/local.json'])
    assert.equal(await fs.readFile(path.join(f.repo.checkout, file), 'utf8'), `personal ${file}\n`);
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'projects/Unsorted/new/app.txt'), 'utf8'), 'my new project\n');
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'shared.txt'), 'utf8'), 'remote source\n');
  assert.equal(git(f.repo.checkout, 'diff', '--cached', '--name-only'), '');
  assert.ok(!f.calls.some(call => call.args.includes('reset') || call.args.includes('stash') || call.args.includes('--force')));
});

test('preserves staged user-data entries and deliberate deletion while upstream adds and removes defaults', async t => {
  const f = await setup(t);
  await f.put(f.repo.checkout, 'xrb-plugins.json', 'staged\n'); git(f.repo.checkout, 'add', 'xrb-plugins.json');
  await f.put(f.repo.checkout, 'xrb-plugins.json', 'working\n');
  await fs.unlink(path.join(f.repo.checkout, 'xrb-panel.json'));
  await fs.unlink(path.join(f.repo.publisher, 'xrb-plugins.json'));
  await f.put(f.repo.publisher, 'xrb-panel.json', 'remote\n');
  await f.put(f.repo.publisher, 'projects/new-from-upstream/file.txt', 'default\n');
  await f.repo.publish('shared.txt', 'remote\n');
  await f.update();
  assert.equal(git(f.repo.checkout, 'show', ':xrb-plugins.json'), 'staged');
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'xrb-plugins.json'), 'utf8'), 'working\n');
  assert.equal(await fs.stat(path.join(f.repo.checkout, 'xrb-panel.json')).then(() => true, () => false), false);
  assert.equal(await fs.stat(path.join(f.repo.checkout, 'projects/new-from-upstream')).then(() => true, () => false), false);
});

test('protected-data projection still rejects tracked source conflicts before writing anything', async t => {
  const f = await setup(t);
  await f.put(f.repo.checkout, 'shared.txt', 'personal source\n');
  await f.put(f.repo.publisher, 'xrb-plugins.json', 'remote defaults\n');
  await f.repo.publish('shared.txt', 'remote source\n');
  const before = await snapshot(f.repo.checkout);
  await assert.rejects(f.update(), /shared.txt/);
  assert.deepEqual(await snapshot(f.repo.checkout), before);
});

test('retry resumes an interruption after source checkout without overwriting user data or local source edits', async t => {
  const f = await setup(t);
  await f.put(f.repo.publisher, 'xrb-plugins.json', 'remote defaults\n');
  const target = await f.repo.publish('shared.txt', 'remote source\n');
  await f.put(f.repo.checkout, 'xrb-plugins.json', 'my settings\n');
  let interrupted = false;
  const runner: GitRunner = async (args, cwd, opts) => {
    if (args[0] === 'update-ref' && !interrupted) { interrupted = true; return { code: 1, output: 'simulated ref interruption' }; }
    return f.runner(args, cwd, opts);
  };
  await assert.rejects(f.update(runner), /journal retained/);
  assert.equal(f.repo.head(), f.before);
  await f.put(f.repo.checkout, 'other.txt', 'new local edit after interruption\n');
  await resumeProtectedCheckout(f.repo.checkout, f.runner, f.ctx.line);
  assert.equal(f.repo.head(), target);
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'xrb-plugins.json'), 'utf8'), 'my settings\n');
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'other.txt'), 'utf8'), 'new local edit after interruption\n');
  assert.equal(await fs.stat(path.join(f.repo.checkout, '.git', CHECKOUT_JOURNAL)).then(() => true, () => false), false);
});

test('a competing index writer or branch change is preserved with its recovery journal', async t => {
  const f = await setup(t);
  await f.put(f.repo.publisher, 'xrb-plugins.json', 'remote defaults\n'); await f.repo.publish();
  let interrupted = false;
  const runner: GitRunner = async (args, cwd, opts) => {
    if (args[0] === 'update-ref' && !interrupted) { interrupted = true; return { code: 1, output: 'stop before ref' }; }
    return f.runner(args, cwd, opts);
  };
  await assert.rejects(f.update(runner), /journal retained/);
  await f.put(f.repo.checkout, 'new-local.txt', 'do not lose\n'); git(f.repo.checkout, 'add', 'new-local.txt');
  const index = await fs.readFile(path.join(f.repo.checkout, '.git/index'));
  await assert.rejects(resumeProtectedCheckout(f.repo.checkout, f.runner, f.ctx.line), /Index changed/);
  assert.deepEqual(await fs.readFile(path.join(f.repo.checkout, '.git/index')), index);
});

test('dead process lock and ready journal resume after a real process exit', async t => {
  const f = await setup(t);
  await f.put(f.repo.publisher, 'xrb-plugins.json', 'incoming\n');
  const target = await f.repo.publish(); git(f.repo.checkout, 'fetch', '-q', 'origin');
  const script = `import {checkoutFetchedCommit} from ${JSON.stringify(new URL('../src/update-checkout.ts', import.meta.url).href)};
    import {runGit} from ${JSON.stringify(new URL('../src/update.ts', import.meta.url).href)};
    await checkoutFetchedCommit(${JSON.stringify(f.repo.checkout)}, {before:${JSON.stringify(f.before)},target:${JSON.stringify(target)},branch:'main',workspace:true,
      ensureUnchanged:async()=>{},line(){},git:(args,cwd,opts)=>{if(args[0]==='update-ref')process.exit(88);return runGit(args,cwd,opts);}});`;
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { env: ENV }), error => (error as { code: number }).code === 88);
  await fs.access(path.join(f.repo.checkout, '.git/index.lock'));
  await resumeProtectedCheckout(f.repo.checkout, f.runner, f.ctx.line);
  assert.equal(f.repo.head(), target);
  assert.equal(await fs.readFile(path.join(f.repo.checkout, 'xrb-plugins.json'), 'utf8'), 'base\n');
});

test('template ignores personal settings without hiding authored projects or curated locks', async t => {
  const f = await setup(t);
  await fs.writeFile(path.join(f.repo.checkout, '.gitignore'), await fs.readFile(new URL('../../../templates/workspace/.gitignore', import.meta.url)));
  for (const file of ['xrb-plugins.json', 'xrb-panel.json', 'xrb-plugins.json.lock', 'xrb-plugins.json.write.tmp', 'xrb-panel.json.write.tmp'])
    assert.equal(git(f.repo.checkout, 'check-ignore', '--no-index', file), file);
  for (const file of ['pnpm-lock.yaml', 'projects/Unsorted/new/xrb-project.json'])
    assert.throws(() => git(f.repo.checkout, 'check-ignore', '--no-index', file));
});

test('core dependency locks are ordinary source, not workspace user-data overrides', async t => {
  const f = await setup(t);
  await f.put(f.repo.checkout, 'pnpm-lock.yaml', 'local\n'); await f.repo.publish('pnpm-lock.yaml', 'remote\n');
  await assert.rejects(f.update(f.runner, false), /pnpm-lock.yaml/);
  assert.equal(f.repo.head(), f.before);
});

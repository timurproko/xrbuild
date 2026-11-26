import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, type TestContext } from 'node:test';
import { checkoutFetchedCommit, resumeProtectedCheckout, CHECKOUT_JOURNAL } from '../src/update-checkout.ts';
import type { GitRunner } from '../src/update.ts';
import { fixture, git, ENV } from './helpers/update-fixture.ts';

type Layout = 'file-to-directory' | 'directory-to-file';
async function setup(t: TestContext, layout: Layout) {
  const f = await fixture(t), repo = f.workspace, dir = repo.checkout;
  if (layout === 'directory-to-file') {
    await fs.unlink(path.join(repo.publisher, 'shared.txt')); await fs.mkdir(path.join(repo.publisher, 'shared.txt'));
    for (const name of ['one', 'two']) await fs.writeFile(path.join(repo.publisher, `shared.txt/${name}.txt`), `old ${name}\n`);
  }
  await repo.publish('xrb-plugins.json', 'base\n');
  git(dir, 'fetch', '-q', 'origin'); git(dir, 'merge', '-q', '--ff-only', 'origin/main');
  const before = repo.head(); await fs.writeFile(path.join(dir, 'xrb-plugins.json'), 'personal\n');
  await fs.writeFile(path.join(repo.publisher, 'xrb-plugins.json'), 'incoming defaults\n');
  if (layout === 'file-to-directory') {
    await fs.unlink(path.join(repo.publisher, 'shared.txt')); await fs.mkdir(path.join(repo.publisher, 'shared.txt'));
    for (const name of ['one', 'two']) await fs.writeFile(path.join(repo.publisher, `shared.txt/${name}.txt`), `incoming ${name}\n`);
  } else {
    await fs.rm(path.join(repo.publisher, 'shared.txt'), { recursive: true });
    await fs.writeFile(path.join(repo.publisher, 'shared.txt'), 'incoming parent\n');
  }
  const target = await repo.publish('other.txt', 'incoming sibling\n'); git(dir, 'fetch', '-q', 'origin');
  const options = { git: f.runner, workspace: true, before, target, branch: 'main', line: f.ctx.line, ensureUnchanged: async () => {} };
  const check = async () => {
    assert.equal(repo.head(), target); assert.equal(await fs.readFile(path.join(dir, 'xrb-plugins.json'), 'utf8'), 'personal\n');
    if (layout === 'file-to-directory') for (const name of ['one', 'two']) assert.equal(await fs.readFile(path.join(dir, `shared.txt/${name}.txt`), 'utf8'), `incoming ${name}\n`);
    else assert.equal(await fs.readFile(path.join(dir, 'shared.txt'), 'utf8'), 'incoming parent\n');
    assert.equal(await fs.readFile(path.join(dir, 'other.txt'), 'utf8'), 'incoming sibling\n');
    assert.equal(git(dir, 'diff', '--cached', '--name-only'), ''); assert.equal((await fs.stat(path.join(dir, '.git/index'))).nlink, 1);
    assert.ok(!(await fs.readdir(path.join(dir, '.git'))).some(name => name.startsWith(CHECKOUT_JOURNAL) || name === 'index.lock'));
  };
  const exitBeforeRef = async () => {
    const script = `import {checkoutFetchedCommit} from ${JSON.stringify(new URL('../src/update-checkout.ts', import.meta.url).href)};
      import {runGit} from ${JSON.stringify(new URL('../src/update.ts', import.meta.url).href)};
      await checkoutFetchedCommit(${JSON.stringify(dir)}, {workspace:true,before:${JSON.stringify(before)},target:${JSON.stringify(target)},branch:'main',line(){},ensureUnchanged:async()=>{},
        git:(args,cwd,opts)=>{if(args[0]==='update-ref')process.exit(88);return runGit(args,cwd,opts);}});`;
    await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { env: ENV, timeout: 60000 }), error => (error as { code: number }).code === 88);
    assert.equal(repo.head(), before);
  };
  return { ...f, repo, dir, before, target, options, check, exitBeforeRef };
}

for (const layout of ['file-to-directory', 'directory-to-file'] as const) {
  test(`${layout} completed checkout resumes after a real exit before ref publication`, async t => {
    const f = await setup(t, layout); await f.exitBeforeRef();
    for (let retry = 0; retry < 2; retry++) await resumeProtectedCheckout(f.dir, f.runner, f.ctx.line);
    await f.check();
  });

  test(`${layout} recovery refuses outside edits to an incoming source file`, async t => {
    const f = await setup(t, layout); await f.exitBeforeRef();
    const file = path.join(f.dir, layout === 'file-to-directory' ? 'shared.txt/one.txt' : 'shared.txt');
    await fs.writeFile(file, 'outside hand edit\n'); const index = await fs.readFile(path.join(f.dir, '.git/index'));
    for (let retry = 0; retry < 2; retry++) {
      await assert.rejects(resumeProtectedCheckout(f.dir, f.runner, f.ctx.line), /shared\.txt/);
      assert.equal(f.repo.head(), f.before); assert.deepEqual(await fs.readFile(path.join(f.dir, '.git/index')), index);
      assert.equal(await fs.readFile(file, 'utf8'), 'outside hand edit\n');
      assert.equal(await fs.readFile(path.join(f.dir, 'xrb-plugins.json'), 'utf8'), 'personal\n');
    }
  });

  for (const empty of [false, true]) test(`${layout} resumes a partially applied ${empty ? 'empty' : 'nonempty'} directory transition`, async t => {
    const f = await setup(t, layout); let interrupted = false;
    const runner: GitRunner = async (args, cwd, opts) => {
      if (!interrupted && args[0] === 'read-tree' && args.includes('-u') && !args.includes('-n')) {
        interrupted = true;
        if (layout === 'file-to-directory') {
          await fs.unlink(path.join(f.dir, 'shared.txt')); await fs.mkdir(path.join(f.dir, 'shared.txt'));
          if (!empty) await fs.writeFile(path.join(f.dir, 'shared.txt/one.txt'), 'incoming one\n');
        } else {
          await fs.unlink(path.join(f.dir, 'shared.txt/one.txt'));
          if (empty) await fs.unlink(path.join(f.dir, 'shared.txt/two.txt'));
        }
        return { code: 1, output: 'simulated interruption inside source checkout' };
      }
      return f.runner(args, cwd, opts);
    };
    await assert.rejects(checkoutFetchedCommit(f.dir, { ...f.options, git: runner }), /fast-forward/);
    for (let retry = 0; retry < 2; retry++) await resumeProtectedCheckout(f.dir, f.runner, f.ctx.line);
    await f.check();
  });
}

test('an extra non-overlapping file in an expected directory remains untouched', async t => {
  const f = await setup(t, 'file-to-directory'); await f.exitBeforeRef();
  const extra = path.join(f.dir, 'shared.txt/outside.txt'); await fs.writeFile(extra, 'outside file\n');
  await resumeProtectedCheckout(f.dir, f.runner, f.ctx.line); await f.check();
  assert.equal(await fs.readFile(extra, 'utf8'), 'outside file\n');
});

test('an outside directory cannot be overwritten by an expected file', async t => {
  const f = await setup(t, 'directory-to-file'); await f.exitBeforeRef();
  await fs.unlink(path.join(f.dir, 'shared.txt')); await fs.mkdir(path.join(f.dir, 'shared.txt'));
  const extra = path.join(f.dir, 'shared.txt/outside.txt'); await fs.writeFile(extra, 'outside file\n');
  for (let retry = 0; retry < 2; retry++) {
    await assert.rejects(resumeProtectedCheckout(f.dir, f.runner, f.ctx.line));
    assert.equal(f.repo.head(), f.before); assert.equal(await fs.readFile(extra, 'utf8'), 'outside file\n');
    assert.equal(await fs.readFile(path.join(f.dir, 'xrb-plugins.json'), 'utf8'), 'personal\n');
  }
});

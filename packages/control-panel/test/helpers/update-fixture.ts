import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { runGit, type GitRunner } from '../../src/update.ts';
import type { JobContext } from '../../src/jobs.ts';

export const ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_TERMINAL_PROMPT: '0' };
export const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args], { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function fixture(t: TestContext, branch = 'main') {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'xrb-default-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const calls: Array<{ args: string[]; cwd: string }> = [], lines: string[] = [];
  const runner: GitRunner = async (args, cwd, opts) => {
    calls.push({ args, cwd });
    if (args[0] === 'lfs') return { code: 0, output: '' };
    return runGit(args, cwd, { ...opts, env: { ...ENV, ...opts?.env } });
  };
  const ctx: JobContext = { line: text => lines.push(text), run: async () => { assert.fail('unexpected external command'); } };
  const repo = async (name: string, checkout = path.join(root, name)) => {
    const remote = path.join(root, `${name}.git`), publisher = path.join(root, `${name}-publisher`);
    git(root, 'init', '--bare', '-q', remote);
    git(remote, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
    git(root, 'clone', '-q', remote, publisher);
    await fs.writeFile(path.join(publisher, '.gitignore'), '.xrbuild/\nnode_modules/\n');
    await fs.writeFile(path.join(publisher, 'shared.txt'), 'one\n');
    await fs.writeFile(path.join(publisher, 'other.txt'), 'one\n');
    git(publisher, 'add', '.'); git(publisher, 'commit', '-qm', 'first'); git(publisher, 'push', '-q', 'origin', `HEAD:${branch}`);
    git(root, 'clone', '-q', remote, checkout);
    git(checkout, 'config', 'core.autocrlf', 'false');
    const head = () => git(checkout, 'rev-parse', 'HEAD');
    const publish = async (file = 'shared.txt', text = 'two\n') => {
      await fs.writeFile(path.join(publisher, file), text);
      git(publisher, 'add', '.'); git(publisher, 'commit', '-qm', `change ${file}`); git(publisher, 'push', '-q', 'origin', `HEAD:${branch}`);
      return git(publisher, 'rev-parse', 'HEAD');
    };
    return { remote, publisher, checkout, head, publish };
  };
  const core = await repo('core'), workspace = await repo('workspace', path.join(core.checkout, '.xrbuild'));
  return { root, core, workspace, runner, calls, lines, ctx };
}

export async function snapshot(dir: string) {
  const index = path.resolve(dir, git(dir, 'rev-parse', '--git-path', 'index'));
  return { head: git(dir, 'rev-parse', 'HEAD'), branch: git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'),
    index: (await fs.readFile(index)).toString('hex'), shared: await fs.readFile(path.join(dir, 'shared.txt'), 'utf8'),
    status: git(dir, '--no-optional-locks', 'status', '--porcelain') };
}

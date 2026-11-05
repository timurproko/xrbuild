import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const core = fileURLToPath(new URL('../../', import.meta.url));
test('ordinary core staging excludes an independent private clone and has no LFS-only hook requirement', (t) => {
  const scratch = path.join(core, '.artifacts');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'boundary-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const g = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  g('init', '--quiet');
  fs.copyFileSync(path.join(core, '.gitignore'), path.join(root, '.gitignore'));
  fs.writeFileSync(path.join(root, 'core.txt'), 'core');
  const workspace = path.join(root, '.xrbuild');
  fs.mkdirSync(workspace);
  execFileSync('git', ['init', '--quiet', workspace], { stdio: 'pipe' });
  fs.writeFileSync(path.join(workspace, 'private.txt'), 'private');
  g('add', '-A');
  assert.deepEqual(g('ls-files').split(/\r?\n/), ['.gitignore', 'core.txt']);
  assert.match(g('check-ignore', '.xrbuild/private.txt', '.xrbuild/.git/config'), /\.xrbuild\/\.git\/config/);
  const attributes = fs.readFileSync(path.join(core, '.gitattributes'), 'utf8');
  assert.doesNotMatch(attributes, /filter=lfs|\.xrbuild/);
  assert.ok(fs.existsSync(path.join(core, '.githooks/pre-commit')));
  for (const hook of fs.readdirSync(path.join(core, '.githooks'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(core, '.githooks', hook), 'utf8'), /git-lfs|git lfs|workspace-push/);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['workspace:push'], undefined);
  for (const name of ['panel:repo', 'host:repo', 'fetch-deps:repo']) assert.match(pkg.scripts[name], /--workspace=\.xrbuild/);
});

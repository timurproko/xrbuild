import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeGit } from './portable-context.mjs';
import { isProtectedOpenSpecPath, verifyOpenSpecBoundary } from './delivery-contract.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const git = (root, ...args) => executeGit(root, ['-c', 'commit.gpgsign=false', ...args]);

test('framework inventory cannot be redirected to a disposable caller repository by ambient Git selectors', t => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'framework-inventory-')); t.after(() => fs.rmSync(box, { recursive: true, force: true }));
  const selected = path.join(box, 'selected'), caller = path.join(box, 'caller');
  for (const root of [selected, caller]) { fs.mkdirSync(root); git(root, 'init', '--quiet', '-b', 'main'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid'); }
  const files = git(source, 'ls-files', '-z').split('\0').filter(isProtectedOpenSpecPath);
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(selected, file)), { recursive: true }); fs.copyFileSync(path.join(source, file), path.join(selected, file)); }
  git(selected, 'add', '.'); git(selected, 'commit', '--quiet', '-m', 'unchanged framework fixture');
  fs.writeFileSync(path.join(caller, 'source.txt'), 'caller source'); git(caller, 'add', '.'); git(caller, 'commit', '--quiet', '-m', 'caller fixture');
  const index = fs.readFileSync(path.join(caller, '.git/index')), head = git(caller, 'rev-parse', 'HEAD');
  const extra = path.join(selected, '.claude/skills/openspec-extra/SKILL.md'); fs.mkdirSync(path.dirname(extra), { recursive: true }); fs.writeFileSync(extra, 'synthetic unapproved fixture');
  const names = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'], before = names.map(key => process.env[key]);
  try {
    process.env.GIT_DIR = path.join(caller, '.git'); process.env.GIT_WORK_TREE = caller; process.env.GIT_INDEX_FILE = path.join(caller, '.git/index');
    assert.throws(() => verifyOpenSpecBoundary({ root: selected }), /Unapproved OpenSpec asset/);
    assert.equal(git(caller, 'rev-parse', 'HEAD'), head); assert.deepEqual(fs.readFileSync(path.join(caller, '.git/index')), index);
    assert.equal(fs.readFileSync(path.join(caller, 'source.txt'), 'utf8'), 'caller source');
  } finally { names.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; }); }
});

test('protected asset type changes cannot hide behind unchanged dereferenced bytes', () => {
  const original = '.claude/skills/openspec-apply-change/SKILL.md';
  assert.throws(() => verifyOpenSpecBoundary({ root: source, paths: [], stat: file => file === original ? { isFile: () => false } : fs.lstatSync(path.join(source, file)) }), /not a regular file/);
});

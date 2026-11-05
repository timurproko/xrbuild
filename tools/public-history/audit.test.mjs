import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { audit } from './audit.mjs';
import { hashOf } from '../name-guard/name-guard.mjs';

const scratch = fileURLToPath(new URL('../../.artifacts/', import.meta.url));
const banned = new Set([hashOf('restrictedfixture')]);
const options = { banned };
function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'history-test-'));
  const repo = path.join(root, 'source');
  fs.mkdirSync(repo);
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', FILTER_BRANCH_SQUELCH_WARNING: '1' },
  }).trim();
  g('init', '--quiet', '-b', 'main');
  g('config', 'user.name', 'Test');
  g('config', 'user.email', 'test@example.invalid');
  g('config', 'core.autocrlf', 'false');
  g('config', 'core.hooksPath', path.join(root, 'no-hooks'));
  const write = (name, contents) => {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), contents);
  };
  const commit = (message = 'fixture') => { g('add', '-A'); g('commit', '--quiet', '-m', message); return g('rev-parse', 'HEAD'); };
  write('README.md', 'Core documentation may mention .xrbuild/ without containing private files.\n');
  commit();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repo, g, write, commit };
}
const kinds = (result) => result.findings.map((finding) => finding.kind);
const pointer = (bytes) => ['version https://git-lfs.github.com/spec/v1', `oid sha256:${createHash('sha256').update(bytes).digest('hex')}`, `size ${bytes.length}`, ''].join('\n');

test('clean history passes without mutating refs, reflog or working files', (t) => {
  const { repo, g } = fixture(t);
  const before = [g('show-ref'), g('reflog', '--all'), g('status', '--porcelain')];
  const result = audit(repo, ['refs/heads/main'], options);
  assert.equal(result.clean, true);
  assert.equal(result.counts.commits, 1);
  assert.deepEqual([g('show-ref'), g('reflog', '--all'), g('status', '--porcelain')], before);
});

test('a deleted private file remains a historical finding', (t) => {
  const { repo, g, write, commit } = fixture(t);
  write('.xrbuild/notes.txt', 'private fixture'); commit();
  g('rm', '-r', '--quiet', '.xrbuild'); commit('detach');
  const result = audit(repo, ['refs/heads/main'], options);
  assert.equal(result.clean, false);
  assert.ok(kinds(result).includes('private-workspace-path'));
  assert.ok(!JSON.stringify(result).includes('notes.txt'), 'findings do not disclose private paths');
});

test('merge-only private content is found through commit trees', (t) => {
  const { repo, g, write, commit } = fixture(t);
  g('checkout', '--quiet', '-b', 'side'); write('side.txt', 'side'); const side = commit();
  g('checkout', '--quiet', 'main'); write('main.txt', 'main'); const main = commit();
  write('.xrbuild/merge-only.txt', 'private'); g('add', '.xrbuild');
  const tree = g('write-tree');
  const merge = g('commit-tree', tree, '-p', main, '-p', side, '-m', 'merge');
  g('update-ref', 'refs/heads/main', merge);
  assert.ok(kinds(audit(repo, ['refs/heads/main'], options)).includes('private-workspace-path'));
});

test('explicit additional branches and tags cannot hide private history', (t) => {
  const { repo, g, write, commit } = fixture(t);
  g('checkout', '--quiet', '-b', 'private'); write('.xrbuild/item', 'private'); commit();
  g('tag', '-a', 'retained', '-m', 'retained');
  assert.equal(audit(repo, ['refs/heads/main'], options).clean, true);
  for (const ref of ['refs/heads/private', 'refs/tags/retained']) {
    assert.equal(audit(repo, ['refs/heads/main', ref], options).clean, false);
  }
});

test('relocated historical LFS pointers and prohibited blob/message/tag names fail', (t) => {
  const { repo, g, write, commit } = fixture(t);
  write('runtime.dat', pointer(Buffer.from('binary fixture'))); commit();
  g('rm', '--quiet', 'runtime.dat');
  write('content.txt', 'restrictedfixture'); commit('restrictedfixture');
  g('tag', '-a', 'annotated', '-m', 'restrictedfixture');
  const result = audit(repo, ['refs/heads/main', 'refs/tags/annotated'], options);
  assert.ok(kinds(result).includes('lfs-pointer'));
  assert.ok(kinds(result).filter((kind) => kind === 'prohibited-name').length >= 3);
  assert.ok(!JSON.stringify(result).includes('restrictedfixture'));
});

test('wide binary strings and sensitive ref names are detected without echoing them', (t) => {
  const { repo, g, write, commit } = fixture(t);
  write('binary.dat', Buffer.concat([Buffer.from([0]), Buffer.from('restrictedfixture', 'utf16le')])); commit();
  g('branch', 'restrictedfixture');
  const result = audit(repo, ['refs/heads/restrictedfixture'], options);
  assert.ok(kinds(result).includes('prohibited-name'));
  assert.ok(kinds(result).includes('prohibited-ref'));
  assert.ok(!JSON.stringify(result).includes('restrictedfixture'));
  assert.throws(() => audit(repo, ['refs/heads/main'], { banned: new Set() }), /policy is empty/);
});

test('private gitlinks are rejected', (t) => {
  const { repo, g } = fixture(t);
  g('update-index', '--add', '--cacheinfo', `160000,${g('rev-parse', 'HEAD')},.xrbuild`);
  g('commit', '--quiet', '-m', 'gitlink');
  const result = audit(repo, ['refs/heads/main'], options);
  assert.ok(kinds(result).includes('private-workspace-path'));
  assert.ok(kinds(result).includes('unverifiable-gitlink'));
});

test('an empty private tree cannot disappear from recursive inspection', (t) => {
  const { repo, g } = fixture(t);
  const object = (args, input) => execFileSync('git', ['-C', repo, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const empty = object(['mktree'], '');
  const tree = object(['mktree'], `040000 tree ${empty}\t.xrbuild\n`);
  const commit = g('commit-tree', tree, '-p', g('rev-parse', 'HEAD'), '-m', 'empty tree');
  g('update-ref', 'refs/heads/main', commit);
  assert.ok(kinds(audit(repo, ['refs/heads/main'], options)).includes('private-workspace-path'));
});

test('missing refs/objects and bounded or rewritten views fail closed', (t) => {
  const { repo, g } = fixture(t);
  assert.throws(() => audit(repo, [], options), /explicit/);
  assert.throws(() => audit(repo, ['HEAD'], options), /explicit/);
  assert.throws(() => audit(repo, ['refs/heads/missing'], options), /incomplete/);
  assert.throws(() => audit(repo, ['refs/heads/main'], { ...options, maxObjectBytes: 1 }), /bound/);
  g('config', 'remote.origin.promisor', 'true');
  assert.throws(() => audit(repo, ['refs/heads/main'], options), /Partial/);
  g('config', '--unset', 'remote.origin.promisor');
  const blob = g('rev-parse', 'HEAD:README.md');
  fs.unlinkSync(path.join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  assert.throws(() => audit(repo, ['refs/heads/main'], options), /incomplete|Missing/);
});

test('local rehearsal retains private subtree history and LFS bytes while filtered publication is clean', (t) => {
  const { root, repo, g, write, commit } = fixture(t);
  const bytes = Buffer.from('private binary fixture');
  const oid = createHash('sha256').update(bytes).digest('hex');
  write('.xrbuild/third_party/runtime.dat', pointer(bytes)); commit();
  write('.xrbuild/history.txt', 'historical'); commit();
  g('rm', '--quiet', '.xrbuild/history.txt'); commit();
  const subtree = g('rev-parse', 'HEAD:.xrbuild');
  const split = g('subtree', 'split', '--prefix=.xrbuild', '-b', 'workspace-history').split(/\r?\n/).at(-1);
  assert.equal(g('rev-parse', `${split}^{tree}`), subtree);
  assert.equal(g('rev-list', '--count', split), '3');
  // LFS bytes are a separate recoverable copy, never part of the core bundle or export.
  const lfsBackup = path.join(root, oid);
  fs.writeFileSync(lfsBackup, bytes);
  assert.equal(createHash('sha256').update(fs.readFileSync(lfsBackup)).digest('hex'), oid);
  g('rm', '-r', '--quiet', '.xrbuild'); commit('detach');
  const exportRepo = path.join(root, 'export.git');
  execFileSync('git', ['clone', '--bare', '--no-local', '--single-branch', '--branch', 'main', repo, exportRepo], { stdio: 'pipe' });
  const exp = (...args) => execFileSync('git', ['-C', exportRepo, ...args], {
    encoding: 'utf8', stdio: 'pipe', env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' },
  }).trim();
  exp('config', '--remove-section', 'remote.origin');
  exp('filter-branch', '--index-filter', 'git rm -r --cached --ignore-unmatch -q .xrbuild', '--prune-empty', '--', 'refs/heads/main');
  assert.equal(audit(exportRepo, ['refs/heads/main'], options).clean, true);
  assert.equal(exp('remote'), '', 'no production or source remote configured');
  // Backup refs in the filter copy do not belong in an upload: prove a fresh allowlisted clone is clean.
  const fresh = path.join(root, 'fresh.git');
  execFileSync('git', ['clone', '--bare', '--no-local', '--single-branch', '--branch', 'main', exportRepo, fresh], { stdio: 'pipe' });
  assert.equal(audit(fresh, ['refs/heads/main'], options).clean, true);
  assert.equal(g('rev-parse', `${split}^{tree}`), subtree, 'source private history unchanged');
});

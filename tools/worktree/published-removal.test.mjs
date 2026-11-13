import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { executeGit } from './portable-context.mjs';
import { inspectRemovalTarget, removePublishedCheckout, runtimeCleanupUnavailable } from './published-removal.mjs';
import { remove, sweep } from './worktree.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const cases = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url), 'utf8')).cases;
const shared = id => { const value = cases.find(item => item.id === id); assert.ok(value, id); return value; };
const quiet = () => {};
const removals = calls => calls.filter(call => call.args[0] === 'worktree' && call.args[1] === 'remove');
const remoteWrites = calls => calls.filter(call => ['push', 'send-pack'].includes(call.args[0]));

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'published-removal-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true })); // Only disposable test-owned repositories.
  let root = path.join(sandbox, 'primary'), remote = path.join(sandbox, 'remote.git');
  fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'main');
  root = fs.realpathSync.native(root); remote = path.join(path.dirname(root), 'remote.git');
  git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n.artifacts/\n.xrbuild/\nnode_modules/\n*.local\n');
  fs.writeFileSync(path.join(root, 'source.txt'), 'published source\n');
  fs.mkdirSync(path.join(root, 'folder')); fs.writeFileSync(path.join(root, 'folder', 'source.txt'), 'nested published source\n');
  fs.mkdirSync(path.join(root, 'openspec/changes/fixture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'openspec/changes/fixture/tasks.md'), '- [ ] Unfinished implementation; verify later fixtures.\n');
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'public fixture');
  git(root, 'init', '--quiet', '--bare', remote); git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '--quiet', 'origin', 'main');
  const branch = 'chore/removable', target = path.join(root, '.worktrees', 'removable');
  git(root, 'worktree', 'add', '--quiet', '-b', branch, target);
  git(root, 'push', '--quiet', 'origin', branch);
  const head = git(target, 'rev-parse', 'HEAD'), calls = [];
  const execute = (cwd, args, options) => { calls.push({ cwd, args: [...args] }); return executeGit(cwd, args, options); };
  const registry = path.join(root, '.git', 'fixture-claims.json');
  const writeClaims = (state = 'available', generation = 'fixture-generation-1', selected = target) => {
    fs.writeFileSync(registry, JSON.stringify({ state, generation, target: fs.realpathSync.native(selected) }));
  };
  writeClaims();
  const readClaims = () => JSON.parse(fs.readFileSync(registry, 'utf8'));
  const identify = directory => git(directory, 'remote', 'get-url', 'origin') === remote ? 'timurproko/xrbuild' : 'foreign/repository';
  const options = { root, target, execute, readClaims, identify };
  return { root, target, remote, branch, head, calls, options, writeClaims, registry,
    publish() { git(target, 'add', '.'); git(target, 'commit', '--quiet', '-m', 'fixture update'); git(target, 'push', '--quiet', 'origin', branch); return git(target, 'rev-parse', 'HEAD'); } };
}

// The oracle above is an isolated registry reader, not an assertion that an unreleased runtime adapter exists.
test('C34: published unfinished draft removes exactly one checkout, retaining local/remote refs without PR gates', t => {
  const f = fixture(t), contract = shared('C34'), before = git(f.remote, 'show-ref'), messages = [];
  let prReads = 0;
  const result = remove('removable', { ...f.options, prState: () => { prReads++; throw new Error('No PR/CI/acceptance gate on local-only disposal'); }, log: line => messages.push(line) });
  assert.equal(prReads, 0);
  assert.deepEqual({ checkoutRemoved: !fs.existsSync(f.target), localBranchPreserved: git(f.root, 'rev-parse', f.branch) === f.head,
    remoteWrites: remoteWrites(f.calls).length,
    acceptanceClaimed: ['acceptance', 'accepted', 'delivered'].some(key => Object.hasOwn(result, key)) || messages.some(line => /accepted|acceptance/i.test(line)) }, contract.expect);
  assert.equal(git(f.remote, 'show-ref'), before);
  assert.equal(result.branchPreserved, true);
  assert.deepEqual(removals(f.calls).map(call => call.args), [['worktree', 'remove', '--', f.target]]);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
});

test('C35: a live remote descendant is sufficient, including fetching its previously absent object', t => {
  const f = fixture(t), contract = shared('C35');
  const next = git(f.remote, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', `${f.head}^{tree}`, '-p', f.head, '-m', 'another machine');
  git(f.remote, 'update-ref', `refs/heads/${f.branch}`, next);
  const result = removePublishedCheckout(f.options);
  assert.equal(result.removed, true);
  assert.deepEqual({ publicationVerified: result.remoteHead === next && result.localHead === f.head,
    identicalTipsRequired: result.localHead === result.remoteHead }, contract.expect);
  assert.ok(f.calls.some(call => call.args[0] === 'fetch' && call.args.at(-1) === next));
  assert.equal(remoteWrites(f.calls).length, 0);
});

test('C36: unavailable remote evidence preserves a clean checkout and every ref', t => {
  const f = fixture(t), contract = shared('C36'); fs.renameSync(f.remote, f.remote + '.offline');
  let error;
  try { removePublishedCheckout(f.options); } catch (failure) { error = failure; }
  assert.deepEqual({ checkoutRemoved: !fs.existsSync(f.target), refsPreserved: git(f.root, 'rev-parse', f.branch) === f.head,
    publicationBlockerReported: /Publication blocker/.test(error?.message ?? '') }, contract.expect);
  assert.equal(removals(f.calls).length, 0);
});

test('C37: every preservation hazard independently blocks disposal without force, export or process termination', async t => {
  const contract = shared('C37');
  for (const hazard of contract.given.preservationHazards) await t.test(hazard, t => {
    const f = fixture(t), options = { ...f.options };
    if (hazard === 'dirty') fs.appendFileSync(path.join(f.target, 'source.txt'), 'uncommitted');
    else if (hazard === 'untracked') fs.writeFileSync(path.join(f.target, 'untracked.txt'), 'personal content');
    else if (hazard === 'unknown-ignored') fs.writeFileSync(path.join(f.target, 'notes.local'), 'unknown ignored content');
    else if (hazard === 'private-workspace') { fs.mkdirSync(path.join(f.target, '.xrbuild')); fs.writeFileSync(path.join(f.target, '.xrbuild', 'private.txt'), 'preserved private fixture'); }
    else if (hazard === 'KEEP') { fs.mkdirSync(path.join(f.target, '.artifacts')); fs.writeFileSync(path.join(f.target, '.artifacts', 'KEEP'), 'keep fixture'); }
    else if (hazard === 'nested-Git') git(path.join(f.target, 'folder'), 'init', '--quiet');
    else if (hazard === 'gitlink') {
      git(f.target, 'update-index', '--add', '--cacheinfo', `160000,${f.head},module`);
      git(f.target, 'commit', '--quiet', '-m', 'fixture gitlink'); git(f.target, 'push', '--quiet', 'origin', f.branch);
      assert.match(git(f.target, 'ls-files', '--stage', 'module'), /^160000 /);
    }
    else if (hazard === 'unsafe-link') fs.symlinkSync(f.root, path.join(f.target, 'folder', 'linked'), 'junction');
    else if (hazard === 'live-owner') f.writeClaims('live');
    else if (hazard === 'unverifiable-owner') f.writeClaims('unknown');
    else if (hazard === 'primary-or-current-directory') options.cwd = f.target;
    else assert.fail(`Unbound preservation hazard ${hazard}`);
    const beforeHead = git(f.root, 'rev-parse', f.branch), before = fs.readFileSync(path.join(f.target, 'source.txt'));
    assert.throws(() => removePublishedCheckout(options), /preserv|cannot be removed|ownership|must be/);
    assert.deepEqual({ checkoutRemoved: !fs.existsSync(f.target),
      privateExportCalls: f.calls.filter(call => ['archive', 'bundle', 'clone', 'push'].includes(call.args[0])).length,
      forceRemovalCalls: removals(f.calls).filter(call => call.args.includes('--force') || call.args.includes('-f')).length,
      processTerminationCalls: f.calls.filter(call => ['taskkill', 'kill', 'TerminateProcess'].includes(call.args[0])).length,
      userDataPreserved: fs.readFileSync(path.join(f.target, 'source.txt')).equals(before) && git(f.root, 'rev-parse', f.branch) === beforeHead }, contract.expect);
    assert.equal(removals(f.calls).length, 0);
    if (hazard === 'primary-or-current-directory') assert.throws(() => removePublishedCheckout({ ...f.options, target: f.root }), /Primary\/current/);
    if (hazard === 'unsafe-link') assert.equal(fs.readFileSync(path.join(f.root, 'source.txt'), 'utf8'), 'published source\n');
    if (hazard === 'private-workspace') assert.equal(fs.readFileSync(path.join(f.target, '.xrbuild', 'private.txt'), 'utf8'), 'preserved private fixture');
    if (hazard === 'KEEP') assert.equal(fs.readFileSync(path.join(f.target, '.artifacts', 'KEEP'), 'utf8'), 'keep fixture');
    if (hazard === 'nested-Git') assert.ok(fs.existsSync(path.join(f.target, 'folder', '.git', 'HEAD')));
  });
});

test('C38: a tracked regular .gitmodules alone does not trigger the nested-repository gate', t => {
  const f = fixture(t), contract = shared('C38');
  fs.writeFileSync(path.join(f.target, '.gitmodules'), '# Reviewed descriptor without initialized metadata or gitlinks.\n'); f.publish();
  const inspected = inspectRemovalTarget(f.options);
  assert.equal(inspected.branch, f.branch);
  for (const [name, file] of [['checkout', f.target], ['marker', path.join(f.target, '.git')], ['admin', inspected.admin]]) {
    const stat = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(inspected.identity[name], { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) }, 'physical identifiers retain exact 64-bit precision, including on Windows');
  }
  assert.deepEqual({ blockedSolelyByGitmodules: !inspected }, contract.expect);
});

test('configured submodules, hardlinks, metadata locks, unknown Git state and inspection bounds preserve resources', async t => {
  for (const hazard of ['configured-submodule', 'source-hardlink', 'git-lock', 'shared-lock', 'metadata-data', 'message-draft', 'recovery-reference', 'recovery-log', 'entry-bound', 'file-bound']) await t.test(hazard, t => {
    const f = fixture(t), options = { ...f.options };
    if (hazard === 'configured-submodule') git(f.target, 'config', 'submodule.fixture.url', 'https://example.invalid/fixture');
    if (hazard === 'source-hardlink') fs.linkSync(path.join(f.target, 'source.txt'), path.join(f.root, 'outside.local'));
    const admin = git(f.target, 'rev-parse', '--absolute-git-dir');
    if (hazard === 'git-lock') fs.writeFileSync(path.join(admin, 'index.lock'), 'foreign lock');
    if (hazard === 'shared-lock') fs.writeFileSync(path.join(f.root, '.git', 'config.lock'), 'foreign shared lock');
    if (hazard === 'message-draft') fs.writeFileSync(path.join(admin, 'COMMIT_EDITMSG'), 'unpublished message draft\n');
    if (hazard.startsWith('recovery-')) {
      const orphan = git(f.root, 'commit-tree', `${f.head}^{tree}`, '-p', f.head, '-m', 'unpublished recovery');
      if (hazard === 'recovery-reference') fs.writeFileSync(path.join(admin, 'ORIG_HEAD'), orphan + '\n');
      else fs.appendFileSync(path.join(admin, 'logs', 'HEAD'), `${f.head} ${orphan} Fixture <fixture@example.invalid> 0 +0000\tunpublished recovery\n`);
    }
    if (hazard === 'metadata-data') fs.writeFileSync(path.join(admin, 'personal.txt'), 'unknown Git-directory data');
    if (hazard === 'entry-bound') options.limits = { entries: 1 };
    if (hazard === 'file-bound') options.limits = { fileBytes: 1 };
    assert.throws(() => removePublishedCheckout(options), /preserv|lock|bound|uninspected/);
    assert.ok(fs.existsSync(f.target)); assert.equal(removals(f.calls).length, 0);
  });
});

test('actual byte verification protects dirty content hidden behind index assume-unchanged/stat caches', t => {
  const f = fixture(t), file = path.join(f.target, 'source.txt'), stat = fs.statSync(file);
  git(f.target, 'update-index', '--assume-unchanged', 'source.txt');
  fs.writeFileSync(file, 'unsharedx source\n'); fs.utimesSync(file, stat.atime, stat.mtime);
  assert.equal(git(f.target, 'status', '--porcelain'), '', 'the Git stat/cache shortcut alone is insufficient');
  assert.throws(() => removePublishedCheckout(f.options), /Unpublished source bytes/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unsharedx source\n');
  assert.equal(removals(f.calls).length, 0);
});

test('checked text normalization permits ordinary CRLF while binary line-ending changes stay protected', async t => {
  await t.test('text', t => {
    const f = fixture(t); git(f.target, 'config', 'core.autocrlf', 'true');
    fs.writeFileSync(path.join(f.target, 'source.txt'), 'published source\r\n');
    assert.equal(removePublishedCheckout(f.options).removed, true);
  });
  await t.test('binary', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.target, '.gitattributes'), 'source.txt -text\n');
    fs.writeFileSync(path.join(f.target, 'source.txt'), 'published source\n'); f.publish();
    assert.equal(execFileSync('git', ['-C', f.target, 'show', 'HEAD:source.txt'], { encoding: 'utf8', stdio: 'pipe' }), 'published source\n');
    git(f.target, 'config', 'core.autocrlf', 'true');
    fs.writeFileSync(path.join(f.target, 'source.txt'), 'published source\r\n');
    assert.throws(() => removePublishedCheckout(f.options), /Unpublished source bytes/);
    assert.ok(fs.existsSync(f.target));
  });
});

test('new content/claims before settlement retain the target and unrelated worktrees; no bulk or cwd fallback', async t => {
  for (const change of ['ignored-content', 'new-owner']) await t.test(change, t => {
    const f = fixture(t), unrelated = path.join(f.root, '.worktrees', 'unrelated');
    git(f.root, 'worktree', 'add', '--quiet', '-b', 'chore/unrelated', unrelated);
    const cwd = process.cwd(); let changed = false;
    const execute = (directory, args, options) => {
      const result = f.options.execute(directory, args, options);
      if (!changed && args[0] === 'ls-remote') {
        changed = true;
        if (change === 'ignored-content') fs.writeFileSync(path.join(f.target, 'late.local'), 'new ignored user content');
        else f.writeClaims('live', 'fixture-generation-2');
      }
      return result;
    };
    assert.throws(() => removePublishedCheckout({ ...f.options, execute }), /preserv|ownership|content/i);
    assert.ok(fs.existsSync(f.target)); assert.ok(fs.existsSync(unrelated));
    assert.equal(process.cwd(), cwd);
    assert.equal(removals(f.calls).length, 0);
    assert.equal(f.calls.some(call => call.args.includes('sweep') || call.args.includes('--force')), false);
    // Actual runtime detach/settle integration remains incomplete under task 3.3; this tests only the repository boundary.
  });
});

test('C40: unavailable runtime support reports a blocker without substituting complete/discard/sweep/deletion', () => {
  const contract = shared('C40'), attempts = []; let error;
  try { runtimeCleanupUnavailable({ complete: () => attempts.push('complete'), discard: () => attempts.push('discard'), sweep: () => attempts.push('sweep'), remove: () => attempts.push('remove') }); }
  catch (failure) { error = failure; }
  assert.deepEqual({ unavailableReported: /unavailable/.test(error?.message ?? ''), completeSubstituted: attempts.includes('complete'),
    discardSubstituted: attempts.includes('discard'), sweepSubstituted: attempts.includes('sweep'), runtimeDeletionCalls: attempts.filter(value => value === 'remove').length }, contract.expect);
});

test('C41: interrupted Git removal and recreated checkout identities cannot inherit a previous journal', t => {
  const f = fixture(t), contract = shared('C41'); let interrupted = false;
  const execute = (directory, args, options) => {
    const result = f.options.execute(directory, args, options);
    if (args[0] === 'worktree' && args[1] === 'remove') {
      interrupted = true;
      git(f.root, 'worktree', 'add', '--quiet', f.target, f.branch);
      fs.writeFileSync(path.join(f.target, 'new-user.txt'), 'recreated checkout data');
      throw new Error('interrupted after Git settled');
    }
    return result;
  };
  assert.throws(() => removePublishedCheckout({ ...f.options, execute }), /Non-force Git removal failed/);
  assert.equal(interrupted, true);
  const folder = path.join(f.root, '.git', 'xrb-removal'), journals = fs.readdirSync(folder).filter(name => name.endsWith('.json'));
  assert.equal(journals.length, 1);
  const file = path.join(folder, journals[0]), before = fs.readFileSync(file, 'utf8');
  assert.equal(JSON.parse(before).phase, 'partial');
  f.calls.length = 0;
  assert.throws(() => removePublishedCheckout(f.options), /explicit recovery required/);
  assert.deepEqual({ recreatedCheckoutPreserved: fs.readFileSync(path.join(f.target, 'new-user.txt'), 'utf8') === 'recreated checkout data',
    retainedRefsPreserved: git(f.root, 'rev-parse', f.branch) === f.head }, contract.expect);
  assert.equal(removals(f.calls).length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('successful journal replay is non-destructive; recreated completed paths and unknown owners remain blocked', t => {
  const f = fixture(t); removePublishedCheckout(f.options);
  f.calls.length = 0;
  assert.equal(removePublishedCheckout(f.options).alreadyRemoved, true);
  assert.equal(removals(f.calls).length, 0);
  git(f.root, 'worktree', 'add', '--quiet', f.target, f.branch);
  assert.throws(() => removePublishedCheckout(f.options), /path was recreated/);
  assert.ok(fs.existsSync(f.target));
  const other = path.join(f.root, '.worktrees', 'other'); git(f.root, 'worktree', 'add', '--quiet', '-b', 'chore/other', other);
  assert.throws(() => removePublishedCheckout({ ...f.options, target: other, readClaims: undefined }), /ownership adapter unavailable/);
  assert.ok(fs.existsSync(other));
});

test('recreated operation locks and unknown journal fields stay untouched on retry', async t => {
  await t.test('lock', t => {
    const f = fixture(t); let replaced = false, lock;
    const readClaims = context => {
      if (!replaced) {
        const directory = path.join(f.root, '.git', 'xrb-removal');
        lock = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.lock')));
        fs.writeFileSync(lock, 'new unverifiable lock owner'); replaced = true;
      }
      return f.options.readClaims(context);
    };
    assert.throws(() => removePublishedCheckout({ ...f.options, readClaims }), /Cleanup lock changed/);
    assert.equal(fs.readFileSync(lock, 'utf8'), 'new unverifiable lock owner');
    assert.throws(() => removePublishedCheckout(f.options), /locked or unverifiable/);
    assert.equal(removals(f.calls).length, 0); assert.ok(fs.existsSync(f.target));
  });
  await t.test('journal', t => {
    const f = fixture(t); let reads = 0;
    const readClaims = context => {
      if (++reads === 2) f.writeClaims('live', 'new-generation');
      return f.options.readClaims(context);
    };
    assert.throws(() => removePublishedCheckout({ ...f.options, readClaims }), /ownership/);
    const directory = path.join(f.root, '.git', 'xrb-removal'), file = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.json')));
    const record = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(record.phase, 'prepared');
    record.untrustedNote = 'preserve operator metadata'; fs.writeFileSync(file, JSON.stringify(record));
    const bytes = fs.readFileSync(file, 'utf8'); f.writeClaims();
    assert.throws(() => removePublishedCheckout(f.options), /Unknown cleanup journal/);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    assert.equal(removals(f.calls).length, 0); assert.ok(fs.existsSync(f.target));
  });
});

test('cleanup implementation has no recursive/force filesystem fallback or ref deletion path', () => {
  const source = fs.readFileSync(new URL('./published-removal.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:rmSync|rmdirSync)\s*\(|['"]--force['"]|\['branch',\s*['"]-[dD]['"]/);
  assert.match(source, /\['worktree', 'remove', '--', snapshot\.target\]/);
});

test('sweep removes only freshly merged eligible snapshots and retains all local refs; discard never broadens authority', t => {
  const f = fixture(t), other = path.join(f.root, '.worktrees', 'open');
  git(f.root, 'worktree', 'add', '--quiet', '-b', 'chore/open', other); git(f.root, 'push', '--quiet', 'origin', 'chore/open');
  const rows = sweep({ ...f.options, prState: branch => branch === f.branch ? 'MERGED' : 'OPEN', apply: true, log: quiet });
  assert.equal(rows.find(row => row.branch === f.branch).cleanup, 'removed');
  assert.equal(rows.find(row => row.branch === 'chore/open').state, 'active');
  assert.equal(fs.existsSync(f.target), false); assert.ok(fs.existsSync(other));
  assert.equal(git(f.root, 'rev-parse', f.branch), f.head);
  assert.throws(() => remove('open', { ...f.options, discard: true, log: quiet }), /separate supported adapter/);
  assert.ok(fs.existsSync(other)); assert.equal(git(f.root, 'rev-parse', 'chore/open'), f.head);
  assert.equal(remoteWrites(f.calls).length, 0);
});

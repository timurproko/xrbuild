import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { enter, handoff } from './worktree.mjs';
import { attachA1, executeGit, publicationEvidence, refreshSelectedRefs, registeredContexts } from './portable-context.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const quiet = () => {};
const cases = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url), 'utf8')).cases;
const shared = id => { const value = cases.find(item => item.id === id); assert.ok(value, id); return value; };

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-context-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const seed = path.join(sandbox, 'seed'), remote = path.join(sandbox, 'remote.git'), root = path.join(sandbox, 'primary');
  fs.mkdirSync(seed);
  git(seed, 'init', '--quiet', '-b', 'main');
  git(seed, 'config', 'user.name', 'Fixture'); git(seed, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(seed, '.gitignore'), '.worktrees/\n.artifacts/\nnode_modules/\n.xrbuild/\nthird_party/*\n');
  fs.writeFileSync(path.join(seed, 'source.txt'), 'initial source\n');
  git(seed, 'add', '.'); git(seed, 'commit', '--quiet', '-m', 'initial');
  git(seed, 'init', '--bare', '--quiet', remote);
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '--quiet', 'origin', 'main');
  git(sandbox, 'clone', '--quiet', '--no-local', remote, root);
  git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const identify = directory => path.resolve(git(directory, 'remote', 'get-url', 'origin')) === remote ? 'timurproko/xrbuild' : 'foreign/repository';
  const commands = [];
  const execute = (cwd, args) => { commands.push({ cwd, args }); return executeGit(cwd, args); };
  const options = { root, identify, execute, log: quiet };
  const branch = 'chore/portable';
  const proposal = () => {
    git(seed, 'switch', '--quiet', '-c', branch);
    fs.mkdirSync(path.join(seed, 'openspec/changes/portable'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'openspec/changes/portable/proposal.md'), '# Portable proposal\n\nPreserve this reviewed plan.\n');
    git(seed, 'add', '.'); git(seed, 'commit', '--quiet', '-m', 'public proposal'); git(seed, 'push', '--quiet', 'origin', branch);
    return git(seed, 'rev-parse', 'HEAD');
  };
  const commit = (directory, message) => {
    fs.appendFileSync(path.join(directory, 'source.txt'), message + '\n');
    git(directory, 'add', 'source.txt'); git(directory, 'commit', '--quiet', '-m', message);
    return git(directory, 'rev-parse', 'HEAD');
  };
  const localCommit = (parent, message) => git(root, 'commit-tree', `${parent}^{tree}`, '-p', parent, '-m', message);
  return { sandbox, seed, remote, root, branch, options, identify, commands, proposal, commit, localCommit };
}

// Actual Git fixtures and mocked runtime attachment; no fixture's expected object is returned by an adapter.
test('C09: fresh-machine entry fetches the same proposal branch with no setup, primary edits or remote writes', t => {
  const f = fixture(t), contract = shared('C09');
  const proposal = f.proposal(), primaryHead = git(f.root, 'rev-parse', 'HEAD'), before = git(f.remote, 'show-ref');
  let installs = 0;
  const dir = enter(f.branch, { ...f.options, installFn: () => { installs++; } });
  const branch = git(dir, 'branch', '--show-current'), head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(head === proposal, contract.expect.proposalHistoryPreserved);
  assert.equal(branch === f.branch && git(f.remote, 'show-ref') === before, contract.expect.sameBranchAndPr);
  assert.equal(git(f.root, 'branch', '--show-current') !== 'main' || git(f.root, 'rev-parse', 'HEAD') !== primaryHead, contract.expect.primaryChanged);
  assert.equal(installs > 0, contract.expect.dependencyInstallImplicit);
  assert.equal(git(f.root, 'rev-parse', `refs/remotes/origin/${f.branch}`), proposal, 'proposal was freshly fetched');
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', '@{upstream}'), `origin/${f.branch}`, 'adoption tracks the task branch, never main');
  assert.match(fs.readFileSync(path.join(dir, 'openspec/changes/portable/proposal.md'), 'utf8'), /reviewed plan/);
  assert.equal(git(f.root, 'status', '--porcelain'), '');
  assert.equal(fs.existsSync(path.join(dir, '.xrbuild')), false);
});

test('C10: successful ownership attachment resumes staged, dirty, untracked and private data in place', t => {
  const f = fixture(t), contract = shared('C10'); f.proposal();
  const dir = enter(f.branch, f.options), original = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'source.txt'), 'staged task edit\n'); git(dir, 'add', 'source.txt');
  fs.appendFileSync(path.join(dir, 'source.txt'), 'unstaged task edit\n');
  fs.writeFileSync(path.join(dir, 'new.txt'), 'new task content');
  fs.mkdirSync(path.join(dir, '.xrbuild')); fs.writeFileSync(path.join(dir, '.xrbuild', 'local.txt'), 'independent private state');
  const before = git(dir, 'status', '--porcelain'), calls = [], log = [];
  const resumed = enter(f.branch, { ...f.options, log: text => log.push(text), acquireOwnership: target => attachA1(target, (command, args) => { calls.push({ command, args }); }) });
  assert.equal(resumed === dir && git(dir, 'status', '--porcelain') === before, contract.expect.dirtyEditsPreserved);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), original);
  assert.equal(fs.readFileSync(path.join(dir, '.xrbuild', 'local.txt'), 'utf8'), 'independent private state');
  assert.deepEqual(calls, [{ command: 'a1', args: ['worktree', 'attach', dir] }]);
  assert.equal(registeredContexts(f.root).filter(item => item.branch === f.branch).length !== 1, contract.expect.replacementCheckoutCreated);
  assert.equal(log.some(line => /reset|inventory/.test(line)), false);
  assert.equal(f.commands.filter(call => call.args[0] === 'reset').length, contract.expect.resetCalls);
  assert.equal(git(dir, 'diff', '--cached', '--name-only'), 'source.txt');
  assert.equal(git(dir, 'diff', '--name-only'), 'source.txt');
});

test('C11-C12: busy or failed attachment refuses resume, preserves files and never sets up dependencies', t => {
  const f = fixture(t), busy = shared('C11'), failed = shared('C12'); f.proposal();
  const dir = enter(f.branch, f.options);
  fs.writeFileSync(path.join(dir, 'source.txt'), 'owned by another task session\n');
  const before = fs.readFileSync(path.join(dir, 'source.txt')), head = git(dir, 'rev-parse', 'HEAD');
  let installs = 0, rejection; const messages = [], runtimeCalls = [];
  try { enter(f.branch, { ...f.options, install: true, installFn: () => { installs++; },
    log: message => messages.push(message), acquireOwnership: target => attachA1(target, (command, args) => {
      runtimeCalls.push({ command, args }); throw new Error('owner busy');
    }) }); } catch (error) { rejection = error; }
  assert.match(rejection.message, /owner busy/);
  assert.deepEqual({ blocked: Boolean(rejection), takeover: runtimeCalls.some(call => call.args.some(arg => /--(?:force|takeover)/.test(arg))),
    primaryFallback: f.commands.some(call => ['switch', 'checkout'].includes(call.args[0])),
    existingFilesPreserved: fs.readFileSync(path.join(dir, 'source.txt')).equals(before) }, busy.expect);
  assert.deepEqual({ implementationEdits: installs, successClaimed: messages.length > 0,
    primaryFallback: f.commands.some(call => ['switch', 'checkout'].includes(call.args[0])) }, failed.expect);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
  assert.throws(() => enter(f.branch, f.options), /ownership.*unverifiable/);
  assert.throws(() => enter(f.branch, { ...f.options, acquireOwnership: () => false }), /ownership.*unverifiable/);
  assert.equal(fs.readFileSync(path.join(dir, 'source.txt')).equals(before), true);
});

test('C13: ordinary external Git worktrees need no A1 installation or forged runtime identity', t => {
  const f = fixture(t), contract = shared('C13'); f.proposal();
  const dir = enter(f.branch, f.options);
  fs.appendFileSync(path.join(dir, 'source.txt'), 'external owned task edit\n');
  assert.equal(git(dir, 'diff', '--name-only'), 'source.txt');
  assert.equal(fs.existsSync(path.join(dir, '.artifacts', 'runtime.json')), contract.expect.runtimeIdentityForged);
  assert.equal(fs.existsSync(path.join(dir, 'node_modules', 'a1')), contract.expect.a1InstallationRequired);
});

test('unoccupied local commits are retained; divergence, local-behind and expected-head drift block without reset', t => {
  const f = fixture(t), proposal = f.proposal();
  git(f.root, 'fetch', '--quiet', 'origin', f.branch);
  const local = f.localCommit(proposal, 'local task continuation');
  git(f.root, 'update-ref', `refs/heads/${f.branch}`, local);
  const dir = enter(f.branch, { ...f.options, expectedHead: local });
  assert.equal(git(dir, 'rev-parse', 'HEAD'), local);
  assert.equal(git(dir, 'merge-base', proposal, 'HEAD'), proposal);
  git(f.root, 'worktree', 'remove', dir); // Fixture-owned ordinary Git cleanup, never production removal.
  const remote = f.commit(f.seed, 'another machine'); git(f.seed, 'push', '--quiet', 'origin', f.branch);
  assert.throws(() => enter(f.branch, f.options), /histories differ/);
  assert.equal(git(f.root, 'rev-parse', f.branch), local);
  assert.equal(fs.existsSync(dir), false);
  git(f.root, 'update-ref', `refs/heads/${f.branch}`, proposal);
  assert.throws(() => enter(f.branch, f.options), /histories differ/);
  assert.equal(git(f.root, 'rev-parse', f.branch), proposal);
  git(f.root, 'update-ref', '-d', `refs/heads/${f.branch}`);
  assert.throws(() => enter(f.branch, { ...f.options, expectedHead: proposal }), /expected task head/);
  assert.equal(git(f.root, 'rev-parse', `refs/remotes/origin/${f.branch}`), remote);
  assert.equal(fs.existsSync(dir), false);
});

test('path collisions, foreign identities, unsafe links, Git locks and concurrent acquisition preserve everything', t => {
  const f = fixture(t); f.proposal();
  const dir = enter(f.branch, f.options);
  assert.throws(() => enter('fix/portable', f.options), /not the selected registered task checkout/);
  assert.throws(() => enter('fix/other', { ...f.options, identify: () => 'foreign/repository' }), /not the expected repository/);
  git(f.root, 'worktree', 'lock', '--reason', 'another owner', dir);
  let ownershipCalls = 0;
  assert.throws(() => enter(f.branch, { ...f.options, acquireOwnership: () => { ownershipCalls++; return true; } }), /locked/);
  assert.equal(ownershipCalls, 0);
  git(f.root, 'worktree', 'unlock', dir);
  const metadata = git(dir, 'rev-parse', '--absolute-git-dir');
  fs.writeFileSync(path.join(metadata, 'index.lock'), 'foreign lock');
  assert.throws(() => enter(f.branch, { ...f.options, acquireOwnership: () => true }), /Git lock/);
  fs.unlinkSync(path.join(metadata, 'index.lock'));
  fs.writeFileSync(path.join(f.root, '.git', 'xrb-context', 'another.lock'), 'unverifiable prior process');
  assert.throws(() => enter('fix/another', f.options), /acquisition is locked/);
  assert.equal(fs.readFileSync(path.join(f.root, '.git', 'xrb-context', 'another.lock'), 'utf8'), 'unverifiable prior process');
  const target = path.join(f.sandbox, 'foreign'); fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(f.root, '.worktrees', 'linked'), 'junction');
  assert.throws(() => enter('fix/linked', f.options), /plain and unlinked/);
  assert.deepEqual(fs.readdirSync(target), []);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
});

test('head race after attachment blocks setup; attachment/setup failure preserves recoverable new checkout', t => {
  const f = fixture(t); const proposal = f.proposal();
  let setups = 0;
  assert.throws(() => enter(f.branch, { ...f.options, install: true, installFn: () => { setups++; throw new Error('offline'); }, acquireOwnership: () => true }), /checkout\/history preserved/);
  const dir = path.join(f.root, '.worktrees', 'portable');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), proposal);
  const changed = f.localCommit(proposal, 'race');
  assert.throws(() => enter(f.branch, { ...f.options, install: true, installFn: () => { setups++; }, acquireOwnership: () => {
    git(dir, 'update-ref', `refs/heads/${f.branch}`, changed); return true;
  } }), /head changed/);
  assert.equal(setups, 1);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), changed, 'external race is not reset');
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
});

test('publication-aware handoff distinguishes equal/descendant remote heads, local-only commits and dirty work', t => {
  const f = fixture(t), proposal = f.proposal(), dir = enter(f.branch, f.options);
  const record = () => JSON.parse(fs.readFileSync(path.join(dir, '.artifacts', 'handoff.json'), 'utf8'));
  const report = () => handoff('portable', { ...f.options, change: 'portable', pr: 19 });
  report();
  assert.equal(record().publicationVerified, true); assert.equal(record().unpublishedWork, false);
  const remoteHead = f.commit(f.seed, 'remote descendant'); git(f.seed, 'push', '--quiet', 'origin', f.branch);
  report();
  assert.equal(record().remoteHead, remoteHead); assert.equal(record().localHead, proposal);
  assert.equal(record().publicationVerified, true, 'safe remote descendants contain the local head');
  fs.writeFileSync(path.join(dir, 'source.txt'), 'uncommitted local edit\n'); report();
  assert.equal(record().publicationVerified, true, 'HEAD containment and dirty state are separate');
  assert.equal(record().unpublishedWork, true); assert.equal(record().dirty, true);
  git(dir, 'add', 'source.txt'); git(dir, 'commit', '--quiet', '-m', 'local-only');
  assert.match(report(), /Publication: unverified/);
  assert.equal(record().publicationVerified, false); assert.equal(record().dirty, false); assert.equal(record().unpublishedWork, true);
  assert.equal(git(f.remote, 'rev-parse', f.branch), remoteHead, 'handoff makes no remote writes');
});

test('C32: detached clean unpublished handoff never advertises remote availability', t => {
  const f = fixture(t), contract = shared('C32'); f.proposal();
  const dir = enter(f.branch, f.options), local = f.localCommit(git(dir, 'rev-parse', 'HEAD'), 'detached local-only');
  git(dir, 'checkout', '--quiet', '--detach', local);
  const report = handoff('portable', { ...f.options, change: 'portable', pr: 19 });
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.artifacts', 'handoff.json'), 'utf8'));
  assert.equal(record.publicationVerified, contract.expect.publicationVerified);
  assert.equal(record.unpublishedWork, contract.expect.unpublishedWorkReported);
  assert.equal(report.includes('Publication: HEAD contained'), contract.expect.remotelyAvailableClaimed);
  assert.equal(record.branch, null);
});

test('offline or ambiguous remote evidence stays unverified and linked scratch is never overwritten', t => {
  const f = fixture(t), proposal = f.proposal(), dir = enter(f.branch, f.options);
  fs.renameSync(f.remote, f.remote + '.offline');
  const evidence = publicationEvidence(f.root, f.branch, proposal, { identify: f.identify });
  assert.equal(evidence.publicationVerified, false);
  assert.equal(evidence.remoteHead, null);
  assert.equal(evidence.reason, 'Remote publication evidence is unavailable');
  const foreign = path.join(f.sandbox, 'foreign-artifacts'); fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'handoff.json'), 'do not overwrite');
  fs.symlinkSync(foreign, path.join(dir, '.artifacts'), 'junction');
  assert.throws(() => handoff('portable', f.options), /plain and unlinked/);
  assert.equal(fs.readFileSync(path.join(foreign, 'handoff.json'), 'utf8'), 'do not overwrite');
});

test('vanished cached proposals and unavailable fetch evidence never restart or overwrite task history', t => {
  const f = fixture(t), proposal = f.proposal();
  git(f.root, 'fetch', '--quiet', 'origin', `${f.branch}:refs/remotes/origin/${f.branch}`);
  git(f.seed, 'push', '--quiet', 'origin', '--delete', f.branch);
  assert.throws(() => enter(f.branch, f.options), /cached history is preserved/);
  assert.equal(git(f.root, 'rev-parse', `refs/remotes/origin/${f.branch}`), proposal);
  assert.equal(fs.existsSync(path.join(f.root, '.worktrees', 'portable')), false);
  fs.renameSync(f.remote, f.remote + '.offline');
  assert.throws(() => enter('fix/offline', f.options), /Git context operation failed/);
  assert.equal(fs.existsSync(path.join(f.root, '.worktrees', 'offline')), false);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
});

test('failed new attachment preserves its proposal checkout, and ambient Git identities cannot redirect context', t => {
  const f = fixture(t), proposal = f.proposal();
  let setups = 0;
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = path.join(f.sandbox, 'not-the-selected-repository');
  t.after(() => { if (previous === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previous; });
  // The fixture identity verifier uses Git too, so isolate its own explicit root lookup from ambient state.
  const identify = directory => executeGit(directory, ['remote', 'get-url', 'origin']) === f.remote ? 'timurproko/xrbuild' : 'foreign/repository';
  assert.throws(() => enter(f.branch, { ...f.options, identify, install: true, installFn: () => { setups++; }, acquireOwnership: () => false }), /Attachment failed/);
  const dir = path.join(f.root, '.worktrees', 'portable');
  assert.equal(executeGit(dir, ['rev-parse', 'HEAD']), proposal);
  assert.equal(executeGit(f.root, ['branch', '--show-current']), 'main');
  assert.equal(setups, 0);
  const originalLock = path.join(f.root, '.git', 'xrb-context', 'portable.lock');
  assert.equal(fs.existsSync(originalLock), false, 'only the owned acquisition lock is released');
});

test('fresh repository identity and acquisition ownership are rechecked before creation/setup', t => {
  const f = fixture(t); f.proposal();
  const foreign = path.join(f.sandbox, 'other-remote.git'); git(f.seed, 'init', '--bare', '--quiet', foreign);
  assert.throws(() => enter(f.branch, { ...f.options, refresh: (root, branch, execute) => {
    const refs = refreshSelectedRefs(root, branch, execute);
    git(f.root, 'remote', 'set-url', 'origin', foreign);
    return refs;
  } }), /not the expected repository/);
  assert.equal(fs.existsSync(path.join(f.root, '.worktrees', 'portable')), false);
  git(f.root, 'remote', 'set-url', 'origin', f.remote);
  let setups = 0;
  const lock = path.join(f.root, '.git', 'xrb-context', 'portable.lock');
  assert.throws(() => enter(f.branch, { ...f.options, install: true, installFn: () => { setups++; }, acquireOwnership: () => {
    fs.writeFileSync(lock, 'new or unverifiable owner'); return true;
  } }), /acquisition changed/);
  assert.equal(setups, 0);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'new or unverifiable owner', 'new lock contents are retained, never cleared as the previous claim');
  assert.equal(fs.existsSync(path.join(f.root, '.worktrees', 'portable', '.git')), true, 'recoverable created checkout retained');
});

// Repository-owned context and publication adapters. No reset, push, merge, cleanup or private provisioning.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { verifyContractInstallation } from './delivery-contract.mjs';

const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
const SHA = /^[a-f0-9]{40}$/;
const fail = message => { throw new Error(message); };
export const contextEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i.test(key)
  && !/^(?:GH_REPO|GH_HOST)$/.test(key)));
export function executeGit(cwd, args) {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd, env: contextEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    }).trimEnd();
  } catch {
    throw Object.assign(new Error('Git context operation failed; inspect repository/ref access without discarding work'), { code: 'XRB_GIT_UNAVAILABLE' });
  }
}
const run = executeGit;
const real = file => fs.realpathSync.native(file);
const same = (a, b) => process.platform === 'win32' ? real(a).toLowerCase() === real(b).toLowerCase() : real(a) === real(b);
const exists = file => { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

function plain(file, missing = false) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = exists(current);
    if (!stat && missing) continue;
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile() || stat.isFile() && stat.nlink !== 1) {
      fail('Context paths must be plain and unlinked; existing files are preserved');
    }
  }
  return absolute;
}

export function identifyRepository(root) {
  try {
    return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
      cwd: root, env: contextEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
    }).trim();
  } catch { fail('Repository identity is unavailable; no task context adopted'); }
}

export function registeredContexts(root, execute = run) {
  const entries = [];
  for (const block of execute(root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean)) {
    const fields = block.split('\0');
    const field = key => fields.find(item => item.startsWith(`${key} `))?.slice(key.length + 1);
    entries.push({ dir: path.resolve(field('worktree')), branch: field('branch')?.replace(/^refs\/heads\//, '') ?? null,
      head: field('HEAD'), locked: fields.some(item => item === 'locked' || item.startsWith('locked ')),
      prunable: fields.some(item => item === 'prunable' || item.startsWith('prunable ')) });
  }
  return entries;
}

function ref(root, name, execute = run) {
  const matches = execute(root, ['for-each-ref', '--format=%(refname) %(objectname)', name])
    .split('\n').filter(line => line.startsWith(`${name} `));
  if (!matches.length) return null;
  const result = matches[0].slice(name.length + 1);
  if (matches.length !== 1 || !SHA.test(result)) fail(`Ambiguous ref: ${name}`);
  return result;
}

/** Read only remote operations; stores fetched public objects/remote-tracking refs, never task refs. */
export function refreshSelectedRefs(root, branch, execute = run) {
  const names = [...new Set([adapter.baseBranch, branch])];
  const listing = execute(root, ['ls-remote', '--heads', 'origin', ...names.map(name => `refs/heads/${name}`)]);
  const tips = new Map(listing.split('\n').filter(Boolean).map(line => line.split(/\s+/)));
  const heads = Object.fromEntries([...tips].map(([sha, name]) => [name, sha]));
  const base = heads[`refs/heads/${adapter.baseBranch}`];
  if (!SHA.test(base ?? '')) fail('Live base ref is missing or unverifiable');
  for (const name of names) {
    const observed = heads[`refs/heads/${name}`];
    if (!observed) continue;
    if (!SHA.test(observed)) fail('Malformed live remote ref');
    execute(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', 'origin', `refs/heads/${name}:refs/remotes/origin/${name}`]);
    if (ref(root, `refs/remotes/origin/${name}`, execute) !== observed) fail('Remote ref changed during fetch; no task branch adopted');
  }
  return { base, remote: heads[`refs/heads/${branch}`] ?? null };
}

export function attachA1(dir, execute = execFileSync) {
  // Exit success is the runtime attachment confirmation. Do not inspect runtime inventories or forge identity.
  execute('a1', ['worktree', 'attach', dir], { cwd: dir, env: contextEnvironment(), stdio: 'inherit', timeout: 30_000 });
  return true;
}

function checkedContext(root, dir, branch, expectedHead, execute = run) {
  plain(dir);
  const marker = fs.lstatSync(path.join(dir, '.git'));
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || !same(execute(dir, ['rev-parse', '--show-toplevel']), dir)
    || !same(path.resolve(dir, execute(dir, ['rev-parse', '--git-common-dir'])), path.join(root, '.git'))
    || execute(dir, ['branch', '--show-current']) !== branch) fail('Foreign or mismatched task checkout; files preserved');
  const entry = registeredContexts(root, execute).find(item => exists(item.dir) && same(item.dir, dir));
  if (!entry || entry.branch !== branch || entry.locked || entry.prunable) fail('Task checkout registration is locked or unverifiable');
  const metadata = path.resolve(dir, execute(dir, ['rev-parse', '--git-dir']));
  for (const name of ['index.lock', 'HEAD.lock', 'locked']) {
    if (exists(path.join(metadata, name))) fail('Task checkout has an active or unverifiable Git lock');
  }
  const head = execute(dir, ['rev-parse', 'HEAD']);
  if (!SHA.test(head) || expectedHead && head !== expectedHead) fail('Task head changed; inspect without reset');
  return head;
}

function withAcquisitionLock(root, name, operation) {
  const directory = plain(path.join(root, '.git', 'xrb-context'), true);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.lock`);
  let handle;
  try { handle = fs.openSync(file, 'wx'); } catch { fail('Context acquisition is locked or unverifiable; no takeover attempted'); }
  const identity = fs.fstatSync(handle);
  const content = JSON.stringify({ pid: process.pid, token: randomUUID() }) + '\n';
  const owned = () => {
    try {
      const current = exists(file);
      return current && current.isFile() && !current.isSymbolicLink() && current.nlink === 1
        && current.ino === identity.ino && current.dev === identity.dev && fs.readFileSync(file, 'utf8') === content;
    } catch { return false; }
  };
  const assertOwned = () => { if (!owned()) fail('Context acquisition changed; all resources preserved'); };
  try {
    fs.writeFileSync(handle, content);
    assertOwned();
    return operation(assertOwned);
  } finally {
    fs.closeSync(handle);
    if (owned()) fs.unlinkSync(file);
  }
}

function verifyPrimary(root, identify, execute) {
  if (!fs.lstatSync(path.join(root, '.git')).isDirectory() || execute(root, ['branch', '--show-current']) !== adapter.baseBranch) {
    fail(`Primary checkout must stay on ${adapter.baseBranch}`);
  }
  if (identify(root) !== adapter.repository) fail('Selected checkout is not the expected repository');
}

export function prepareContext(branch, { root, name, resume = true, expectedHead,
  identify = identifyRepository, refresh = refreshSelectedRefs, acquireOwnership, setup, log = console.log, execute = run } = {}) {
  if (!/^(?:feat|fix|refactor|docs|test|chore|ci|perf)\/[a-z0-9][a-z0-9-]*$/.test(branch ?? '') || name !== branch.split('/')[1]) fail('Safe typed task branch/name required');
  root = real(plain(root));
  verifyPrimary(root, identify, execute);
  if (expectedHead !== undefined && !SHA.test(expectedHead)) fail('Expected head must be an immutable commit SHA');
  return withAcquisitionLock(root, name, assertAcquisition => {
    const matches = registeredContexts(root, execute).filter(item => item.branch === branch);
    for (const file of ['HEAD.lock', 'index.lock', `refs/heads/${branch}.lock`]) {
      if (exists(path.join(root, '.git', file))) fail('Repository has an active or unverifiable Git lock');
    }
    if (matches.length > 1) fail('Task branch has ambiguous checkout registration');
    const existing = matches[0];
    if (existing) {
      if (!resume || same(existing.dir, root)) fail('Task branch is already checked out; no replacement created');
      const head = checkedContext(root, existing.dir, branch, expectedHead, execute);
      assertAcquisition();
      if (!acquireOwnership || acquireOwnership(existing.dir) !== true) fail('Task ownership is unavailable or unverifiable; use an owned Git checkout or a supported attachment adapter');
      checkedContext(root, existing.dir, branch, head, execute);
      verifyPrimary(root, identify, execute);
      assertAcquisition();
      if (setup) setup(existing.dir);
      log(`Git checkout: ${existing.dir} (branch ${branch}, head ${head})`);
      return existing.dir;
    }
    const dir = plain(path.join(root, '.worktrees', name), true);
    if (exists(dir)) fail(`${dir} exists but is not the selected registered task checkout; files preserved`);
    const local = ref(root, `refs/heads/${branch}`, execute);
    const { base, remote } = refresh(root, branch, execute);
    if (!local && !remote && ref(root, `refs/remotes/origin/${branch}`, execute)) fail('Live proposal branch is missing; cached history is preserved, not restarted');
    if (!SHA.test(base ?? '') || remote !== null && !SHA.test(remote ?? '')) fail('Fresh selected refs are unverifiable');
    if (ref(root, `refs/heads/${branch}`, execute) !== local) fail('Local branch changed during adoption');
    if (local && remote && local !== remote) {
      // No implicit integration/reset. A local descendant is safe to adopt without losing commits.
      try { execute(root, ['merge-base', '--is-ancestor', remote, local]); }
      catch { fail('Local and remote task histories differ; integrate explicitly without replacing local work'); }
    }
    const selected = local ?? remote ?? base;
    try { execute(root, ['merge-base', base, selected]); } catch { fail('Task history is unrelated to the selected repository base'); }
    if (expectedHead && selected !== expectedHead) fail('Selected head differs from the expected task head');
    const args = local ? ['worktree', 'add', '--quiet', dir, branch]
      : ['worktree', 'add', '--quiet', '--no-track', '-b', branch, dir, selected];
    verifyPrimary(root, identify, execute);
    assertAcquisition();
    execute(root, args);
    const head = checkedContext(root, dir, branch, selected, execute);
    if (!local && remote) {
      assertAcquisition();
      execute(root, ['branch', `--set-upstream-to=origin/${branch}`, branch]);
    }
    // Creation/setup partial success is recoverable. Never delete the checkout/ref on attachment/setup failure.
    assertAcquisition();
    if (acquireOwnership && acquireOwnership(dir) !== true) fail('Attachment failed; created task checkout and history preserved');
    checkedContext(root, dir, branch, head, execute);
    verifyPrimary(root, identify, execute);
    assertAcquisition();
    if (setup) setup(dir);
    log(`Git checkout: ${dir} (branch ${branch}, head ${head})`);
    return dir;
  });
}

export function publicationEvidence(root, branch, head, { identify = identifyRepository, execute = run } = {}) {
  const result = { repository: adapter.repository, repositoryVerified: false, localHead: head, remoteHead: null,
    publicationVerified: false, reason: null };
  try {
    if (identify(root) !== adapter.repository) fail('Repository identity mismatch');
    result.repositoryVerified = true;
    if (!branch || !SHA.test(head)) fail('Attached branch and local head required');
    execute(root, ['check-ref-format', `refs/heads/${branch}`]);
    const lines = execute(root, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).split('\n').filter(Boolean);
    if (lines.length !== 1 || lines[0].split(/\s+/)[1] !== `refs/heads/${branch}`) fail('Live remote branch is missing or ambiguous');
    const remote = lines[0].split(/\s+/)[0];
    if (!SHA.test(remote)) fail('Remote head is malformed');
    result.remoteHead = remote;
    try { execute(root, ['cat-file', '-e', `${remote}^{commit}`]); }
    catch { execute(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', 'origin', remote]); }
    // Containment, not identical tips, is the publication test. Remote operations above are read-only.
    try { execute(root, ['merge-base', '--is-ancestor', head, remote]); }
    catch { fail('Local HEAD is not contained in the named live remote branch'); }
    if (execute(root, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]) !== lines[0]) fail('Remote branch changed during publication inspection');
    result.publicationVerified = true;
  } catch (error) {
    // Never include remote command output (which can contain credential-bearing URLs or private inventories).
    result.reason = error.code === 'XRB_GIT_UNAVAILABLE' ? 'Remote publication evidence is unavailable' : error.message;
  }
  return result;
}

export function writeHandoffRecord(record) {
  const directory = plain(path.join(record.worktree, '.artifacts'), true);
  fs.mkdirSync(directory, { recursive: true });
  const file = plain(path.join(directory, 'handoff.json'), true);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

export function describeHandoff({ root, branch, change, pr, worktree, now = new Date(), identify = identifyRepository, execute = run }) {
  if (pr !== null && pr !== undefined && (!Number.isSafeInteger(Number(pr)) || Number(pr) < 1)) fail('PR identity must be a positive integer');
  if (change !== null && change !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(change)) fail('Change identity is malformed');
  const head = execute(worktree, ['rev-parse', 'HEAD']);
  let dirty = Boolean(execute(worktree, ['status', '--porcelain=v1', '--untracked-files=all']));
  const actualBranch = execute(worktree, ['branch', '--show-current']) || null;
  const evidence = publicationEvidence(root, branch, head, { identify, execute });
  dirty ||= Boolean(execute(worktree, ['status', '--porcelain=v1', '--untracked-files=all']));
  if (actualBranch !== branch || execute(worktree, ['branch', '--show-current']) !== (actualBranch ?? '')
    || execute(worktree, ['rev-parse', 'HEAD']) !== head) {
    evidence.publicationVerified = false;
    evidence.reason = 'Local context changed or is detached; publication not certified';
  }
  const record = { worktree, branch: actualBranch, intendedBranch: branch, baseBranch: adapter.baseBranch, change, pr: pr ? Number(pr) : null, head,
    ...evidence, dirty, unpublishedWork: dirty || !evidence.publicationVerified, time: now.toISOString() };
  return { record, report: [
    `Repository: ${record.repository}${record.repositoryVerified ? '' : ' (identity unverified)'}`,
    `Worktree: ${worktree}`, `Branch and PR: ${actualBranch ?? 'detached'}${record.pr ? `, #${record.pr}` : ''}${change ? ` (change ${change})` : ''}`,
    `Local HEAD: ${head}`, `Remote HEAD: ${record.remoteHead ?? 'unavailable'}`,
    `Publication: ${record.publicationVerified ? 'HEAD contained in live remote branch' : `unverified (${record.reason})`}`,
    `Unpublished work: ${record.unpublishedWork ? 'yes or unverified' : 'no Git changes; ignored/private content not certified'}`,
    'Commands run: ', 'Behaviour: ', 'Unfinished work and gaps: ', 'Manual test: ',
  ].join('\n') };
}

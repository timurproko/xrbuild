// Exact published-local removal. No remote writes, branch deletion, recursive/force fallback or runtime takeover.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { contextEnvironment } from './git-environment.mjs';
import { assertOwnershipExclusion, recheckOwnershipExclusion, ownershipExclusionSignal } from './ownership-exclusion.mjs';
import { executeGit, identifyRepository, publicationEvidence, registeredContexts } from './portable-context.mjs';
import { verifyContractInstallation } from './delivery-contract.mjs';

const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
const fail = message => { throw new Error(message); };
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const exists = file => { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
const inside = (directory, file) => key(file) === key(directory) || key(file).startsWith(key(directory) + path.sep);
const canonical = file => fs.realpathSync.native(file);
const id = file => {
  // IDs are opaque 64-bit values: preserve exact signed/unsigned representations, never round through Number.
  const stat = typeof file === 'number' ? fs.fstatSync(file, { bigint: true }) : fs.lstatSync(file, { bigint: true });
  if (stat.ino === 0n) fail('Filesystem identity is unverifiable; data preserved');
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function plain(file, missing = false) {
  const absolute = path.resolve(file); let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = exists(current);
    if (!stat && missing) continue;
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile() || stat.isFile() && stat.nlink !== 1) {
      fail('Unsafe linked or unverifiable cleanup path; data preserved');
    }
  }
  return absolute;
}

function readPlainFile(file, limit) {
  const identity = id(file), before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) fail('Linked, oversized or uninspected content must be preserved');
  const handle = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const content = Buffer.alloc(before.size);
  try {
    const opened = fs.fstatSync(handle);
    if (!equal(id(handle), identity) || opened.size !== before.size) fail('File identity/size changed during inspection');
    let offset = 0;
    while (offset < content.length) {
      const length = fs.readSync(handle, content, offset, content.length - offset, offset);
      if (!length) fail('Content shrank during inspection');
      offset += length;
    }
    if (fs.readSync(handle, Buffer.alloc(1), 0, 1, offset)) fail('Content grew during bounded inspection');
  } finally { fs.closeSync(handle); }
  const after = fs.lstatSync(file);
  if (!equal(id(file), identity) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.mode !== after.mode) fail('Content changed during inspection');
  return { content, stat: after, identity };
}

export function preservationReason(target) {
  if (exists(path.join(target, '.xrbuild'))) return '.xrbuild must be preserved separately before worktree cleanup';
  const artifacts = exists(path.join(target, '.artifacts'));
  if (artifacts?.isSymbolicLink()) return '.artifacts is linked and must be preserved separately before worktree cleanup';
  if (artifacts?.isDirectory() && exists(path.join(target, '.artifacts', 'KEEP'))) return '.artifacts/KEEP must be preserved separately before worktree cleanup';
  return null;
}

function describeTarget({ root, target, expectedHead, cwd = process.cwd(), execute = executeGit }) {
  root = canonical(plain(root)); target = canonical(plain(target));
  const common = canonical(plain(path.join(root, '.git')));
  if (!fs.lstatSync(common).isDirectory() || execute(root, ['branch', '--show-current']) !== adapter.baseBranch) fail('Cleanup primary identity/base is unverifiable');
  if (inside(target, root) || [process.cwd(), cwd].some(directory => inside(target, canonical(plain(directory))))) fail('Primary/current working directories cannot be removed');
  const marker = path.join(target, '.git'); plain(marker);
  if (!fs.lstatSync(marker).isFile()) fail('Cleanup requires one registered linked checkout');
  const markerContent = readPlainFile(marker, 4096).content;
  if (canonical(execute(target, ['rev-parse', '--show-toplevel'])) !== target
    || key(canonical(path.resolve(target, execute(target, ['rev-parse', '--git-common-dir'])))) !== key(common)) fail('Foreign checkout identity; data preserved');
  const admin = canonical(plain(path.resolve(target, execute(target, ['rev-parse', '--git-dir']))));
  if (!inside(path.join(common, 'worktrees'), admin) || key(admin) === key(path.join(common, 'worktrees'))) fail('Linked Git metadata is outside the admitted boundary');
  const entries = registeredContexts(root, execute).filter(entry => key(path.resolve(entry.dir)) === key(target));
  const branch = execute(target, ['branch', '--show-current']), head = execute(target, ['rev-parse', 'HEAD']);
  if (entries.length !== 1 || !branch || entries[0].branch !== branch || entries[0].head !== head || entries[0].locked || entries[0].prunable) fail('Task registration is locked or unverifiable');
  if (expectedHead !== undefined && !/^[a-f0-9]{40}$/.test(expectedHead)) fail('Cleanup expected head must be an immutable commit SHA');
  if (!/^[a-f0-9]{40}$/.test(head) || expectedHead && expectedHead !== head) fail('Cleanup task head changed; data preserved');
  for (const file of [path.join(admin, 'index.lock'), path.join(admin, 'HEAD.lock'), path.join(admin, 'locked'), path.join(common, 'HEAD.lock'), path.join(common, 'index.lock'), path.join(common, 'config.lock'), path.join(common, 'packed-refs.lock'), path.join(common, 'worktrees.lock'), path.join(common, `refs/heads/${branch}.lock`), path.join(common, 'xrb-context', `${path.basename(branch)}.lock`)]) {
    if (exists(file)) fail('Git lock blocks removal; no takeover attempted');
  }
  const protectedData = preservationReason(target);
  if (protectedData) fail(protectedData);
  return { root, target, common, admin, branch, head, identity: { checkout: id(target), marker: id(marker),
    markerHash: sha(markerContent), admin: id(admin) } };
}

function sourceEntries(output, tree = false) {
  const entries = new Map();
  for (const record of output.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t'), fields = record.slice(0, tab).split(' '), name = record.slice(tab + 1);
    const [mode, second, third] = fields, object = tree ? third : second;
    if (tab < 0 || !name || entries.has(name) || !/^[a-f0-9]{40}$/.test(object) || !tree && third !== '0') fail('Unmerged or unverifiable source index');
    if (mode === '160000') fail('Actual gitlink/submodule data must be preserved');
    if (!['100644', '100755'].includes(mode)) fail('Source links or unsupported Git modes must be preserved');
    entries.set(name, { mode, object });
  }
  return entries;
}

const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function lf(bytes) {
  const out = Buffer.allocUnsafe(bytes.length); let length = 0;
  for (let i = 0; i < bytes.length; i++) { if (bytes[i] === 13 && bytes[i + 1] === 10) continue; out[length++] = bytes[i]; }
  return out.subarray(0, length);
}

/** No ignored/cache payloads are admitted. Bounds fail closed instead of treating uninspected content as disposable. */
export function inspectRemovalTarget(options) {
  const context = describeTarget(options), { target, admin } = context;
  const execute = options.execute ?? executeGit;
  const bounds = { entries: 100_000, bytes: 256 * 1024 * 1024, fileBytes: 32 * 1024 * 1024, depth: 64, historyRefs: 1024 };
  const limits = { ...bounds, ...options.limits };
  if (Object.keys(limits).some(name => !Object.hasOwn(bounds, name) || !Number.isSafeInteger(limits[name]) || limits[name] < 1 || limits[name] > bounds[name])) fail('Invalid inspection bounds; data preserved');
  let count = 0, bytes = 0;
  const fingerprint = createHash('sha256'), seen = new Set(), publishedAncestors = new Set([context.head]);
  const verifyAncestor = object => {
    if (object === '0'.repeat(40) || publishedAncestors.has(object)) return;
    if (!/^[a-f0-9]{40}$/.test(object)) fail('Unverifiable worktree recovery reference must be preserved');
    if (publishedAncestors.size >= limits.historyRefs) fail('Recovery-history inspection bound exceeded; data preserved');
    try { execute(context.root, ['merge-base', '--is-ancestor', object, context.head]); }
    catch { fail('Unpublished worktree recovery history must be preserved'); }
    publishedAncestors.add(object);
  };
  const tracked = sourceEntries(execute(target, ['ls-files', '--stage', '-z']));
  const committed = sourceEntries(execute(target, ['ls-tree', '-r', '-z', 'HEAD']), true);
  if (tracked.size !== committed.size || [...tracked].some(([name, entry]) => !equal(entry, committed.get(name)))) fail('Staged changes must be preserved');
  if (execute(target, ['config', '--name-only', '--null', '--list']).split('\0').some(name => /^submodule\./i.test(name))) fail('Configured submodules must be preserved');
  // Cached attributes read only the index, never uninspected working-tree links or ignored directories.
  const attributes = new Map();
  const fields = tracked.size ? execute(target, ['check-attr', '--cached', '-z', '--stdin', 'text', 'eol'], {
    input: [...tracked.keys()].join('\0') + '\0',
  }).split('\0') : [''];
  if (fields.pop() !== '' || fields.length % 3) fail('Source attribute snapshot is unverifiable');
  for (let i = 0; i < fields.length; i += 3) {
    const [name, attribute, value] = fields.slice(i, i + 3);
    if (!tracked.has(name) || !['text', 'eol'].includes(attribute)) fail('Unknown source attribute binding');
    const entry = attributes.get(name) ?? {}; entry[attribute] = value; attributes.set(name, entry);
  }
  if (attributes.size !== tracked.size) fail('Incomplete source attribute snapshot');
  let auto = '';
  try { auto = execute(target, ['config', '--get', 'core.autocrlf']); } catch { /* Absent/unknown conversion admits raw equality only. */ }
  const directories = new Set(['']);
  for (const name of tracked.keys()) {
    const parts = name.split('/'); parts.pop();
    while (parts.length) { directories.add(parts.join('/')); parts.pop(); }
  }
  const read = (file, relative) => {
    const { content, stat, identity } = readPlainFile(file, limits.fileBytes);
    if ((bytes += content.length) > limits.bytes) fail('Content inspection byte bound exceeded; data preserved');
    fingerprint.update(`${relative}\0${JSON.stringify(identity)}\0${stat.mode}\0${sha(content)}\0`);
    return content;
  };
  const walk = (directory, relative = '', depth = 0, metadata = false) => {
    if (depth > limits.depth) fail('Inspection depth bound exceeded; data preserved');
    const identity = id(directory), start = fs.lstatSync(directory);
    if (!start.isDirectory() || start.isSymbolicLink()) fail('Unsafe directory link; data preserved');
    const handle = fs.opendirSync(directory); const names = [];
    try { for (let entry; (entry = handle.readSync());) { if (++count > limits.entries) fail('Inspection entry bound exceeded; data preserved'); names.push(entry.name); } }
    finally { handle.closeSync(); }
    names.sort();
    fingerprint.update(`directory:${relative}\0${JSON.stringify(identity)}\0${names.join('\0')}\0`);
    for (const name of names) {
      const rel = relative ? `${relative}/${name}` : name, file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) fail('Unsafe links/hardlinks must be preserved');
      if (!metadata && rel === '.git') { read(file, rel); continue; }
      if (name.toLowerCase() === '.git' || name.toLowerCase() === '.xrbuild' || rel === '.artifacts/KEEP') fail('Nested/private/KEEP data must be preserved');
      if (stat.isDirectory()) {
        if (metadata ? !['logs', 'refs'].includes(rel) : !directories.has(rel)) fail('Unknown ignored/untracked directory or Git metadata must be preserved');
        walk(file, rel, depth + 1, metadata);
      } else if (stat.isFile()) {
        if (metadata) {
          if (!['HEAD', 'index', 'commondir', 'gitdir', 'logs/HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'COMMIT_EDITMSG'].includes(rel)) fail('Unknown worktree Git metadata must be preserved');
          const content = read(file, `admin/${rel}`);
          if (rel === 'COMMIT_EDITMSG' && content.toString('utf8') !== `${execute(target, ['show', '-s', '--format=%B', 'HEAD'])}\n`) fail('Unpublished commit-message draft must be preserved');
          if (rel === 'ORIG_HEAD') verifyAncestor(content.toString('utf8').trim());
          if (rel === 'FETCH_HEAD') for (const line of content.toString('utf8').split('\n').filter(Boolean)) verifyAncestor(line.split('\t')[0]);
          if (rel === 'logs/HEAD') for (const line of content.toString('utf8').split('\n').filter(Boolean)) {
            const [oldHead, newHead] = line.split(' '); verifyAncestor(oldHead); verifyAncestor(newHead);
          }
          continue;
        }
        const expected = tracked.get(rel);
        if (!expected) fail('Unknown ignored/untracked content must be preserved');
        const content = read(file, rel), attributesForFile = attributes.get(rel);
        const text = attributesForFile?.text, eol = attributesForFile?.eol;
        const forcedText = text === 'set' || ['lf', 'crlf'].includes(eol);
        const automatic = text === 'auto' || text === 'unspecified' && ['true', 'input'].includes(auto);
        const simpleText = content.every((byte, i) => (byte >= 32 || [9, 10, 13].includes(byte)) && (byte !== 13 || content[i + 1] === 10));
        const normalizable = text !== 'unset' && (forcedText || automatic && simpleText);
        if (gitBlob(content) !== expected.object && !(normalizable && gitBlob(lf(content)) === expected.object)) fail('Unpublished source bytes must be preserved');
        if (process.platform !== 'win32' && Boolean(stat.mode & 0o111) !== (expected.mode === '100755')) fail('Unpublished source permissions must be preserved');
        seen.add(rel);
      } else fail('Unsupported filesystem content must be preserved');
    }
    if (!equal(id(directory), identity)) fail('Directory identity changed during inspection');
  };
  walk(target); walk(admin, '', 0, true);
  if (seen.size !== tracked.size) fail('Missing source must be preserved');
  const final = describeTarget(options);
  if (!equal(context, final)) fail('Checkout identity/head changed during inspection');
  return { ...context, fingerprint: fingerprint.digest('hex') };
}

function availableClaims(readClaims, context) {
  if (typeof readClaims !== 'function') fail('Trusted cleanup ownership adapter unavailable; no complete/discard/sweep substitute');
  const claim = readClaims(context);
  if (!claim || claim.state !== 'available' || key(claim.target ?? '') !== key(context.target)
    || typeof claim.generation !== 'string' || !claim.generation || claim.generation.length > 256) fail('Live or unverifiable cleanup ownership; checkout preserved');
  return { target: claim.target, generation: claim.generation };
}

function snapshotEqual(a, b) {
  return ['root', 'target', 'admin', 'branch', 'head', 'identity', 'fingerprint'].every(field => equal(a[field], b[field]));
}

function toolDirectory(root) {
  const directory = plain(path.join(root, '.git', 'xrb-removal'), true);
  fs.mkdirSync(directory, { recursive: true }); return directory;
}

function acquireLock(directory, slot) {
  const file = path.join(directory, `${slot}.lock`), content = JSON.stringify({ pid: process.pid, token: randomUUID() }) + '\n';
  let handle;
  try { handle = fs.openSync(file, 'wx'); } catch { fail('Cleanup operation is locked or unverifiable; no takeover attempted'); }
  const identity = id(handle);
  const owned = () => {
    try { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && equal(id(file), identity) && readPlainFile(file, 4096).content.toString('utf8') === content; }
    catch { return false; }
  };
  const assertOwned = () => { if (!owned()) fail('Cleanup lock changed; no further mutations attempted'); };
  try { fs.writeFileSync(handle, content); fs.fsyncSync(handle); assertOwned(); }
  catch (error) { fs.closeSync(handle); if (owned()) fs.unlinkSync(file); throw error; }
  return { assertOwned, release() { fs.closeSync(handle); if (owned()) fs.unlinkSync(file); } };
}
function withLock(directory, slot, operation) {
  const lock = acquireLock(directory, slot);
  try { return operation(lock.assertOwned); } finally { lock.release(); }
}

function validIdentity(identity) {
  return identity && Object.keys(identity).sort().join(',') === 'admin,checkout,marker,markerHash'
    && /^[a-f0-9]{64}$/.test(identity.markerHash ?? '') && ['admin', 'checkout', 'marker'].every(name => {
      const value = identity[name];
      return value && Object.keys(value).sort().join(',') === 'birthtimeNs,dev,ino'
        && ['dev', 'ino'].every(field => typeof value[field] === 'string' && /^-?\d+$/.test(value[field]))
        && value.ino !== '0' && typeof value.birthtimeNs === 'string' && /^-?\d+$/.test(value.birthtimeNs);
    });
}

function loadJournal(file) {
  if (!exists(file)) return null;
  plain(file);
  const bytes = readPlainFile(file, 16_384).content.toString('utf8');
  let record;
  try { record = JSON.parse(bytes); } catch { fail('Partial cleanup journal requires recovery; data preserved'); }
  if (!record || record.version !== 1 || !['prepared', 'removing', 'partial', 'removed'].includes(record.phase)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(record.operation ?? '') || !record.snapshot
    || Object.keys(record).some(name => !['version', 'operation', 'phase', 'snapshot', 'observedRemoteHead', 'intent'].includes(name))
    || record.intent !== undefined && (!record.intent || !['local', 'complete'].includes(record.intent.kind)
      || Object.keys(record.intent).some(name => !['kind', 'change', 'pr'].includes(name))
      || record.intent.kind === 'complete' && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.intent.change ?? '') || !Number.isSafeInteger(record.intent.pr) || record.intent.pr < 1))
    || Object.keys(record.snapshot).sort().join(',') !== 'admin,branch,common,fingerprint,head,identity,root,target'
    || ['admin', 'branch', 'common', 'root', 'target'].some(name => typeof record.snapshot[name] !== 'string' || !record.snapshot[name] || record.snapshot[name].length > 4096)
    || !/^[a-f0-9]{40}$/.test(record.snapshot.head ?? '') || record.observedRemoteHead !== undefined && !/^[a-f0-9]{40}$/.test(record.observedRemoteHead)
    || !validIdentity(record.snapshot.identity) || !/^[a-f0-9]{64}$/.test(record.snapshot.fingerprint ?? '')) fail('Unknown cleanup journal; data preserved');
  return { record, bytes };
}

function saveJournal(file, record, previous) {
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  if (!previous) {
    const handle = fs.openSync(file, 'wx');
    try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  } else {
    if (loadJournal(file)?.bytes !== previous.bytes) fail('Cleanup journal changed; no replacement attempted');
    const temporary = `${file}.${randomUUID()}.next`, handle = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    if (loadJournal(file)?.bytes !== previous.bytes) fail('Cleanup journal changed; recoverable next record retained');
    fs.renameSync(temporary, file);
  }
  return { record, bytes };
}

/** Caller supplies a trusted ownership oracle; missing runtime/claim support always blocks actual disposal. */
export function removePublishedCheckout({ root, target, expectedHead, readClaims, identify = identifyRepository, execute = executeGit, cwd, limits } = {}) {
  root = canonical(plain(root));
  target = path.join(canonical(plain(path.dirname(path.resolve(target)))), path.basename(target));
  plain(target, true);
  const directory = toolDirectory(root), slot = sha(key(path.resolve(target))), journalFile = path.join(directory, `${slot}.json`);
  return withLock(directory, slot, assertLock => {
    let journal = loadJournal(journalFile);
    if (journal && (key(journal.record.snapshot.root) !== key(root) || key(journal.record.snapshot.target) !== key(path.resolve(target)))) fail('Foreign cleanup journal; data preserved');
    if (journal && journal.record.phase === 'removed') {
      if (exists(target)) fail('Checkout path was recreated; previous removal authority cannot be reused');
      let branchPreserved = false;
      try { branchPreserved = execute(root, ['rev-parse', '--verify', `refs/heads/${journal.record.snapshot.branch}`]) === journal.record.snapshot.head; } catch { /* Do not recreate refs. */ }
      return { removed: true, alreadyRemoved: true, operation: journal.record.operation, journal: journalFile, branchPreserved };
    }
    if (journal && ['removing', 'partial'].includes(journal.record.phase)) fail('Prior removal may have partially completed; explicit recovery required, no retry deletion attempted');
    if (!exists(target)) fail('Partial/missing checkout requires explicit recovery; no pruning or fallback attempted');
    const options = { root, target, expectedHead, execute, cwd, limits };
    const context = describeTarget(options), claims = availableClaims(readClaims, context);
    if (identify(root) !== adapter.repository) fail('Cleanup repository identity mismatch; data preserved');
    const snapshot = inspectRemovalTarget(options);
    if (journal && !snapshotEqual(journal.record.snapshot, snapshot)) fail('Checkout identity/content was recreated or changed; previous journal cannot authorize removal');
    const evidence = publicationEvidence(root, snapshot.branch, snapshot.head, { identify, execute });
    if (!evidence.publicationVerified) fail(`Publication blocker: ${evidence.reason}; checkout preserved`);
    assertLock();
    if (!journal) journal = saveJournal(journalFile, { version: 1, operation: randomUUID(), phase: 'prepared', snapshot }, null);
    assertLock();
    if (!snapshotEqual(snapshot, inspectRemovalTarget(options)) || !equal(claims, availableClaims(readClaims, context))) fail('Content or ownership changed before removal; checkout preserved');
    const fresh = publicationEvidence(root, snapshot.branch, snapshot.head, { identify, execute });
    if (!fresh.publicationVerified || fresh.remoteHead !== evidence.remoteHead) fail('Publication changed before removal; checkout preserved');
    // Network inspection precedes the last bounded local/claim checks and the one non-force Git operation.
    if (identify(root) !== adapter.repository || !snapshotEqual(snapshot, inspectRemovalTarget(options))
      || !equal(claims, availableClaims(readClaims, context))) fail('Final identity/content/ownership check changed; checkout preserved');
    assertLock();
    journal = saveJournal(journalFile, { ...journal.record, phase: 'removing', observedRemoteHead: fresh.remoteHead }, journal);
    assertLock();
    try { execute(root, ['worktree', 'remove', '--', snapshot.target]); }
    catch {
      assertLock();
      journal = saveJournal(journalFile, { ...journal.record, phase: 'partial' }, journal);
      fail(`Non-force Git removal failed; journal ${journal.record.operation} retained with all recoverable resources; no fallback attempted`);
    }
    assertLock();
    journal = saveJournal(journalFile, { ...journal.record, phase: 'removed' }, journal);
    let branchPreserved = false;
    try { branchPreserved = execute(root, ['rev-parse', '--verify', `refs/heads/${snapshot.branch}`]) === snapshot.head; } catch { /* Report, never recreate, missing refs. */ }
    return { removed: true, operation: journal.record.operation, journal: journalFile, branchPreserved,
      replacementPreserved: Boolean(exists(snapshot.target)), localHead: snapshot.head, remoteHead: fresh.remoteHead };
  });
}

/** Pre-detach snapshot reservation, not ownership/deletion authority. */
export async function prepareRemovalCheckout(options, { intent = { kind: 'local' }, readPublication } = {}) {
  const root = canonical(plain(options.root)), target = canonical(plain(options.target));
  const directory = toolDirectory(root), journalFile = path.join(directory, `${sha(key(target))}.json`);
  const lock = acquireLock(directory, sha(key(target)));
  try {
    const snapshot = inspectRemovalTarget({ ...options, root, target });
    if ((options.identify ?? identifyRepository)(root) !== adapter.repository) fail('Cleanup repository identity mismatch');
    const evidence = readPublication ? await readPublication(snapshot) : publicationEvidence(root, snapshot.branch, snapshot.head, { identify: options.identify, execute: options.execute });
    if (!evidence.publicationVerified || !/^[a-f0-9]{40}$/.test(evidence.remoteHead ?? '')) fail('Publication/merged evidence unavailable; checkout preserved');
    if (!snapshotEqual(snapshot, inspectRemovalTarget({ ...options, root, target }))) fail('Preflight snapshot changed');
    const prior = loadJournal(journalFile);
    if (prior && (prior.record.phase !== 'prepared' || !snapshotEqual(prior.record.snapshot, snapshot) || !equal(prior.record.intent, intent))) fail('Prior operation requires explicit recovery; preflight cannot replace its authority');
    lock.assertOwned();
    if (!prior) saveJournal(journalFile, { version: 1, operation: randomUUID(), phase: 'prepared', snapshot, observedRemoteHead: evidence.remoteHead, intent }, null);
    return snapshot;
  } finally { lock.release(); }
}

const executeAsync = promisify(execFile);
export async function executeScopedNonForceRemoval(root, target, signal) {
  await executeAsync('git', ['-c', 'core.hooksPath=/dev/null', 'worktree', 'remove', '--', target], {
    cwd: root, env: contextEnvironment(), encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024, signal,
  });
}

/** Real execution under a held, target-bound exclusion scope. Legacy generation-based callers are unchanged. */
export async function removePublishedCheckoutInScope({ scope, intent, readPublication, remove = executeScopedNonForceRemoval, ...options }) {
  const root = canonical(plain(options.root)), target = canonical(plain(options.target));
  const directory = toolDirectory(root), journalFile = path.join(directory, `${sha(key(target))}.json`);
  const lock = acquireLock(directory, sha(key(target)));
  try {
    const context = describeTarget({ ...options, root, target });
    if ((options.identify ?? identifyRepository)(root) !== adapter.repository) fail('Cleanup repository identity mismatch');
    assertOwnershipExclusion(scope, context);
    let journal = loadJournal(journalFile);
    if (!journal || journal.record.phase !== 'prepared' || !equal(journal.record.intent, intent)) fail('Matching pre-detach reservation is required; no retry deletion');
    const snapshot = inspectRemovalTarget({ ...options, root, target });
    if (!snapshotEqual(journal.record.snapshot, snapshot)) fail('Checkout changed after preflight; preserved');
    const publication = async () => {
      const evidence = readPublication ? await readPublication(snapshot) : publicationEvidence(root, snapshot.branch, snapshot.head, { identify: options.identify, execute: options.execute });
      if (!evidence.publicationVerified || !/^[a-f0-9]{40}$/.test(evidence.remoteHead ?? '')) fail('Fresh publication/merged evidence unavailable');
      return evidence;
    };
    await recheckOwnershipExclusion(scope, context);
    const evidence = await publication();
    if (!snapshotEqual(snapshot, inspectRemovalTarget({ ...options, root, target }))) fail('Content changed during exclusion');
    await recheckOwnershipExclusion(scope, context);
    const fresh = await publication();
    if (fresh.remoteHead !== evidence.remoteHead || (options.identify ?? identifyRepository)(root) !== adapter.repository
      || !snapshotEqual(snapshot, inspectRemovalTarget({ ...options, root, target }))) fail('Final repository/publication/content changed');
    await recheckOwnershipExclusion(scope, context); lock.assertOwned();
    journal = saveJournal(journalFile, { ...journal.record, phase: 'removing', observedRemoteHead: fresh.remoteHead }, journal);
    assertOwnershipExclusion(scope, context); lock.assertOwned();
    try { await remove(root, target, ownershipExclusionSignal(scope)); }
    catch {
      lock.assertOwned(); saveJournal(journalFile, { ...journal.record, phase: 'partial' }, journal);
      fail('Non-force scoped removal failed or lost exclusion; explicit recovery required, no fallback');
    }
    // Any uncertainty after the command leaves the removing journal for explicit recovery, never retry deletion.
    assertOwnershipExclusion(scope, context); lock.assertOwned();
    saveJournal(journalFile, { ...journal.record, phase: 'removed' }, journal);
    let branchPreserved = false;
    try { branchPreserved = (options.execute ?? executeGit)(root, ['rev-parse', '--verify', `refs/heads/${snapshot.branch}`]) === snapshot.head; } catch { /* Report, never recreate refs. */ }
    return { removed: true, branchPreserved, replacementPreserved: Boolean(exists(target)), localHead: snapshot.head, remoteHead: fresh.remoteHead };
  } finally { lock.release(); }
}

export function runtimeCleanupUnavailable() {
  fail('Compatible released exact-target runtime cleanup adapter unavailable; complete/discard/sweep are not substitutes');
}

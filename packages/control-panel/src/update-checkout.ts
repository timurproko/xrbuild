// Ordinary fast-forward first. Only incoming protected data that differs locally needs a projected checkout.
// The special case publishes one immutable directory before any source write; there is no mutable phase journal.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitRunner } from './update.ts';

export const CHECKOUT_JOURNAL = 'xrb-update-checkout';
interface Entry { mode: string; oid: string; file: string }
interface Journal { version: 1 | 2; before: string; target: string; branch: string; projected: string; workspaceLock?: boolean }
const records = (text: string) => text.split('\0').filter(Boolean);
const treeEntries = (text: string): Entry[] => records(text).map(record => {
  const match = /^(\d+) (?:blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
  if (!match) throw new Error('Cannot inspect the fetched tree safely');
  return { mode: match[1]!, oid: match[2]!, file: match[3]! };
});
const key = (file: string) => process.platform === 'win32' ? file.toLowerCase() : file;
const overlaps = (a: string, b: string) => key(a) === key(b) || key(a).startsWith(`${key(b)}/`) || key(b).startsWith(`${key(a)}/`);
export const keptWorkspacePath = (file: string) => /^(?:pnpm-lock\.yaml|projects|config|\.xrb-layout\.lock)$/.test(key(file))
  || /^xrb-(?:plugins|panel)\.json(?:$|\.lock$|\.[^/]+\.tmp$)/.test(key(file))
  || /^\.xrb-manifest-[^/]+\.tmp$/.test(key(file)) || key(file).startsWith('projects/') || key(file).startsWith('config/');
const protectedBy = (journal: { workspaceLock?: boolean }) => (file: string) => keptWorkspacePath(file)
  && (journal.workspaceLock !== false || key(file) !== 'pnpm-lock.yaml');

export class CheckoutRefusal extends Error {
  readonly output: string;
  readonly files: string[];
  readonly outputLogged: boolean;
  constructor(output: string, files: string[] = [], outputLogged = false) {
    super(files.length ? `Incoming source changes would overwrite local work in ${files.slice(0, 4).map(file => JSON.stringify(file)).join(', ')}${files.length > 4 ? ', …' : ''}; preserve or reconcile those files and retry Update.`
      : 'Git could not fast-forward safely; inspect git status and retry Update.');
    this.output = output; this.files = files; this.outputLogged = outputLogged;
  }
}
export interface CheckoutOptions {
  git: GitRunner; workspace: boolean; workspaceLock?: boolean; before: string; target: string; branch: string;
  ensureUnchanged: () => Promise<void>; line: (line: string) => void;
}
function commands(dir: string, git: GitRunner, index?: string) {
  const run = (args: string[], input?: string) => git(args, dir, { input, raw: true, env: { GIT_OPTIONAL_LOCKS: '0', ...(index ? { GIT_INDEX_FILE: index } : {}) } });
  const checked = async (args: string[], input?: string) => {
    const result = await run(args, input);
    if (result.code) throw new CheckoutRefusal(result.output);
    return result.output;
  };
  return { run, checked };
}
const exists = (file: string) => fs.lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
async function regular(file: string, linked = false) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !linked && stat.nlink !== 1) throw new Error(`Unsafe Update transaction file: ${path.basename(file)}`);
}
async function stagedEntries(dir: string, git: GitRunner, index: string): Promise<Entry[]> {
  return records(await commands(dir, git, index).checked(['ls-files', '--stage', '-z'])).map(record => {
    const match = /^(\d+) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Unmerged index; finish the existing merge before Update');
    return { mode: match[1]!, oid: match[2]!, file: match[3]! };
  });
}
async function replaceEntries(dir: string, git: GitRunner, index: string, entries: Entry[], select: (file: string) => boolean) {
  const current = await stagedEntries(dir, git, index), zero = '0'.repeat(entries[0]?.oid.length ?? current[0]?.oid.length ?? 40);
  const changes = [...current.filter(entry => select(entry.file)).map(entry => `0 ${zero}\t${entry.file}\0`),
    ...entries.filter(entry => select(entry.file)).map(entry => `${entry.mode} ${entry.oid}\t${entry.file}\0`)];
  if (changes.length) await commands(dir, git, index).checked(['update-index', '-z', '--index-info'], changes.join(''));
}
async function transactionPaths(dir: string, git: GitRunner) {
  const { checked } = commands(dir, git);
  return { index: path.resolve(dir, (await checked(['rev-parse', '--git-path', 'index'])).trim()),
    root: path.resolve(dir, (await checked(['rev-parse', '--git-path', CHECKOUT_JOURNAL])).trim()) };
}
async function durableWrite(file: string, text: string) {
  const handle = await fs.open(file, 'wx');
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } };
const identity = async (file: string) => { const stat = await fs.lstat(file, { bigint: true }); return `${stat.dev}:${stat.ino}`; };
const sameIdentity = async (file: string, id: string) => await exists(file) && await identity(file) === id;
const leasePattern = /^lease-(\d+)-[a-f0-9-]+\.index$/;
const scratchPattern = /^(?:lease|working|recovery)-\d+-[a-f0-9-]+\.index(?:\.lock)?$/;
const fixedFiles = new Set(['journal.json', 'journal.next', 'original.index', 'working.index', 'final.index', 'projected.index', 'projection.index', 'recovery.index', 'owner.json']);
async function ownedDirectory(root: string) {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe Update checkout journal directory');
  const names = await fs.readdir(root);
  for (const name of names) {
    if (!fixedFiles.has(name) && !scratchPattern.test(name) && !/^(?:working|final|projection|recovery)\.index\.lock$/.test(name))
      throw new Error('Unknown file in Update checkout journal; it was preserved');
    await regular(path.join(root, name), leasePattern.test(name));
  }
  return names;
}
// A hard link publishes complete lock bytes AND recoverable ownership in one operation. No owner-file write window.
async function recoverLock(root: string, index: string) {
  if (!await exists(`${index}.lock`)) return;
  const lockId = await identity(`${index}.lock`);
  for (const name of await fs.readdir(root)) {
    const match = leasePattern.exec(name);
    if (match && await identity(path.join(root, name)) === lockId) {
      if (alive(Number(match[1]))) throw new Error('Git index lock is active; retry Update when the previous command finishes');
      await fs.unlink(`${index}.lock`); return;
    }
  }
  // Compatibility with the previous token-based journal, including its interrupted journal.next publication.
  if (await exists(path.join(root, 'owner.json'))) {
    const owner = JSON.parse(await fs.readFile(path.join(root, 'owner.json'), 'utf8')) as { pid: number; token: string; inode: string; device: string };
    const bytes = await fs.readFile(`${index}.lock`), final = path.join(root, 'final.index');
    if (Number.isInteger(owner.pid) && owner.pid > 0 && `${owner.device}:${owner.inode}` === lockId && !alive(owner.pid)
      && (bytes.toString() === owner.token || await exists(final) && bytes.equals(await fs.readFile(final)))) {
      await fs.unlink(`${index}.lock`); return;
    }
  }
  throw new Error('Git index lock is not owned by this Update; it was preserved');
}
async function acquireLock(root: string, index: string, source: string) {
  await recoverLock(root, index);
  const file = path.join(root, `lease-${process.pid}-${randomUUID()}.index`);
  await fs.copyFile(source, file, fs.constants.COPYFILE_EXCL);
  const handle = await fs.open(file, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
  const id = await identity(file);
  await fs.link(file, `${index}.lock`);
  return { file, id };
}
async function releaseLock(index: string, id: string) {
  if (await sameIdentity(`${index}.lock`, id)) await fs.unlink(`${index}.lock`);
}
async function removeRetired(root: string, index: string) {
  await ownedDirectory(root);
  // Another still-live recovery attempt can briefly hold its lease in a directory just retired by the winner.
  if (await exists(`${index}.lock`)) {
    try { await recoverLock(root, index); } catch { return; }
  }
  await fs.rm(root, { recursive: true, force: true });
}
async function retire(root: string, index: string) {
  const done = `${root}.done-${process.pid}-${randomUUID()}`;
  try { await fs.rename(root, done); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  await removeRetired(done, index);
}
async function scavenge(root: string, index: string) {
  const prefix = `${path.basename(root)}.`;
  for (const name of await fs.readdir(path.dirname(root))) {
    if (!name.startsWith(prefix)) continue;
    const match = /\.(prepare|done)-(\d+)-[a-zA-Z0-9-]+$/.exec(name);
    if (!match || match[1] === 'prepare' && alive(Number(match[2]))) continue;
    await removeRetired(path.join(path.dirname(root), name), index);
  }
}
function parseJournal(text: string): Journal {
  const value = JSON.parse(text) as Journal;
  if (![1, 2].includes(value.version) || ![value.before, value.target, value.projected].every(sha => typeof sha === 'string' && /^[0-9a-f]{40,64}$/.test(sha))
    || typeof value.branch !== 'string' || value.workspaceLock !== undefined && typeof value.workspaceLock !== 'boolean')
    throw new Error('Invalid Update checkout journal; it was preserved');
  return value;
}
async function readJournal(root: string): Promise<Journal | null> {
  await ownedDirectory(root);
  const read = async (name: string) => { const file = path.join(root, name); if (!await exists(file)) return null;
    if ((await fs.stat(file)).size > 4 * 1024 * 1024) throw new Error('Oversized Update checkout journal');
    return fs.readFile(file, 'utf8'); };
  const current = await read('journal.json'), next = await read('journal.next');
  if (current !== null) {
    const journal = parseJournal(current);
    if (next !== null) {
      // A partial old next write is disposable: the published immutable fields remain authoritative.
      let candidate: Journal | null = null; try { candidate = parseJournal(next); } catch { /* interrupted old write */ }
      if (candidate && ['before', 'target', 'branch', 'projected', 'workspaceLock'].some(field => candidate![field as keyof Journal] !== journal[field as keyof Journal]))
        throw new Error('Conflicting Update journal.next; both records were preserved');
    }
    return journal;
  }
  if (next !== null) { try { return parseJournal(next); } catch { /* legacy initial publication never reached checkout */ } }
  return null;
}

export async function resumeProtectedCheckout(dir: string, git: GitRunner, line: (line: string) => void): Promise<string[]> {
  const { index, root } = await transactionPaths(dir, git);
  await scavenge(root, index);
  if (!await exists(root)) return [];
  const journal = await readJournal(root);
  if (!journal) {
    // Old preparation/cleanup interrupted before/after publishing a manifest: no worktree operation can be pending.
    const lease = await acquireLock(root, index, index);
    try { await retire(root, index); } finally { await releaseLock(index, lease.id); }
    await scavenge(root, index); return [];
  }
  line('Resuming protected-data fast-forward from its immutable checkout journal.');
  await finishTransaction(dir, git, index, root, journal);
  const changed = records(await commands(dir, git).checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', journal.before, journal.target]));
  return changed.filter(protectedBy(journal));
}

// Source progress is derived from immutable old/new snapshots, not a mutable phase or a leftover Git lock file.
async function applyJournalCheckout(dir: string, git: GitRunner, root: string, journal: Journal, sources: string[]) {
  const original = path.join(root, 'original.index'), expected = path.join(root, 'projected.index');
  const before = new Map((await stagedEntries(dir, git, original)).map(entry => [entry.file, entry]));
  const after = new Map((await stagedEntries(dir, git, expected)).map(entry => [entry.file, entry]));
  const applied: Entry[] = [], names = new Set<string>();
  const matches = async (index: string, file: string, entry: Entry | undefined) => !entry
    ? !await fs.lstat(path.join(dir, file)).then(() => true, error => { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; })
    : (await commands(dir, git, index).run(['diff', '--quiet', '--no-ext-diff', '--no-textconv', '--', file])).code === 0;
  for (const file of sources) {
    const old = before.get(file), next = after.get(file);
    if (old?.mode === next?.mode && old?.oid === next?.oid) continue; // Git will not write an already-adopted index entry.
    if (await matches(original, file, old)) continue;
    if (!await matches(expected, file, after.get(file))) throw new CheckoutRefusal('Source changed outside the interrupted checkout', [file]);
    names.add(file); const entry = after.get(file); if (entry) applied.push(entry);
  }
  const suffix = `${process.pid}-${randomUUID()}`, working = path.join(root, `working-${suffix}.index`);
  await fs.copyFile(original, working);
  let base = journal.before;
  if (names.size) {
    const recovery = path.join(root, `recovery-${suffix}.index`);
    await commands(dir, git, recovery).checked(['read-tree', journal.before]);
    await replaceEntries(dir, git, recovery, applied, file => names.has(file));
    base = (await commands(dir, git, recovery).checked(['write-tree'])).trim();
    await replaceEntries(dir, git, working, applied, file => names.has(file));
  }
  const result = await commands(dir, git, working).run(['read-tree', '-m', '-u', base, journal.projected]);
  if (result.code) throw new CheckoutRefusal(result.output);
}
async function finishTransaction(dir: string, git: GitRunner, index: string, root: string, journal: Journal) {
  const { checked, run } = commands(dir, git);
  if ((await run(['merge-base', '--is-ancestor', journal.before, journal.target])).code) throw new Error('Checkout journal is not a fast-forward');
  const sources = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', journal.before, journal.projected]));
  const excluded = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', journal.projected, journal.target]));
  if (sources.some(protectedBy(journal)) || excluded.some(file => !protectedBy(journal)(file))) throw new Error('Invalid checkout projection; user data was not touched');
  for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (await exists(path.resolve(dir, (await checked(['rev-parse', '--git-path', state])).trim()))) throw new Error('Another Git operation is active; finish it before resuming Update');
  }
  for (const name of ['original.index', 'final.index', 'projected.index']) await regular(path.join(root, name));
  const lease = await acquireLock(root, index, path.join(root, 'final.index'));
  try {
    const branch = (await checked(['symbolic-ref', '-q', 'HEAD'])).trim(), head = (await checked(['rev-parse', 'HEAD'])).trim();
    if (branch !== `refs/heads/${journal.branch}` || ![journal.before, journal.target].includes(head)) throw new Error('Git changed during Update; journal retained');
    const bytes = await fs.readFile(index), old = await fs.readFile(path.join(root, 'original.index')), next = await fs.readFile(path.join(root, 'final.index'));
    if (!bytes.equals(old) && !bytes.equals(next)) throw new Error('Index changed during Update; journal retained without replacing local work');
    if (head === journal.before) {
      await applyJournalCheckout(dir, git, root, journal, sources);
      if ((await run(['update-ref', '-m', 'XR Build Update: protected-data fast-forward', `refs/heads/${journal.branch}`, journal.target, journal.before])).code)
        throw new Error('Branch changed during Update; journal retained without forcing any ref');
    }
    await fs.rename(`${index}.lock`, index);
  } finally { await releaseLock(index, lease.id); }
  // Completion is another atomic directory publication; interrupted recursive cleanup is never an active journal.
  await retire(root, index);
}

export async function checkoutFetchedCommit(dir: string, options: CheckoutOptions): Promise<string[]> {
  const { git, before, target, branch, line } = options, { checked, run } = commands(dir, git);
  if (before === target) return [];
  const changed = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', before, target]));
  const protect = protectedBy(options), retained = options.workspace ? changed.filter(protect) : [], sources = changed.filter(file => !retained.includes(file));
  const localSources = async () => [...new Set([...records(await checked(['diff', '--name-only', '-z'])),
    ...records(await checked(['diff', '--cached', '--name-only', '-z']))].filter(file => sources.some(incoming => overlaps(file, incoming))))];
  const untracked = records(await checked(['ls-files', '--others', '-z']));
  const collisions = untracked.filter(file => sources.some(incoming => overlaps(file, incoming)));
  if (collisions.length) throw new CheckoutRefusal('Untracked source paths would be overwritten', collisions);
  const deleted = records(await checked(['diff', '--name-only', '--diff-filter=D', '-z']));
  const fetchedEntries = retained.length || deleted.length ? treeEntries(await checked(['ls-tree', '-rz', target])) : [];
  // Git may restore an unstaged deletion. Preserve it, but allow a deletion already adopted by upstream.
  const deletedConflicts = deleted.filter(file => sources.includes(file) && fetchedEntries.some(entry => entry.file === file));
  if (deletedConflicts.length) throw new CheckoutRefusal('Incoming source would restore locally deleted files', deletedConflicts);
  await options.ensureUnchanged();
  let needsProjection = false;
  const incoming = new Set(fetchedEntries.map(entry => entry.file));
  for (const file of retained) {
    const same = incoming.has(file) ? (await run(['diff', '--quiet', '--no-ext-diff', '--no-textconv', target, '--', file])).code === 0
      : !await fs.lstat(path.join(dir, file)).then(() => true, error => !['ENOENT', 'ENOTDIR'].includes(error.code));
    if (!same) { needsProjection = true; break; }
  }
  // Matching working bytes alone are not enough: a different staged personal value must also survive.
  if (!needsProjection && retained.length && (await run(['read-tree', '-n', '-m', '-u', before, target])).code !== 0) needsProjection = true;
  if (!needsProjection) {
    line('Checkout: ordinary Git fast-forward (local work preserved).');
    let streamed = false;
    const result = await git(['-c', 'merge.autostash=false', 'merge', '--ff-only', '--no-edit', '--no-overwrite-ignore', target], dir,
      { onLine: text => { streamed = true; line(text); } });
    if (result.code) {
      throw new CheckoutRefusal(result.output, await localSources(), streamed);
    }
    return retained;
  }

  line('Checkout: protected-data fast-forward; incoming defaults are not written over local user data.');
  const { index, root } = await transactionPaths(dir, git);
  await regular(index);
  const prep = await fs.mkdtemp(`${root}.prepare-${process.pid}-`);
  try {
    const original = path.join(prep, 'original.index'), final = path.join(prep, 'final.index');
    await fs.copyFile(index, original);
    const baseEntries = treeEntries(await checked(['ls-tree', '-rz', before])), projection = path.join(prep, 'projection.index');
    await commands(dir, git, projection).checked(['read-tree', target]);
    await replaceEntries(dir, git, projection, baseEntries, protect);
    const projected = (await commands(dir, git, projection).checked(['write-tree'])).trim();
    await fs.copyFile(original, final);
    const dry = await commands(dir, git, final).run(['read-tree', '-n', '-m', '-u', before, projected]);
    if (dry.code) {
      throw new CheckoutRefusal(dry.output, await localSources());
    }
    await commands(dir, git, final).checked(['read-tree', '-m', before, projected]);
    await fs.copyFile(final, path.join(prep, 'projected.index'));
    const oldEntries = await stagedEntries(dir, git, original), base = new Map(baseEntries.map(entry => [entry.file, `${entry.mode} ${entry.oid}`]));
    const old = new Map(oldEntries.map(entry => [entry.file, `${entry.mode} ${entry.oid}`]));
    const staged = new Set([...base.keys(), ...old.keys()].filter(file => protect(file) && base.get(file) !== old.get(file)));
    await replaceEntries(dir, git, final, [...fetchedEntries.filter(entry => !staged.has(entry.file)), ...oldEntries.filter(entry => staged.has(entry.file))], protect);
    const journal: Journal = { version: 2, before, target, branch, projected, workspaceLock: options.workspaceLock };
    await options.ensureUnchanged();
    await durableWrite(path.join(prep, 'journal.json'), JSON.stringify(journal));
    await fs.rename(prep, root); // all recovery inputs become visible together, never a partially written journal
    await finishTransaction(dir, git, index, root, journal);
    return retained;
  } finally { if (await exists(prep)) await fs.rm(prep, { recursive: true, force: true }); }
}

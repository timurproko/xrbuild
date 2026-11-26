// A normal fast-forward unless incoming commits touch installation-local workspace data.
// In that case project the checkout tree, never the branch: HEAD still advances to the exact remote commit.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitRunner } from './update.ts';

export const CHECKOUT_JOURNAL = 'xrb-update-checkout';
interface Entry { mode: string; oid: string; file: string }
interface Journal { version: 1; before: string; target: string; branch: string; projected: string; sources: string[]; retained: string[]; workspaceLock?: boolean; phase: 'checkout' | 'ready' }
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
  git: GitRunner;
  workspace: boolean;
  workspaceLock?: boolean;
  before: string;
  target: string;
  branch: string;
  ensureUnchanged: () => Promise<void>;
  line: (line: string) => void;
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
async function regular(file: string) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Unsafe Update transaction file: ${path.basename(file)}`);
}
async function writeJournal(root: string, value: Journal) {
  const temp = path.join(root, 'journal.next');
  const handle = await fs.open(temp, 'wx');
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, path.join(root, 'journal.json'));
}
async function replaceEntries(dir: string, git: GitRunner, index: string, entries: Entry[], select: (file: string) => boolean) {
  const command = commands(dir, git, index);
  const current = await stagedEntries(dir, git, index), zero = '0'.repeat(entries[0]?.oid.length ?? current[0]?.oid.length ?? 40);
  const records = [...current.filter(entry => select(entry.file)).map(entry => `0 ${zero}\t${entry.file}\0`),
    ...entries.filter(entry => select(entry.file)).map(entry => `${entry.mode} ${entry.oid}\t${entry.file}\0`)];
  if (records.length) await command.checked(['update-index', '-z', '--index-info'], records.join(''));
}
async function stagedEntries(dir: string, git: GitRunner, index: string): Promise<Entry[]> {
  return records(await commands(dir, git, index).checked(['ls-files', '--stage', '-z'])).map(record => {
    const match = /^(\d+) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Unmerged index; finish the existing merge before Update');
    return { mode: match[1]!, oid: match[2]!, file: match[3]! };
  });
}
async function transactionPaths(dir: string, git: GitRunner) {
  const { checked } = commands(dir, git);
  const index = path.resolve(dir, (await checked(['rev-parse', '--git-path', 'index'])).trim());
  const root = path.resolve(dir, (await checked(['rev-parse', '--git-path', CHECKOUT_JOURNAL])).trim());
  return { index, root };
}

// An incomplete checkout is never mistaken for a successful fast-forward. Only exact journal states resume.
export async function resumeProtectedCheckout(dir: string, git: GitRunner, line: (line: string) => void): Promise<string[]> {
  const { index, root } = await transactionPaths(dir, git);
  if (!await fs.lstat(root).then(() => true, () => false)) return [];
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe Update checkout journal; inspect Git metadata');
  await regular(path.join(root, 'journal.json'));
  if ((await fs.stat(path.join(root, 'journal.json'))).size > 4 * 1024 * 1024) throw new Error('Oversized Update checkout journal');
  const journal = JSON.parse(await fs.readFile(path.join(root, 'journal.json'), 'utf8')) as Journal;
  if (journal.version !== 1 || !/^[0-9a-f]{40,64}$/.test(journal.before) || !/^[0-9a-f]{40,64}$/.test(journal.target)
    || !/^[0-9a-f]{40,64}$/.test(journal.projected) || typeof journal.branch !== 'string'
    || !Array.isArray(journal.sources) || !Array.isArray(journal.retained)
    || ![...journal.sources, ...journal.retained].every(file => typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'))
    || !['checkout', 'ready'].includes(journal.phase))
    throw new Error('Invalid Update checkout journal; preserve it and inspect Git metadata');
  line('Resuming protected-data fast-forward from its checkout journal.');
  await finishTransaction(dir, git, index, root, journal);
  return journal.retained;
}

// read-tree publishes its index atomically, but a process can die halfway through writing worktree files.
// Resume only files that still match either recorded tree, never an outside edit or a partially written blob.
async function applyJournalCheckout(dir: string, git: GitRunner, root: string, journal: Journal) {
  const original = path.join(root, 'original.index'), expected = path.join(root, 'projected.index'), working = path.join(root, 'working.index');
  const before = new Map((await stagedEntries(dir, git, original)).map(entry => [entry.file, entry]));
  const after = new Map((await stagedEntries(dir, git, expected)).map(entry => [entry.file, entry]));
  const applied: Entry[] = [], appliedNames = new Set<string>();
  const matches = async (index: string, file: string, entry: Entry | undefined) => {
    if (!entry) return !await fs.lstat(path.join(dir, file)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    return (await commands(dir, git, index).run(['diff', '--quiet', '--no-ext-diff', '--no-textconv', '--', file])).code === 0;
  };
  for (const file of journal.sources) {
    if (await matches(original, file, before.get(file))) continue;
    if (!await matches(expected, file, after.get(file))) throw new CheckoutRefusal('Source changed outside the interrupted checkout', [file]);
    appliedNames.add(file);
    const entry = after.get(file); if (entry) applied.push(entry);
  }
  await fs.copyFile(original, working);
  let base = journal.before;
  if (appliedNames.size) {
    const recovery = path.join(root, 'recovery.index');
    await commands(dir, git, recovery).checked(['read-tree', journal.before]);
    await replaceEntries(dir, git, recovery, applied, file => appliedNames.has(file));
    base = (await commands(dir, git, recovery).checked(['write-tree'])).trim();
    await replaceEntries(dir, git, working, applied, file => appliedNames.has(file));
  }
  const result = await commands(dir, git, working).run(['read-tree', '-m', '-u', base, journal.projected]);
  if (result.code) throw new CheckoutRefusal(result.output);
}

async function finishTransaction(dir: string, git: GitRunner, index: string, root: string, journal: Journal) {
  const { checked, run } = commands(dir, git);
  if ((await run(['merge-base', '--is-ancestor', journal.before, journal.target])).code !== 0)
    throw new Error('Checkout journal does not describe a fast-forward; preserve it for inspection');
  const projectedChanges = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', journal.before, journal.projected]));
  const excludedChanges = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', journal.projected, journal.target]));
  const protectedPath = (file: string) => keptWorkspacePath(file) && (journal.workspaceLock !== false || key(file) !== 'pnpm-lock.yaml');
  if (projectedChanges.some(protectedPath) || excludedChanges.some(file => !protectedPath(file)))
    throw new Error('Checkout journal projection is invalid; user data was not touched');
  journal.sources = projectedChanges;
  for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const file = path.resolve(dir, (await checked(['rev-parse', '--git-path', state])).trim());
    if (await fs.stat(file).then(() => true, () => false)) throw new Error('Another Git operation is active; finish it before resuming Update');
  }
  const working = path.join(root, 'working.index'), original = path.join(root, 'original.index'), final = path.join(root, 'final.index');
  for (const file of [working, original, final]) await regular(file);
  const lockPath = `${index}.lock`, ownerFile = path.join(root, 'owner.json');
  // Recover only this journal's demonstrably dead owner, never somebody else's Git lock.
  if (await fs.lstat(lockPath).then(() => true, () => false)) {
    await regular(lockPath); await regular(ownerFile);
    const owner = JSON.parse(await fs.readFile(ownerFile, 'utf8')) as { pid: number; token: string; inode: string; device: string };
    const identity = await fs.lstat(lockPath, { bigint: true });
    if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string'
      || identity.ino.toString() !== owner.inode || identity.dev.toString() !== owner.device) throw new Error('Git lock no longer belongs to this Update; preserve it');
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (error) { alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
    const bytes = await fs.readFile(lockPath);
    if (alive || !(bytes.toString() === owner.token || bytes.equals(await fs.readFile(final))))
      throw new Error('Git index lock is active or not owned by this Update; preserve it and inspect the checkout journal');
    await fs.unlink(lockPath);
  }
  const token = randomUUID(), lock = await fs.open(lockPath, 'wx');
  let published = false;
  try {
    const identity = await lock.stat({ bigint: true });
    await fs.writeFile(ownerFile, JSON.stringify({ pid: process.pid, token, inode: identity.ino.toString(), device: identity.dev.toString() }));
    await lock.writeFile(token); await lock.sync();
    const branch = (await checked(['symbolic-ref', '-q', 'HEAD'])).trim();
    const head = (await checked(['rev-parse', 'HEAD'])).trim();
    if (branch !== `refs/heads/${journal.branch}` || ![journal.before, journal.target].includes(head))
      throw new Error('Git changed during the protected update; journal retained for inspection');
    const bytes = await fs.readFile(index), old = await fs.readFile(original), next = await fs.readFile(final);
    if (!bytes.equals(old) && !bytes.equals(next)) throw new Error('Index changed during Update; journal retained without replacing local work');
    if (journal.phase === 'checkout') {
      // The working index is atomically written by read-tree. It records whether checkout completed before a crash.
      const expected = await commands(dir, git, path.join(root, 'projected.index')).checked(['ls-files', '--stage', '-z']);
      const actual = await commands(dir, git, working).checked(['ls-files', '--stage', '-z']);
      if (actual !== expected) {
        if (head !== journal.before) throw new Error('Incomplete checkout with changed HEAD; inspect retained journal');
        await applyJournalCheckout(dir, git, root, journal);
      }
      journal.phase = 'ready';
      await writeJournal(root, journal);
    }
    await lock.truncate(0); await lock.write(next, 0, next.length, 0); await lock.sync();
    if (head === journal.before) {
      const changed = await run(['update-ref', '-m', 'XR Build Update: protected-data fast-forward', `refs/heads/${journal.branch}`, journal.target, journal.before]);
      if (changed.code) throw new Error('Branch changed during Update; checkout journal retained without forcing any ref');
    }
    await lock.close();
    await fs.rename(lockPath, index); published = true;
    await fs.rm(root, { recursive: true });
  } finally {
    await lock.close().catch(() => {});
    if (!published) await fs.unlink(lockPath).catch(() => {});
  }
}

export async function checkoutFetchedCommit(dir: string, options: CheckoutOptions): Promise<string[]> {
  const { git, before, target, branch, line } = options, { checked } = commands(dir, git);
  const changed = records(await checked(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', before, target]));
  const protectedPath = (file: string) => keptWorkspacePath(file) && (options.workspaceLock !== false || key(file) !== 'pnpm-lock.yaml');
  const retained = options.workspace ? changed.filter(protectedPath) : [];
  const sources = changed.filter(file => !retained.includes(file));
  // merge/read-tree can overwrite ignored files by default. Include them in the untracked collision check.
  const untracked = records(await checked(['ls-files', '--others', '-z']));
  const local = [...records(await checked(['diff', '--name-only', '-z'])), ...records(await checked(['diff', '--cached', '--name-only', '-z']))];
  const collisions = [...new Set([...untracked, ...local].filter(file => sources.some(incoming => overlaps(file, incoming))))];
  if (collisions.length) throw new CheckoutRefusal('Locally changed source paths would be overwritten', collisions);
  await options.ensureUnchanged();
  const fetchedEntries = retained.length ? treeEntries(await checked(['ls-tree', '-rz', target])) : [];
  let needsProjection = retained.length > 0;
  if (needsProjection) {
    const incoming = new Set(fetchedEntries.map(entry => entry.file));
    let alreadyMatches = true;
    for (const file of retained) {
      const matches = incoming.has(file)
        ? (await commands(dir, git).run(['diff', '--quiet', '--no-ext-diff', '--no-textconv', target, '--', file])).code === 0
        : !await fs.lstat(path.join(dir, file)).then(() => true, error => !['ENOENT', 'ENOTDIR'].includes(error.code));
      if (!matches) { alreadyMatches = false; break; }
    }
    if (alreadyMatches && (await commands(dir, git).run(['read-tree', '-n', '-m', '-u', before, target])).code === 0) needsProjection = false;
  }
  if (!needsProjection) {
    line('Checkout: ordinary Git fast-forward (local work preserved).');
    let streamed = false;
    const result = await git(['-c', 'merge.autostash=false', 'merge', '--ff-only', '--no-edit', '--no-overwrite-ignore', target], dir,
      { onLine: text => { streamed = true; line(text); } });
    if (result.code) {
      const local = records(await checked(['diff', '--name-only', '-z', 'HEAD']));
      throw new CheckoutRefusal(result.output, local.filter(file => sources.some(incoming => overlaps(file, incoming))), streamed);
    }
    return retained;
  }

  line('Checkout: protected-data fast-forward; incoming defaults are not written over local user data.');
  const { index, root } = await transactionPaths(dir, git);
  await regular(index);
  await fs.mkdir(root); // exclusive; an earlier journal must be recovered, never overwritten
  let journalWritten = false;
  try {
    const original = path.join(root, 'original.index'), working = path.join(root, 'working.index'), final = path.join(root, 'final.index');
    await fs.copyFile(index, original); await fs.copyFile(index, working);
    const baseEntries = treeEntries(await checked(['ls-tree', '-rz', before]));
    const targetEntries = fetchedEntries;
    const projection = path.join(root, 'projection.index');
    await commands(dir, git, projection).checked(['read-tree', target]);
    await replaceEntries(dir, git, projection, baseEntries, protectedPath);
    const projected = (await commands(dir, git, projection).checked(['write-tree'])).trim();
    const dryRun = await commands(dir, git, working).run(['read-tree', '-n', '-m', '-u', before, projected]);
    if (dryRun.code) {
      const local = records(await checked(['diff', '--name-only', '-z', 'HEAD']));
      throw new CheckoutRefusal(dryRun.output, local.filter(file => sources.some(incoming => overlaps(file, incoming))));
    }
    await fs.copyFile(original, final);
    await commands(dir, git, final).checked(['read-tree', '-m', before, projected]);
    // Preserve the original staged user-data entries; otherwise index follows the real target, not the projection.
    const oldEntries = await stagedEntries(dir, git, original);
    const base = new Map(baseEntries.map(entry => [entry.file, `${entry.mode} ${entry.oid}`]));
    const old = new Map(oldEntries.map(entry => [entry.file, `${entry.mode} ${entry.oid}`]));
    const staged = new Set([...base.keys(), ...old.keys()].filter(file => protectedPath(file) && base.get(file) !== old.get(file)));
    const desired = [...targetEntries.filter(entry => !staged.has(entry.file)), ...oldEntries.filter(entry => staged.has(entry.file))];
    // Save the projected expected index for crash recognition before changing protected index entries.
    await fs.copyFile(final, path.join(root, 'projected.index'));
    await replaceEntries(dir, git, final, desired, protectedPath);
    const journal: Journal = { version: 1, before, target, branch, projected, sources, retained, workspaceLock: options.workspaceLock, phase: 'checkout' };
    await options.ensureUnchanged();
    await writeJournal(root, journal); journalWritten = true;
    await finishTransaction(dir, git, index, root, journal);
    return retained;
  } finally {
    if (!journalWritten) await fs.rm(root, { recursive: true, force: true });
  }
}

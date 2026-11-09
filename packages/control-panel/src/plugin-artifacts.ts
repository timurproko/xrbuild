// Native output ownership. No discovery call creates directories or changes a build receipt.
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync, lstatSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const NATIVE_RECEIPT = '.xrb-native-build.json';

/** Membership and stamps, not only the newest file: removals must invalidate native artifacts. */
export function nativeBinaryFingerprint(root: string): string {
  const hash = createHash('sha256');
  const visit = (file: string, relative: string) => {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isDirectory() && !stat.isFile()) throw new Error(`Native binary scan refuses a link or unsupported entry: ${file}`);
    hash.update(relative).update(`\0${stat.isDirectory() ? 'd' : 'f'}:${stat.ino}:${stat.size}:${stat.mtimeMs}\0`);
    if (stat.isDirectory()) for (const name of readdirSync(file).sort()) visit(path.join(file, name), `${relative}/${name}`);
  };
  visit(root, '');
  return hash.digest('hex');
}

export function canonicalFuturePath(file: string): string {
  const absolute = path.resolve(file);
  try { return realpathSync.native(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(absolute) === absolute) throw error;
    return path.join(canonicalFuturePath(path.dirname(absolute)), path.basename(absolute));
  }
}
export interface NativeArtifacts {
  binaryRoot: string;
  nativeBuildRoot: string;
  nativeStateRoot: string;
  nativeProblem: string | null;
  nativeRebuilt: boolean;
}

/** Check every existing component, including a missing destination's parents; never follow links. */
export async function nativeDirectory(workspace: string, destination: string, create = false): Promise<void> {
  const root = canonicalFuturePath(workspace), relative = path.relative(root, path.resolve(destination));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Native output must be inside the selected workspace');
  // Check the selected root itself before canonicalizing its descendants.
  const rootStat = await fs.lstat(workspace).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (rootStat?.isSymbolicLink()) throw new Error('Native workspace must not be a link');
  if (create) await fs.mkdir(workspace, { recursive: true });
  let current = root;
  for (const part of ['', ...relative.split(path.sep)]) {
    if (part) current = path.join(current, part);
    if (create && part) await fs.mkdir(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Native output path must be a plain directory: ${current}`);
  }
}

export async function nativeArtifacts(core: string, workspace: string, sourceRoot: string, origin: 'bundled' | 'workspace'): Promise<NativeArtifacts> {
  const coreRoot = canonicalFuturePath(core), userRoot = canonicalFuturePath(workspace);
  // Keep MSBuild's nested compiler-check paths below Windows path limits even for long plugin IDs.
  const identity = origin === 'bundled' ? `${coreRoot}\0${sourceRoot}` : sourceRoot;
  const key = createHash('sha256').update(process.platform === 'win32' ? identity.toLowerCase() : identity).digest('hex').slice(0, 20);
  const stateRoot = path.join(userRoot, 'build', 'native', `${origin === 'bundled' ? 'b' : 'w'}-${key}`);
  const buildRoot = origin === 'bundled' ? stateRoot : path.join(sourceRoot, 'build');
  const output = origin === 'bundled' ? path.join(stateRoot, 'bin') : path.join(sourceRoot, 'bin');
  const base = { nativeBuildRoot: buildRoot, nativeStateRoot: stateRoot, nativeRebuilt: false };
  try {
    await nativeDirectory(workspace, stateRoot);
    const state = await fs.lstat(stateRoot).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!state) return { ...base, binaryRoot: path.join(sourceRoot, 'bin'), nativeProblem: null };
    const file = path.join(stateRoot, NATIVE_RECEIPT);
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw new Error('missing or unsafe native build receipt');
    const receipt = JSON.parse(await fs.readFile(file, 'utf8'));
    if (receipt.version !== 1 || receipt.core !== coreRoot || receipt.source !== sourceRoot || receipt.status !== 'complete') throw new Error('native build is incomplete, failed or belongs to another source');
    await nativeDirectory(workspace, output);
    if (!(await fs.stat(output)).isDirectory()) throw new Error('native binary output is missing');
    return { ...base, binaryRoot: output, nativeRebuilt: true, nativeProblem: null };
  } catch (error) {
    return { ...base, binaryRoot: output, nativeProblem: (error as Error).message };
  }
}

/** Atomic receipt replacement, only under a validated writable build-state root. */
export async function writeNativeReceipt(core: string, workspace: string, source: string, stateRoot: string, status: 'building' | 'complete' | 'failed'): Promise<void> {
  await nativeDirectory(workspace, stateRoot, true);
  const file = path.join(stateRoot, NATIVE_RECEIPT), temporary = `${file}.${randomUUID()}.tmp`;
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) throw new Error('Unsafe native build receipt');
  try {
    await fs.writeFile(temporary, JSON.stringify({ version: 1, core: canonicalFuturePath(core), source, status }), { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
}

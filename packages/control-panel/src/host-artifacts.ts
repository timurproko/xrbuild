// Core-bound host builds and immutable published runtimes; discovery never creates state.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalFuturePath, nativeDirectory, nativeBinaryFingerprint } from './plugin-artifacts.ts';

export const HOST_RECEIPT = '.xrb-host-build.json';
export const HOST_LOCK = '.xrb-host-build.lock';
const MAX_RECEIPT = 16384;

/** Legacy/source-development layout, also the packaged runtime before a local rebuild exists. */
export function hostPaths(repo: string) {
  const hostDir = path.join(repo, 'native', 'host'), buildDir = path.join(hostDir, 'build');
  return { hostDir, buildDir, releaseDir: path.join(buildDir, 'Release'), exe: path.join(buildDir, 'Release', 'xrb-host.exe'),
    sources: ['src', 'CMakeLists.txt', 'tests', 'testpages'].map(name => path.join(hostDir, name)).concat([
      path.join(repo, 'native/plugin-sdk/include'), path.join(repo, 'native/plugin-sdk/tests'), path.join(repo, 'tools/fetch-deps/deps.lock.json'),
    ]) };
}
export function hostCachePaths(repo: string, workspace: string) {
  const core = canonicalFuturePath(repo), user = canonicalFuturePath(workspace);
  const key = createHash('sha256').update(process.platform === 'win32' ? core.toLowerCase() : core).digest('hex').slice(0, 20);
  const stateRoot = path.join(user, 'build', 'native', `h-${key}`), buildDir = path.join(stateRoot, 'b');
  return { ...hostPaths(core), stateRoot, buildDir, releaseDir: path.join(buildDir, 'Release'), exe: path.join(buildDir, 'Release', 'xrb-host.exe') };
}
export function hostSourceFingerprint(repo: string): string {
  const hash = createHash('sha256');
  const core = canonicalFuturePath(repo);
  for (const file of hostPaths(core).sources) {
    let current = core;
    for (const part of path.relative(core, file).split(path.sep)) {
      current = path.join(current, part);
      if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Host source path contains a symbolic link or junction');
    }
    hash.update(file).update('\0');
    hash.update(lstatSync(file, { throwIfNoEntry: false }) ? nativeBinaryFingerprint(file) : 'missing').update('\0');
  }
  return hash.digest('hex');
}
export async function validateHostCache(repo: string, workspace: string, create = false, forWrite = create): Promise<void> {
  const core = canonicalFuturePath(repo), user = canonicalFuturePath(workspace), relative = path.relative(core, user);
  // Repository-local independent .xrbuild is valid; product source/dependency directories are not user roots.
  if (forWrite && (!relative || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && ['native', 'embedded', 'packages', 'third_party', 'templates', 'tools', 'config', 'docs', 'openspec', '.claude'].includes(relative.split(path.sep)[0].toLowerCase())))
    throw new Error('Host cache workspace must be outside product source and dependency directories');
  const hp = hostCachePaths(repo, workspace);
  await nativeDirectory(workspace, hp.stateRoot, create);
  await nativeDirectory(workspace, hp.buildDir);
}

export interface HostArtifacts extends ReturnType<typeof hostPaths> {
  stateRoot: string;
  rebuilt: boolean;
  problem: string | null;
  inputs?: string;
  builtMs?: number;
}
async function readReceipt(file: string) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_RECEIPT) throw new Error('Unsafe host build receipt');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error('Host receipt changed while opening');
    const bytes = Buffer.alloc(MAX_RECEIPT + 1);
    let size = 0;
    while (size < bytes.length) {
      const next = await handle.read(bytes, size, bytes.length - size, null);
      if (!next.bytesRead) break;
      size += next.bytesRead;
    }
    if (size > MAX_RECEIPT) throw new Error('Oversized host build receipt');
    let receipt;
    try { receipt = JSON.parse(bytes.subarray(0, size).toString('utf8')); }
    catch { throw new Error('Invalid host build receipt'); }
    return { receipt, builtMs: stat.mtimeMs };
  } finally { await handle.close(); }
}

export async function resolvedHostPaths(repo: string, workspace: string): Promise<HostArtifacts> {
  const hp = hostCachePaths(repo, workspace), base = { ...hp, rebuilt: false, problem: null };
  try {
    await validateHostCache(repo, workspace);
    const state = await fs.lstat(hp.stateRoot).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!state) {
      const packaged = hostPaths(canonicalFuturePath(repo));
      await nativeDirectory(canonicalFuturePath(repo), packaged.releaseDir);
      const exe = lstatSync(packaged.exe, { throwIfNoEntry: false });
      if (exe) {
        if (!exe.isFile()) throw new Error('Host executable must be a regular file');
        nativeBinaryFingerprint(packaged.exe);
      }
      return { ...base, ...packaged };
    }
    if (lstatSync(path.join(hp.stateRoot, HOST_LOCK), { throwIfNoEntry: false })) throw new Error('Host rebuild lock exists; wait for completion or verify the previous builder stopped');
    const { receipt, builtMs } = await readReceipt(path.join(hp.stateRoot, HOST_RECEIPT));
    if (receipt?.version !== 1 || receipt.core !== canonicalFuturePath(repo) || receipt.source !== hp.hostDir || receipt.status !== 'complete')
      throw new Error('Host rebuild is incomplete, failed or belongs to another core/source');
    if (typeof receipt.inputs !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.inputs) || typeof receipt.runtime !== 'string' || !/^r-[a-zA-Z0-9]{6}$/.test(receipt.runtime)) throw new Error('Invalid host runtime receipt');
    const releaseDir = path.join(hp.stateRoot, receipt.runtime), exe = path.join(releaseDir, 'xrb-host.exe');
    await nativeDirectory(workspace, releaseDir);
    if (!(await fs.lstat(exe)).isFile() || nativeBinaryFingerprint(releaseDir) !== receipt.output) throw new Error('Host runtime output is missing, changed or unsafe; rebuild the host');
    return { ...base, releaseDir, exe, rebuilt: true, inputs: receipt.inputs, builtMs };
  } catch (error) { return { ...base, problem: (error as Error).message }; }
}

export async function writeHostReceipt(repo: string, workspace: string, status: 'building' | 'complete' | 'failed', inputs: string, runtime?: string): Promise<void> {
  await validateHostCache(repo, workspace, false, true);
  const hp = hostCachePaths(repo, workspace), file = path.join(hp.stateRoot, HOST_RECEIPT), temporary = `${file}.${randomUUID()}.tmp`;
  const stat = lstatSync(file, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) throw new Error('Unsafe host build receipt');
  if (!/^[a-f0-9]{64}$/.test(inputs) || status === 'complete' && (!runtime || !/^r-[a-zA-Z0-9]{6}$/.test(runtime))) throw new Error('Invalid host receipt fields');
  if (runtime) await nativeDirectory(workspace, path.join(hp.stateRoot, runtime));
  const content = JSON.stringify({ version: 1, core: canonicalFuturePath(repo), source: hp.hostDir, status, inputs, runtime,
    output: status === 'complete' && runtime ? nativeBinaryFingerprint(path.join(hp.stateRoot, runtime)) : undefined });
  if (Buffer.byteLength(content) > MAX_RECEIPT) throw new Error('Oversized host build receipt');
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
}

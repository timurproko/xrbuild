// Explicit core dependency setup. Readiness checks never create storage or fetch packages.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalFuturePath, nativeBinaryFingerprint, nativeDirectory } from './plugin-artifacts.ts';
import { validateHostCache } from './host-artifacts.ts';
import { assertWritablePath } from './project-access.ts';
import type { JobContext } from './jobs.ts';

const RECEIPT = 'dependencies.json';
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
export function nativeDependencyPaths(core: string, workspace: string) {
  const owner = canonicalFuturePath(core), user = canonicalFuturePath(workspace);
  const key = digest(process.platform === 'win32' ? owner.toLowerCase() : owner).slice(0, 20);
  const root = path.join(user, 'build', 'native-deps', `d-${key}`);
  return { root, receipt: path.join(root, RECEIPT) };
}
async function regular(file: string, max = 65536): Promise<Buffer> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > max) throw new Error('Unsafe native dependency metadata');
  return fs.readFile(file);
}
async function inputs(core: string) {
  const lock = await regular(path.join(core, 'tools/fetch-deps/deps.lock.json'));
  const sources = await regular(path.join(core, 'tools/fetch-deps/sources.mjs'));
  const pins = JSON.parse(lock.toString('utf8')) as Record<string, string>;
  for (const key of ['archive:cef', 'nlohmann/nlohmann/json.hpp']) if (!/^[a-f0-9]{64}$/.test(pins[key] ?? '')) throw new Error('Core native dependency hashes are not pinned');
  return { revision: digest(Buffer.concat([lock, sources])), pins };
}
async function requiredFiles(root: string, pins: Record<string, string>): Promise<void> {
  // A shared core third_party root may resolve elsewhere; all descendants must still be plain.
  const resolved = canonicalFuturePath(root);
  for (const relative of ['cef/cmake/FindCEF.cmake', 'cef/include/cef_version.h', 'cef/Release/libcef.dll', 'cef/Release/libcef.lib', 'nlohmann/nlohmann/json.hpp']) {
    let current = resolved;
    for (const part of relative.split('/')) {
      current = path.join(current, part); const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new Error('Native dependencies contain an unsafe entry');
    }
    if (!(await fs.stat(current)).isFile()) throw new Error('Native dependency file is missing');
  }
  if ((await regular(path.join(resolved, 'cef/.fetched-sha256'))).toString('utf8').trim() !== pins['archive:cef']) throw new Error('Browser runtime dependency does not match its pinned archive');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(resolved, 'nlohmann/nlohmann/json.hpp'))) hash.update(chunk);
  if (hash.digest('hex') !== pins['nlohmann/nlohmann/json.hpp']) throw new Error('Native header dependency hash mismatch');
}
interface DependencyReceipt { version: number; core: string; revision: string; generation: string; output: string }
async function cached(core: string, workspace: string): Promise<{ root: string; receipt: DependencyReceipt } | null> {
  const p = nativeDependencyPaths(core, workspace);
  await nativeDirectory(workspace, p.root);
  let bytes: Buffer;
  try { bytes = await regular(p.receipt); } catch (error) { if (missing(error)) return null; throw error; }
  let receipt: DependencyReceipt;
  try { receipt = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Malformed native dependency receipt; preserve and review it'); }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).some(key => !['version', 'core', 'revision', 'generation', 'output'].includes(key)) || receipt.version !== 1 || receipt.core !== canonicalFuturePath(core) || !/^[a-f0-9]{64}$/.test(receipt.revision)
    || !/^n-[a-zA-Z0-9]{6}$/.test(receipt.generation) || !/^[a-f0-9]{64}$/.test(receipt.output)) throw new Error('Foreign or invalid native dependency receipt; preserve and review it');
  const root = path.join(p.root, receipt.generation);
  await nativeDirectory(workspace, root);
  if (nativeBinaryFingerprint(root) !== receipt.output) throw new Error('Cached native dependencies changed; preserve and review them');
  return { root, receipt };
}
export interface NativeDependencyStatus { ready: boolean; root: string; revision: string; problem: string | null; blocked: boolean }
export async function nativeDependencyStatus(core: string, workspace: string): Promise<NativeDependencyStatus> {
  const fallback = path.join(core, 'third_party');
  let sourceRevision = '';
  try {
    const source = await inputs(core); sourceRevision = source.revision;
    const saved = await cached(core, workspace);
    if (saved && saved.receipt.revision !== source.revision) return { ready: false, root: saved.root, revision: source.revision, problem: 'Pinned native inputs changed; install the current libraries.', blocked: false };
    const root = saved?.root ?? fallback;
    try { await requiredFiles(root, source.pins); }
    catch (error) {
      if (saved) throw error;
      return { ready: false, root, revision: source.revision, problem: missing(error) ? 'Pinned core native libraries are not installed.' : (error as Error).message, blocked: false };
    }
    return { ready: true, root, revision: source.revision, problem: null, blocked: false };
  } catch (error) { return { ready: false, root: fallback, revision: sourceRevision, problem: (error as Error).message, blocked: true }; }
}
/** Developer defaults stay unchanged until an explicit user cache has been published. */
export async function nativeDependencyRoot(core: string, workspace: string): Promise<string> {
  const saved = await cached(core, workspace);
  if (!saved) return path.join(core, 'third_party');
  const source = await inputs(core);
  if (saved.receipt.revision !== source.revision) throw new Error('Native dependency inputs changed; use Desktop setup');
  await requiredFiles(saved.root, source.pins);
  return saved.root;
}
export async function installNativeDependencies(core: string, workspace: string, ctx: JobContext): Promise<void> {
  await validateHostCache(core, workspace, false, true);
  const status = await nativeDependencyStatus(core, workspace);
  if (status.blocked) throw new Error(status.problem ?? 'Native dependency state is blocked');
  if (status.ready) { ctx.line('Core native libraries are already ready.'); return; }
  const source = await inputs(core), p = nativeDependencyPaths(core, workspace);
  assertWritablePath(core, workspace, p.receipt);
  await nativeDirectory(workspace, p.root, true);
  const generation = await fs.mkdtemp(path.join(p.root, 'n-'));
  ctx.line('Downloading pinned core native libraries into a new user-owned generation.');
  // The fetcher owns only this fresh generation; failures and old generations are preserved.
  await ctx.run(process.execPath, [path.join(core, 'tools/fetch-deps/fetch-deps.mjs'), `--output=${generation}`], { cwd: core, windowsHide: true });
  await nativeDirectory(workspace, generation);
  await requiredFiles(generation, source.pins);
  if ((await inputs(core)).revision !== source.revision) throw new Error('Core dependency pins changed during setup; retry after the checkout is stable');
  const receipt: DependencyReceipt = { version: 1, core: canonicalFuturePath(core), revision: source.revision, generation: path.basename(generation), output: nativeBinaryFingerprint(generation) };
  const temporary = `${p.receipt}.${path.basename(generation)}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(receipt)); await handle.sync(); } finally { await handle.close(); }
  assertWritablePath(core, workspace, p.receipt);
  await fs.rename(temporary, p.receipt);
  ctx.line('Pinned core native libraries verified and ready.');
}

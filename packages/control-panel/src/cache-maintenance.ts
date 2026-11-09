// Conservative, explicit reclamation: working generations only, never published runtime snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildJson, buildStateDirectory } from './embedded-inputs.ts';
import { embeddedStateRoot, EMBEDDED_LOCK, EMBEDDED_RECEIPT } from './embedded-workspace.ts';
import { projectBuildRoot, PROJECT_BUILD_LOCK, PROJECT_BUILD_RECEIPT } from './project-build.ts';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { containedPath, withinRoot } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import type { Project } from './projects.ts';
import { projectStorageKey } from './project-run-settings.ts';
import { HttpError } from './http.ts';

export interface CacheScope { core: string; workspace: string; project?: Project }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function location(scope: CacheScope) {
  const { core, workspace, project } = scope;
  if (project && project.origin !== 'bundled') throw new HttpError(409, 'Cache maintenance requires a bundled project');
  return project ? { root: projectBuildRoot(core, workspace, project), lock: PROJECT_BUILD_LOCK, receipt: PROJECT_BUILD_RECEIPT } : { root: embeddedStateRoot(core, workspace), lock: EMBEDDED_LOCK, receipt: EMBEDDED_RECEIPT };
}
async function exists(file: string) { return fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; }); }
async function tree(root: string, original = root) {
  const hash = createHash('sha256'); let bytes = 0, files = 0;
  const visit = async (file: string, relative = '') => {
    const stat = await fs.lstat(file);
    hash.update(`${relative}\0${stat.ino}:${stat.size}:${stat.mtimeMs}\0`);
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(file), target = path.resolve(path.dirname(path.join(original, relative)), link);
      if (!withinRoot(original, target)) throw new Error('Working cache contains a link outside its generation');
      hash.update(`link:${link}`); files++; return;
    }
    if (stat.isFile()) { if (stat.nlink !== 1) throw new Error('Working cache contains a hard link'); bytes += stat.size; files++; return; }
    if (!stat.isDirectory()) throw new Error('Working cache contains an unsupported entry');
    for (const name of (await fs.readdir(file)).sort()) {
      if (['.git', '.xrbuild', 'keep'].includes(name.toLowerCase())) throw new Error('Working cache contains protected Git/private/KEEP data');
      await visit(path.join(file, name), relative ? `${relative}/${name}` : name);
    }
  };
  await visit(root); return { fingerprint: hash.digest('hex'), bytes, files };
}
async function ancestorProtection(root: string, scope: CacheScope) {
  const boundary = canonicalFuturePath(scope.workspace);
  let current = canonicalFuturePath(root);
  if (!withinRoot(boundary, current)) throw new Error('Cache escapes its selected workspace');
  while (true) {
    if (await exists(path.join(current, 'KEEP')) || await exists(path.join(current, '.artifacts/KEEP'))) throw new Error('Cache is covered by a KEEP preservation marker');
    if (current === boundary) break;
    current = path.dirname(current);
  }
  // A task-local cache also respects that task's marker, not an unrelated primary checkout's artifacts.
  const core = canonicalFuturePath(scope.core);
  if (withinRoot(core, canonicalFuturePath(root)) && (await exists(path.join(core, 'KEEP')) || await exists(path.join(core, '.artifacts/KEEP')))) throw new Error('Cache is covered by a KEEP preservation marker');
}
export interface CacheReview {
  revision: string; candidates: Array<{ name: string; bytes: number; files: number }>; retained: Array<{ name: string; reason: string }>; problem: string | null;
}
async function inspect(scope: CacheScope, ownLock = false): Promise<CacheReview & { fingerprints: Record<string, string> }> {
  const target = location(scope), candidates: CacheReview['candidates'] = [], retained: CacheReview['retained'] = [], fingerprints: Record<string, string> = {};
  const empty = { revision: digest('absent'), candidates, retained, problem: null, fingerprints };
  try {
    await buildStateDirectory(scope.core, scope.workspace, target.root); await ancestorProtection(target.root, scope);
    if (!await exists(target.root)) return empty;
    if (!ownLock && await exists(path.join(target.root, target.lock))) throw new Error('Cache builder/maintenance lock exists; verify the writer before recovery');
    const receipt = await buildJson(await containedPath(target.root, target.receipt));
    if (receipt.version !== 1 || receipt.core !== canonicalFuturePath(scope.core) || !['complete', 'failed'].includes(receipt.status)
      || typeof receipt.working !== 'string' || !/^w-[a-zA-Z0-9]{6}$/.test(receipt.working)) throw new Error('Cache has unknown/incomplete ownership or current-generation state; retained for review');
    if (scope.project && (receipt.source !== canonicalFuturePath(scope.project.dir) || receipt.key !== projectStorageKey(scope.project))) throw new Error('Cache belongs to another project');
    if (!scope.project && receipt.source !== canonicalFuturePath(path.join(scope.core, 'embedded'))) throw new Error('Cache belongs to another product workspace');
    for (const name of (await fs.readdir(target.root)).sort()) {
      if (!/^w-[a-zA-Z0-9]{6}$/.test(name)) continue;
      if (name === receipt.working) { retained.push({ name, reason: 'current or diagnostic working generation' }); continue; }
      const candidate = await containedPath(target.root, name), stat = await fs.lstat(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) { retained.push({ name, reason: 'not a plain working directory' }); continue; }
      if (await exists(path.join(candidate, '.xrb-service-runtime.json'))) { retained.push({ name, reason: 'reserved or published service runtime; may still be in use' }); continue; }
      try {
        let ownership;
        try { ownership = await buildJson(await containedPath(candidate, '.xrb-working.json')); }
        catch { throw new Error('Working generation ownership is unknown or malformed'); }
        if (ownership.version !== 1 || ownership.core !== canonicalFuturePath(scope.core) || ownership.workspace !== canonicalFuturePath(scope.workspace) || ownership.cacheRoot !== canonicalFuturePath(target.root) || ownership.generation !== name || ownership.source !== canonicalFuturePath(path.join(scope.core, 'embedded')) || !['complete', 'failed'].includes(ownership.status)) throw new Error('Working generation ownership is unknown, foreign or incomplete');
        const state = await tree(candidate); fingerprints[name] = state.fingerprint; candidates.push({ name, bytes: state.bytes, files: state.files });
      } catch (error) { retained.push({ name, reason: (error as Error).message }); }
    }
    return { revision: digest(JSON.stringify({ core: canonicalFuturePath(scope.core), workspace: canonicalFuturePath(scope.workspace), target: target.root, receipt, fingerprints, retained })), candidates, retained, problem: null, fingerprints };
  } catch (error) { return { ...empty, problem: (error as Error).message }; }
}
export async function reviewWorkingCache(scope: CacheScope): Promise<CacheReview> {
  const { fingerprints: _private, ...review } = await inspect(scope); return review;
}
export async function cleanWorkingCache(scope: CacheScope, request: { revision?: unknown; generations?: unknown; confirm?: unknown }) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['revision', 'generations', 'confirm'].includes(key)) || request.confirm !== true || typeof request.revision !== 'string' || !Array.isArray(request.generations) || !request.generations.length || request.generations.some(name => typeof name !== 'string' || !/^w-[a-zA-Z0-9]{6}$/.test(name)) || new Set(request.generations).size !== request.generations.length)
    throw new HttpError(400, 'Confirm an explicit reviewed set of working generations');
  const target = location(scope), reviewed = await inspect(scope);
  if (reviewed.problem || reviewed.revision !== request.revision || request.generations.some(name => !Object.hasOwn(reviewed.fingerprints, name))) throw new HttpError(409, 'Cache review is stale or unsafe; review it again');
  await buildStateDirectory(scope.core, scope.workspace, target.root); await ancestorProtection(target.root, scope);
  const file = path.join(target.root, target.lock), lock = await fs.open(file, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => { if (error.code === 'EEXIST') throw new HttpError(409, 'Cache builder/maintenance lock exists'); throw error; });
  const removed: string[] = [];
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, maintenance: true, started: new Date().toISOString() }));
    const current = await inspect(scope, true);
    if (current.problem || current.revision !== request.revision) throw new HttpError(409, 'Cache changed after review; no deletion started');
    for (const name of request.generations) {
      const source = await containedPath(target.root, name), expected = reviewed.fingerprints[name];
      if ((await tree(source)).fingerprint !== expected) throw new HttpError(409, 'Working generation changed; cleanup stopped');
      const quarantine = path.join(target.root, `q-${randomUUID()}`);
      assertWritablePath(scope.core, scope.workspace, quarantine);
      await fs.rename(source, quarantine);
      // Never follow links: absolute pnpm junction targets still name the original generation after rename.
      if ((await tree(quarantine, source)).fingerprint !== expected) throw new HttpError(409, 'Quarantined generation changed; retained for manual review');
      await ancestorProtection(target.root, scope);
      await fs.rm(quarantine, { recursive: true, force: false }); removed.push(name);
    }
    return { removed };
  } finally { await lock.close(); await fs.unlink(file); }
}

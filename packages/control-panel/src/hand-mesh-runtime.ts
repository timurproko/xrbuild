// Passive user-home runtime receipts. No installer, environment discovery, workspace writes or model knowledge.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { containedModule, containedPath, withinRoot } from './extension-catalog.ts';
import type { HandMeshDeclaration } from './hand-mesh-contract.ts';
export const MESH_RUNTIME_RECEIPT = '.xrb-hand-mesh-runtime.json';
export const meshUserRoot = () => path.join(os.homedir(), '.xrbuild');
export interface MeshRuntimeOwner { owner: string; sourceRoot: string; declaration: HandMeshDeclaration }
export interface MeshRuntimeOptions { userRoot?: string; verify?: boolean; signal?: AbortSignal }
export interface MeshRuntimeReceipt {
  version: 1; status: 'complete'; owner: string; id: string; source: string; inputs: string; declaration: string;
  files: { file: string; bytes: number; sha256: string }[];
}
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const meshDeclarationFingerprint = (d: HandMeshDeclaration) => digest(JSON.stringify(d));
async function plainAncestors(file: string): Promise<void> {
  const root = path.parse(path.resolve(file)).root; let current = root;
  for (const part of path.relative(root, path.resolve(file)).split(path.sep)) {
    current = path.join(current, part); const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe mesh runtime directory');
  }
}
async function hashFile(root: string, relative: string, signal?: AbortSignal, maxBytes = Infinity) {
  signal?.throwIfAborted();
  const file = await containedModule(root, root, relative), before = await fs.lstat(file);
  if (before.size > maxBytes) throw new Error('Mesh input exceeds limit');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.nlink !== 1) throw new Error('Mesh file changed during verification');
    const hash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024);
    for (;;) { signal?.throwIfAborted(); const { bytesRead } = await handle.read(buffer); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); }
    const after = await handle.stat(), named = await fs.lstat(file);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || named.ino !== opened.ino || named.dev !== opened.dev || named.nlink !== 1 || named.isSymbolicLink()
      || named.size !== after.size || named.mtimeMs !== after.mtimeMs || named.ctimeMs !== after.ctimeMs) throw new Error('Mesh file changed during verification');
    return { file: relative, bytes: before.size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
async function inventory(root: string, source: boolean, signal?: AbortSignal) {
  await plainAncestors(root);
  const files: { file: string; bytes: number; sha256: string }[] = [];
  let sourceBytes = 0;
  const visit = async (relative = ''): Promise<void> => {
    signal?.throwIfAborted();
    for (const entry of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!relative && (entry.name === MESH_RUNTIME_RECEIPT || source && ['.git', 'node_modules', 'build', 'bin', 'dist'].includes(entry.name))) continue;
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Linked mesh runtime/source entry');
      if (entry.isDirectory()) await visit(file);
      else {
        if (files.length >= 32768) throw new Error('Too many mesh runtime/input files');
        const item = await hashFile(root, file, signal, source ? 64 * 1024 * 1024 - sourceBytes : Infinity);
        sourceBytes += item.bytes; files.push(item);
      }
    }
  };
  await visit(); return files;
}
export async function meshSourceFingerprint(sourceRoot: string, signal?: AbortSignal): Promise<string> {
  return digest(JSON.stringify(await inventory(sourceRoot, true, signal)));
}
/** Explicit setup contributions can build this data after their own authorized provisioning; this helper writes nothing. */
export async function meshRuntimeReceipt(owner: MeshRuntimeOwner, root: string, signal?: AbortSignal): Promise<MeshRuntimeReceipt> {
  const source = await fs.realpath(owner.sourceRoot), runtime = await fs.realpath(root);
  if (withinRoot(source, runtime) || withinRoot(runtime, source)) throw new Error('Mesh runtime must be outside its source tree');
  return { version: 1, status: 'complete', owner: owner.owner, id: owner.declaration.id, source: await fs.realpath(owner.sourceRoot),
    inputs: await meshSourceFingerprint(owner.sourceRoot, signal), declaration: meshDeclarationFingerprint(owner.declaration), files: await inventory(root, false, signal) };
}
async function readMeshReceipt(root: string): Promise<Buffer> {
  const file = await containedModule(root, root, MESH_RUNTIME_RECEIPT), before = await fs.lstat(file);
  if (before.size > 8 * 1024 * 1024) throw new Error('Oversized mesh runtime receipt');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.nlink !== 1) throw new Error('Unsafe mesh receipt');
    const raw = Buffer.alloc(before.size + 1); let count = 0;
    while (count < raw.length) { const r = await handle.read(raw, count, raw.length - count); if (!r.bytesRead) break; count += r.bytesRead; }
    const after = await handle.stat(), named = await fs.lstat(file);
    if (count !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || named.ino !== opened.ino || named.dev !== opened.dev || named.nlink !== 1 || named.isSymbolicLink()
      || named.size !== after.size || named.mtimeMs !== after.mtimeMs || named.ctimeMs !== after.ctimeMs) throw new Error('Mesh receipt changed');
    return raw.subarray(0, count);
  } finally { await handle.close(); }
}
export async function resolveMeshRuntime(owner: MeshRuntimeOwner, options: MeshRuntimeOptions = {}): Promise<{ program: string; cwd: string }> {
  const d = owner.declaration;
  if (!d.runtime) {
    await plainAncestors(owner.sourceRoot);
    return { program: await containedModule(owner.sourceRoot, owner.sourceRoot, d.program), cwd: path.dirname(await containedModule(owner.sourceRoot, owner.sourceRoot, d.program)) };
  }
  const user = path.resolve(options.userRoot ?? meshUserRoot());
  await plainAncestors(user);
  const root = await containedPath(user, `plugins/${d.runtime.id}/${d.runtime.generation}`);
  await plainAncestors(root);
  const source = await fs.realpath(owner.sourceRoot);
  if (withinRoot(source, root) || withinRoot(root, source)) throw new Error('Mesh runtime must be outside its source tree');
  const raw = await readMeshReceipt(root);
  const r = JSON.parse(raw.toString('utf8')) as MeshRuntimeReceipt;
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (r.version !== 1 || r.status !== 'complete' || r.owner !== owner.owner || r.id !== d.id || r.source !== await fs.realpath(owner.sourceRoot)
    || r.declaration !== meshDeclarationFingerprint(d) || !hash(r.inputs) || !Array.isArray(r.files) || r.files.length > 32768
    || r.files.some(f => !f || typeof f.file !== 'string' || !f.file || /[\\:\x00-\x1f\x7f]/.test(f.file) || f.file.split('/').some(p => !p || p === '.' || p === '..')
      || !hash(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0)
    || new Set(r.files.map(f => f.file)).size !== r.files.length || !r.files.some(f => f.file === d.program)) throw new Error('Mesh runtime receipt is incomplete, stale or belongs to another source');
  const program = await containedModule(root, root, d.program);
  if (options.verify) {
    if (r.inputs !== await meshSourceFingerprint(owner.sourceRoot, options.signal)
      || JSON.stringify(r.files) !== JSON.stringify(await inventory(root, false, options.signal))) throw new Error('Mesh runtime inputs/output changed; prepare explicitly');
    if (r.inputs !== await meshSourceFingerprint(owner.sourceRoot, options.signal)) throw new Error('Mesh source changed during verification');
    if (digest(raw) !== digest(await readMeshReceipt(root))) throw new Error('Mesh runtime receipt changed during verification');
    if (program !== await containedModule(root, root, d.program)) throw new Error('Mesh runtime program changed');
  }
  return { program, cwd: root };
}

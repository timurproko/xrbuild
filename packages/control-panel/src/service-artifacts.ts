// Explicitly activated public Node dependencies. Discovery never installs into product sources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { containedPath, withinRoot, type ResolvedPlugin } from './extension-catalog.ts';
import { embeddedWorkspacePlan, runEmbeddedWorkspace } from './embedded-workspace.ts';
import { buildJson, buildStateDirectory, embeddedInputs, inputHash, writeBuildReceipt } from './embedded-inputs.ts';
import type { JobContext } from './jobs.ts';

export const SERVICE_RECEIPT = 'services.json';
export const SERVICE_LOCK = 'services.lock';
export function serviceStateRoot(core: string, workspace: string) {
  const canonical = canonicalFuturePath(core);
  return path.join(canonicalFuturePath(workspace), 'build', 'services', `e-${inputHash(process.platform === 'win32' ? canonical.toLowerCase() : canonical).slice(0, 20)}`);
}
/** Installed symlinks are allowed only when their real targets remain in this exact generation. */
export async function installedFingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (file: string, relative = '') => {
    const stat = await fs.lstat(file);
    hash.update(`${relative}\0${stat.size}:${stat.mtimeMs}:${stat.ino}\0`);
    if (stat.isSymbolicLink()) {
      const target = await fs.realpath(file);
      if (!withinRoot(root, target)) throw new Error('Installed service dependency escapes its generation');
      hash.update(`l:${path.relative(root, target)}\0`); return;
    }
    if (stat.isFile()) { if (stat.nlink !== 1) throw new Error('Installed service file uses a hard link'); return; }
    if (!stat.isDirectory()) throw new Error('Unsupported installed service entry');
    for (const name of (await fs.readdir(file)).sort()) await visit(path.join(file, name), relative ? `${relative}/${name}` : name);
  };
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Installed service workspace must be a plain directory');
  await visit(root); return hash.digest('hex');
}
async function sourceFingerprint(core: string) {
  const plan = await embeddedWorkspacePlan(core), inputs = await embeddedInputs(core, plan.excluded);
  if (plan.sourceFingerprint !== inputs.sourceFingerprint) throw new Error('Embedded service inputs changed during validation');
  return inputs.fingerprint;
}
export async function setupEmbeddedServices(core: string, workspace: string, ctx: JobContext) {
  const inputs = await sourceFingerprint(core), root = await buildStateDirectory(core, workspace, serviceStateRoot(core, workspace), true);
  const lockFile = path.join(root, SERVICE_LOCK), lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error('Service setup lock exists; verify the previous writer stopped before recovery'); throw error;
  });
  const identity = { version: 1, core: canonicalFuturePath(core), source: canonicalFuturePath(path.join(core, 'embedded')), inputs };
  let started = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    await writeBuildReceipt(root, SERVICE_RECEIPT, { ...identity, status: 'building' }, core, workspace); started = true;
    const built = await runEmbeddedWorkspace(core, workspace, 'build', ctx, { reserveRuntime: true });
    const relative = path.relative(canonicalFuturePath(workspace), built.workspace).split(path.sep).join('/');
    const runtime = await containedPath(canonicalFuturePath(workspace), relative);
    const output = await installedFingerprint(runtime);
    if (inputs !== await sourceFingerprint(core) || output !== await installedFingerprint(runtime)) throw new Error('Service inputs/output changed during setup; retry');
    await writeBuildReceipt(path.dirname(runtime), '.xrb-service-runtime.json', { ...identity, status: 'complete', runtime: 'workspace', output }, core, workspace);
    await writeBuildReceipt(root, SERVICE_RECEIPT, { ...identity, status: 'complete', runtime: relative, output }, core, workspace);
    return { runtime, packages: built.packages };
  } catch (error) {
    if (started) await writeBuildReceipt(root, SERVICE_RECEIPT, { ...identity, status: 'failed' }, core, workspace);
    throw error;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}
export async function embeddedServiceRuntime(core: string, workspace: string): Promise<{ root: string | null; installed: boolean }> {
  const state = await buildStateDirectory(core, workspace, serviceStateRoot(core, workspace));
  if (!await fs.lstat(state).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) return { root: null, installed: false };
  if (await fs.lstat(path.join(state, SERVICE_LOCK)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Embedded service setup is active or has a leftover lock');
  const saved = await buildJson(await containedPath(state, SERVICE_RECEIPT));
  if (saved?.version !== 1 || saved.status !== 'complete' || saved.core !== canonicalFuturePath(core) || saved.source !== canonicalFuturePath(path.join(core, 'embedded'))
    || typeof saved.runtime !== 'string' || !/^build\/embedded\/e-[a-f0-9]{20}\/w-[a-zA-Z0-9]{6}\/workspace$/.test(saved.runtime)
    || typeof saved.output !== 'string' || !/^[a-f0-9]{64}$/.test(saved.output)) throw new Error('Embedded service setup is incomplete, failed or belongs to another source');
  if (saved.inputs !== await sourceFingerprint(core)) throw new Error('Embedded service inputs changed; run Setup bundled services again');
  const expected = canonicalFuturePath(path.join(workspace, 'build', 'embedded', path.basename(state)));
  const runtime = await containedPath(canonicalFuturePath(workspace), saved.runtime);
  if (!withinRoot(expected, runtime) || await installedFingerprint(runtime) !== saved.output) throw new Error('Installed service output changed or is unsafe; run Setup bundled services again');
  return { root: runtime, installed: true };
}
export async function serviceModuleFile(plugin: ResolvedPlugin, sourceFile: string, workspace: string, core?: string) {
  if (plugin.origin !== 'bundled' || !core) return { file: sourceFile, runtimeRoot: null };
  const runtime = await embeddedServiceRuntime(core, workspace);
  if (!runtime.root) return { file: sourceFile, runtimeRoot: null };
  const relative = path.relative(canonicalFuturePath(path.join(core, 'embedded')), sourceFile).split(path.sep).join('/');
  return { file: await containedPath(runtime.root, relative), runtimeRoot: runtime.root };
}

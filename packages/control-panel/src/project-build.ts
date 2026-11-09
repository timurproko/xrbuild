// Reproducible bundled web builds in writable snapshots, never in installed product sources.
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { buildJson as json, buildInventory as inventory, embeddedDeclaration, embeddedInputs, buildStateDirectory, writeBuildReceipt as receipt, prepareEmbeddedSnapshot } from './embedded-inputs.ts';
import { embeddedWorkspacePlan, embeddedPrerequisites } from './embedded-workspace.ts';
import { containedPath } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import { projectStateKey } from './project-run-settings.ts';
import { packagedProjectEntry, projectFile } from './embedded-projects.ts';
import { defaultEntry, type Project } from './projects.ts';
import { HttpError } from './http.ts';
import type { JobContext } from './jobs.ts';
import { finalizeBrowserBuild } from './browser-build.ts';

export const PROJECT_BUILD_RECEIPT = 'build.json';
export const PROJECT_BUILD_LOCK = 'build.lock';
const scope = (core: string, p: Project) => ({ core: canonicalFuturePath(core), source: canonicalFuturePath(p.dir), key: p.key ?? p.id });
export function projectBuildRoot(core: string, workspace: string, p: Project): string {
  return path.join(canonicalFuturePath(workspace), 'build', 'projects', projectStateKey(core, p));
}
function requireBundled(p: Project) {
  if (!p.readOnly || p.origin !== 'bundled' || !p.manifest) throw new HttpError(409, 'Build cache requires a valid bundled project');
  return p.manifest;
}
async function sourceLocation(core: string, p: Project) {
  const root = await containedPath(canonicalFuturePath(core), 'embedded');
  const relative = path.relative(root, canonicalFuturePath(p.dir)).split(path.sep).join('/');
  if (!/^projects\/[^/]+\/[^/]+$/.test(relative)) throw new HttpError(409, 'Bundled project is outside the product workspace');
  await containedPath(root, relative);
  return { root, relative };
}
function buildEntry(p: Project): string {
  const m = requireBundled(p), entry = m.entry ?? defaultEntry(m.kind);
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(entry) || entry.split('/').some(name => ['node_modules', 'config', 'projects', 'plugins'].includes(name.toLowerCase())))
    throw new HttpError(409, 'Cached builds require a dedicated relative output directory');
  return entry;
}

/** No YAML execution/extensions: a deliberately bounded canonical package-glob contract. */
export async function bundledBuildPlan(core: string, p: Project) {
  const m = requireBundled(p);
  if (!m.scripts?.build || !/^\w[\w:.-]*$/.test(m.scripts.build)) throw new HttpError(409, 'Bundled source is read-only and has no cache build script');
  const entry = buildEntry(p), { root, relative } = await sourceLocation(core, p);
  try {
    const { packageManager } = await embeddedDeclaration(core);
    const current = await json(await projectFile(p, 'xrb-project.json'));
    if (JSON.stringify(current) !== JSON.stringify(p.manifest)) throw new Error('Project manifest changed');
    const pkg = await json(await projectFile(p, 'package.json'));
    if (typeof pkg?.scripts?.[m.scripts.build] !== 'string') throw new Error('Missing declared package script');
    return { root, relative, entry, script: m.scripts.build, packageManager };
  } catch { throw new HttpError(409, 'Cached rebuild needs embedded package.json (private: true, pinned pnpm), a frozen lockfile, canonical package globs and the declared project script'); }
}

async function inputs(core: string, p: Project) {
  await sourceLocation(core, p);
  const plan = await embeddedWorkspacePlan(core), before = await embeddedInputs(core, plan.excluded);
  if (before.sourceFingerprint !== plan.sourceFingerprint) throw new Error('Embedded inputs changed during planning');
  return { ...before, plan };
}
async function cacheDirectory(core: string, workspace: string, p: Project, create = false) {
  return buildStateDirectory(core, workspace, projectBuildRoot(core, workspace, p), create);
}
export interface ProjectOutput { entry: string | null; origin: 'packaged' | 'cache'; generation: string | null; problem: string | null; status?: number }
export async function resolveProjectOutput(core: string, workspace: string, p: Project, generation?: string): Promise<ProjectOutput> {
  requireBundled(p);
  const empty: ProjectOutput = { entry: null, origin: 'cache', generation: null, problem: null };
  try {
    await sourceLocation(core, p);
    const root = await cacheDirectory(core, workspace, p);
    if (!generation && !await fs.lstat(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) {
      empty.origin = 'packaged';
      return { entry: await packagedProjectEntry(p), origin: 'packaged', generation: null, problem: null };
    }
    if (generation && !/^r-[a-zA-Z0-9]{6}$/.test(generation)) throw new Error('Invalid project output generation');
    if (!generation && await fs.lstat(path.join(root, PROJECT_BUILD_LOCK)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Project rebuild is active or has a stale lock; verify the builder before recovery');
    const recordFile = generation ? `${generation}/${PROJECT_BUILD_RECEIPT}` : PROJECT_BUILD_RECEIPT;
    const saved = await json(await containedPath(root, recordFile)), identity = scope(core, p);
    if (saved?.version !== 1 || saved.status !== 'complete' || typeof saved.inputs !== 'string' || !/^[a-f0-9]{64}$/.test(saved.inputs) || typeof saved.output !== 'string' || !/^[a-f0-9]{64}$/.test(saved.output) || saved.core !== identity.core || saved.source !== identity.source || saved.key !== identity.key
      || typeof saved.generation !== 'string' || !/^r-[a-zA-Z0-9]{6}$/.test(saved.generation) || generation && saved.generation !== generation)
      throw new Error('Project build is incomplete, failed or belongs to another source');
    if (!generation && (await inputs(core, p)).fingerprint !== saved.inputs) throw new Error('Bundled build inputs changed; rebuild the project');
    const entry = await containedPath(root, `${saved.generation}/out`);
    const output = await inventory(entry);
    if (!output.files.includes('index.html') || output.fingerprint !== saved.output) throw new Error('Project build output is missing or changed; rebuild the project');
    return { entry, generation: saved.generation, origin: 'cache', problem: null };
  } catch (error) { return { ...empty, problem: (error as Error).message, status: empty.origin === 'packaged' && error instanceof HttpError ? error.status : 409 }; }
}
export async function requireProjectOutput(core: string, workspace: string, p: Project, generation?: string) {
  const output = await resolveProjectOutput(core, workspace, p, generation);
  if (!output.entry) throw new HttpError(output.status ?? 409, output.problem ?? 'Project output is unavailable');
  return { ...output, entry: output.entry };
}
export function projectPreviewRoute(p: Project, output?: ProjectOutput): string {
  return `/preview/${p.id.split('/').map(encodeURIComponent).join('/')}/${output?.generation ? `@${output.generation}/` : ''}`;
}

export async function rebuildBundledProject(core: string, workspace: string, p: Project, ctx: JobContext): Promise<void> {
  const plan = await bundledBuildPlan(core, p), before = await inputs(core, p);
  const prerequisites = embeddedPrerequisites(before.plan, plan.relative);
  const root = await cacheDirectory(core, workspace, p, true), lockFile = path.join(root, PROJECT_BUILD_LOCK);
  const lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new HttpError(409, 'Project build lock exists; verify the previous builder stopped before recovery'); throw error;
  });
  const identity = { version: 1, ...scope(core, p), inputs: before.fingerprint };
  let started = false;
  let stage: Awaited<ReturnType<typeof prepareEmbeddedSnapshot>> | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    await receipt(root, PROJECT_BUILD_RECEIPT, { ...identity, status: 'building' }, core, workspace); started = true;
    stage = await prepareEmbeddedSnapshot(core, workspace, root, before, before.plan.excluded);
    await receipt(root, PROJECT_BUILD_RECEIPT, { ...identity, status: 'building', working: path.basename(stage.work) }, core, workspace);
    const project = path.join(stage.snapshot, plan.relative);
    if (JSON.stringify(await json(await containedPath(project, 'xrb-project.json'))) !== JSON.stringify(p.manifest)) throw new Error('Project defaults changed; reload before rebuilding');
    await stage.install(ctx);
    for (const dependency of prerequisites) if (dependency.build) {
      ctx.line(`Build prerequisite ${dependency.name}`); await stage.run(ctx, dependency.relative, dependency.build);
    }
    ctx.line(`Building ${p.id} in the user cache`);
    await stage.run(ctx, plan.relative, plan.script);
    assertWritablePath(core, workspace, project);
    const built = await containedPath(project, plan.entry);
    if (!(await inventory(built)).files.includes('index.html')) throw new Error('Build produced no index.html');
    assertWritablePath(core, workspace, path.join(built, 'index.html'));
    const icon = await projectFile({ ...p, dir: project }, p.manifest!.icon ?? 'icon.png').catch(error => {
      if (error instanceof HttpError && error.status === 404) return undefined;
      throw error;
    });
    await finalizeBrowserBuild(built, { file: icon,
      color: p.manifest!.iconColor, shape: p.manifest!.iconShape, description: p.manifest!.description });
    const tree = await inventory(built);
    const generation = await fs.mkdtemp(path.join(root, 'r-')), out = path.join(generation, 'out'); await fs.mkdir(out);
    for (const name of tree.directories) { assertWritablePath(core, workspace, path.join(out, name)); await fs.mkdir(path.join(out, name), { recursive: true }); }
    for (const name of tree.files) {
      const source = await containedPath(built, name), target = path.join(out, name);
      assertWritablePath(core, workspace, target); await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
    }
    const copied = await inventory(out);
    if (copied.fingerprint !== tree.fingerprint || before.fingerprint !== (await inputs(core, p)).fingerprint || tree.fingerprint !== (await inventory(built)).fingerprint)
      throw new Error('Bundled inputs or output changed during build; rebuild again');
    const complete = { ...identity, status: 'complete', generation: path.basename(generation), working: path.basename(stage.work), output: copied.fingerprint };
    await stage.markWorking('complete');
    await receipt(generation, PROJECT_BUILD_RECEIPT, complete, core, workspace);
    await receipt(root, PROJECT_BUILD_RECEIPT, complete, core, workspace);
  } catch (error) {
    if (stage) await stage.markWorking('failed');
    if (started) await receipt(root, PROJECT_BUILD_RECEIPT, { ...identity, status: 'failed', working: stage ? path.basename(stage.work) : undefined }, core, workspace);
    throw error;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}

// Durable editable embedded projects. Product provenance is not an operational read-only flag.
import fs from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { constants } from 'node:fs';
import path from 'node:path';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { containedPath } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import { buildInventory, buildJson, metadataText, embeddedInputs, inputHash, prepareEmbeddedSnapshot, embeddedSnapshotRunner, writeBuildReceipt } from './embedded-inputs.ts';
import { embeddedWorkspacePlan, embeddedPrerequisites } from './embedded-workspace.ts';
import { projectFile, packagedProjectEntry } from './embedded-projects.ts';
import { readProjectRunSettings, withRunSettings } from './project-run-settings.ts';
import { defaultEntry, liveId, MANIFEST, readProject, type Project } from './projects.ts';
import { HttpError } from './http.ts';
import { markEffectiveBuildFailed } from './embedded-project-output.ts';
import type { JobContext } from './jobs.ts';

function identity(core: string, workspace: string, projects: string, p: Project) {
  const source = canonicalFuturePath(p.productDir ?? p.dir);
  const relative = path.relative(path.join(canonicalFuturePath(core), 'embedded'), source).split(path.sep).join('/');
  if (!/^projects\/[^/]+\/[^/]+$/.test(relative)) throw new HttpError(409, 'Embedded source is outside the product workspace');
  return { core: canonicalFuturePath(core), workspace: canonicalFuturePath(workspace), projects: canonicalFuturePath(projects), source, key: liveId(p.key ?? p.id), relative };
}
export function embeddedProjectRoot(core: string, workspace: string, projects: string, p: Project): string {
  const { source: _source, relative: _relative, ...stable } = identity(core, workspace, projects, p);
  return path.join(projects, '.xrb', 'embedded-projects', inputHash(JSON.stringify(stable)).slice(0, 24));
}
export function embeddedManifestRevision(p: Project, legacyRevision?: string): string {
  return inputHash(JSON.stringify({ key: liveId(p.key ?? p.id), manifest: p.manifest, errors: p.errors, mtimeMs: p.manifestMtimeMs, legacyRevision }));
}
export function projectWritableRoot(projects: string, p: Project): string {
  return p.origin === 'bundled' && p.workingRoot ? p.workingRoot : projects;
}
async function stateRecord(core: string, workspace: string, projects: string, p: Project) {
  const scope = identity(core, workspace, projects, p), root = embeddedProjectRoot(core, workspace, projects, p);
  assertWritablePath(core, projects, path.join(root, 'state.json'));
  const saved = await buildJson(await containedPath(root, 'state.json'));
  if (saved?.version !== 1 || !/^[a-f0-9]{64}$/.test(saved.initialManifest) || !saved.scope || ['core', 'workspace', 'projects', 'key'].some(key => saved.scope[key] !== scope[key as keyof typeof scope])
    || typeof saved.scope.source !== 'string' || !/^projects\/[^/]+\/[^/]+$/.test(saved.scope.relative)
    || saved.scope.relative !== path.relative(path.join(scope.core, 'embedded'), canonicalFuturePath(saved.scope.source)).split(path.sep).join('/')
    || path.basename(saved.scope.source) !== path.basename(scope.source) || !/^w-[a-zA-Z0-9]{6}$/.test(saved.working)
    || saved.legacyRunRevision !== null && (typeof saved.legacyRunRevision !== 'string' || !/^[a-f0-9]{64}$/.test(saved.legacyRunRevision))
    || !saved.runDefaults || typeof saved.runDefaults.flat !== 'boolean' || typeof saved.runDefaults.cameraView !== 'boolean'
    || !/^[a-f0-9]{64}$/.test(saved.inputs) || !Array.isArray(saved.excluded) || saved.excluded.some((v: unknown) => typeof v !== 'string' || !/^projects\/[^/]+\/[^/]+\/[a-zA-Z0-9_/-]+$/.test(v)))
    throw new HttpError(409, `Invalid embedded working state; review ${root}`);
  const workingRoot = await containedPath(root, `${saved.working}/workspace`);
  return { root, scope: saved.scope as typeof scope, saved, workingRoot, work: path.dirname(workingRoot) };
}

/** Read-only discovery. Incomplete state is visible and is never reset or silently ignored. */
export async function effectiveEmbeddedProject(core: string, workspace: string, projects: string, p: Project): Promise<Project> {
  const original = { ...p, productDir: p.productDir ?? p.dir, integrationWorkspace: workspace };
  const root = embeddedProjectRoot(core, workspace, projects, original);
  try {
    assertWritablePath(core, projects, root);
    if (!await fs.lstat(root).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; })) return original;
    const state = await stateRecord(core, workspace, projects, original);
    const dir = await containedPath(state.workingRoot, state.scope.relative);
    await projectFile({ ...p, dir }, MANIFEST);
    const current = await readProject(dir, p.id, p.section);
    if (!current) throw new Error('Effective project manifest is missing');
    const changed = state.saved.inputs !== (await embeddedInputs(core, state.saved.excluded)).fingerprint;
    return { ...original, ...current, key: p.key, origin: 'bundled', readOnly: false, workingRoot: state.workingRoot,
      sourceUpdate: changed ? { revision: state.saved.inputs as string, path: state.workingRoot } : undefined, runDefaults: state.saved.runDefaults,
      importedRunRevision: state.saved.legacyRunRevision };
  } catch (error) {
    return { ...original, stateProblem: `Embedded working state unavailable (${root}): ${(error as Error).message}` };
  }
}

/** Materialization is an implementation detail of an explicit action, never another catalog entry. */
export async function prepareEmbeddedProject(core: string, workspace: string, projects: string, p: Project): Promise<Project> {
  const owned = p.origin === 'bundled' ? { ...p, productDir: p.productDir ?? p.dir, integrationWorkspace: workspace } : p;
  try { return await withEmbeddedProjectLock(core, projects, owned, () => prepareProject(core, workspace, projects, owned)); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(409, `Embedded project preparation failed: ${(error as Error).message}`); }
}
async function prepareProject(core: string, workspace: string, projects: string, p: Project): Promise<Project> {
  if (p.origin !== 'bundled') return p;
  if (p.stateProblem) throw new HttpError(409, p.stateProblem);
  const scope = identity(core, workspace, projects, p), root = embeddedProjectRoot(core, workspace, projects, p);
  assertWritablePath(core, projects, root);
  const exists = await fs.lstat(root).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
  if (!exists) {
    const source = await readProject(scope.source, p.id, p.section);
    if (!source) throw new HttpError(409, 'Embedded project manifest is missing');
    if (source.manifestMtimeMs !== p.manifestMtimeMs || JSON.stringify(source.manifest) !== JSON.stringify(p.manifest)) throw new HttpError(409, 'Installed project defaults changed; reload before continuing');
    const raw = { ...p, ...source, key: `bundled:${path.basename(path.dirname(scope.source)) === 'archive' ? 'archive/' : ''}${path.basename(scope.source)}`, origin: 'bundled' as const, readOnly: true };
    const personal = source.manifest ? await readProjectRunSettings(core, workspace, raw) : null;
    const plan = source.manifest?.scripts?.build || source.manifest?.scripts?.dev ? await embeddedWorkspacePlan(core) : null;
    const before = await embeddedInputs(core, plan?.excluded ?? []);
    // Reserve the durable root exactly once. An interruption remains inspectable, not overwritten.
    await fs.mkdir(path.dirname(root), { recursive: true });
    try { await fs.mkdir(root); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new HttpError(409, 'Embedded project preparation is active or interrupted; inspect its working state'); throw e; }
    const stage = await prepareEmbeddedSnapshot(core, projects, root, before, plan?.excluded ?? []);
    const dir = path.join(stage.snapshot, scope.relative);
    // Static packaged output may be omitted by source-only snapshotting (e.g. dist/).
    if (source.manifest && !source.manifest.scripts?.build) {
      const entry = await packagedProjectEntry(raw).catch(error => { if (error instanceof HttpError && error.status === 404) return null; throw error; });
      const relative = source.manifest.entry ?? defaultEntry(source.manifest.kind);
      if (entry && relative !== '.') {
        const tree = await buildInventory(entry), out = path.join(dir, relative);
        for (const name of tree.directories) { assertWritablePath(core, projects, path.join(out, name)); await fs.mkdir(path.join(out, name), { recursive: true }); }
        for (const name of tree.files) {
          const to = path.join(out, name); assertWritablePath(core, projects, to); await fs.mkdir(path.dirname(to), { recursive: true });
          await fs.copyFile(await containedPath(entry, name), to, constants.COPYFILE_EXCL).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
        }
      }
    }
    const manifest = personal ? withRunSettings(raw, personal).manifest : source.manifest;
    if (manifest) await fs.writeFile(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    await writeBuildReceipt(root, 'state.json', { version: 1, scope, legacyRunRevision: personal?.revision ?? null, initialManifest: inputHash(JSON.stringify(manifest)), inputs: before.fingerprint, excluded: plan?.excluded ?? [], working: path.basename(stage.work),
      runDefaults: { flat: personal?.values.flat ?? false, cameraView: personal?.values.cameraView ?? false } }, core, projects);
    await stage.markWorking('complete');
  }
  const state = await stateRecord(core, workspace, projects, p);
  if (state.saved.inputs !== (await embeddedInputs(core, state.saved.excluded)).fingerprint)
    throw new HttpError(409, `Installed embedded inputs changed. Working edits are preserved at ${state.workingRoot}; reconcile them before continuing`);
  const effective = await effectiveEmbeddedProject(core, workspace, projects, p);
  if (effective.stateProblem || effective.readOnly) throw new HttpError(409, effective.stateProblem ?? 'Embedded project preparation is incomplete');
  if ((p.workingRoot && (effective.manifestMtimeMs !== p.manifestMtimeMs || JSON.stringify(effective.manifest) !== JSON.stringify(p.manifest))) || (exists && p.readOnly && inputHash(JSON.stringify(effective.manifest)) !== state.saved.initialManifest))
    throw new HttpError(409, 'Effective project settings changed; reload before continuing');
  return effective;
}

const operationContext = new AsyncLocalStorage<Set<string>>();
export async function withEmbeddedProjectLock<T>(core: string, projects: string, p: Project, work: () => Promise<T>, retain?: (release: () => Promise<void>) => boolean): Promise<T> {
  if (p.origin !== 'bundled') return work();
  if (!p.integrationWorkspace) throw new HttpError(409, 'Embedded project owner is missing');
  const root = embeddedProjectRoot(core, p.integrationWorkspace, projects, p);
  const file = path.join(projects, '.xrb', 'embedded-locks', `${path.basename(root)}.lock`);
  if (operationContext.getStore()?.has(file)) return work();
  assertWritablePath(core, projects, file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.open(file, 'wx').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EEXIST') throw new HttpError(409, 'Embedded project is busy or has an interrupted operation; inspect its operation lock'); throw e;
  });
  let succeeded = false, released = false;
  const release = async () => { if (!released) { released = true; await handle.close(); await fs.unlink(file); } };
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, started: new Date().toISOString(), project: liveId(p.key ?? p.id), core: canonicalFuturePath(core) }));
    const value = await operationContext.run(new Set([...(operationContext.getStore() ?? []), file]), work);
    succeeded = true; return value;
  } finally { if (!succeeded || !retain?.(release)) await release(); }
}

/** Only public frozen inputs are installed. Effective source edits do not enroll a user/private workspace. */
export async function prepareEmbeddedDependencies(core: string, projects: string, p: Project, ctx: JobContext): Promise<void> {
  if (!p.workingRoot || p.origin !== 'bundled') throw new HttpError(409, 'Embedded project is not prepared');
  const plan = await embeddedWorkspacePlan(core, p.workingRoot);
  for (const name of ['user.npmrc', 'global.npmrc']) if (await metadataText(await containedPath(path.dirname(p.workingRoot), name)) !== '')
    throw new HttpError(409, 'Managed package-manager configuration changed; review working state');
  const runner = embeddedSnapshotRunner(core, projects, path.dirname(p.workingRoot), p.workingRoot);
  const relative = path.relative(p.workingRoot, p.dir).split(path.sep).join('/');
  await runner.install(ctx);
  for (const dependency of embeddedPrerequisites(plan, relative)) if (dependency.build) {
    ctx.line(`Build prerequisite ${dependency.name}`); await runner.run(ctx, dependency.relative, dependency.build);
  }
}
export async function runEmbeddedProjectScript(core: string, projects: string, p: Project, ctx: JobContext, script: string) {
  if (!p.workingRoot) throw new HttpError(409, 'Embedded project is not prepared');
  return embeddedSnapshotRunner(core, projects, path.dirname(p.workingRoot), p.workingRoot)
    .run(ctx, path.relative(p.workingRoot, p.dir).split(path.sep).join('/'), script);
}

/** Explicit non-destructive reconciliation: keep all existing working inputs and accept the new installed baseline. */
export async function keepEmbeddedWorkingSources(core: string, workspace: string, projects: string, p: Project, revision: unknown, confirm: unknown) {
  return withEmbeddedProjectLock(core, projects, p, async () => {
    const state = await stateRecord(core, workspace, projects, p);
    if (confirm !== true || revision !== state.saved.inputs) throw new HttpError(409, 'Review and confirm the current source-update revision');
    // Revalidate the effective graph, but never overwrite it with product files.
    if (p.manifest?.scripts?.build || p.manifest?.scripts?.dev) await embeddedWorkspacePlan(core, state.workingRoot);
    const current = await embeddedInputs(core, state.saved.excluded);
    await markEffectiveBuildFailed(core, workspace, p);
    await writeBuildReceipt(state.root, 'state.json', { ...state.saved, inputs: current.fingerprint }, core, projects);
    return effectiveEmbeddedProject(core, workspace, projects, { ...p, sourceUpdate: undefined });
  });
}

export function embeddedProjectEnvironment(core: string, projects: string, p: Project) {
  return p.workingRoot ? embeddedSnapshotRunner(core, projects, path.dirname(p.workingRoot), p.workingRoot).env : undefined;
}

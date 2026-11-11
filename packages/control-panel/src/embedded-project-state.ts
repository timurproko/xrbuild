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
import { projectStateKey, readProjectRunSettings, withRunSettings } from './project-run-settings.ts';
import { defaultEntry, liveId, MANIFEST, readProject, type Project } from './projects.ts';
import { HttpError } from './http.ts';
import { sourceFiles, normalizedSourceFiles, refreshManifest, writeSourceBaseline, readSourceBaseline, relocateFiles, mergeSourceFiles, preservePersonalFiles, type SourceBaseline } from './embedded-source-refresh.ts';
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
  if (![1, 2].includes(saved?.version) || saved.version === 2 && (!/^[a-f0-9]{64}$/.test(saved.baseline) || !/^[a-f0-9]{24}$/.test(saved.outputKey))
    || saved.previous !== undefined && (!Array.isArray(saved.previous) || saved.previous.some((value: unknown) => typeof value !== 'string' || !/^w-[a-zA-Z0-9]{6}$/.test(value))) || !/^[a-f0-9]{64}$/.test(saved.initialManifest) || !saved.scope || ['core', 'workspace', 'projects', 'key'].some(key => saved.scope[key] !== scope[key as keyof typeof scope])
    || typeof saved.scope.source !== 'string' || !/^projects\/[^/]+\/[^/]+$/.test(saved.scope.relative)
    || saved.scope.relative !== path.relative(path.join(scope.core, 'embedded'), canonicalFuturePath(saved.scope.source)).split(path.sep).join('/')
    || path.basename(saved.scope.source) !== path.basename(scope.source) || !/^w-[a-zA-Z0-9]{6}$/.test(saved.working)
    || saved.legacyRunRevision !== null && (typeof saved.legacyRunRevision !== 'string' || !/^[a-f0-9]{64}$/.test(saved.legacyRunRevision))
    || !saved.runDefaults || typeof saved.runDefaults.flat !== 'boolean' || typeof saved.runDefaults.cameraView !== 'boolean'
    || !/^[a-f0-9]{64}$/.test(saved.inputs) || !Array.isArray(saved.excluded) || saved.excluded.some((v: unknown) => typeof v !== 'string' || !/^projects\/[^/]+\/[^/]+\/[a-zA-Z0-9_/-]+$/.test(v)))
    throw new HttpError(409, `Invalid embedded working state; review ${root}`);
  const workingRoot = await containedPath(root, `${saved.working}/workspace`), work = path.dirname(workingRoot);
  const marker = await buildJson(await containedPath(work, '.xrb-working.json'));
  if (marker.version !== 1 || marker.status !== 'complete' || marker.core !== scope.core || marker.workspace !== scope.projects
    || marker.cacheRoot !== canonicalFuturePath(root) || marker.generation !== saved.working || !/^[a-f0-9]{64}$/.test(marker.inputs)
    || saved.version === 2 && marker.inputs !== saved.inputs
    || marker.source !== canonicalFuturePath(path.join(core, 'embedded'))) throw new HttpError(409, 'Embedded working generation is incomplete or belongs to another project');
  for (const name of ['user.npmrc', 'global.npmrc']) if (await metadataText(await containedPath(work, name)) !== '')
    throw new HttpError(409, 'Managed package-manager configuration changed; review working state');
  if (saved.version === 2) await readSourceBaseline(work, saved.baseline, saved.scope.relative);
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
    return { ...original, ...current, key: p.key, origin: 'bundled', readOnly: false, workingRoot: state.workingRoot,
      workingOutputKey: state.saved.version === 2 ? state.saved.outputKey : undefined, runDefaults: state.saved.runDefaults,
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
    const excluded = plan?.excluded ?? [];
    const stage = await installedStage(core, projects, root, before, excluded, scope.relative, raw);
    const dir = path.join(stage.snapshot, scope.relative);
    const files = await sourceFiles(stage.snapshot, excluded, scope.relative, source.manifest);
    const baseline = await writeSourceBaseline(stage.work, { version: 1, relative: scope.relative, files, manifest: source.manifest }, core, projects);
    if (inputHash(JSON.stringify(files)) !== inputHash(JSON.stringify(await sourceFiles(before.root, excluded, scope.relative, source.manifest)))) throw new HttpError(409, 'Installed sources changed during preparation; try again');
    const manifest = personal ? withRunSettings(raw, personal).manifest : source.manifest;
    if (manifest) await fs.writeFile(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    await stage.markWorking('complete');
    await writeBuildReceipt(root, 'state.json', { version: 2, scope, baseline, outputKey: projectStateKey(core, { ...p, dir, workingRoot: stage.snapshot }), legacyRunRevision: personal?.revision ?? null, initialManifest: inputHash(JSON.stringify(manifest)), inputs: before.fingerprint, excluded, working: path.basename(stage.work),
      runDefaults: { flat: personal?.values.flat ?? false, cameraView: personal?.values.cameraView ?? false } }, core, projects);
  }
  const state = await stateRecord(core, workspace, projects, p);
  const effective = await effectiveEmbeddedProject(core, workspace, projects, p);
  if (effective.stateProblem || effective.readOnly) throw new HttpError(409, effective.stateProblem ?? 'Embedded project preparation is incomplete');
  if ((p.workingRoot && (p.workingRoot !== effective.workingRoot || effective.manifestMtimeMs !== p.manifestMtimeMs || JSON.stringify(effective.manifest) !== JSON.stringify(p.manifest))) || (exists && p.readOnly && inputHash(JSON.stringify(effective.manifest)) !== state.saved.initialManifest))
    throw new HttpError(409, 'Effective project settings changed; reload before continuing');
  const installed = await readProject(scope.source, p.id, p.section);
  const baseline = state.saved.version === 2 ? await readSourceBaseline(state.work, state.saved.baseline, state.scope.relative) : null;
  // Static dist/ files are intentionally absent from the shared package-build digest,
  // but are real installed inputs for an app with no compilation step.
  if (!baseline || state.scope.relative !== scope.relative || state.saved.inputs !== (await embeddedInputs(core, state.saved.excluded)).fingerprint
    || inputHash(JSON.stringify(baseline.files)) !== inputHash(JSON.stringify(await sourceFiles(path.join(core, 'embedded'), state.saved.excluded, scope.relative, installed?.manifest ?? null))))
    return refreshProject(core, workspace, projects, effective, state, scope);
  return effective;
}

async function installedStage(core: string, projects: string, root: string, before: Awaited<ReturnType<typeof embeddedInputs>>, excluded: string[], relative: string, source: Project) {
  const stage = await prepareEmbeddedSnapshot(core, projects, root, before, excluded);
  if (source.manifest && !source.manifest.scripts?.build) {
    const entry = await packagedProjectEntry(source).catch(error => { if (error instanceof HttpError && error.status === 404) return null; throw error; });
    const output = source.manifest.entry ?? defaultEntry(source.manifest.kind);
    if (entry && output !== '.') {
      const tree = await buildInventory(entry), out = path.join(stage.snapshot, relative, output);
      for (const name of tree.directories) { assertWritablePath(core, projects, path.join(out, name)); await fs.mkdir(path.join(out, name), { recursive: true }); }
      for (const name of tree.files) {
        const to = path.join(out, name); assertWritablePath(core, projects, to); await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(await containedPath(entry, name), to, constants.COPYFILE_EXCL).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
      }
    }
  }
  return stage;
}

async function refreshProject(core: string, workspace: string, projects: string, p: Project, state: Awaited<ReturnType<typeof stateRecord>>, scope: ReturnType<typeof identity>): Promise<Project> {
  const source = await readProject(scope.source, p.id, p.section);
  if (!source) throw new HttpError(409, 'The updated project is unavailable');
  if (!p.manifest || !source.manifest) throw new HttpError(409, 'Fix the project manifest before updating its sources.');
  const sourceProject = { ...source, origin: 'bundled' as const, readOnly: true, key: p.key };
  const plan = source.manifest?.scripts?.build || source.manifest?.scripts?.dev ? await embeddedWorkspacePlan(core) : null;
  const excluded = plan?.excluded ?? [], before = await embeddedInputs(core, excluded);
  const baseline: SourceBaseline | null = state.saved.version === 2 ? await readSourceBaseline(state.work, state.saved.baseline, state.scope.relative) : null;
  const local = await sourceFiles(state.workingRoot, state.saved.excluded, state.scope.relative, p.manifest);
  const stage = await installedStage(core, projects, state.root, before, excluded, scope.relative, sourceProject);
  const nextFiles = await sourceFiles(stage.snapshot, excluded, scope.relative, source.manifest);
  const nextBaseline = { version: 1 as const, relative: scope.relative, files: nextFiles, manifest: source.manifest };
  const manifest = refreshManifest(baseline?.manifest ?? null, p.manifest, source.manifest, p.dir);
  if (baseline) await mergeSourceFiles(core, projects, state.workingRoot, stage.snapshot,
    relocateFiles(baseline.files, state.scope.relative, scope.relative), relocateFiles(await normalizedSourceFiles(state.work, state.saved.baseline, local, state.scope.relative, p.manifest), state.scope.relative, scope.relative), nextFiles, state.scope.relative, scope.relative, p.manifest?.icon);
  const dir = path.join(stage.snapshot, scope.relative);
  // Legacy snapshots have no provable source baseline. Their whole old generation is retained;
  // carry their chosen icon explicitly, but never guess that other unknown source edits are defaults.
  if (!baseline) for (const name of [p.manifest.icon, p.manifest.host?.recordHands].filter((v): v is string => !!v)) {
    const relative = path.relative(p.dir, path.resolve(p.dir, name)).split(path.sep).join('/');
    const from = await containedPath(p.dir, relative).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
    if (!from) continue;
    const to = path.join(dir, name); assertWritablePath(core, projects, from); assertWritablePath(core, projects, to);
    await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to);
  }
  const verifyPersonal = await preservePersonalFiles(core, projects, p.dir, dir, local, state.scope.relative);
  if (manifest) await fs.writeFile(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  if (manifest?.scripts?.build || manifest?.scripts?.dev) await embeddedWorkspacePlan(core, stage.snapshot);
  const newBaseline = await writeSourceBaseline(stage.work, nextBaseline, core, projects);
  await stage.markWorking('complete');
  await verifyPersonal();
  const unchanged = (a: unknown, b: unknown) => inputHash(JSON.stringify(a)) === inputHash(JSON.stringify(b));
  if (!unchanged(local, await sourceFiles(state.workingRoot, state.saved.excluded, state.scope.relative, p.manifest))
    || !unchanged(nextFiles, await sourceFiles(before.root, excluded, scope.relative, source.manifest))
    || before.fingerprint !== (await embeddedInputs(core, excluded)).fingerprint
    || !unchanged(state.saved, (await stateRecord(core, workspace, projects, p)).saved))
    throw new HttpError(409, 'Project files changed during update; try again');
  await writeBuildReceipt(state.root, 'state.json', { ...state.saved, version: 2, scope, baseline: newBaseline,
    outputKey: state.saved.version === 2 ? state.saved.outputKey : projectStateKey(core, p), inputs: before.fingerprint, excluded,
    working: path.basename(stage.work), previous: [...(state.saved.previous ?? []), state.saved.working] }, core, projects);
  const effective = await effectiveEmbeddedProject(core, workspace, projects, { ...p, productDir: scope.source });
  if (effective.stateProblem || effective.readOnly) throw new HttpError(409, effective.stateProblem ?? 'Updated project is unavailable');
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

export function embeddedProjectEnvironment(core: string, projects: string, p: Project) {
  return p.workingRoot ? embeddedSnapshotRunner(core, projects, path.dirname(p.workingRoot), p.workingRoot).env : undefined;
}

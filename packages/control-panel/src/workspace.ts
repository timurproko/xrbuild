// Selected integration and project roots (design D1, D6), logically outside the core.
// The panel creates them from templates/workspace or templates/projects and new projects from templates/app; it only adds
// files that are missing and never runs git there (versioning the workspace is the user's choice).
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertWritablePath } from './project-access.ts';
import { discoverAll, liveId, MANIFEST, PROJECTS, UNSORTED, validateManifest, type Manifest } from './projects.ts';

export const WORKSPACE_TEMPLATE = path.join('templates', 'workspace');
export const PROJECTS_TEMPLATE = path.join('templates', 'projects');
export const APP_TEMPLATE = path.join('templates', 'app');
export const PLUGIN_PROJECTS_SECTION = 'plugins';
/** Folder name of the starter app a new workspace gets. */
export const STARTER_APP = 'hello-xr';

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** A folder is a workspace once it has the workspace's pnpm file or a projects/ folder. */
export async function isWorkspace(dir: string): Promise<boolean> {
  return (await exists(path.join(dir, 'pnpm-workspace.yaml'))) || (await exists(path.join(dir, PROJECTS)));
}

/** Copies `from` into `to`, file by file, skipping files that already exist; `edit` may rewrite text files. */
async function copyMissing(core: string, from: string, to: string, edit: (rel: string, text: string) => string = (_r, t) => t, rel = ''): Promise<string[]> {
  const added: string[] = [];
  assertWritablePath(core, to, path.join(to, rel));
  await fs.mkdir(path.join(to, rel), { recursive: true });
  for (const e of await fs.readdir(path.join(from, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) {
      added.push(...(await copyMissing(core, from, to, edit, r)));
      continue;
    }
    const dest = path.join(to, r);
    assertWritablePath(core, to, dest);
    if (await exists(dest)) continue;
    await fs.writeFile(dest, edit(r, await fs.readFile(path.join(from, r), 'utf8')), { flag: 'wx' });
    added.push(r.split(path.sep).join('/'));
  }
  return added;
}

/** Adds the starter app when a newly initialized root does not already contain one. */
async function addStarter(core: string, dir: string, added: string[]): Promise<void> {
  if (!(await discoverAll(dir)).some((p) => liveId(p.id) === STARTER_APP) && !(await exists(path.join(dir, PROJECTS, UNSORTED, STARTER_APP))))
    added.push(...(await createProject(core, dir, STARTER_APP, 'Hello XR')).map((f) => `${PROJECTS}/${UNSORTED}/${STARTER_APP}/${f}`));
}

/** Creates or completes a combined integration workspace with a starter app. */
export async function createWorkspace(core: string, dir: string): Promise<string[]> {
  assertWritablePath(core, dir);
  const added = await copyMissing(core, path.join(core, WORKSPACE_TEMPLATE), dir);
  await addStarter(core, dir, added);
  return added;
}

/** Creates or completes an app-only project repository without private integration folders. */
export async function createProjectWorkspace(core: string, dir: string): Promise<string[]> {
  assertWritablePath(core, dir);
  const added = await copyMissing(core, path.join(core, PROJECTS_TEMPLATE), dir);
  await addStarter(core, dir, added);
  return added;
}

export class ProjectRefused extends Error {}

/** Folder names a new project may have: lower case words with dashes (also its package name). */
export const PROJECT_FOLDER = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** A new app from templates/app in `<workspace>/projects/unsorted/<folder>`; refused when a project has that name. */
export async function createProject(core: string, workspace: string, folder: string, name = folder): Promise<string[]> {
  if (!PROJECT_FOLDER.test(folder)) throw new ProjectRefused(`"${folder}" is not a project folder name (lower case letters, digits, dashes)`);
  const dir = path.join(workspace, PROJECTS, UNSORTED, folder);
  assertWritablePath(core, workspace, dir);
  const taken = (await discoverAll(workspace)).find((p) => liveId(p.id).toLowerCase() === folder.toLowerCase());
  if (taken) throw new ProjectRefused(`a project named ${folder} already exists (${path.relative(workspace, taken.dir).split(path.sep).join('/')})`);
  if (await exists(dir)) throw new ProjectRefused(`${PROJECTS}/${UNSORTED}/${folder} already exists`);
  const json = (s: string) => JSON.stringify(s).slice(1, -1);
  const html = (s: string) => s.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);
  return copyMissing(core, path.join(core, APP_TEMPLATE), dir, (rel, text) =>
    text.replaceAll('__PACKAGE__', folder).replaceAll('__NAME__', rel.endsWith('.html') ? html(name) : json(name)));
}

const SAMPLE_OUTPUT_DIRS = new Set(['.git', '.cache', '.vite', 'build', 'coverage', 'dist', 'node_modules']);
const sampleOutput = (rel: string, name: string) => SAMPLE_OUTPUT_DIRS.has(name.toLowerCase()) || path.join(rel, name).split(path.sep).join('/').toLowerCase() === 'public/vendor';

async function copySampleTree(source: string, target: string, rel = ''): Promise<void> {
  await fs.mkdir(path.join(target, rel), { recursive: true });
  for (const entry of await fs.readdir(path.join(source, rel), { withFileTypes: true })) {
    if (sampleOutput(rel, entry.name)) continue;
    const next = path.join(rel, entry.name), from = path.join(source, next), to = path.join(target, next);
    if (entry.isSymbolicLink()) throw new ProjectRefused(`sample contains a symbolic link: ${next.split(path.sep).join('/')}`);
    if (entry.isDirectory()) await copySampleTree(source, target, next);
    else if (entry.isFile()) await fs.copyFile(from, to);
    else throw new ProjectRefused(`sample contains an unsupported filesystem entry: ${next.split(path.sep).join('/')}`);
  }
}

/** Copies a plugin-owned sample into an independent project under projects/plugins/. */
export async function importPluginSample(projects: string, source: string, folder: string, name: string): Promise<string> {
  if (!PROJECT_FOLDER.test(folder)) throw new ProjectRefused(`"${folder}" is not a project folder name (lower case letters, digits, dashes)`);
  const taken = (await discoverAll(projects)).find((project) => liveId(project.id).toLowerCase() === folder.toLowerCase());
  if (taken) throw new ProjectRefused(`a project named ${folder} already exists (${path.relative(projects, taken.dir).split(path.sep).join('/')})`);
  const parent = path.join(projects, PROJECTS, PLUGIN_PROJECTS_SECTION), destination = path.join(parent, folder);
  if (await exists(destination)) throw new ProjectRefused(`${PROJECTS}/${PLUGIN_PROJECTS_SECTION}/${folder} already exists`);
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, `.${folder}.${process.pid}.`));
  try {
    await copySampleTree(source, staging);
    const manifestFile = path.join(staging, MANIFEST);
    let manifest: Manifest;
    try { manifest = JSON.parse((await fs.readFile(manifestFile, 'utf8')).replace(/^﻿/, '')) as Manifest; }
    catch (error) { throw new ProjectRefused(`sample has invalid ${MANIFEST}: ${(error as Error).message}`); }
    manifest.name = name;
    const problems = validateManifest(manifest, staging);
    if (problems.length) throw new ProjectRefused(`sample has invalid ${MANIFEST}: ${problems.map((problem) => `${problem.field}: ${problem.message}`).join('; ')}`);
    await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const packageFile = path.join(staging, 'package.json');
    if (await exists(packageFile)) {
      let declaration: Record<string, unknown>;
      try { declaration = JSON.parse(await fs.readFile(packageFile, 'utf8')) as Record<string, unknown>; }
      catch (error) { throw new ProjectRefused(`sample has invalid package.json: ${(error as Error).message}`); }
      declaration.name = folder;
      await fs.writeFile(packageFile, `${JSON.stringify(declaration, null, 2)}\n`, 'utf8');
    }
    await fs.rename(staging, destination);
    return folder;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    if (await exists(destination)) throw new ProjectRefused(`${PROJECTS}/${PLUGIN_PROJECTS_SECTION}/${folder} already exists`);
    throw error;
  }
}

/**
 * Editor resolution of the SDK (app-sdk-supply): an ignored jsconfig.json in the workspace mapping the
 * SDK names to this core's sources. Rewritten only when it changes.
 */
export async function writeEditorConfig(core: string, workspace: string): Promise<boolean> {
  const src = (pkg: string) => path.join(core, 'packages', pkg, 'src', 'index.ts').split(path.sep).join('/');
  const config = {
    compilerOptions: {
      module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022', checkJs: false, allowJs: true,
      paths: { '@xr-build/sdk': [src('sdk')], '@xr-build/ui-kit': [src('ui-kit')] },
    },
    exclude: ['**/node_modules', '**/dist', '**/build', 'plugins/*/bin', 'third_party', 'builds'],
  };
  const file = path.join(workspace, 'jsconfig.json');
  assertWritablePath(core, workspace, file);
  const text = JSON.stringify(config, null, 2) + '\n';
  if ((await fs.readFile(file, 'utf8').catch(() => null)) === text) return false;
  await fs.writeFile(file, text, 'utf8');
  return true;
}

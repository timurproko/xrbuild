import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { containedPath } from './extension-catalog.ts';
import { HttpError } from './http.ts';
import { assertEditableProject, assertWritablePath } from './project-access.ts';
import { defaultEntry, discoverAll, liveId, MANIFEST, UNSORTED, validateManifest, type Manifest, type Project } from './projects.ts';
import { PROJECT_FOLDER } from './workspace.ts';

/** Project-owned asset/directory, including its complete parent chain. */
export async function projectPath(p: Project, relative: string): Promise<string> {
  try {
    const file = await containedPath(p.dir, relative);
    const stat = await fs.lstat(file);
    if (stat.isFile() ? stat.nlink > 1 : !stat.isDirectory()) throw new Error('Project asset must be regular and unlinked');
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, 'Project asset is unavailable');
    throw new HttpError(403, 'Project asset is outside its owner or uses a link');
  }
}

export async function projectFile(p: Project, relative: string): Promise<string> {
  const file = await projectPath(p, relative);
  if (!(await fs.stat(file)).isFile()) throw new HttpError(403, 'Project asset must be a file');
  return file;
}

/** Never execute scripts or finalize output for a bundled project. Native serving also needs the full tree checked. */
export async function packagedProjectEntry(p: Project): Promise<string> {
  if (!p.manifest) throw new HttpError(409, 'Project manifest has errors');
  const relative = p.manifest.entry ?? defaultEntry(p.manifest.kind);
  await projectFile(p, `${relative}/index.html`);
  const entry = await projectPath(p, relative);
  const visit = async (dir: string) => {
    for (const name of await fs.readdir(dir)) {
      const file = path.join(dir, name), stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1 || !stat.isFile() && !stat.isDirectory())
        throw new HttpError(403, 'Packaged project output contains a link or unsupported entry');
      if (stat.isDirectory()) await visit(file);
    }
  };
  await visit(entry);
  return entry;
}

const OMIT = new Set(['.git', '.gitmodules', '.xrb', '.xrbuild', '.artifacts', '.cache', '.vite', '.vscode', '.idea', 'node_modules', 'build', 'builds', 'coverage', 'config', 'recordings', 'logs', 'third_party', '.npmrc', '.pnpmfile.cjs', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'jsconfig.json', 'xrb-panel.json', 'xrb-plugins.json', 'xrb-app.json']);
const omitted = (name: string, hasBuild: boolean) => {
  const lower = name.toLowerCase();
  return OMIT.has(lower) || lower === 'dist' && hasBuild || lower.startsWith('.env') || /\.(?:pem|key|pfx|p12|jks|keystore|log|zip)$/i.test(name);
};

/** Deliberately allowlist portable fields: future/unknown identity or machine fields must not leak into a new app. */
export function portableProjectManifest(source: Manifest, name: string): Manifest {
  const manifest: Manifest = { name, kind: source.kind };
  for (const key of ['description', 'entry', 'scripts', 'icon', 'iconColor', 'iconShape', 'target'] as const)
    if (source[key] !== undefined) Object.assign(manifest, { [key]: structuredClone(source[key]) });
  return manifest;
}

/** An explicit new live copy; never replaces a destination, even an empty directory. */
export async function copyBundledProject(core: string, projects: string, p: Project, folder: string, name = p.manifest?.name ?? folder): Promise<string> {
  if (p.origin !== 'bundled' || !p.manifest) throw new HttpError(409, 'Only valid bundled projects can be copied');
  if (p.workingRoot) assertEditableProject(core, projects, p);
  if (typeof folder !== 'string' || !PROJECT_FOLDER.test(folder) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(folder)) throw new HttpError(400, 'Choose a project folder using lowercase letters, digits and dashes');
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new HttpError(400, 'A project name is required (at most 200 characters)');
  const owner = p.workingRoot ?? await fs.realpath(path.join(core, 'embedded'));
  const source = await containedPath(owner, path.relative(owner, p.dir).split(path.sep).join('/'));
  const destination = path.join(projects, 'projects', UNSORTED, folder);
  assertWritablePath(core, projects, destination);
  if ((await discoverAll(projects)).some(project => liveId(project.id).toLowerCase() === folder)) throw new HttpError(409, 'That project folder name is already in use');
  const manifest = portableProjectManifest(p.manifest, name.trim());
  const errors = validateManifest(manifest, destination);
  if (errors.length) throw new HttpError(409, 'The portable project manifest is invalid', errors);
  const files: string[] = [];
  const scan = async (relative = '') => {
    for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
      if (omitted(entry.name, !!manifest.scripts?.build) || entry.name.toLowerCase() === MANIFEST && !relative) continue;
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (p.manifest?.host?.recordHands && path.resolve(source, next) === path.resolve(source, p.manifest.host.recordHands)) continue;
      const file = await projectPath(p, next), stat = await fs.lstat(file);
      if (stat.isFile() && stat.nlink === 1) files.push(next);
      else if (stat.isDirectory()) await scan(next);
      else throw new HttpError(409, 'Bundled source contains a linked or unsupported entry');
    }
  };
  await scan(); // Validate everything before reserving any destination.
  if (manifest.icon && !files.includes(path.posix.normalize(manifest.icon))) delete manifest.icon;
  let packageText: string | undefined;
  const packageFile = files.find(file => file.toLowerCase() === 'package.json');
  if (packageFile) {
    let declaration;
    try { declaration = JSON.parse(await fs.readFile(await projectFile(p, packageFile), 'utf8')); }
    catch { throw new HttpError(409, 'Invalid project package declaration'); }
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) throw new HttpError(409, 'Invalid project package declaration');
    declaration.name = folder;
    delete declaration.publishConfig;
    declaration.private = true;
    packageText = JSON.stringify(declaration, null, 2) + '\n';
  }
  assertWritablePath(core, projects, destination);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.mkdir(destination); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new HttpError(409, 'The destination already exists'); throw error; }
  // On interruption leave the reserved, incomplete folder for inspection; never delete concurrent user data.
  for (const relative of files) {
    const from = await projectFile(p, relative), to = path.join(destination, relative);
    assertWritablePath(core, projects, to);
    await fs.mkdir(path.dirname(to), { recursive: true });
    if (relative === packageFile) await fs.writeFile(to, packageText!, { flag: 'wx' });
    else await fs.copyFile(from, to, constants.COPYFILE_EXCL);
  }
  assertWritablePath(core, projects, path.join(destination, MANIFEST));
  await fs.writeFile(path.join(destination, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return folder;
}

// Project ownership checks shared by HTTP routes, jobs and workspace creation.
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { HttpError } from './http.ts';
import { liveId, type Project } from './projects.ts';
import { embeddedProjectRoot } from './embedded-project-state.ts';

const inside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return rel === '' || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};
export function assertUserRoot(core: string, root: string): void {
  if (inside(canonicalFuturePath(path.join(core, 'embedded')), canonicalFuturePath(root)))
    throw new HttpError(409, 'Writable workspace and project roots must be outside embedded product sources');
  if (lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink()) throw new HttpError(409, 'Writable root must not be a symbolic link or junction');
}

/** Existing and prospective paths; no linked parents or hard-linked files may be written. */
export function assertWritablePath(core: string, root: string, file = root): void {
  assertUserRoot(core, root);
  const absoluteRoot = path.resolve(root), target = path.resolve(file), realRoot = canonicalFuturePath(root);
  // Windows discovery expands 8.3 paths. Keep the original descendant chain when available to inspect links.
  const base = inside(absoluteRoot, target) ? absoluteRoot : realRoot;
  if (!inside(base, target) || !inside(realRoot, canonicalFuturePath(target)))
    throw new HttpError(409, 'Writable path escapes its selected root');
  if (inside(canonicalFuturePath(path.join(core, 'embedded')), canonicalFuturePath(target)))
    throw new HttpError(409, 'Cannot write embedded product sources');
  let current = base;
  for (const segment of ['', ...path.relative(base, target).split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1 || !stat.isFile() && !stat.isDirectory())
      throw new HttpError(409, 'Writable path contains a link or unsupported entry');
  }
}
export function assertEditableProject(core: string, projects: string, project: Project): void {
  if (project.origin === 'bundled' && !project.readOnly && project.workingRoot && project.productDir && project.integrationWorkspace) {
    const root = embeddedProjectRoot(core, project.integrationWorkspace, projects, project);
    assertWritablePath(core, projects, path.join(root, 'state.json'));
    try {
      if (lstatSync(path.join(root, 'state.json')).size > 65536) throw new Error('Oversized state');
      const record = JSON.parse(readFileSync(path.join(root, 'state.json'), 'utf8'));
      const relative = record.scope?.relative;
      if (record.version !== 1 || record.scope?.core !== canonicalFuturePath(core) || record.scope?.projects !== canonicalFuturePath(projects)
        || record.scope?.workspace !== canonicalFuturePath(project.integrationWorkspace) || record.scope?.key !== liveId(project.key ?? project.id)
        || typeof relative !== 'string' || !/^projects\/[^/]+\/[^/]+$/.test(relative) || relative.split('/').some(segment => segment === '.' || segment === '..')
        || path.posix.basename(relative) !== path.basename(project.productDir) || typeof record.working !== 'string' || !/^w-[a-zA-Z0-9]{6}$/.test(record.working)) throw new Error('Invalid state');
      const expected = path.join(root, record.working, 'workspace');
      if (canonicalFuturePath(project.workingRoot) !== canonicalFuturePath(expected)
        || canonicalFuturePath(project.dir) !== canonicalFuturePath(path.join(expected, relative))) throw new Error('Invalid owner');
      assertWritablePath(core, projects, project.dir);
    } catch { throw new HttpError(409, `Invalid effective embedded project owner; review ${root}`); }
    return;
  }
  if (project.readOnly || project.origin === 'bundled' || project.id.startsWith('bundled:'))
    throw new HttpError(409, 'Embedded project must be prepared in user-owned working state');
  const root = canonicalFuturePath(path.join(projects, 'projects')), dir = canonicalFuturePath(project.dir);
  const relative = path.relative(root, dir);
  if (relative.split(path.sep).length !== 2 || !inside(root, dir))
    throw new HttpError(409, 'Project is outside the editable project repository');
  assertWritablePath(core, projects, project.dir);
}

// Project ownership checks shared by HTTP routes, jobs and workspace creation.
import { lstatSync } from 'node:fs';
import path from 'node:path';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { HttpError } from './http.ts';
import type { Project } from './projects.ts';

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
  if (project.readOnly || project.origin === 'bundled' || project.id.startsWith('bundled:'))
    throw new HttpError(409, 'Bundled projects are read-only; copy to workspace first');
  const root = canonicalFuturePath(path.join(projects, 'projects')), dir = canonicalFuturePath(project.dir);
  const relative = path.relative(root, dir);
  if (relative.split(path.sep).length !== 2 || !inside(root, dir))
    throw new HttpError(409, 'Project is outside the editable project repository');
  assertWritablePath(core, projects, project.dir);
}

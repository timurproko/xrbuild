// Immutable finalized output shared by embedded run, preview, packaging and publication.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { buildInventory, buildJson, inputHash, writeBuildReceipt } from './embedded-inputs.ts';
import { containedPath } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import { defaultEntry, type Project } from './projects.ts';
import { HttpError } from './http.ts';
import { projectStateKey } from './project-run-settings.ts';
import { embeddedWorkspacePlan } from './embedded-workspace.ts';

export function effectiveOutputRoot(core: string, workspace: string, p: Project) {
  const key = p.workingOutputKey ?? projectStateKey(core, p);
  if (!/^[a-f0-9]{24}$/.test(key)) throw new HttpError(409, 'Invalid effective output scope');
  return path.join(workspace, 'build', 'projects', key);
}
export async function effectiveInputFingerprint(p: Project) {
  if (!p.workingRoot || !p.manifest) throw new HttpError(409, 'Effective embedded project is unavailable');
  const entry = path.relative(p.workingRoot, path.resolve(p.dir, p.manifest.entry ?? defaultEntry(p.manifest.kind))).split(path.sep).join('/');
  const excluded = p.manifest.scripts?.build ? (await embeddedWorkspacePlan('', p.workingRoot)).excluded : [];
  const source = (await buildInventory(p.workingRoot, true, excluded)).fingerprint;
  // Static dist/ is otherwise deliberately omitted by source-only inventory filtering.
  const output = !p.manifest.scripts?.build ? (await buildInventory(path.join(p.workingRoot, entry), path.resolve(p.dir) === path.resolve(p.workingRoot, entry))).fingerprint : '';
  return inputHash(`${source}\0${output}`);
}
export async function publishEffectiveOutput(core: string, workspace: string, p: Project) {
  const root = effectiveOutputRoot(core, workspace, p);
  assertWritablePath(core, workspace, root); await fs.mkdir(root, { recursive: true });
  const entry = path.resolve(p.dir, p.manifest!.entry ?? defaultEntry(p.manifest!.kind));
  const sourceEntry = path.resolve(entry) === path.resolve(p.dir);
  const before = await effectiveInputFingerprint(p), tree = await buildInventory(entry, sourceEntry);
  if (!tree.files.includes('index.html')) throw new Error('Build produced no index.html');
  const generation = await fs.mkdtemp(path.join(root, 'r-')), out = path.join(generation, 'out'); await fs.mkdir(out);
  for (const name of tree.directories) { assertWritablePath(core, workspace, path.join(out, name)); await fs.mkdir(path.join(out, name), { recursive: true }); }
  for (const name of tree.files) {
    const target = path.join(out, name); assertWritablePath(core, workspace, target); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(await containedPath(entry, name), target, constants.COPYFILE_EXCL);
  }
  if (before !== await effectiveInputFingerprint(p) || tree.fingerprint !== (await buildInventory(entry, sourceEntry)).fingerprint || tree.fingerprint !== (await buildInventory(out)).fingerprint)
    throw new HttpError(409, 'Effective project inputs/output changed during build');
  const record = { version: 2, key: p.key, source: p.dir, inputs: before, output: tree.fingerprint, generation: path.basename(generation) };
  await writeBuildReceipt(generation, 'effective.json', record, core, workspace);
  await writeBuildReceipt(root, 'effective.json', record, core, workspace);
}
export async function effectiveProjectOutput(core: string, workspace: string, p: Project, generation?: string) {
  const root = effectiveOutputRoot(core, workspace, p);
  assertWritablePath(core, workspace, root);
  if (generation !== undefined && !/^r-[a-zA-Z0-9]{6}$/.test(generation)) throw new HttpError(409, 'Invalid output generation');
  const record = await buildJson(await containedPath(root, generation ? `${generation}/effective.json` : 'effective.json'));
  if (record?.version !== 2 || !/^[a-f0-9]{64}$/.test(record.inputs) || !/^[a-f0-9]{64}$/.test(record.output) || record.key !== p.key || typeof record.source !== 'string' || !/^r-[a-zA-Z0-9]{6}$/.test(record.generation) || generation && record.generation !== generation)
    throw new HttpError(409, 'Effective output belongs to another project or generation');
  if (!generation && (record.source !== p.dir || record.inputs !== await effectiveInputFingerprint(p))) throw new HttpError(409, 'Effective sources changed; rebuild the project');
  const entry = await containedPath(root, `${record.generation}/out`), tree = await buildInventory(entry);
  if (!tree.files.includes('index.html') || tree.fingerprint !== record.output) throw new HttpError(409, 'Effective build output is missing or changed');
  return { entry, origin: 'cache' as const, generation: record.generation as string, problem: null };
}
export async function markEffectiveBuildFailed(core: string, workspace: string, p: Project) {
  const root = effectiveOutputRoot(core, workspace, p); assertWritablePath(core, workspace, root); await fs.mkdir(root, { recursive: true });
  await writeBuildReceipt(root, 'effective.json', { version: 2, status: 'failed' }, core, workspace);
}

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PublicationCard } from './publishers.ts';

export interface PublicationConfig {
  enabled: boolean;
  publisher: string;
  id: string;
  slug: string;
  routes?: Record<string, string>;
  /** Draft next publication version per publisher (release-capable publishers only); independent of package versions. */
  versions?: Record<string, string>;
}
export const publicationIdentity = (publication: PublicationConfig) => ({ id: publication.id, slug: publication.slug });
/** The launcher card of a project as its manifest describes it; `hasModel` says whether the build ships a 3D icon. */
export function publicationCard(m: { name: string; description?: string; icon?: string; iconColor?: string; iconShape?: string }, hasModel: boolean): PublicationCard {
  return {
    name: m.name,
    description: (m.description ?? '').trim(),
    icon: { default: !m.icon, color: m.iconColor ?? 'blue', shape: m.iconShape ?? 'sphere', model: hasModel },
  };
}
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
/** Why a value is not a stable three-part semantic version, or null. */
export function versionProblem(value: unknown): string | null {
  const match = typeof value === 'string' ? VERSION.exec(value) : null;
  if (!match || !match.slice(1).every((part) => Number.isSafeInteger(Number(part)))) return 'version must be a stable three-part version such as 0.1.0';
  return null;
}
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  return 0;
}
export const nextPatchVersion = (version: string) => { const p = version.split('.').map(Number); return `${p[0]}.${p[1]}.${p[2]! + 1}`; };
/** The highest stable version among retained releases, or null without semantic history. */
export function highestVersion(versions: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of versions) if (typeof v === 'string' && !versionProblem(v) && (!best || compareVersions(v, best) > 0)) best = v;
  return best;
}
/** `0.1.0` without semantic history, otherwise the next patch after the highest retained version (also after a rollback). */
export const suggestedVersion = (versions: Array<string | null | undefined>) => { const top = highestVersion(versions); return top ? nextPatchVersion(top) : '0.1.0'; };
export interface BuildReceipt { projectId: string; manifestMtimeMs: number; entry: string; completedMs: number; digest: string; files: number; sizeBytes: number; context?: Record<string, string> }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const newPublicationId = () => randomUUID();
export const normalizePublicationSlug = (value: string) => value.trim().toLowerCase();
export function slugProblem(value: string): string | null {
  const slug = normalizePublicationSlug(value);
  if (!slug) return null;
  if (!SLUG.test(slug) || slug.includes('--')) return 'publication slug must be empty or 1-63 lower-case letters, digits or single dashes, beginning and ending with a letter or digit';
  return null;
}
export function publicationProblems(value: unknown): Array<{ field: string; message: string }> {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ field: 'publication', message: 'publication must be an object' }];
  const p = value as Record<string, unknown>, errors: Array<{ field: string; message: string }> = [];
  if (typeof p.enabled !== 'boolean') errors.push({ field: 'publication.enabled', message: 'publication.enabled must be true or false' });
  if (typeof p.publisher !== 'string' || !/^[a-z0-9-]+$/.test(p.publisher)) errors.push({ field: 'publication.publisher', message: 'publication.publisher must be a publisher name' });
  if (typeof p.id !== 'string' || !ID.test(p.id)) errors.push({ field: 'publication.id', message: 'publication.id must be a generated publication ID' });
  if (typeof p.slug !== 'string') errors.push({ field: 'publication.slug', message: 'publication.slug is required' });
  else if (slugProblem(p.slug)) errors.push({ field: 'publication.slug', message: slugProblem(p.slug)! });
  else if (p.slug !== normalizePublicationSlug(p.slug)) errors.push({ field: 'publication.slug', message: `publication.slug must be normalized as "${normalizePublicationSlug(p.slug)}"` });
  if (p.routes !== undefined) {
    if (!p.routes || typeof p.routes !== 'object' || Array.isArray(p.routes)) errors.push({ field: 'publication.routes', message: 'publication.routes must map publisher names to slugs' });
    else for (const [publisher, slug] of Object.entries(p.routes)) {
      if (!/^[a-z0-9-]+$/.test(publisher)) errors.push({ field: `publication.routes.${publisher}`, message: 'publication route publisher must be a publisher name' });
      else if (typeof slug !== 'string' || slugProblem(slug)) errors.push({ field: `publication.routes.${publisher}`, message: typeof slug === 'string' ? slugProblem(slug)! : 'publication route slug must be a string' });
      else if (slug !== normalizePublicationSlug(slug)) errors.push({ field: `publication.routes.${publisher}`, message: `publication route slug must be normalized as "${normalizePublicationSlug(slug)}"` });
    }
  }
  if (p.versions !== undefined) {
    if (!p.versions || typeof p.versions !== 'object' || Array.isArray(p.versions)) errors.push({ field: 'publication.versions', message: 'publication.versions must map publisher names to draft versions' });
    else for (const [publisher, version] of Object.entries(p.versions)) {
      if (!/^[a-z0-9-]+$/.test(publisher)) errors.push({ field: `publication.versions.${publisher}`, message: 'publication version publisher must be a publisher name' });
      else if (versionProblem(version)) errors.push({ field: `publication.versions.${publisher}`, message: `publication ${versionProblem(version)}` });
    }
  }
  return errors;
}
const receiptFile = (workspace: string, projectId: string) => path.join(workspace, '.xrb', 'state', 'builds', `${projectId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
export async function digestTree(root: string) {
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('build entry cannot be a link');
  const files: Array<{ rel: string; file: string; size: number }> = [];
  let walkedBytes = 0;
  async function walk(dir: string): Promise<void> {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name), rel = path.relative(root, file).split(path.sep).join('/');
      if (item.isSymbolicLink()) throw new Error(`build output contains a link: ${rel}`);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile()) {
        const size = (await fs.stat(file)).size;
        files.push({ rel, file, size });
        walkedBytes += size;
        if (files.length > 20_000 || walkedBytes > 500 * 1024 * 1024) throw new Error('build output exceeds the publication limit');
      }
    }
  }
  await walk(root); files.sort((a, b) => a.rel.localeCompare(b.rel));
  const hash = createHash('sha256'); let sizeBytes = 0;
  for (const item of files) { hash.update(item.rel); hash.update('\0'); hash.update(await fs.readFile(item.file)); hash.update('\0'); sizeBytes += item.size; }
  return { digest: hash.digest('hex'), files: files.length, sizeBytes };
}
export async function writeBuildReceipt(workspace: string, projectId: string, manifestMtimeMs: number, entry: string, context?: Record<string, string>): Promise<BuildReceipt> {
  if (!(await fs.access(path.join(entry, 'index.html')).then(() => true, () => false))) throw new Error('successful build produced no index.html');
  const receipt = { projectId, manifestMtimeMs, entry: path.resolve(entry), completedMs: Date.now(), ...(context ? { context } : {}), ...(await digestTree(entry)) };
  const file = receiptFile(workspace, projectId); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(receipt, null, 2) + '\n'); return receipt;
}
/** Whether the entry tree is still byte-for-byte the output a successful receipt recorded, whatever the manifest did since. */
export async function receiptMatchesOutput(workspace: string, projectId: string, entry: string): Promise<boolean> {
  let receipt: BuildReceipt;
  try { receipt = JSON.parse(await fs.readFile(receiptFile(workspace, projectId), 'utf8')); } catch { return false; }
  if (path.resolve(receipt.entry) !== path.resolve(entry)) return false;
  const current = await digestTree(entry).catch(() => null);
  return !!current && current.digest === receipt.digest && current.files === receipt.files && current.sizeBytes === receipt.sizeBytes;
}
export async function verifyBuildReceipt(workspace: string, projectId: string, manifestMtimeMs: number, entry: string, context?: Record<string, string>): Promise<BuildReceipt> {
  let receipt: BuildReceipt;
  try { receipt = JSON.parse(await fs.readFile(receiptFile(workspace, projectId), 'utf8')); } catch { throw new Error('run Build successfully before publishing'); }
  if (receipt.manifestMtimeMs !== manifestMtimeMs || path.resolve(receipt.entry) !== path.resolve(entry)) throw new Error('project settings changed after Build: run Build again');
  if (JSON.stringify(receipt.context ?? {}) !== JSON.stringify(context ?? {})) throw new Error('build context changed after Build: run Build again');
  const current = await digestTree(entry);
  if (current.digest !== receipt.digest || current.files !== receipt.files || current.sizeBytes !== receipt.sizeBytes) throw new Error('build output changed after Build: run Build again');
  return receipt;
}

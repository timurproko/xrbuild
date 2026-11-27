import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolvePluginCatalog } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import type { JobContext } from './jobs.ts';

/** A post-processing plugin may export its own consent-gated prerequisite installer under this name. */
export const MESH_SETUP_EXPORT = 'mesh-runtime-setup';

export interface MeshSetupItem { name: string; version: string; publisher: string; licence: string; bytes: number }
export interface MeshSetupPlan {
  owner: string; consent: string; installed: boolean; destination: string;
  downloadBytes: number; installedBytes: number; licences: string[]; items: MeshSetupItem[];
}
interface SetupModule {
  plan(options?: object): { consent: string; destination: string; downloadBytes: number; installedBytes: number; licences: string[]; items: MeshSetupItem[] };
  install(options: object): Promise<unknown>;
  status?(options?: object): Promise<{ cpu?: { installed?: boolean } | null }>;
}
export class MeshSetupUnavailable extends Error {}

async function setupModule(core: string, workspace: string, owner: string) {
  const catalog = await resolvePluginCatalog(workspace, core, true);
  const plugin = catalog.selected.find(candidate => candidate.key === owner && candidate.meta.handMesh);
  const declaration = plugin?.meta.exports?.[MESH_SETUP_EXPORT];
  if (!plugin || !declaration) throw new MeshSetupUnavailable('This post-processing plugin has no setup');
  const resolved = await resolvePluginModule(plugin, plugin.sourceRoot, declaration, workspace, core, catalog);
  const stat = await fs.stat(resolved.file);
  const module = await import(`${pathToFileURL(resolved.file).href}?mesh-setup=${stat.mtimeMs}-${stat.size}`) as Partial<SetupModule>;
  if (typeof module.plan !== 'function' || typeof module.install !== 'function') throw new MeshSetupUnavailable('Plugin setup has no compatible plan and install');
  return { module: module as SetupModule, plugin };
}

/** Whether a selected post-processing plugin offers a setup; reads only the catalog. */
export async function meshSetupOwners(core: string, workspace: string): Promise<Set<string>> {
  const catalog = await resolvePluginCatalog(workspace, core, true);
  return new Set(catalog.selected.filter(plugin => plugin.meta.handMesh && plugin.meta.exports?.[MESH_SETUP_EXPORT]).map(plugin => plugin.key));
}

/** What the setup would download, from where and under which licences. Downloads nothing. */
export async function meshSetupPlan(core: string, workspace: string, owner: string): Promise<MeshSetupPlan> {
  const { module, plugin } = await setupModule(core, workspace, owner);
  const plan = module.plan({});
  const status = await module.status?.({}).catch(() => null);
  return { owner: plugin.key, consent: plan.consent, installed: !!status?.cpu?.installed, destination: plan.destination,
    downloadBytes: plan.downloadBytes, installedBytes: plan.installedBytes, licences: plan.licences,
    items: plan.items.map(({ name, version, publisher, licence, bytes }) => ({ name, version, publisher, licence, bytes })) };
}

/**
 * Progress a plugin setup reports through `install({ onProgress })`. Every plugin uses this one shape and core formats it,
 * so the job log and dialog read the same for every setup without per-plugin wording.
 * - `step`: short lowercase name, for example `download`, `unpack`, `self-check`.
 * - `done`/`total`: both present for a measurable step; `unit` says what they count (`bytes` by default, or `items`).
 * - `detail`: the current item, for example a file or module name (`file` is accepted as an older alias).
 */
export interface SetupProgress { step: string; done?: number; total?: number; unit?: 'bytes' | 'items'; detail?: string; file?: string }

const STEP = /^[a-z][a-z0-9-]{0,31}$/;
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const mib = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`;

/** Validates one progress event; anything malformed is ignored rather than written to the log. */
export function setupProgress(raw: unknown): (SetupProgress & { percent: number | null }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  if (typeof event.step !== 'string' || !STEP.test(event.step)) return null;
  const unit = event.unit === undefined ? 'bytes' : event.unit;
  if (unit !== 'bytes' && unit !== 'items') return null;
  const measured = event.total !== undefined;
  if (measured && (!count(event.total) || (event.done !== undefined && !count(event.done)) || (event.total as number) <= 0)) return null;
  const done = measured ? Math.min(event.done as number ?? 0, event.total as number) : undefined;
  const rawDetail = typeof event.detail === 'string' ? event.detail : typeof event.file === 'string' ? event.file : '';
  const detail = rawDetail.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) || undefined;
  return { step: event.step, unit, detail, ...(measured ? { done, total: event.total as number, percent: Math.floor(done! * 100 / (event.total as number)) } : { percent: null }) };
}

/** One log line per event: `download: 1.0 MB of 2.0 MB (50%)`, `self-check: 3 of 7 (42%) · torch`, `unpack…`. */
export function formatSetupProgress(event: SetupProgress & { percent: number | null }): string {
  if (event.total === undefined) return `${event.step}…${event.detail ? ` ${event.detail}` : ''}`;
  const amount = event.unit === 'items' ? `${event.done} of ${event.total}` : `${mib(event.done ?? 0)} of ${mib(event.total)}`;
  return `${event.step}: ${amount} (${event.percent}%)${event.unit === 'items' && event.detail ? ` · ${event.detail}` : ''}`;
}

/** Runs the plugin's installer for the exact plan the person agreed to, reporting progress as job lines. */
export async function installMeshSetup(core: string, workspace: string, owner: string, consent: string, ctx: JobContext): Promise<void> {
  const { module, plugin } = await setupModule(core, workspace, owner);
  let last = '';
  ctx.line(`Installing ${plugin.meta.title ?? plugin.id}.`);
  await module.install({ consent, core, workspace, owner: plugin.key, onProgress: (raw: unknown) => {
    const event = setupProgress(raw); if (!event) return;
    // Byte counters fire per chunk: log a new line only when the visible text changes.
    const line = formatSetupProgress(event.unit === 'bytes' ? { ...event, detail: undefined } : event);
    if (line !== last) { ctx.line(line); last = line; }
  } });
  ctx.line(`${plugin.meta.title ?? plugin.id} installed.`);
}

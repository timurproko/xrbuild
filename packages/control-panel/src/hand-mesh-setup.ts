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

const mib = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`;

/** Runs the plugin's installer for the exact plan the person agreed to, reporting progress as job lines. */
export async function installMeshSetup(core: string, workspace: string, owner: string, consent: string, ctx: JobContext): Promise<void> {
  const { module, plugin } = await setupModule(core, workspace, owner);
  let last = '', lastPercent = -1;
  ctx.line(`Installing prerequisites for ${plugin.meta.title ?? plugin.id}.`);
  await module.install({ consent, core, workspace, owner: plugin.key, onProgress: (event: { step: string; done?: number; total?: number; file?: string }) => {
    if (event.total) {
      const percent = Math.floor((event.done ?? 0) * 100 / event.total);
      if (event.step === 'download' && percent === lastPercent) return;
      lastPercent = percent;
      ctx.line(`${event.step}: ${mib(event.done ?? 0)} of ${mib(event.total)} (${percent}%)`);
    } else if (event.step !== last) ctx.line(`${event.step}…`);
    last = event.step;
  } });
  ctx.line('Prerequisites installed.');
}

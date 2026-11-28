import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { meshUserRoot } from './hand-mesh-runtime.ts';
import { ensurePythonEnv, pythonEnvPlan } from './python-env.ts';
import { resolvePluginCatalog } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import type { JobContext } from './jobs.ts';
import { readHandsState } from './hands-state.ts';
import { meshChoice } from './hand-mesh-state.ts';

/** A post-processing plugin may export its own consent-gated prerequisite installer under this name. */
export const MESH_SETUP_EXPORT = 'mesh-runtime-setup';

export interface MeshSetupItem { name: string; version: string; publisher: string; licence: string; bytes: number }
/**
 * A local file the person must choose for this install, for example a licensed archive that cannot be downloaded.
 * The setup declares it in `plan().input`; the panel copies the chosen file to a private folder and passes its path
 * to `install({ from })`, then deletes the copy.
 */
export interface MeshSetupInput { label: string; accept: string }
/**
 * Optional install kinds a setup declares (`export const setupKinds`): each kind is a separate runtime, needed always or
 * only while one of the plugin's settings has a given value. Without it the setup has one kind, installed by `plan()`.
 */
export interface MeshSetupKind { id: string; label: string; requires?: { setting: string; value: unknown } }
export interface MeshSetupPlan {
  owner: string; kind: string | null; label: string | null; consent: string; installed: boolean;
  /** Installed, and the setup can re-check it for the current plugin version without downloading. */
  refresh: boolean; destination: string;
  /** The local file this install needs the person to choose, or null. */
  input: MeshSetupInput | null;
  /** This install first prepares the plugin's core-provisioned Python environment. */
  python: boolean;
  downloadBytes: number; installedBytes: number; licences: string[]; items: MeshSetupItem[];
}
interface SetupModule {
  /** `python: true` asks core for the plugin's declared Python environment; its path reaches `install({ python })`. */
  plan(options?: object): { consent: string; destination: string; downloadBytes: number; installedBytes: number; licences: string[]; items: MeshSetupItem[]; input?: unknown; python?: boolean };
  install(options: object): Promise<unknown>;
  /** Re-binds an installed runtime to the current plugin source after an update; downloads nothing. */
  refresh?(options: object): Promise<unknown>;
  status?(options?: object): Promise<Record<string, { installed?: boolean } | null | unknown>>;
  setupKinds?: MeshSetupKind[];
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

const validKinds = (value: unknown): MeshSetupKind[] => Array.isArray(value) ? value.filter((k): k is MeshSetupKind => !!k && typeof k === 'object'
  && typeof k.id === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(k.id) && typeof k.label === 'string' && k.label.length <= 60).slice(0, 8) : [];
const installedKind = (status: Record<string, unknown> | null | undefined, kind: string) => {
  const entry = status?.[kind]; return !!entry && typeof entry === 'object' && (entry as { installed?: unknown }).installed === true;
};

/** The saved settings of this plugin's mesh layer (empty when none are saved). */
async function savedSettings(core: string, workspace: string, owner: string): Promise<Record<string, unknown>> {
  try {
    const choice = meshChoice((await readHandsState(core, workspace)).raw.postprocessing);
    const entry = Object.entries(choice.settings).find(([key]) => key.startsWith(`${owner}/`));
    return entry?.[1].values ?? {};
  } catch { return {}; }
}

/** The first declared kind the current settings need that is not installed yet (null when everything needed is there). */
export async function neededKind(module: SetupModule, settings: Record<string, unknown>): Promise<MeshSetupKind | null> {
  const kinds = validKinds(module.setupKinds); if (!kinds.length) return null;
  const status = await module.status?.({}).catch(() => null) as Record<string, unknown> | null;
  return kinds.find(k => (!k.requires || settings[k.requires.setting] === k.requires.value) && !installedKind(status, k.id)) ?? null;
}

/** Which declared runtime the plugin's saved settings still need, and the setting that asks for it, for the layer card's Install. */
export async function meshSetupNeeded(core: string, workspace: string, owner: string): Promise<{ kind: string; label: string; setting: string | null } | null> {
  try { const { module } = await setupModule(core, workspace, owner); const kind = await neededKind(module, await savedSettings(core, workspace, owner)); return kind && { kind: kind.id, label: kind.label, setting: kind.requires?.setting ?? null }; }
  catch { return null; }
}

const setupInput = (value: unknown): MeshSetupInput | null => {
  if (!value || typeof value !== 'object') return null;
  const { label, accept } = value as Record<string, unknown>;
  return typeof label === 'string' && label.trim() && label.length <= 80 && !/[\x00-\x1f\x7f]/.test(label)
    && typeof accept === 'string' && /^\.[a-z0-9]{1,8}(,\.[a-z0-9]{1,8}){0,3}$/i.test(accept) ? { label: label.trim(), accept: accept.toLowerCase() } : null;
};

/** Private copies of chosen setup files, outside every repository and workspace, removed after their install. */
export const meshSetupInputRoot = (userRoot = meshUserRoot()) => path.join(userRoot, 'setup-inputs');
const SETUP_INPUT_LIMIT = 4 * 2 ** 30;
const SETUP_INPUT_MAX_AGE_MS = 24 * 3600 * 1000;
/** Streams one chosen file into the private folder and returns its id; abandoned copies older than a day are removed. */
export async function receiveMeshSetupInput(body: Readable, extension: string, userRoot?: string): Promise<{ id: string; file: string }> {
  if (!/^\.[a-z0-9]{1,8}$/i.test(extension)) throw new Error('Unsupported setup file type');
  const root = meshSetupInputRoot(userRoot); await fs.mkdir(root, { recursive: true });
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const old = path.join(root, entry.name);
    if (entry.isFile() && Date.now() - (await fs.stat(old)).mtimeMs > SETUP_INPUT_MAX_AGE_MS) await fs.rm(old, { force: true });
  }
  const id = randomUUID(), file = path.join(root, `${id}${extension.toLowerCase()}`);
  let bytes = 0;
  try {
    await pipeline(body, async function* (source) {
      for await (const chunk of source) { bytes += (chunk as Buffer).length; if (bytes > SETUP_INPUT_LIMIT) throw new Error('The chosen file is larger than 4 GB'); yield chunk; }
    }, createWriteStream(file, { flags: 'wx' }));
    if (!bytes) throw new Error('The chosen file is empty');
  } catch (error) { await fs.rm(file, { force: true }); throw error; }
  return { id, file };
}

/** What the setup would download, from where and under which licences. Downloads nothing. */
export async function meshSetupPlan(core: string, workspace: string, owner: string): Promise<MeshSetupPlan> {
  const { module, plugin } = await setupModule(core, workspace, owner);
  const kinds = validKinds(module.setupKinds), needed = await neededKind(module, await savedSettings(core, workspace, owner));
  const kind = needed ?? kinds[0] ?? null;
  const plan = module.plan(kind ? { kind: kind.id } : {});
  const status = await module.status?.({}).catch(() => null) as Record<string, unknown> | null;
  const installed = kind ? !needed && installedKind(status, kind.id) : installedKind(status, 'cpu');
  if (!installed && plan.python === true && !plugin.meta.python) throw new MeshSetupUnavailable('Plugin setup asks for Python but declares no python environment');
  // A Python environment that is not ready yet joins the same plan and consent: its downloads are listed with the plugin's.
  const python = !installed && plan.python === true ? await pythonEnvPlan(plugin.key, plugin.meta.python!) : null;
  const extra = python && !python.ready ? python : null;
  return { owner: plugin.key, kind: kind?.id ?? null, label: kind?.label ?? null, consent: extra ? `${plan.consent}+${extra.key}` : plan.consent, installed,
    refresh: installed && typeof module.refresh === 'function', destination: plan.destination, input: installed ? null : setupInput(plan.input), python: !!python,
    downloadBytes: plan.downloadBytes + (extra?.downloadBytes ?? 0), installedBytes: plan.installedBytes, licences: [...new Set([...plan.licences, ...(extra?.items.map(i => i.licence) ?? [])])],
    items: [...plan.items, ...(extra?.items ?? [])].map(({ name, version, publisher, licence, bytes }) => ({ name, version, publisher, licence, bytes })) };
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
export async function installMeshSetup(core: string, workspace: string, owner: string, consent: string, ctx: JobContext, signal?: AbortSignal, kind: string | null = null, refresh = false, from: string | null = null, python = false): Promise<void> {
  const { module, plugin } = await setupModule(core, workspace, owner);
  if (refresh && module.refresh) {
    // Already installed: re-check its files and bind them to the current plugin version instead of downloading again.
    ctx.line(`Checking the installed ${plugin.meta.title ?? plugin.id} runtime for this plugin version.`);
    await module.refresh({ core, workspace, owner: plugin.key, signal });
    ctx.line(`${plugin.meta.title ?? plugin.id} is ready.`);
    return;
  }
  let last = '';
  ctx.line(`Installing ${plugin.meta.title ?? plugin.id}.`);
  const onProgress = (raw: unknown) => {
    const event = setupProgress(raw); if (!event) return;
    // Byte counters fire per chunk: log a new line only when the visible text changes.
    const line = formatSetupProgress(event.unit === 'bytes' ? { ...event, detail: undefined } : event);
    if (line !== last) { ctx.line(line); last = line; }
  };
  if (python && !plugin.meta.python) throw new Error('Plugin setup asks for Python but declares no python environment');
  const interpreter = python ? await ensurePythonEnv(plugin.key, plugin.meta.python!, { onProgress, signal }) : null;
  if (interpreter) signal?.throwIfAborted();
  // The plugin consented to its own plan; a '+' suffix only binds the shared Python part of the same consent.
  await module.install({ ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(interpreter ? { python: interpreter } : {}),
    consent: consent.split('+')[0], core, workspace, owner: plugin.key, signal, onProgress });
  // A setup that ignores the signal still finishes, so report the cancel only when it actually stopped.
  signal?.throwIfAborted();
  ctx.line(`${plugin.meta.title ?? plugin.id} installed.`);
}

// Personal run choices, never edits to the product manifest or executable configuration.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { assertWritablePath } from './project-access.ts';
import { projectFile } from './embedded-projects.ts';
import { HttpError } from './http.ts';
import { MANIFEST, selectionOf, type Manifest, type Project } from './projects.ts';
import { providerRunSchemas, applyProviderRunOverrides, selectedRunProviders, privateRunField, type ProviderRunOverride, type ProviderRunSchema, type ProviderSettingsOptions } from './project-provider-settings.ts';

export interface ProjectRunValues {
  inputs: string[];
  display: string;
  monitor: number;
  fullscreen: boolean;
  flat: boolean;
  cameraView: boolean;
  providerSettings?: Record<string, ProviderRunOverride>;
}
export type ProjectRunOverrides = Partial<ProjectRunValues>;
export interface ProjectRunSettings {
  revision: string;
  defaults: ProjectRunValues;
  overrides: ProjectRunOverrides;
  values: ProjectRunValues;
  providerSchemas?: ProviderRunSchema[];
}
const MAX_BYTES = 8192;
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const scopeOf = (core: string, p: Project) => ({ core: canonicalFuturePath(core), source: canonicalFuturePath(p.dir), key: p.key ?? `workspace:${p.id}` });
export function projectStateKey(core: string, p: Project): string {
  const scope = scopeOf(core, p);
  return digest(`${scope.core}\0${scope.source}\0${scope.key}`).slice(0, 24);
}
export function projectRunSettingsFile(core: string, workspace: string, p: Project): string {
  return path.join(workspace, 'config', 'projects', projectStateKey(core, p), 'run.json');
}
function requireBundled(p: Project): Manifest {
  if (!p.readOnly || p.origin !== 'bundled' || !p.manifest) throw new HttpError(409, 'Personal run settings require a valid bundled project');
  return p.manifest;
}
export function validateRunOverrides(value: unknown): ProjectRunOverrides {
  if (!object(value)) throw new HttpError(400, 'Run settings must be an object');
  for (const [key, field] of Object.entries(value)) {
    let valid = false;
    if (key === 'inputs') valid = Array.isArray(field) && field.length <= 16 && field.every(input => typeof input === 'string' && PROVIDER.test(input) && input !== 'none') && new Set(field).size === field.length;
    if (key === 'display') valid = typeof field === 'string' && PROVIDER.test(field);
    if (key === 'monitor') valid = Number.isInteger(field) && Number(field) >= 0 && Number(field) <= 255;
    if (['fullscreen', 'flat', 'cameraView'].includes(key)) valid = typeof field === 'boolean';
    if (key === 'providerSettings') valid = object(field) && Object.keys(field).length <= 16 && Object.entries(field).every(([provider, record]) =>
      PROVIDER.test(provider) && object(record) && Object.keys(record).every(key => ['owner', 'schema', 'values'].includes(key))
      && typeof record.owner === 'string' && /^(bundled|workspace):[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(record.owner)
      && typeof record.schema === 'string' && /^[a-f0-9]{64}$/.test(record.schema) && object(record.values) && Object.keys(record.values).length <= 32
      && Object.entries(record.values).every(([key, value]) => !privateRunField(key) && (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && /^[a-zA-Z0-9_. -]{1,80}$/.test(value))));
    if (!valid) throw new HttpError(400, 'Run settings contain an unsupported field or invalid value');
  }
  return structuredClone(value) as ProjectRunOverrides;
}
function defaultsOf(m: Manifest): ProjectRunValues {
  const selection = selectionOf(m), desktop = m.plugins?.desktop;
  return { inputs: [...selection.inputs ?? []], display: selection.display,
    monitor: Number.isInteger(desktop?.monitor) && Number(desktop?.monitor) >= 0 && Number(desktop?.monitor) <= 255 ? Number(desktop!.monitor) : 0,
    fullscreen: desktop?.fullscreen === true, flat: false, cameraView: false };
}

async function readBytes(file: string): Promise<Buffer | null> {
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error('unsafe settings');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error('changed settings');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const next = await handle.read(bytes, size, bytes.length - size, null);
      if (!next.bytesRead) break;
      size += next.bytesRead;
    }
    if (size > MAX_BYTES) throw new Error('oversized settings');
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.nlink !== 1) throw new Error('changed settings');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

/** Read-only, including when the selected workspace/config directory does not yet exist. */
export async function readProjectRunSettings(core: string, workspace: string, p: Project, options: ProviderSettingsOptions = {}): Promise<ProjectRunSettings> {
  const manifest = requireBundled(p), file = projectRunSettingsFile(core, workspace, p);
  const source = await projectFile(p, MANIFEST);
  if ((await fs.stat(source)).mtimeMs !== p.manifestMtimeMs) throw new HttpError(409, 'Project defaults changed; reload before editing run settings');
  try {
    assertWritablePath(core, workspace, file);
    const bytes = await readBytes(file);
    assertWritablePath(core, workspace, file);
    let overrides: ProjectRunOverrides = {};
    if (bytes) {
      const saved = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      const scope = scopeOf(core, p);
      if (!object(saved) || saved.version !== 1 || Object.keys(saved).some(key => !['version', 'scope', 'overrides'].includes(key)) || !object(saved.scope)
        || Object.keys(saved.scope).length !== 3 || saved.scope.core !== scope.core || saved.scope.source !== scope.source || saved.scope.key !== scope.key) throw new Error('wrong settings scope');
      overrides = validateRunOverrides(saved.overrides);
    }
    const defaults = defaultsOf(manifest);
    const values = { ...defaults, ...overrides }, schemas = await providerRunSchemas(core, workspace, p, values, options);
    applyProviderRunOverrides(overrides.providerSettings, schemas, selectedRunProviders(p, values));
    const revision = digest(`${JSON.stringify(manifest)}\0${p.manifestMtimeMs}\0${bytes ? digest(bytes) : 'missing'}\0${JSON.stringify(schemas.map(schema => [schema.provider, schema.owner, schema.schema, schema.defaults]))}`);
    return { revision, defaults, overrides, values, ...(schemas.length ? { providerSchemas: schemas } : {}) };
  } catch {
    throw new HttpError(409, 'Saved run settings are invalid, oversized, linked or belong to another source; review the user configuration file before running');
  }
}

/** Explicit compare-and-swap. A stale lock is never removed by another writer. */
export async function saveProjectRunSettings(core: string, workspace: string, p: Project, overrides: unknown, expectedRevision: unknown, options: ProviderSettingsOptions = {}): Promise<ProjectRunSettings> {
  requireBundled(p);
  const valid = validateRunOverrides(overrides);
  const schemas = await providerRunSchemas(core, workspace, p, { ...defaultsOf(p.manifest!), ...valid }, options);
  const schemaIdentity = JSON.stringify(schemas.map(schema => [schema.provider, schema.owner, schema.schema, schema.defaults]));
  try { applyProviderRunOverrides(valid.providerSettings, schemas, selectedRunProviders(p, { ...defaultsOf(p.manifest!), ...valid })); }
  catch { throw new HttpError(400, 'Personal provider settings do not match the selected source/schema'); }
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new HttpError(400, 'The current run-settings revision is required');
  if ((await readProjectRunSettings(core, workspace, p, options)).revision !== expectedRevision) throw new HttpError(409, 'Run settings changed; reload before saving');
  const file = projectRunSettingsFile(core, workspace, p), dir = path.dirname(file), lock = path.join(dir, 'run.lock');
  const serialized = JSON.stringify({ version: 1, scope: scopeOf(core, p), overrides: valid }, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > MAX_BYTES) throw new HttpError(400, 'Run-settings record exceeds 8 KiB');
  assertWritablePath(core, workspace, lock);
  await fs.mkdir(dir, { recursive: true });
  assertWritablePath(core, workspace, lock);
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new HttpError(409, 'Run settings are being saved, or a previous writer left a lock; retry after verifying that writer stopped'); throw error; }
  const temporary = path.join(dir, `run-${randomUUID()}.tmp`);
  try {
    if ((await readProjectRunSettings(core, workspace, p, options)).revision !== expectedRevision) throw new HttpError(409, 'Run settings changed; reload before saving');
    const staged = await fs.open(temporary, 'wx', 0o600);
    try { await staged.writeFile(serialized); await staged.sync(); }
    finally { await staged.close(); }
    if ((await readProjectRunSettings(core, workspace, p, options)).revision !== expectedRevision) throw new HttpError(409, 'Run settings changed; reload before saving');
    const latestSchemas = await providerRunSchemas(core, workspace, p, { ...defaultsOf(p.manifest!), ...valid }, options);
    if (schemaIdentity !== JSON.stringify(latestSchemas.map(schema => [schema.provider, schema.owner, schema.schema, schema.defaults]))) throw new HttpError(409, 'Provider defaults or source changed; reload before saving');
    assertWritablePath(core, workspace, file);
    await fs.rename(temporary, file);
    return await readProjectRunSettings(core, workspace, p, options);
  } finally {
    await handle.close();
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(lock);
  }
}

export function withRunSettings(p: Project, settings: ProjectRunSettings): Project {
  const m = requireBundled(p), selected = selectedRunProviders(p, settings.values);
  const plugins = { ...m.plugins };
  for (const [provider, record] of Object.entries(settings.values.providerSettings ?? {})) if (selected.has(provider)) plugins[provider] = { ...plugins[provider], ...record.values };
  return { ...p, manifest: { ...m, inputs: [...settings.values.inputs], display: settings.values.display,
    plugins: { ...plugins, desktop: { ...plugins.desktop, fullscreen: settings.values.fullscreen, monitor: settings.values.monitor } } } };
}

// Workspace plugin metadata and preferences. Never move or delete a plugin to disable it:
// a disabled folder remains available to rebuild, but is not loaded for runs or packaging.
import { existsSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { assertWritablePath } from './project-access.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST, validateManifest, type ProjectKind } from './projects.ts';

export const PLUGIN_PREFS = 'xrb-plugins.json';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const VERSION = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const SAMPLE_ID = /^[a-z][a-z0-9-]{0,47}$/;
const SAMPLE_PATH = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*)*$/;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export type SettingValue = string | number | boolean;
export interface PluginSettingOption { value: string; label: string }
export interface PluginSetting {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  default?: SettingValue;
  hint?: string;
  section?: string;
  /** Config only: the plugin's boolean runtime setting that must be on for this field to be shown. */
  shownWhen?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: PluginSettingOption[];
}
export interface PluginSample { id: string; path: string; dir: string; name: string; kind: ProjectKind; description?: string }
export const PLUGIN_TYPES = ['display', 'input', 'platform', 'publisher', 'plugin'] as const;
export type PluginType = typeof PLUGIN_TYPES[number];
export const PLUGIN_PANEL_TARGETS = ['webxr'] as const;
export type PluginPanelTarget = typeof PLUGIN_PANEL_TARGETS[number];
export interface PluginMeta { title?: string; type?: PluginType; version?: string; hidden?: boolean; /** legacy display title */ name?: string; description?: string; settingsDescription?: string; icon?: string; glyph?: string; screenName?: string; displayMode?: string; settings?: PluginSetting[]; panelSettings?: PluginSetting[]; panelTools?: unknown[]; panelTargets?: PluginPanelTarget[]; panelProviderNames?: Record<string, string>; panelHiddenProviders?: string[]; panelSamples?: PluginSample[]; /** User-owned config/plugins/<id>/config.json schema. */ config?: PluginSetting[]; exports?: Record<string, string>; references?: Record<string, { plugin: string; export: string }> }
export interface PluginPrefs { disabled: string[]; settings: Record<string, Record<string, SettingValue>>; panelSettings: Record<string, Record<string, SettingValue>>; origins?: Record<string, 'bundled' | 'workspace'> }
const empty = (): PluginPrefs => ({ disabled: [], settings: {}, panelSettings: {} });

export function pluginFolders(workspace: string): string[] {
  const root = path.join(workspace, 'plugins');
  return existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && ID.test(e.name) && existsSync(path.join(root, e.name, 'xrb-plugin.json'))).map((e) => e.name).sort() : [];
}

async function preferenceBytes(workspace: string): Promise<Buffer | null> {
  const file = path.join(workspace, PLUGIN_PREFS);
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw new Error('Plugin preferences are unsafe or oversized; review the user preferences file');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error('Plugin preferences changed while reading');
    const buffer = Buffer.alloc(65537); let size = 0;
    while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > 65536) throw new Error('Plugin preferences are oversized');
    return buffer.subarray(0, size);
  } finally { await handle.close(); }
}
export async function pluginPrefsRevision(workspace: string): Promise<string> {
  return createHash('sha256').update(await preferenceBytes(workspace) ?? 'missing').digest('hex');
}
function parsePreferences(data: Buffer | null): Record<string, any> {
  let parsed: unknown;
  try { parsed = JSON.parse(data?.toString('utf8') ?? '{}'); }
  catch { throw new Error('Plugin preferences contain invalid JSON; review the user preferences file'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${PLUGIN_PREFS} must contain an object`);
  return parsed as Record<string, any>;
}
export async function readPluginPrefs(workspace: string): Promise<PluginPrefs> {
  const parsed: unknown = parsePreferences(await preferenceBytes(workspace));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${PLUGIN_PREFS} must contain an object`);
  const raw = parsed as Partial<PluginPrefs>;
  if (raw.origins !== undefined && (!raw.origins || typeof raw.origins !== 'object' || Array.isArray(raw.origins)
    || Object.entries(raw.origins).some(([id, origin]) => !ID.test(id) || id !== id.toLowerCase() || !['bundled', 'workspace'].includes(origin))))
    throw new Error(`${PLUGIN_PREFS}: origins must map lowercase plugin IDs to bundled or workspace`);
  return {
    ...(raw.origins ? { origins: raw.origins } : {}),
    disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((id): id is string => typeof id === 'string' && (ID.test(id) || /^(bundled|workspace):[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id))) : [],
    settings: raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : {},
    panelSettings: raw.panelSettings && typeof raw.panelSettings === 'object' && !Array.isArray(raw.panelSettings) ? raw.panelSettings : {},
  };
}

export async function updatePluginPrefs(workspace: string, change: (prefs: PluginPrefs) => void | Promise<void>, core = workspace, afterWrite?: () => Promise<void>): Promise<void> {
  const file = path.join(workspace, PLUGIN_PREFS), lockFile = `${file}.lock`, temp = `${file}.${randomUUID()}.tmp`;
  assertWritablePath(core, workspace, file);
  await fs.mkdir(workspace, { recursive: true });
  // The checked preference path shares the lock's parent. Exclusive creation refuses any existing
  // lock leaf (including links); do not realpath a competing writer's transient/deleting lock.
  const lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => { if (error.code === 'EEXIST') throw new Error('Plugin preference lock exists; verify the previous writer stopped before recovery'); throw error; });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    const before = await pluginPrefsRevision(workspace), raw = parsePreferences(await preferenceBytes(workspace)), prefs = await readPluginPrefs(workspace);
    await change(prefs);
    const text = `${JSON.stringify({ ...raw, ...prefs }, null, 2)}\n`;
    if (Buffer.byteLength(text) > 65536) throw new Error('Plugin preferences are oversized');
    if (before !== await pluginPrefsRevision(workspace)) throw new Error('Plugin preferences changed; reload before saving');
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    assertWritablePath(core, workspace, file);
    if (before !== await pluginPrefsRevision(workspace)) throw new Error('Plugin preferences changed; reload before saving');
    await fs.rename(temp, file);
    await afterWrite?.();
  } finally {
    await fs.unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    await lock.close(); await fs.unlink(lockFile);
  }
}
export async function savePluginPrefs(workspace: string, prefs: PluginPrefs): Promise<void> {
  await updatePluginPrefs(workspace, current => { Object.assign(current, prefs); });
}

async function sampleProject(workspace: string, pluginId: string, value: unknown): Promise<PluginSample> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${pluginId}: panel.samples must contain objects`);
  const sample = value as Record<string, unknown>;
  if (typeof sample.id !== 'string' || !SAMPLE_ID.test(sample.id)) throw new Error(`${pluginId}: invalid panel sample id`);
  if (typeof sample.path !== 'string' || !SAMPLE_PATH.test(sample.path)) throw new Error(`${pluginId}: invalid panel sample path`);
  if (sample.description !== undefined && (typeof sample.description !== 'string' || sample.description.length > 240 || /[\x00-\x1f\x7f]/.test(sample.description)))
    throw new Error(`${pluginId}: invalid panel sample description`);
  const root = path.join(workspace, 'plugins', pluginId), rootReal = await fs.realpath(root);
  let dir = root;
  for (const segment of sample.path.split('/')) {
    dir = path.join(dir, segment);
    const stat = await fs.lstat(dir).catch(() => null);
    if (!stat) throw new Error(`${pluginId}: panel sample ${sample.id} does not exist`);
    if (stat.isSymbolicLink()) throw new Error(`${pluginId}: panel sample ${sample.id} uses a symbolic link`);
  }
  const dirReal = await fs.realpath(dir), relative = path.relative(rootReal, dirReal);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${pluginId}: panel sample ${sample.id} escapes its plugin`);
  const manifestFile = path.join(dirReal, MANIFEST), manifestStat = await fs.lstat(manifestFile).catch(() => null);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1 || manifestStat.size > 65536) throw new Error(`${pluginId}: panel sample ${sample.id} has no regular ${MANIFEST}`);
  let manifest: unknown;
  try { manifest = JSON.parse((await fs.readFile(manifestFile, 'utf8')).replace(/^﻿/, '')); }
  catch { throw new Error(`${pluginId}: panel sample ${sample.id} has invalid ${MANIFEST}`); }
  const problems = validateManifest(manifest, dirReal);
  if (problems.length) throw new Error(`${pluginId}: panel sample ${sample.id} has invalid ${MANIFEST}: ${problems.map((problem) => `${problem.field}: ${problem.message}`).join('; ')}`);
  const project = manifest as { name: string; kind: ProjectKind };
  return { id: sample.id, path: sample.path, dir: dirReal, name: project.name, kind: project.kind,
    ...(typeof sample.description === 'string' && sample.description.trim() ? { description: sample.description.trim() } : {}) };
}

const SETTING_TYPES = ['text', 'number', 'boolean', 'select'] as const;
const SETTING_KEYS = new Set(['key', 'label', 'type', 'default', 'hint', 'section', 'shownWhen', 'min', 'max', 'step', 'options']);
const settingText = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const settingValueText = (value: unknown): value is string => typeof value === 'string' && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);

function settingFields(pluginId: string, source: string, value: unknown): PluginSetting[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw new Error(`${pluginId}: ${source} must be a list of at most 32 fields`);
  const fields = value.map((entry, index): PluginSetting => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${pluginId}: ${source}[${index}] must be an object`);
    const raw = entry as Record<string, unknown>;
    for (const key of Object.keys(raw)) if (!SETTING_KEYS.has(key)) throw new Error(`${pluginId}: ${source}[${index}] contains unknown field ${key}`);
    if (typeof raw.key !== 'string' || !KEY.test(raw.key)) throw new Error(`${pluginId}: ${source}[${index}] has an invalid key`);
    if (!settingText(raw.label, 80)) throw new Error(`${pluginId}: ${source}.${raw.key} has an invalid label`);
    if (typeof raw.type !== 'string' || !SETTING_TYPES.includes(raw.type as PluginSetting['type'])) throw new Error(`${pluginId}: ${source}.${raw.key} has an invalid type`);
    if (raw.hint !== undefined && (typeof raw.hint !== 'string' || raw.hint.length > 240 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw.hint))) throw new Error(`${pluginId}: ${source}.${raw.key} has an invalid hint`);
    if (raw.section !== undefined && !settingText(raw.section, 80)) throw new Error(`${pluginId}: ${source}.${raw.key} has an invalid section`);
    if (raw.shownWhen !== undefined && (source !== 'config' || typeof raw.shownWhen !== 'string' || !KEY.test(raw.shownWhen))) throw new Error(`${pluginId}: ${source}.${raw.key} has an invalid shownWhen`);
    const field: PluginSetting = { key: raw.key, label: raw.label.trim(), type: raw.type as PluginSetting['type'],
      ...(typeof raw.hint === 'string' && raw.hint.trim() ? { hint: raw.hint.trim() } : {}),
      ...(typeof raw.section === 'string' ? { section: raw.section.trim() } : {}),
      ...(typeof raw.shownWhen === 'string' ? { shownWhen: raw.shownWhen } : {}) };
    if (field.type === 'number') {
      for (const key of ['min', 'max', 'step'] as const) if (raw[key] !== undefined && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid ${key}`);
      if (typeof raw.min === 'number') field.min = raw.min;
      if (typeof raw.max === 'number') field.max = raw.max;
      if (typeof raw.step === 'number') field.step = raw.step;
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new Error(`${pluginId}: ${source}.${field.key} has invalid limits`);
      if (field.step !== undefined && field.step <= 0) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid step`);
      if (raw.default !== undefined && (typeof raw.default !== 'number' || !Number.isFinite(raw.default) || field.min !== undefined && raw.default < field.min || field.max !== undefined && raw.default > field.max)) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid default`);
    } else if (field.type === 'select') {
      if (!Array.isArray(raw.options) || !raw.options.length || raw.options.length > 32) throw new Error(`${pluginId}: ${source}.${field.key} must have 1–32 options`);
      field.options = raw.options.map((option, optionIndex) => {
        if (!option || typeof option !== 'object' || Array.isArray(option)) throw new Error(`${pluginId}: ${source}.${field.key}.options[${optionIndex}] must be an object`);
        const candidate = option as Record<string, unknown>;
        if (Object.keys(candidate).some((key) => !['value', 'label'].includes(key)) || !settingText(candidate.value, 80) || !settingText(candidate.label, 80)) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid option`);
        return { value: candidate.value as string, label: (candidate.label as string).trim() };
      });
      if (new Set(field.options.map((option) => option.value)).size !== field.options.length) throw new Error(`${pluginId}: ${source}.${field.key} has duplicate options`);
      if (raw.default !== undefined && (typeof raw.default !== 'string' || !field.options.some((option) => option.value === raw.default))) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid default`);
    } else {
      if (raw.options !== undefined || raw.min !== undefined || raw.max !== undefined || raw.step !== undefined) throw new Error(`${pluginId}: ${source}.${field.key} has properties unsupported by ${field.type}`);
      if (raw.default !== undefined && (field.type === 'text' ? !settingValueText(raw.default) : typeof raw.default !== 'boolean')) throw new Error(`${pluginId}: ${source}.${field.key} has an invalid default`);
    }
    if (raw.default !== undefined) field.default = raw.default as SettingValue;
    return field;
  });
  if (new Set(fields.map((field) => field.key)).size !== fields.length) throw new Error(`${pluginId}: ${source} keys must be distinct`);
  return fields;
}

export async function pluginMeta(workspace: string, id: string): Promise<PluginMeta> {
  if (!pluginFolders(workspace).includes(id)) throw new Error(`no plugin ${id}`);
  const file = path.join(workspace, 'plugins', id, 'xrb-plugin.json'), stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw new Error(`${id}: plugin metadata must be a bounded regular unlinked file`);
  const handle = await fs.open(file, 'r'); let data: string;
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error(`${id}: plugin metadata changed while opening`);
    const bytes = Buffer.alloc(65537); let size = 0;
    while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > 65536) throw new Error(`${id}: plugin metadata is oversized`);
    data = bytes.subarray(0, size).toString('utf8');
  } finally { await handle.close(); }
  let raw: PluginMeta;
  try { raw = JSON.parse(data); } catch { throw new Error(`${id}: invalid xrb-plugin.json`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${id}: invalid xrb-plugin.json`);
  if (raw.title === undefined) throw new Error(`${id}: xrb-plugin.json requires title`);
  if (raw.type === undefined) throw new Error(`${id}: xrb-plugin.json requires type`);
  if (raw.version === undefined) throw new Error(`${id}: xrb-plugin.json requires version`);
  if (raw.title !== undefined && (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 80 || /[\x00-\x1f\x7f]/.test(raw.title))) throw new Error(`${id}: invalid plugin title`);
  if (raw.type !== undefined && !PLUGIN_TYPES.includes(raw.type)) throw new Error(`${id}: invalid plugin type`);
  if (typeof raw.version !== 'string' || !VERSION.test(raw.version)) throw new Error(`${id}: invalid plugin version`);
  if (raw.hidden !== undefined && typeof raw.hidden !== 'boolean') throw new Error(`${id}: hidden must be boolean`);
  if (raw.glyph !== undefined && (typeof raw.glyph !== 'string' || !raw.glyph.trim() || raw.glyph !== raw.glyph.trim() || raw.glyph.length > 16 || /[\x00-\x1f\x7f]/.test(raw.glyph) || [...graphemes.segment(raw.glyph)].length !== 1))
    throw new Error(`${id}: glyph must be one bounded visible character`);
  const panel = (raw as PluginMeta & { panel?: unknown }).panel;
  if (panel !== undefined && (!panel || typeof panel !== 'object' || Array.isArray(panel))) throw new Error(`${id}: panel must be an object`);
  const panelTools = (panel as { tools?: unknown } | undefined)?.tools;
  if (panelTools !== undefined && !Array.isArray(panelTools)) throw new Error(`${id}: panel.tools must be a list`);
  const panelSettings = settingFields(id, 'panel.settings', (panel as { settings?: unknown } | undefined)?.settings);
  const settingsDescription = (panel as { settingsDescription?: unknown } | undefined)?.settingsDescription;
  if (settingsDescription !== undefined && (typeof settingsDescription !== 'string' || !settingsDescription.trim() || settingsDescription.length > 240 || /[\x00-\x1f\x7f]/.test(settingsDescription)))
    throw new Error(`${id}: panel.settingsDescription must be bounded text`);
  const panelTargets = (panel as { targets?: unknown } | undefined)?.targets;
  if (panelTargets !== undefined && (!Array.isArray(panelTargets) || panelTargets.length > PLUGIN_PANEL_TARGETS.length ||
    panelTargets.some((target) => typeof target !== 'string' || !PLUGIN_PANEL_TARGETS.includes(target as PluginPanelTarget)) || new Set(panelTargets).size !== panelTargets.length))
    throw new Error(`${id}: panel.targets must contain unique supported targets`);
  const panelProviderNames = (panel as { providerNames?: unknown } | undefined)?.providerNames;
  if (panelProviderNames !== undefined && (!panelProviderNames || typeof panelProviderNames !== 'object' || Array.isArray(panelProviderNames) ||
    Object.keys(panelProviderNames).length > 8 || Object.entries(panelProviderNames).some(([runtimeName, exposedName]) => !ID.test(runtimeName) || typeof exposedName !== 'string' || !ID.test(exposedName)) ||
    new Set(Object.values(panelProviderNames)).size !== Object.keys(panelProviderNames).length))
    throw new Error(`${id}: panel.providerNames must map unique bounded provider IDs`);
  const panelHiddenProviders = (panel as { hiddenProviders?: unknown } | undefined)?.hiddenProviders;
  if (panelHiddenProviders !== undefined && (!Array.isArray(panelHiddenProviders) || panelHiddenProviders.length > 8 ||
    panelHiddenProviders.some((name) => typeof name !== 'string' || !ID.test(name)) || new Set(panelHiddenProviders).size !== panelHiddenProviders.length))
    throw new Error(`${id}: panel.hiddenProviders must contain unique bounded provider IDs`);
  const panelSampleValues = (panel as { samples?: unknown } | undefined)?.samples;
  if (panelSampleValues !== undefined && (!Array.isArray(panelSampleValues) || panelSampleValues.length > 8))
    throw new Error(`${id}: panel.samples must be a list of at most 8 samples`);
  const panelSamples = await Promise.all((panelSampleValues as unknown[] | undefined ?? []).map((sample) => sampleProject(workspace, id, sample)));
  if (new Set(panelSamples.map((sample) => sample.id)).size !== panelSamples.length) throw new Error(`${id}: panel sample IDs must be distinct`);
  const exports: Record<string, string> = {}, references: Record<string, { plugin: string; export: string }> = {};
  for (const kind of ['exports', 'references'] as const) {
    const values = raw[kind];
    if (values === undefined) continue;
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 32) throw new Error(`${id}: invalid component declarations`);
    for (const [key, value] of Object.entries(values)) {
      if (!/^[a-z][a-z0-9-]{0,47}$/.test(key)) throw new Error(`${id}: invalid component alias`);
      if (kind === 'exports') {
        if (typeof value !== 'string' || value.length > 256 || !/^\.\/(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(?:mjs|js|ts)$/.test(value) || value.split('/').includes('..')) throw new Error(`${id}: component exports must be contained module paths`);
        exports[key] = value;
      } else {
        const target = value as Record<string, unknown>;
        if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => !['plugin', 'export'].includes(key)) || typeof target.plugin !== 'string' || !/^(bundled|workspace):[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.plugin) || typeof target.export !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(target.export)) throw new Error(`${id}: component references require a qualified plugin and export`);
        references[key] = { plugin: target.plugin, export: target.export };
      }
    }
  }
  const settings = settingFields(id, 'settings', raw.settings);
  if (new Set([...settings, ...panelSettings].map((field) => field.key)).size !== settings.length + panelSettings.length)
    throw new Error(`${id}: runtime and panel setting keys must be distinct`);
  const config = raw.config === undefined ? undefined : settingFields(id, 'config', raw.config);
  for (const field of config ?? []) if (field.shownWhen && !settings.some(setting => setting.key === field.shownWhen && setting.type === 'boolean'))
    throw new Error(`${id}: config.${field.key} shownWhen must name a boolean runtime setting`);
  return {
    title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
    type: raw.type,
    version: raw.version,
    hidden: raw.hidden === true,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    settingsDescription: typeof settingsDescription === 'string' ? settingsDescription.trim() : undefined,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    glyph: typeof raw.glyph === 'string' ? raw.glyph : undefined,
    screenName: typeof raw.screenName === 'string' ? raw.screenName.trim().slice(0, 100) : undefined,
    displayMode: typeof raw.displayMode === 'string' ? raw.displayMode.trim().slice(0, 32) : undefined,
    panelTools: panelTools as unknown[] | undefined,
    panelSettings,
    panelTargets: panelTargets as PluginPanelTarget[] | undefined,
    panelProviderNames: panelProviderNames as Record<string, string> | undefined,
    panelHiddenProviders: panelHiddenProviders as string[] | undefined,
    panelSamples,
    ...(config === undefined ? {} : { config }),
    ...(raw.exports === undefined ? {} : { exports }),
    ...(raw.references === undefined ? {} : { references }),
    settings,
  };
}

/** An icon must be a PNG inside its plugin folder (even after following symlinks). */
export async function pluginIcon(workspace: string, id: string): Promise<string | null> {
  const meta = await pluginMeta(workspace, id);
  if (!meta.icon || path.isAbsolute(meta.icon) || !/\.png$/i.test(meta.icon)) return null;
  const root = await fs.realpath(path.join(workspace, 'plugins', id));
  const { containedPath } = await import('./extension-catalog.ts');
  const file = await containedPath(root, meta.icon).catch(() => null);
  if (!file) return null;
  const stat = await fs.lstat(file);
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 ? file : null;
}

export function validateSettings(fields: PluginSetting[], values: unknown): Record<string, SettingValue> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('settings must be an object');
  const result: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((f) => f.key === key);
    const valid = field && (field.type === 'text' && settingValueText(value) ||
      field.type === 'boolean' && typeof value === 'boolean' ||
      field.type === 'select' && typeof value === 'string' && field.options?.some((option) => option.value === value) ||
      field.type === 'number' && typeof value === 'number' && Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max));
    if (!valid) throw new Error(`invalid setting ${key}`);
    result[key] = value as SettingValue;
  }
  return result;
}

/** Schema defaults followed by saved values; per-project config overrides these at launch. */
export function effectiveSettings(fields: PluginSetting[], saved: Record<string, SettingValue> = {}): Record<string, SettingValue> {
  const defaults = Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default!]));
  // Old preferences may outlive a field removed from a plugin's schema.
  const known = Object.fromEntries(Object.entries(saved).filter(([key, value]) => {
    const field = fields.find((f) => f.key === key);
    return field && (field.type === 'text' && settingValueText(value) || field.type === 'boolean' && typeof value === 'boolean'
      || field.type === 'select' && typeof value === 'string' && field.options?.some((option) => option.value === value)
      || field.type === 'number' && typeof value === 'number' && Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max));
  }));
  return { ...defaults, ...known };
}

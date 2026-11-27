import type { PluginSetting, SettingValue } from './plugin-manager.ts';
import { validMeshCapabilities, type MeshCapability } from '../../sdk/src/hand-mesh-protocol.ts';
export interface HandMeshSetting extends PluginSetting { changeMode?: 'live' | 'reprepare' }

/** One optional mesh producer, never an input provider or skeleton modifier. */
export interface HandMeshDeclaration {
  version: 1 | 2;
  capabilities?: MeshCapability[];
  preparationTimeoutMs?: number;
  /** Prepared user-home generation, never a workspace or absolute path. */
  runtime?: { id: string; generation: string };
  id: string;
  label: string;
  program: string;
  args: string[];
  settingsVersion: number;
  settings: HandMeshSetting[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const id = (v: unknown): v is string => text(v, 128) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v);
const fail = (): never => { throw new Error('Invalid handMesh declaration or settings'); };
const keys = (v: Record<string, unknown>, allowed: string[]) => { if (Object.keys(v).some(k => !allowed.includes(k))) fail(); };

/** Pure metadata parser. In particular this never resolves or imports the program. */
export function handMeshDeclaration(value: unknown): HandMeshDeclaration {
  if (!object(value)) return fail();
  keys(value, ['version', 'id', 'label', 'program', 'args', 'settingsVersion', 'settings', ...(value.version === 2 ? ['capabilities', 'preparationTimeoutMs', 'runtime'] : [])]);
  if (value.runtime !== undefined) {
    if (!object(value.runtime)) return fail();
    keys(value.runtime, ['id', 'generation']);
    if (!id(value.runtime.id) || !id(value.runtime.generation)) return fail();
  }
  if (value.version === 2 && (!validMeshCapabilities(value.capabilities) || value.preparationTimeoutMs !== undefined
    && (!Number.isSafeInteger(value.preparationTimeoutMs) || (value.preparationTimeoutMs as number) < 1000 || (value.preparationTimeoutMs as number) > 120000))) return fail();
  if (value.version !== 1 && value.version !== 2 || !id(value.id) || !text(value.label, 80)
    || !text(value.program, 256) || !/^(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(value.program)
    || !Number.isSafeInteger(value.settingsVersion) || (value.settingsVersion as number) < 1
    || value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 16 || value.args.some(v => typeof v !== 'string' || v.length > 256 || /[\x00-\x1f\x7f]/.test(v)))
    || value.settings !== undefined && (!Array.isArray(value.settings) || value.settings.length > 8)) return fail();
  const settings = ((value.settings ?? []) as unknown[]).map((raw): HandMeshSetting => {
    if (!object(raw)) return fail();
    keys(raw, ['key', 'label', 'hint', 'type', 'default', 'min', 'max', 'step', 'options', ...(value.version === 2 ? ['changeMode'] : [])]);
    if (raw.changeMode !== undefined && raw.changeMode !== 'live' && raw.changeMode !== 'reprepare') return fail();
    if (!text(raw.key, 64) || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(raw.key) || ['__proto__', 'prototype', 'constructor'].includes(raw.key)
      || !text(raw.label, 80) || raw.hint !== undefined && !text(raw.hint, 240)) return fail();
    const field: HandMeshSetting = { key: raw.key, label: raw.label, type: raw.type as PluginSetting['type'], default: raw.default as SettingValue };
    if (value.version === 2) field.changeMode = raw.changeMode === 'live' ? 'live' : 'reprepare';
    if (typeof raw.hint === 'string') field.hint = raw.hint;
    if (raw.type === 'number') {
      if (typeof raw.min !== 'number' || !Number.isFinite(raw.min) || typeof raw.max !== 'number' || !Number.isFinite(raw.max) || raw.min > raw.max
        || raw.step !== undefined && (typeof raw.step !== 'number' || !Number.isFinite(raw.step) || raw.step <= 0) || raw.options !== undefined) return fail();
      field.min = raw.min; field.max = raw.max;
      if (typeof raw.step === 'number') field.step = raw.step;
    } else if (raw.type === 'select') {
      if (raw.min !== undefined || raw.max !== undefined || raw.step !== undefined || !Array.isArray(raw.options) || !raw.options.length || raw.options.length > 16) return fail();
      field.options = raw.options.map(option => {
        if (!object(option)) return fail();
        keys(option, ['value', 'label']);
        if (!text(option.value, 80) || !text(option.label, 80)) return fail();
        return { value: option.value, label: option.label };
      });
      if (new Set(field.options.map(o => o.value)).size !== field.options.length) return fail();
    } else if (raw.type !== 'boolean' || raw.min !== undefined || raw.max !== undefined || raw.step !== undefined || raw.options !== undefined) return fail();
    if (!validValue(field, raw.default)) return fail();
    return field;
  });
  if (new Set(settings.map(s => s.key)).size !== settings.length) return fail();
  return { version: value.version as 1 | 2, id: value.id, label: value.label, program: value.program,
    ...(value.runtime ? { runtime: { ...(value.runtime as { id: string; generation: string }) } } : {}),
    ...(value.version === 2 ? { capabilities: [...value.capabilities as MeshCapability[]], preparationTimeoutMs: value.preparationTimeoutMs as number ?? 30000 } : {}),
    args: [...(value.args as string[] ?? [])], settingsVersion: value.settingsVersion as number, settings };
}
/** Independent hard allowance; progress never renews it. */
export function meshPreparationAllowance(declaration: HandMeshDeclaration): number {
  const value = declaration.version === 1 ? 10000 : declaration.preparationTimeoutMs ?? 30000;
  if (!Number.isSafeInteger(value) || value < 1000 || value > 120000) throw new Error('Invalid mesh preparation allowance');
  return value;
}
function validValue(field: PluginSetting, value: unknown): value is SettingValue {
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (field.type === 'select') return typeof value === 'string' && !!field.options?.some(o => o.value === value);
  return field.type === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= field.min! && value <= field.max!;
}
/** Configuration input may inherit declaration defaults; application evidence must never do so. */
export function handMeshSettings(declaration: HandMeshDeclaration, value: unknown): Record<string, SettingValue> {
  return settingsValues(declaration, value, true);
}
/** Every declared setting must be explicitly echoed, including values equal to defaults. */
export function handMeshAppliedSettings(declaration: HandMeshDeclaration, value: unknown): Record<string, SettingValue> {
  return settingsValues(declaration, value, false);
}
/** Values are small data, not paths, credentials or commands. Unknown values require schema review. */
function settingsValues(declaration: HandMeshDeclaration, value: unknown, defaults: boolean): Record<string, SettingValue> {
  if (!object(value) || new TextEncoder().encode(JSON.stringify(value)).length > 2048
    || Object.keys(value).some(k => !declaration.settings.some(s => s.key === k))) return fail();
  const result: Record<string, SettingValue> = {};
  for (const field of declaration.settings) {
    const present = Object.hasOwn(value, field.key);
    if (!present && !defaults) return fail();
    const v = present ? value[field.key] : field.default;
    if (!validValue(field, v)) return fail();
    result[field.key] = v;
  }
  return result;
}

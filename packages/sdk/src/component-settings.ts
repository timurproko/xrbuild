/** Data-only component-library contract. Safe to import during project discovery. */
export interface ComponentChoice {
  type: 'choice';
  label: string;
  options: readonly { value: string; label: string }[];
  default: string;
}
export interface ComponentLibrary { parameters: Record<string, ComponentChoice> }
export interface ComponentConsumer {
  /** Exposed parameter key to existing scene prop name. */
  props: Record<string, string>;
  defaults?: Record<string, string>;
}
export type ComponentValues = Record<string, Record<string, string>>;
export interface ComponentMetadata {
  componentLibrary?: ComponentLibrary;
  componentLibraries?: Record<string, ComponentConsumer>;
  componentSettings?: ComponentValues;
}
export interface ComponentGroup {
  id: string;
  label: string;
  parameters: Record<string, ComponentChoice>;
  values: Record<string, string>;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const key = (value: string) => /^[a-zA-Z][a-zA-Z0-9-]{0,79}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const libraryId = (value: string) => /^(bundled|workspace):(?:archive\/)?[a-z0-9][a-z0-9-]*$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 160;
const stringMap = (value: unknown) => object(value) && Object.entries(value).every(([k, v]) => key(k) && typeof v === 'string' && v.length <= 160);

export function componentMetadataErrors(value: ComponentMetadata): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const fail = (field: string) => errors.push({ field, message: 'Invalid component parameter declaration or value' });
  if (value.componentLibrary !== undefined) {
    const library = value.componentLibrary;
    if (!object(library) || !object(library.parameters)) fail('componentLibrary');
    else for (const [name, p] of Object.entries(library.parameters)) {
      if (!key(name) || !object(p) || p.type !== 'choice' || !text(p.label) || !Array.isArray(p.options) || !p.options.length
        || p.options.some(o => !object(o) || !text(o.value) || o.value.includes('|') || !text(o.label))
        || new Set(p.options.map(o => o.value)).size !== p.options.length || !p.options.some(o => o.value === p.default)) fail(`componentLibrary.parameters.${name}`);
    }
  }
  if (value.componentLibraries !== undefined) {
    if (!object(value.componentLibraries)) fail('componentLibraries');
    else for (const [id, consumer] of Object.entries(value.componentLibraries)) {
      if (!libraryId(id) || !object(consumer) || !stringMap(consumer.props) || Object.values(consumer.props).some(v => !key(v))
        || consumer.defaults !== undefined && !stringMap(consumer.defaults)) fail(`componentLibraries.${id}`);
    }
  }
  if (value.componentSettings !== undefined) {
    if (!object(value.componentSettings)) fail('componentSettings');
    else for (const [id, values] of Object.entries(value.componentSettings)) if (!libraryId(id) || !stringMap(values)) fail(`componentSettings.${id}`);
  }
  return errors;
}

/** Explicit origin-qualified references only; no executable imports or name fallback. */
export function resolveComponentGroups(consumer: ComponentMetadata, libraries: ReadonlyMap<string, { name: string; componentLibrary?: ComponentLibrary }>): ComponentGroup[] {
  if (componentMetadataErrors(consumer).length) return [];
  return Object.entries(consumer.componentLibraries ?? {}).flatMap(([id, reference]) => {
    const library = libraries.get(id);
    if (!library?.componentLibrary || componentMetadataErrors(library).length) return [];
    const parameters = Object.fromEntries(Object.entries(library.componentLibrary.parameters).filter(([name]) => Object.hasOwn(reference.props, name)));
    if (!Object.keys(parameters).length) return [];
    const values = Object.fromEntries(Object.entries(parameters).map(([name, p]) => {
      const selected = consumer.componentSettings?.[id]?.[name] ?? reference.defaults?.[name] ?? p.default;
      return [name, p.options.some(o => o.value === selected) ? selected : p.default];
    }));
    return [{ id, label: library.name, parameters, values }];
  });
}

export function componentSceneProps(metadata: ComponentMetadata, values: ComponentValues): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [id, reference] of Object.entries(metadata.componentLibraries ?? {})) {
    for (const [parameter, prop] of Object.entries(reference.props)) {
      const value = values[id]?.[parameter] ?? reference.defaults?.[parameter];
      if (value !== undefined) props[prop] = value;
    }
  }
  return props;
}

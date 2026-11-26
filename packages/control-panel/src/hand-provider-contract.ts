// Metadata only: native hand data continues to use XrbInputApi/XrbHandFrame unchanged.
export interface HandProviderDeclaration {
  version: 1;
  id: string;
  transport: 'native';
  runtimeName: string;
  purpose: 'tracked' | 'synthetic' | 'replay';
  label?: string;
}
const ID = /^[a-z][a-z0-9-]{0,47}$/;
export function handProviderDeclarations(value: unknown): HandProviderDeclaration[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error('handProviders must be a bounded list');
  const ids = new Set<string>(), runtimes = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['version', 'id', 'transport', 'runtimeName', 'purpose', 'label'].includes(key))
      || raw.version !== 1 || !ID.test(raw.id) || typeof raw.id !== 'string' || raw.transport !== 'native'
      || typeof raw.runtimeName !== 'string' || !ID.test(raw.runtimeName) || ['none', 'mouse', 'keyboard', 'hand', 'webxr', 'simulated', 'replay'].includes(raw.runtimeName)
      || !['tracked', 'synthetic', 'replay'].includes(raw.purpose)
      || raw.label !== undefined && (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 80 || /[\x00-\x1f\x7f]/.test(raw.label))
      || ids.has(raw.id) || runtimes.has(raw.runtimeName)) throw new Error('Invalid or duplicate handProviders declaration');
    ids.add(raw.id); runtimes.add(raw.runtimeName);
    return { version: 1, id: raw.id, transport: 'native', runtimeName: raw.runtimeName, purpose: raw.purpose, ...(raw.label ? { label: raw.label.trim() } : {}) };
  });
}

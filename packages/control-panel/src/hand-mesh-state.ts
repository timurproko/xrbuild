import { HttpError } from './http.ts';
import { writeHandsState, validHandProviderKey } from './hands-state.ts';
import type { HandProviderKey } from './hand-providers.ts';
import { handMeshSettings } from './hand-mesh-contract.ts';
import type { HandMeshRegistry } from './hand-mesh-plugins.ts';

/** `enabled: false` keeps the layer and its settings but runs no mesh (absent means on). */
export interface MeshChoice { version: 1; selected: HandProviderKey | null; enabled?: boolean; settings: Record<string, { version: number; values: Record<string, unknown> }>; [key: string]: unknown }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const meshKey = (v: HandProviderKey) => `${v.owner}/${v.id}`;
export function meshChoice(value: unknown): MeshChoice {
  if (value === undefined) return { version: 1, selected: null, settings: {} };
  if (!object(value) || value.version !== 1 || value.selected !== null && (!validHandProviderKey(value.selected) || value.selected.owner === 'core')
    || (value.enabled !== undefined && typeof value.enabled !== 'boolean')
    || !object(value.settings) || Buffer.byteLength(JSON.stringify(value)) > 8192) throw new HttpError(409, 'Invalid or oversized Hands post-processing settings');
  for (const [key, entry] of Object.entries(value.settings)) {
    if (!/^(bundled|workspace):[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(key)
      || !object(entry) || !Number.isSafeInteger(entry.version) || (entry.version as number) < 1 || !object(entry.values)
      || Buffer.byteLength(JSON.stringify(entry.values)) > 2048) throw new HttpError(409, 'Invalid mesh plugin settings record');
  }
  return value as unknown as MeshChoice;
}
export async function saveMeshChoice(core: string, workspace: string, registry: HandMeshRegistry, request: { selected?: unknown; enabled?: unknown; values?: unknown; revision?: unknown; registryRevision?: unknown }, initialProvider: HandProviderKey | null = null) {
  if (request.registryRevision !== registry.revision) throw new HttpError(409, 'Mesh plugins changed; reload before saving');
  const selected = request.selected;
  if (selected !== null && (!validHandProviderKey(selected) || selected.owner === 'core')) throw new HttpError(400, 'Choose None or an installed mesh plugin');
  const plugin = selected && registry.plugins.find(p => meshKey(p) === meshKey(selected as HandProviderKey));
  // A plugin waiting for its prerequisites can be chosen; it applies once its setup is installed.
  if (selected && !plugin?.available && !plugin?.needsSetup) throw new HttpError(409, 'Selected mesh plugin is unavailable; choose None or an installed plugin');
  if (request.enabled !== undefined && typeof request.enabled !== 'boolean') throw new HttpError(400, 'Layer on/off must be true or false');
  let values: Record<string, unknown> = {};
  if (plugin) {
    try { values = handMeshSettings(plugin.declaration, request.values ?? {}); }
    catch (e) { throw new HttpError(400, (e as Error).message); }
  }
  return writeHandsState(core, workspace, request.revision, state => {
    const previous = meshChoice(state.raw.postprocessing);
    // A newly chosen layer starts on; otherwise the saved switch stays unless this request sets it.
    const changed = JSON.stringify(previous.selected) !== JSON.stringify(selected);
    const enabled = typeof request.enabled === 'boolean' ? request.enabled : changed ? true : previous.enabled ?? true;
    const postprocessing = { ...previous, selected, enabled, settings: { ...previous.settings,
      ...(plugin ? { [meshKey(plugin)]: { ...previous.settings[meshKey(plugin)], version: plugin.declaration.settingsVersion, values } } : {}) } };
    meshChoice(postprocessing);
    return { provider: state.exists ? state.provider : initialProvider, postprocessing };
  });
}

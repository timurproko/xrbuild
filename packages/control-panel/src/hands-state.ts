import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertWritablePath } from './project-access.ts';
import { HttpError } from './http.ts';
import { HAND_APPEARANCE_DEFAULTS, handProfile, type HandProfile } from '../../sdk/src/hand-profile.ts';
import { type HandProvider, type HandProviderKey, type HandRegistry, sameHandProvider } from './hand-providers.ts';

export type HandContext = 'native' | 'webxr';
export interface HandsState { exists: boolean; provider: HandProviderKey | null; revision: string; raw: Record<string, unknown>; profile: HandProfile }
const FILE = 'config/hands/profile.json', MAX_BYTES = 16384;
export const validHandProviderKey = (v: unknown): v is HandProviderKey => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(k => k === 'owner' || k === 'id')
  && typeof (v as HandProviderKey).owner === 'string' && /^(core|(?:bundled|workspace):[a-zA-Z0-9][a-zA-Z0-9._-]*)$/.test((v as HandProviderKey).owner)
  && typeof (v as HandProviderKey).id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test((v as HandProviderKey).id);
const hash = (bytes: Buffer | null) => createHash('sha256').update(bytes ?? 'missing').digest('hex');
export async function readHandsState(core: string, workspace: string): Promise<HandsState> {
  const file = path.join(workspace, FILE);
  assertWritablePath(core, workspace, file);
  const stat = await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
  if (!stat) return { exists: false, provider: null, revision: hash(null), raw: {}, profile: handProfile() };
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new HttpError(409, 'Hands profile is unsafe or oversized');
  const handle = await fs.open(file, 'r');
  let bytes: Buffer;
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new HttpError(409, 'Hands profile changed while opening');
    const buffer = Buffer.alloc(MAX_BYTES + 1); let size = 0;
    while (size < buffer.length) { const r = await handle.read(buffer, size, buffer.length - size, null); if (!r.bytesRead) break; size += r.bytesRead; }
    if (size > MAX_BYTES) throw new HttpError(409, 'Hands profile is oversized');
    bytes = buffer.subarray(0, size);
  } finally { await handle.close(); }
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(bytes.toString('utf8')); } catch { throw new HttpError(409, 'Hands profile contains invalid JSON; review config/hands/profile.json'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || raw.scope !== path.resolve(workspace)
    || raw.provider !== null && !validHandProviderKey(raw.provider)) throw new HttpError(409, 'Hands profile is invalid or belongs to another workspace');
  let profile: HandProfile;
  try { profile = handProfile(raw); } catch (error) { throw new HttpError(409, `Hands profile: ${(error as Error).message}`); }
  return { exists: true, provider: raw.provider as HandProviderKey | null, revision: hash(bytes), raw, profile };
}
export async function saveHandsState(core: string, workspace: string, provider: unknown, revision: unknown): Promise<HandsState> {
  if (provider !== null && !validHandProviderKey(provider)) throw new HttpError(400, 'A valid hand provider identity is required');
  return writeHandsState(core, workspace, revision, () => ({ provider }));
}
export async function saveHandAdjustments(core: string, workspace: string, value: unknown, revision: unknown, initialProvider: HandProviderKey | null = null): Promise<HandsState> {
  let profile: HandProfile;
  try { profile = handProfile(value); } catch (error) { throw new HttpError(400, (error as Error).message); }
  return writeHandsState(core, workspace, revision, state => ({ provider: state.exists ? state.provider : initialProvider,
    offsetMm: profile.offsetMm, sizeFactor: profile.sizeFactor,
    appearance: { ...Object.fromEntries(Object.entries(state.raw.appearance as object ?? {}).filter(([k]) => !(k in HAND_APPEARANCE_DEFAULTS))), ...profile.appearance } }));
}
async function writeHandsState(core: string, workspace: string, revision: unknown, update: (state: HandsState) => Record<string, unknown>): Promise<HandsState> {
  if (typeof revision !== 'string') throw new HttpError(400, 'Hands profile revision required');
  const file = path.join(workspace, FILE), lock = `${file}.lock`, temp = `${file}.${randomUUID()}.tmp`;
  assertWritablePath(core, workspace, file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const lease = await fs.open(lock, 'wx', 0o600).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new HttpError(409, 'Hands profile lock exists; verify its writer stopped before recovery'); throw e; });
  try {
    const state = await readHandsState(core, workspace);
    if (state.revision !== revision) throw new HttpError(409, 'Hands profile changed; reload before saving');
    const content = JSON.stringify({ ...state.raw, version: 1, scope: path.resolve(workspace), ...update(state) }, null, 2);
    if (Buffer.byteLength(content) > MAX_BYTES) throw new HttpError(409, 'Hands profile is oversized');
    assertWritablePath(core, workspace, temp);
    await fs.writeFile(temp, content, { flag: 'wx', mode: 0o600 });
    if ((await readHandsState(core, workspace)).revision !== revision) throw new HttpError(409, 'Hands profile changed before saving');
    assertWritablePath(core, workspace, file);
    await fs.rename(temp, file);
    return await readHandsState(core, workspace);
  } finally { await fs.rm(temp, { force: true }); await lease.close(); await fs.unlink(lock); }
}
export function selectedHandProvider(state: HandsState, registry: HandRegistry, context: HandContext): { key: HandProviderKey | null; initial: boolean } {
  if (state.exists) return { key: state.provider, initial: false };
  const real = registry.providers.filter(p => p.available && p.purpose === 'tracked' && p.transport === context);
  return { key: real.length === 1 ? { owner: real[0].owner, id: real[0].id } : null, initial: real.length === 1 };
}
export interface HandResolution { inputs: string[]; input: string; source: HandProvider | null; policy: 'off' | 'native' | 'webxr' }
export function resolveHandInput(inputs: string[], state: HandsState, registry: HandRegistry, context: HandContext): HandResolution {
  const browser = inputs.filter(n => n === 'mouse' || n === 'keyboard');
  if (!inputs.some(n => !['mouse', 'keyboard', 'none', ''].includes(n))) return { inputs: browser, input: 'none', source: null, policy: 'off' };
  const { key } = selectedHandProvider(state, registry, context);
  if (!key) throw new HttpError(409, 'Hand requires a provider choice in Hands');
  const source = registry.providers.find(p => sameHandProvider(p, key));
  if (!source) throw new HttpError(409, `Selected hand provider ${key.owner}/${key.id} is missing; choose a provider in Hands`);
  if (!source.available) throw new HttpError(409, `${source.label}: ${source.reason}`);
  if (source.transport !== context) throw new HttpError(409, `${source.label} is incompatible with ${context === 'native' ? 'native apps' : 'browser preview/publication'}`);
  return { inputs: [...browser, ...(source.runtimeName ? [source.runtimeName] : [])], input: source.runtimeName ?? 'none', source, policy: source.transport };
}
/** Only explicit actions pin an inferred default. A concurrent choice must be re-read, never overwritten. */
export async function prepareHandInput(core: string, workspace: string, registry: HandRegistry, inputs: string[], context: HandContext): Promise<HandResolution> {
  let state = await readHandsState(core, workspace);
  const resolved = resolveHandInput(inputs, state, registry, context);
  if (resolved.source && !state.exists) {
    state = await saveHandsState(core, workspace, { owner: resolved.source.owner, id: resolved.source.id }, state.revision);
    return resolveHandInput(inputs, state, registry, context);
  }
  return resolved;
}

// Shared Python for plugins: a plugin declares an exact Python and hash-locked wheels; core provisions them with one
// pinned uv into the user's ~/.xrbuild. No Python or uv already on the machine is used, and nothing runs in a workspace.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import { runProcess } from './jobs.ts';

export interface PythonWheel { name: string; version: string; sha256: string; bytes: number; publisher: string; licence: string }
/** `python` in xrb-plugin.json: the exact interpreter and the only wheels its environment may contain. */
export interface PythonDeclaration { version: string; wheels: PythonWheel[] }
export interface PythonItem { name: string; version: string; publisher: string; licence: string; bytes: number }

/** The one package manager core uses, pinned by size and SHA-256. Windows x64 only, like the native host. */
export const UV = {
  name: 'uv', version: '0.13.8', file: 'uv-x86_64-pc-windows-msvc.zip',
  url: 'https://github.com/astral-sh/uv/releases/download/0.13.8/uv-x86_64-pc-windows-msvc.zip',
  bytes: 15529884, sha256: '529e78a9cec6cd7e3e014f7ecd8bda0c113969d4ed0f2efeedb85c30943325b8',
  publisher: 'Astral (GitHub)', licence: 'MIT OR Apache-2.0',
} as const;
/** A standalone CPython download is about this size; uv checks its own pinned checksum for it. */
const PYTHON_APPROX_BYTES = 32 * 2 ** 20;

const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
/** Validates a plugin's `python` block; throws on anything that is not an exact, hash-locked environment. */
export function pythonDeclaration(raw: unknown): PythonDeclaration {
  const fail = (): never => { throw new Error('Invalid python declaration: exact version and hash-locked wheels are required'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !['version', 'wheels'].includes(key))) fail();
  if (typeof value.version !== 'string' || !/^3\.\d{1,2}\.\d{1,2}$/.test(value.version)) fail();
  if (!Array.isArray(value.wheels) || !value.wheels.length || value.wheels.length > 64) fail();
  const wheels = (value.wheels as unknown[]).map(entry => {
    if (!entry || typeof entry !== 'object') return fail();
    const w = entry as Record<string, unknown>;
    if (Object.keys(w).some(key => !['name', 'version', 'sha256', 'bytes', 'publisher', 'licence'].includes(key))) fail();
    if (typeof w.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(w.name) || typeof w.version !== 'string' || !/^[A-Za-z0-9.+!-]{1,32}$/.test(w.version)
      || typeof w.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(w.sha256) || !Number.isSafeInteger(w.bytes) || (w.bytes as number) <= 0
      || !text(w.publisher, 80) || !text(w.licence, 120)) fail();
    return { name: w.name as string, version: w.version as string, sha256: w.sha256 as string, bytes: w.bytes as number, publisher: w.publisher as string, licence: w.licence as string };
  });
  if (new Set(wheels.map(w => w.name.toLowerCase())).size !== wheels.length) fail();
  return { version: value.version as string, wheels };
}

/** Beside the mesh runtimes in the user's ~/.xrbuild, independent of the selected workspace. */
export const pythonRoot = (userRoot = path.join(os.homedir(), '.xrbuild')) => path.join(userRoot, 'python');
const lockKey = (d: PythonDeclaration) => createHash('sha256').update(JSON.stringify([UV.sha256, d.version, d.wheels.map(w => [w.name.toLowerCase(), w.version, w.sha256])])).digest('hex').slice(0, 16);
const exists = (file: string) => fs.lstat(file).then(() => true, () => false);

function paths(owner: string, d: PythonDeclaration, userRoot?: string) {
  const root = pythonRoot(userRoot), safe = owner.replace(/[^a-zA-Z0-9._-]/g, '_');
  const env = path.join(root, 'envs', `${safe}-${lockKey(d)}`);
  return { root, uvDir: path.join(root, `uv-${UV.version}`), uv: path.join(root, `uv-${UV.version}`, 'uv.exe'), pythons: path.join(root, 'cpython'),
    cache: path.join(root, 'cache'), downloads: path.join(root, 'downloads'), env, python: path.join(env, 'Scripts', 'python.exe'), ready: path.join(env, '.xrb-ready.json') };
}

/** What a plugin's environment still needs: nothing when it is ready, else the downloads for the consent plan. Reads only. */
export async function pythonEnvPlan(owner: string, d: PythonDeclaration, userRoot?: string): Promise<{ ready: boolean; key: string; items: PythonItem[]; downloadBytes: number }> {
  const p = paths(owner, d, userRoot), key = lockKey(d);
  if (await exists(p.ready) && await exists(p.python)) return { ready: true, key, items: [], downloadBytes: 0 };
  const items: PythonItem[] = [];
  if (!await exists(p.uv)) items.push({ name: UV.name, version: UV.version, publisher: UV.publisher, licence: UV.licence, bytes: UV.bytes });
  items.push({ name: 'CPython', version: d.version, publisher: 'Python Software Foundation (standalone build)', licence: 'PSF-2.0', bytes: PYTHON_APPROX_BYTES });
  items.push(...d.wheels.map(({ name, version, publisher, licence, bytes }) => ({ name, version, publisher, licence, bytes })));
  return { ready: false, key, items, downloadBytes: items.reduce((n, i) => n + i.bytes, 0) };
}

type Run = (program: string, args: string[], options: { env: Record<string, string>; signal?: AbortSignal }) => Promise<void>;
/** Runs a tool, keeping only its last lines for an error message. */
async function quiet(program: string, args: string[], env: Record<string, string>, signal?: AbortSignal): Promise<void> {
  const lines: string[] = [];
  const code = await runProcess(program, args, line => { lines.push(line); if (lines.length > 12) lines.shift(); }, { env: { ...process.env, ...env }, signal });
  if (code !== 0) throw new Error(`${path.basename(program)} ${args[0]} failed (${code}): ${lines.join(' ').trim().slice(-600)}`);
}
const defaultRun: Run = (program, args, { env, signal }) => quiet(program, args, env, signal);

async function obtainUv(p: ReturnType<typeof paths>, fetchImpl: typeof fetch, onProgress?: (event: object) => void, signal?: AbortSignal) {
  await fs.mkdir(p.downloads, { recursive: true });
  const archive = path.join(p.downloads, UV.file), part = path.join(p.downloads, `.part-${randomBytes(6).toString('hex')}`);
  const check = async (file: string) => {
    const s = await fs.lstat(file), digest = createHash('sha256');
    if (!s.isFile() || s.size !== UV.bytes) return false;
    await pipeline((await fs.open(file)).createReadStream(), digest); return digest.digest('hex') === UV.sha256;
  };
  try {
    if (!(await exists(archive) && await check(archive))) {
      const response = await fetchImpl(UV.url, { signal, redirect: 'follow' });
      if (response.status !== 200 || !response.body) throw new Error(`uv download failed (${response.status})`);
      let bytes = 0;
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), new Transform({ transform(chunk, _, done) {
        bytes += chunk.length; if (bytes > UV.bytes) return done(new Error('uv exceeds its pinned size'));
        onProgress?.({ step: 'download', done: bytes, total: UV.bytes, detail: 'uv' }); done(null, chunk);
      } }), createWriteStream(part, { flags: 'wx' }), { signal });
      if (!await check(part)) throw new Error('uv size or SHA-256 mismatch');
      await fs.rename(part, archive);
    }
    await fs.rm(p.uvDir, { recursive: true, force: true }); await fs.mkdir(p.uvDir, { recursive: true });
    // Windows' own tar reads zip archives; only uv.exe is taken out of it.
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    await quiet(tar, ['-xf', archive, '-C', p.uvDir, 'uv.exe'], {}, signal).catch(() => {});
    if (!await exists(p.uv)) throw new Error('The pinned uv archive has no uv.exe');
  } finally { await fs.rm(part, { force: true }); }
}

/**
 * Makes the plugin's environment ready and returns its python.exe: the pinned uv installs the exact CPython, a fresh
 * environment and only the declared wheels with --require-hashes. A ready environment is reused as it is.
 */
export async function ensurePythonEnv(owner: string, d: PythonDeclaration, options: { userRoot?: string; onProgress?: (event: object) => void; signal?: AbortSignal; fetchImpl?: typeof fetch; run?: Run } = {}): Promise<string> {
  const p = paths(owner, d, options.userRoot), run = options.run ?? defaultRun;
  if (await exists(p.ready) && await exists(p.python)) return p.python;
  await fs.mkdir(p.root, { recursive: true });
  if (!await exists(p.uv)) await obtainUv(p, options.fetchImpl ?? fetch, options.onProgress, options.signal);
  const env = { UV_NO_CONFIG: '1', UV_CACHE_DIR: p.cache, UV_PYTHON_INSTALL_DIR: p.pythons, UV_PYTHON_DOWNLOADS: 'automatic', UV_PYTHON_PREFERENCE: 'only-managed',
    UV_NO_MODIFY_PATH: '1', UV_PYTHON_INSTALL_BIN: '0', UV_PYTHON_INSTALL_REGISTRY: '0', VIRTUAL_ENV: '', PYTHONHOME: '', PYTHONPATH: '' };
  options.onProgress?.({ step: 'python', detail: `CPython ${d.version}` });
  await run(p.uv, ['python', 'install', d.version], { env, signal: options.signal });
  await fs.rm(p.env, { recursive: true, force: true });
  await run(p.uv, ['venv', p.env, '--python', d.version], { env, signal: options.signal });
  options.onProgress?.({ step: 'packages', done: 0, total: d.wheels.length, unit: 'items' });
  const requirements = path.join(p.env, 'requirements.txt');
  await fs.writeFile(requirements, d.wheels.map(w => `${w.name}==${w.version} --hash=sha256:${w.sha256}`).join('\n') + '\n');
  await run(p.uv, ['pip', 'install', '--python', p.python, '--require-hashes', '--no-deps', '--only-binary', ':all:', '-r', requirements], { env, signal: options.signal });
  options.onProgress?.({ step: 'packages', done: d.wheels.length, total: d.wheels.length, unit: 'items' });
  await fs.writeFile(p.ready, JSON.stringify({ owner, python: d.version, uv: UV.version, wheels: d.wheels.map(w => `${w.name}==${w.version}`) }));
  await fs.rm(p.cache, { recursive: true, force: true }).catch(() => {});
  return p.python;
}

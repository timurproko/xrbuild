// Shared Python for plugins: a plugin declares an exact Python and hash-locked wheel sets; core provisions them with one
// pinned uv. No Python or uv already on the machine is used, and nothing is written into a workspace or repository.
// Two placements: a reusable environment under ~/.xrbuild/python (for setup-time tools), or a self-contained copy inside
// a plugin's own runtime folder (for a runtime that core checks against its receipt at every launch).
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import { runProcess } from './jobs.ts';

export interface PythonWheel { name: string; version: string; sha256: string; bytes: number; publisher: string; licence: string }
/** A named, separately installed group of wheels, optionally from its own package index (for example a GPU build). */
export interface PythonWheelSet { index?: string; wheels: PythonWheel[] }
/** `python` in xrb-plugin.json: the exact interpreter, its default wheels and optional named sets. */
export interface PythonDeclaration { version: string; wheels: PythonWheel[]; sets?: Record<string, PythonWheelSet> }
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
export const DEFAULT_SET = 'default';

const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
function wheelList(value: unknown, fail: () => never): PythonWheel[] {
  if (!Array.isArray(value) || !value.length || value.length > 64) fail();
  const wheels = (value as unknown[]).map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail();
    const w = entry as Record<string, unknown>;
    if (Object.keys(w).some(key => !['name', 'version', 'sha256', 'bytes', 'publisher', 'licence'].includes(key))) fail();
    if (typeof w.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(w.name) || typeof w.version !== 'string' || !/^[A-Za-z0-9.+!-]{1,32}$/.test(w.version)
      || typeof w.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(w.sha256) || !Number.isSafeInteger(w.bytes) || (w.bytes as number) <= 0
      || !text(w.publisher, 80) || !text(w.licence, 120)) fail();
    return { name: w.name as string, version: w.version as string, sha256: w.sha256 as string, bytes: w.bytes as number, publisher: w.publisher as string, licence: w.licence as string };
  });
  if (new Set(wheels.map(w => w.name.toLowerCase())).size !== wheels.length) fail();
  return wheels;
}
/** Validates a plugin's `python` block; throws on anything that is not an exact, hash-locked environment. */
export function pythonDeclaration(raw: unknown): PythonDeclaration {
  const fail = (): never => { throw new Error('Invalid python declaration: exact version and hash-locked wheels are required'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !['version', 'wheels', 'sets'].includes(key))) fail();
  if (typeof value.version !== 'string' || !/^3\.\d{1,2}\.\d{1,2}$/.test(value.version)) fail();
  const wheels = wheelList(value.wheels, fail);
  if (value.sets === undefined) return { version: value.version as string, wheels };
  if (!value.sets || typeof value.sets !== 'object' || Array.isArray(value.sets) || Object.keys(value.sets).length > 8) fail();
  const sets: Record<string, PythonWheelSet> = {};
  for (const [id, raw] of Object.entries(value.sets as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || id === DEFAULT_SET || !raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
    const set = raw as Record<string, unknown>;
    if (Object.keys(set).some(key => !['index', 'wheels'].includes(key))) fail();
    if (set.index !== undefined && (typeof set.index !== 'string' || set.index.length > 256 || !/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~\/-]*)?$/.test(set.index))) fail();
    sets[id] = { ...(set.index ? { index: set.index as string } : {}), wheels: wheelList(set.wheels, fail) };
  }
  return { version: value.version as string, wheels, sets };
}
const wheelSet = (d: PythonDeclaration, set = DEFAULT_SET): PythonWheelSet => {
  const found = set === DEFAULT_SET ? { wheels: d.wheels } : d.sets?.[set];
  if (!found) throw new Error(`The python declaration has no wheel set "${set}"`);
  return found;
};

/** Beside the mesh runtimes in the user's ~/.xrbuild, independent of the selected workspace. */
export const pythonRoot = (userRoot = path.join(os.homedir(), '.xrbuild')) => path.join(userRoot, 'python');
const lockKey = (d: PythonDeclaration, set = DEFAULT_SET) => {
  const s = wheelSet(d, set);
  return createHash('sha256').update(JSON.stringify([UV.sha256, d.version, set, s.index ?? null, s.wheels.map(w => [w.name.toLowerCase(), w.version, w.sha256])])).digest('hex').slice(0, 16);
};
const exists = (file: string) => fs.lstat(file).then(() => true, () => false);

function paths(userRoot?: string) {
  const root = pythonRoot(userRoot);
  return { root, uvDir: path.join(root, `uv-${UV.version}`), uv: path.join(root, `uv-${UV.version}`, 'uv.exe'), pythons: path.join(root, 'cpython'),
    cache: path.join(root, 'cache'), downloads: path.join(root, 'downloads') };
}
function envPaths(owner: string, d: PythonDeclaration, userRoot?: string) {
  const env = path.join(pythonRoot(userRoot), 'envs', `${owner.replace(/[^a-zA-Z0-9._-]/g, '_')}-${lockKey(d)}`);
  return { env, python: path.join(env, 'Scripts', 'python.exe'), ready: path.join(env, '.xrb-ready.json') };
}
const uvItem = (): PythonItem => ({ name: UV.name, version: UV.version, publisher: UV.publisher, licence: UV.licence, bytes: UV.bytes });
const pythonItem = (d: PythonDeclaration): PythonItem => ({ name: 'CPython', version: d.version, publisher: 'Python Software Foundation (standalone build)', licence: 'PSF-2.0', bytes: PYTHON_APPROX_BYTES });
const wheelItems = (s: PythonWheelSet): PythonItem[] => s.wheels.map(({ name, version, publisher, licence, bytes }) => ({ name, version, publisher, licence, bytes }));
async function managedPythonPresent(d: PythonDeclaration, userRoot?: string) {
  return (await fs.readdir(paths(userRoot).pythons).catch(() => [] as string[])).some(name => name.startsWith(`cpython-${d.version}-`));
}
const summary = (items: PythonItem[], key: string, ready = false) => ({ ready, key, items, downloadBytes: items.reduce((n, i) => n + i.bytes, 0) });

/** What a plugin's reusable environment still needs: nothing when it is ready, else the downloads for the consent plan. Reads only. */
export async function pythonEnvPlan(owner: string, d: PythonDeclaration, userRoot?: string): Promise<{ ready: boolean; key: string; items: PythonItem[]; downloadBytes: number }> {
  const e = envPaths(owner, d, userRoot), key = lockKey(d);
  if (await exists(e.ready) && await exists(e.python)) return summary([], key, true);
  return summary([...(await exists(paths(userRoot).uv) ? [] : [uvItem()]), ...(await managedPythonPresent(d, userRoot) ? [] : [pythonItem(d)]), ...wheelItems(wheelSet(d))], key);
}
/** What placing a wheel set (and optionally the interpreter) into a plugin's runtime folder downloads. Reads only. */
export async function pythonRuntimePlan(d: PythonDeclaration, options: { set?: string; interpreter?: boolean; userRoot?: string } = {}) {
  const set = options.set ?? DEFAULT_SET, key = lockKey(d, set);
  return summary([...(await exists(paths(options.userRoot).uv) ? [] : [uvItem()]),
    ...(await managedPythonPresent(d, options.userRoot) ? [] : [pythonItem(d)]), ...wheelItems(wheelSet(d, set))], key);
}

export type PythonRun = (program: string, args: string[], options: { env: Record<string, string>; signal?: AbortSignal }) => Promise<string | void>;
/** Runs a tool and returns its output; an error keeps only the last lines. */
async function quiet(program: string, args: string[], env: Record<string, string>, signal?: AbortSignal): Promise<string> {
  const lines: string[] = [];
  const code = await runProcess(program, args, line => { lines.push(line); if (lines.length > 200) lines.shift(); }, { env: { ...process.env, ...env }, signal });
  if (code !== 0) throw new Error(`${path.basename(program)} ${args[0]} failed (${code}): ${lines.slice(-12).join(' ').trim().slice(-600)}`);
  return lines.join('\n');
}
const defaultRun: PythonRun = (program, args, { env, signal }) => quiet(program, args, env, signal);

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

type Options = { userRoot?: string; onProgress?: (event: object) => void; signal?: AbortSignal; fetchImpl?: typeof fetch; run?: PythonRun };
/** The pinned uv and the exact managed CPython, shared by every plugin; returns the tool paths and uv's environment. */
async function prepare(d: PythonDeclaration, options: Options) {
  const p = paths(options.userRoot), run = options.run ?? defaultRun;
  await fs.mkdir(p.root, { recursive: true });
  if (!await exists(p.uv)) await obtainUv(p, options.fetchImpl ?? fetch, options.onProgress, options.signal);
  // Copies, never hard links into the cache: runtime folders are checked to hold only plain, unlinked files.
  const env = { UV_NO_CONFIG: '1', UV_CACHE_DIR: p.cache, UV_PYTHON_INSTALL_DIR: p.pythons, UV_PYTHON_DOWNLOADS: 'automatic', UV_PYTHON_PREFERENCE: 'only-managed',
    UV_NO_MODIFY_PATH: '1', UV_PYTHON_INSTALL_BIN: '0', UV_PYTHON_INSTALL_REGISTRY: '0', UV_LINK_MODE: 'copy', VIRTUAL_ENV: '', PYTHONHOME: '', PYTHONPATH: '' };
  options.onProgress?.({ step: 'python', detail: `CPython ${d.version}` });
  await run(p.uv, ['python', 'install', d.version], { env, signal: options.signal });
  return { p, run, env };
}
const requirements = (s: PythonWheelSet) => s.wheels.map(w => `${w.name}==${w.version} --hash=sha256:${w.sha256}`).join('\n') + '\n';
const pipArgs = (python: string, file: string, s: PythonWheelSet, findLinks?: string) => ['pip', 'install', '--python', python, '--require-hashes', '--no-deps', '--only-binary', ':all:',
  ...(findLinks ? ['--no-index', '--find-links', findLinks] : s.index ? ['--index-url', s.index] : []), '-r', file];

/**
 * Makes the plugin's reusable environment ready and returns its python.exe: the exact CPython, a fresh environment and
 * only the declared default wheels with --require-hashes. A ready environment is reused as it is.
 */
export async function ensurePythonEnv(owner: string, d: PythonDeclaration, options: Options = {}): Promise<string> {
  const e = envPaths(owner, d, options.userRoot);
  if (await exists(e.ready) && await exists(e.python)) return e.python;
  const { p, run, env } = await prepare(d, options);
  await fs.rm(e.env, { recursive: true, force: true });
  await run(p.uv, ['venv', e.env, '--python', d.version], { env, signal: options.signal });
  const s = wheelSet(d);
  options.onProgress?.({ step: 'packages', done: 0, total: s.wheels.length, unit: 'items' });
  const file = path.join(e.env, 'requirements.txt'); await fs.writeFile(file, requirements(s));
  await run(p.uv, pipArgs(e.python, file, s), { env, signal: options.signal });
  options.onProgress?.({ step: 'packages', done: s.wheels.length, total: s.wheels.length, unit: 'items' });
  await fs.writeFile(e.ready, JSON.stringify({ owner, python: d.version, uv: UV.version, wheels: s.wheels.map(w => `${w.name}==${w.version}`) }));
  await fs.rm(p.cache, { recursive: true, force: true }).catch(() => {});
  return e.python;
}

/**
 * Places Python into a plugin's own runtime folder `dest`, so the plugin's receipt covers every file that runs:
 * with `interpreter`, a copy of the exact standalone CPython in `dest/python` whose `._pth` puts `dest/site-packages`
 * on its path; always the chosen wheel set, installed into `dest/site-packages`. `findLinks` installs the same
 * hash-locked wheels from a local folder instead of the index.
 */
export async function installPythonRuntime(d: PythonDeclaration, dest: string, options: Options & { set?: string; interpreter?: boolean; findLinks?: string } = {}): Promise<{ python: string | null; sitePackages: string }> {
  const s = wheelSet(d, options.set ?? DEFAULT_SET);
  const { p, run, env } = await prepare(d, options);
  const found = String(await run(p.uv, ['python', 'find', d.version], { env, signal: options.signal }) ?? '').trim().split(/\r?\n/).at(-1)?.trim() ?? '';
  if (!found || !path.resolve(found).toLowerCase().startsWith(path.resolve(p.pythons).toLowerCase() + path.sep)) throw new Error(`Managed CPython ${d.version} was not found`);
  const sitePackages = path.join(dest, 'site-packages');
  let python: string | null = null;
  if (options.interpreter) {
    const target = path.join(dest, 'python');
    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(path.dirname(found), target, { recursive: true, dereference: false, errorOnExist: true, force: false });
    const [major, minor] = d.version.split('.');
    // A ._pth file fixes sys.path to the copied standard library and the runtime's own site-packages.
    await fs.writeFile(path.join(target, `python${major}${minor}._pth`), ['.', 'Lib', 'DLLs', '..\\site-packages', ''].join('\n'));
    python = path.join(target, 'python.exe');
  }
  await fs.mkdir(sitePackages, { recursive: true });
  options.onProgress?.({ step: 'packages', done: 0, total: s.wheels.length, unit: 'items' });
  const file = path.join(p.root, `requirements-${randomBytes(6).toString('hex')}.txt`);
  try {
    await fs.writeFile(file, requirements(s));
    await run(p.uv, [...pipArgs(found, file, s, options.findLinks), '--target', sitePackages], { env, signal: options.signal });
  } finally { await fs.rm(file, { force: true }); }
  options.onProgress?.({ step: 'packages', done: s.wheels.length, total: s.wheels.length, unit: 'items' });
  await fs.rm(p.cache, { recursive: true, force: true }).catch(() => {});
  return { python, sitePackages };
}

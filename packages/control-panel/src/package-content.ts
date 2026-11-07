// Operational runtime inventories. These checks are not a redistribution audit or a build-code sandbox.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const RUNTIME_MANIFEST = 'xrb-runtime.json';
const HOST_FILES = new Set(['xrb-host.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'resources.pak', 'icudtl.dat', 'v8_context_snapshot.bin', 'snapshot_blob.bin', 'natives_blob.bin', 'libcef.dll', 'chrome_elf.dll', 'libEGL.dll', 'libGLESv2.dll', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll']);
const BAD_SEGMENT = /^(?:\..*|node_modules|src|source|sources|third_party|recordings|logs|coverage|testpages|test-plugins|tests?|builds?|config|credentials?|secrets?|private|id_rsa|id_ed25519)$/i;
const BAD_FILE = /(?:\.(?:pem|key|pfx|p12|jks|keystore|pdb|lib|exp|map|log|ts|tsx|cpp|c|h|hpp|ps1|bat|cmd)$|(?:^|[-_.])(?:secret|credentials?|password|signing)(?:[-_.]|$)|^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|xrb-(?:project|plugins|panel|app)\.json|run\.json|(?:vite|webpack|rollup|tsconfig|jsconfig)[.-].*|build\.(?:js|mjs|cjs))$)/i;
const APP_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.wasm', '.bin', '.dat', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico', '.mp3', '.mp4', '.ogg', '.wav', '.webm', '.glb', '.gltf', '.ktx', '.ktx2', '.basis', '.hdr', '.exr', '.woff', '.woff2', '.ttf', '.otf', '.txt', '.xml', '.webmanifest', '.pdf', '.usdz']);
const LICENSE = /^(?:licen[cs]e|notice|copying|copyright)(?:[-_.][a-z0-9._-]+)?$/i;
const inside = (root: string, file: string) => { const relative = path.relative(root, file); return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
export async function plainPath(file: string, allowMissing = false): Promise<string> {
  const absolute = path.resolve(file), parts = path.parse(absolute); let current = parts.root;
  for (const part of absolute.slice(parts.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => { if (allowMissing && error.code === 'ENOENT') return null; throw error; });
    if (!stat) continue;
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isDirectory() && !stat.isFile()) throw new Error('Package paths must be regular and unlinked');
  }
  return absolute;
}
export function portableFile(relative: unknown): asserts relative is string {
  if (typeof relative !== 'string' || relative.length > 240 || !relative || relative.includes('\\') || relative.split('/').some(part => !/^[a-zA-Z0-9_@][a-zA-Z0-9_@ .+-]*$/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) || BAD_SEGMENT.test(part)) || BAD_FILE.test(path.posix.basename(relative))) throw new Error('Package inventory contains a forbidden or nonportable path');
}
export interface ContentFile { relative: string; hash: string }
export interface ContentPlan { root: string; files: ContentFile[] }
async function digest(file: string) {
  await plainPath(file);
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Package input must be a regular unlinked file');
    const hash = createHash('sha256');
    for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes);
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.nlink !== 1) throw new Error('Package input changed during reading');
    return hash.digest('hex');
  } finally { await handle.close(); }
}
async function plan(root: string, files: string[]): Promise<ContentPlan> {
  await plainPath(root);
  if (!(await fs.lstat(root)).isDirectory()) throw new Error('Package source must be a directory');
  if (new Set(files.map(file => file.toLowerCase())).size !== files.length) throw new Error('Package inventory paths must be unique');
  const result: ContentFile[] = [];
  for (const relative of files.sort()) { portableFile(relative); result.push({ relative, hash: await digest(path.join(root, relative)) }); }
  return { root: await fs.realpath(root), files: result };
}
async function walk(root: string, prefix = '', omitRootMetadata = false): Promise<string[]> {
  const result: string[] = [];
  await plainPath(path.join(root, prefix));
  for (const name of (await fs.readdir(path.join(root, prefix))).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (!prefix && omitRootMetadata && ['xrb-project.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(name)) continue;
    portableFile(relative); const file = path.join(root, relative); await plainPath(file);
    if ((await fs.lstat(file)).isDirectory()) result.push(...await walk(root, relative)); else result.push(relative);
  }
  return result;
}
export async function hostContent(root: string): Promise<ContentPlan> {
  await plainPath(root);
  const files: string[] = [];
  for (const name of await fs.readdir(root)) {
    const file = path.join(root, name);
    if (HOST_FILES.has(name) || LICENSE.test(name)) {
      await plainPath(file); if (!(await fs.lstat(file)).isFile()) throw new Error('Host runtime file is not regular'); files.push(name);
    } else if (name === 'locales') {
      await plainPath(file);
      for (const locale of await fs.readdir(file)) {
        if (!/^[a-zA-Z0-9_-]+\.pak$/.test(locale)) continue;
        files.push(`locales/${locale}`);
      }
    } else if (name.toLowerCase() === 'licenses') {
      const notices = await walk(root, name);
      if (notices.some(notice => !/\.(?:txt|md|html)$/i.test(notice))) throw new Error('Runtime license directory contains unexpected files');
      files.push(...notices);
    }
  }
  if (!files.includes('xrb-host.exe')) throw new Error('the host runtime has no xrb-host.exe');
  return plan(root, files);
}
export async function pluginContent(root: string): Promise<ContentPlan> {
  await plainPath(root);
  const file = path.join(root, RUNTIME_MANIFEST), stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  let files: string[];
  if (stat) {
    await plainPath(file);
    if (!stat.isFile() || stat.size > 65536) throw new Error('Invalid plugin runtime inventory');
    let value: any;
    const handle = await fs.open(file, 'r');
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error();
      const bytes = Buffer.alloc(65537); let size = 0;
      while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
      if (size > 65536) throw new Error();
      value = JSON.parse(bytes.subarray(0, size).toString('utf8'));
    } catch { throw new Error('Invalid plugin runtime inventory'); } finally { await handle.close(); }
    if (!value || value.version !== 1 || Object.keys(value).some(key => !['version', 'files'].includes(key)) || !Array.isArray(value.files) || !value.files.length || value.files.length > 1024) throw new Error('Invalid plugin runtime inventory');
    files = value.files;
  } else files = (await fs.readdir(root)).filter(name => /\.dll$/i.test(name) || LICENSE.test(name));
  if (!files.some(name => typeof name === 'string' && /\.dll$/i.test(name))) throw new Error('Selected plugin runtime has no declared DLL');
  return plan(root, files);
}
export async function appContent(root: string, staticProjectRoot = false): Promise<ContentPlan> {
  const files = await walk(root, '', staticProjectRoot);
  if (!files.includes('index.html')) throw new Error('Package app has no index.html');
  if (files.some(file => !APP_EXTENSIONS.has(path.posix.extname(file).toLowerCase()) && !LICENSE.test(path.posix.basename(file)))) throw new Error('Built app contains an unsupported distributable file');
  return plan(root, files);
}
export async function iconContent(file: string) { await plainPath(file); return digest(file); }
export async function assertPackageDestination(folder: string, sources: string[]) {
  await plainPath(folder, true);
  const target = path.resolve(folder);
  for (const source of sources) {
    const canonical = await plainPath(source);
    if (inside(canonical, target) || inside(target, canonical)) throw new Error('Package output must not overlap its inputs');
  }
}
export async function copyContent(content: ContentPlan, destination: string) {
  await plainPath(destination, true); await fs.mkdir(destination, { recursive: true });
  for (const file of content.files) {
    const source = path.join(content.root, file.relative), target = path.join(destination, file.relative);
    if (await digest(source) !== file.hash) throw new Error('Package inputs changed before copying');
    await plainPath(target, true); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target, constants.COPYFILE_EXCL);
    if (await digest(target) !== file.hash || await digest(source) !== file.hash) throw new Error('Package inputs changed during copying');
  }
}
export async function verifyContent(content: ContentPlan) {
  for (const file of content.files) if (await digest(path.join(content.root, file.relative)) !== file.hash) throw new Error('Package input changed during staging');
}

/** Fingerprint staged bytes/membership, including only the metadata generated by the packager. */
export async function stagedContentFingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (directory: string, relative = '') => {
    await plainPath(directory);
    for (const name of (await fs.readdir(directory)).sort()) {
      const file = path.join(directory, name), next = relative ? `${relative}/${name}` : name;
      await plainPath(file); const stat = await fs.lstat(file);
      hash.update(`${next}\0${stat.isDirectory() ? 'd' : 'f'}\0`);
      if (stat.isDirectory()) await visit(file, next); else hash.update(await digest(file));
    }
  };
  await visit(root); return hash.digest('hex');
}

/** Only selected provider configuration; do not ship incidental project state. */
export function portableHostConfig(o: { plugins: string[]; selection: { input: string; inputs?: string[]; display: string; platform: string }; config?: { input: string; inputs?: string[]; display: string; platform: string; plugins: Record<string, unknown> } }) {
  if (!o.config) throw new Error('the desktop package needs the effective host configuration');
  const selection = o.selection, selected = new Set([selection.input, ...(selection.inputs ?? []), selection.display, selection.platform].filter(Boolean));
  for (const id of selected) if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Invalid package provider identity');
  const builtins = new Set(['desktop', 'none', 'replay', 'simulated', 'mouse', 'keyboard']);
  const expected = [...selected].filter(id => !builtins.has(id)).sort();
  if (JSON.stringify([...new Set(o.plugins)].sort()) !== JSON.stringify(expected) || new Set(o.plugins).size !== o.plugins.length) throw new Error('Packaged plugins must exactly match selected providers');
  if (o.config.input !== selection.input || o.config.display !== selection.display || o.config.platform !== selection.platform || JSON.stringify(o.config.inputs ?? []) !== JSON.stringify(selection.inputs ?? [])) throw new Error('Package configuration disagrees with provider selection');
  const inspect = (value: unknown, depth = 0): unknown => {
    if (depth > 8) throw new Error('Package configuration is too deeply nested');
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      if (value.length > 4096 || /^(?:[a-zA-Z]:[\\/]|[\\/]|(?:git\+)?file:)/i.test(value)) throw new Error('Package configuration contains a machine-local path');
      return value;
    }
    if (Array.isArray(value)) { if (value.length > 128) throw new Error('Oversized package configuration'); return value.map(item => inspect(item, depth + 1)); }
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/secret|password|token|credential|signing|certificate|private.?key|record|^(?:args|file|path|dir|directory)$/i.test(key)) throw new Error('Package configuration contains private or machine-local state');
      return [key, inspect(item, depth + 1)];
    }));
    throw new Error('Package configuration must contain portable JSON values');
  };
  const plugins = Object.fromEntries(Object.entries(o.config.plugins).filter(([key]) => selected.has(key)).map(([key, value]) => [key, inspect(value)]));
  const config = { input: selection.input, ...(selection.inputs ? { inputs: selection.inputs } : {}), display: selection.display, platform: selection.platform, plugins };
  if (Buffer.byteLength(JSON.stringify(config)) > 65536) throw new Error('Oversized package configuration');
  return config;
}

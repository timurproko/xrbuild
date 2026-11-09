// Shared source-only snapshots and frozen installation for trusted embedded package code.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalFuturePath, nativeDirectory } from './plugin-artifacts.ts';
import { containedPath, withinRoot } from './extension-catalog.ts';
import { assertWritablePath } from './project-access.ts';
import type { JobContext } from './jobs.ts';

const OMIT = new Set(['.git', '.gitmodules', '.xrbuild', '.artifacts', '.xrb', 'node_modules', 'dist', 'build', 'builds', 'coverage', '.cache', '.vite', 'recordings', 'logs', 'third_party']);
const omit = (name: string) => OMIT.has(name.toLowerCase()) || /^\.env(?:\.|$)/i.test(name) || /\.(?:pem|key|pfx|p12|jks|keystore|log)$/i.test(name);
export const inputHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const scriptName = (value: unknown): value is string => typeof value === 'string' && /^\w[\w:.-]*$/.test(value);
export function outputDirectory(entry: unknown): asserts entry is string {
  if (typeof entry !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(entry) || entry.split('/').some(name => ['node_modules', 'config', 'projects', 'plugins'].includes(name.toLowerCase())))
    throw new Error('Cached builds require a dedicated relative output directory');
}
export async function metadataText(file: string, maximum = 65536): Promise<string> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximum) throw new Error('Unsafe or oversized build metadata');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error('Build metadata changed while opening');
    const bytes = Buffer.alloc(maximum + 1); let size = 0;
    while (size < bytes.length) {
      const next = await handle.read(bytes, size, bytes.length - size, null);
      if (!next.bytesRead) break;
      size += next.bytesRead;
    }
    if (size > maximum) throw new Error('Oversized build metadata');
    return bytes.subarray(0, size).toString('utf8');
  } finally { await handle.close(); }
}
export async function buildJson(file: string): Promise<any> {
  const text = await metadataText(file);
  try { return JSON.parse(text); } catch { throw new Error('Invalid build metadata JSON'); }
}
export async function embeddedDeclaration(core: string) {
  const root = await containedPath(canonicalFuturePath(core), 'embedded');
  const declaration = await buildJson(await containedPath(root, 'package.json'));
  if (declaration?.private !== true || typeof declaration.packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-zA-Z0-9]+)?$/.test(declaration.packageManager)) throw new Error('Embedded root requires private: true and an exact pinned pnpm manager');
  const lock = await containedPath(root, 'pnpm-lock.yaml'), lockStat = await fs.lstat(lock);
  if (!lockStat.isFile() || lockStat.nlink !== 1) throw new Error('Embedded lockfile must be a plain file');
  const yaml = await metadataText(await containedPath(root, 'pnpm-workspace.yaml'));
  const lines = yaml.split(/\r?\n/).map(line => line.replace(/\s+#.*$/, '').trim()).filter(line => line && !line.startsWith('#'));
  const allowedPatterns = new Set(['projects/*', 'projects/*/*', 'plugins/*', 'plugins/*/*', 'plugins/*/samples/*']);
  const patterns = lines.slice(1).map(line => /^-\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))$/.exec(line)?.slice(1).find(Boolean));
  if (lines[0] !== 'packages:' || patterns.some(value => !value || !allowedPatterns.has(value)) || !patterns.includes('projects/*/*') || new Set(patterns).size !== patterns.length) throw new Error('Canonical packages-only embedded workspace required');
  return { root, declaration, packageManager: declaration.packageManager as string, patterns: patterns as string[] };
}

/** Length-delimited content/membership digest; never follow links or accept hard-linked files. */
export async function buildInventory(root: string, filtered = false, excluded: string | string[] = []) {
  const exclusions = typeof excluded === 'string' ? [excluded] : excluded;
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Build tree root must be a plain directory');
  const files: string[] = [], directories: string[] = [], digest = createHash('sha256');
  const visit = async (relative = '') => {
    const dir = await containedPath(root, relative || '.');
    for (const name of (await fs.readdir(dir)).sort()) {
      const next = relative ? `${relative}/${name}` : name;
      if (filtered && (omit(name) || exclusions.some(value => value && (next === value || next.startsWith(`${value}/`))))) continue;
      if (filtered && ['.npmrc', '.pnpmfile.cjs', 'pnpmfile.cjs'].includes(name.toLowerCase())) throw new Error('Custom package-manager configuration requires an editable copy');
      const file = await containedPath(root, next), stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isFile() && !stat.isDirectory()) throw new Error('Build tree contains a link or unsupported entry');
      digest.update(`${next}\0${stat.isDirectory() ? 'd' : 'f'}\0${stat.isFile() ? stat.size : 0}\0`);
      if (stat.isDirectory()) { directories.push(next); await visit(next); }
      else {
        files.push(next);
        const handle = await fs.open(file, 'r');
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1 || opened.size !== stat.size) throw new Error('Build input changed while opening');
          let size = 0;
          for await (const bytes of handle.createReadStream({ autoClose: false })) { digest.update(bytes); size += bytes.length; }
          if (size !== stat.size) throw new Error('Build input changed while reading');
        } finally { await handle.close(); }
      }
    }
  };
  await visit(); return { files, directories, fingerprint: digest.digest('hex') };
}
export async function embeddedInputs(core: string, excluded: string | string[] = []) {
  const root = await containedPath(canonicalFuturePath(core), 'embedded');
  const tree = await buildInventory(root, true, excluded), sdk: string[] = [];
  for (const relative of ['packages/sdk/src', 'packages/ui-kit/src', 'packages/app-icon/src']) {
    const source = await containedPath(canonicalFuturePath(core), relative).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    sdk.push(source ? (await buildInventory(source)).fingerprint : 'missing');
  }
  for (const relative of ['package.json', 'pnpm-lock.yaml', 'tools/fetch-deps/deps.lock.json', 'packages/sdk/package.json', 'packages/ui-kit/package.json', 'packages/control-panel/package.json', 'packages/control-panel/src/browser-build.ts', 'packages/control-panel/src/project-build.ts', 'packages/control-panel/src/embedded-inputs.ts', 'packages/control-panel/src/embedded-workspace.ts', 'packages/control-panel/src/service-artifacts.ts', 'packages/control-panel/src/component-resolver.ts', 'packages/control-panel/src/plugin-manager.ts']) {
    const file = await containedPath(canonicalFuturePath(core), relative).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (file && (await fs.lstat(file)).nlink !== 1) throw new Error('Core build input uses a hard link');
    sdk.push(file ? inputHash(await fs.readFile(file, 'utf8')) : 'missing');
  }
  return { ...tree, root, sourceFingerprint: tree.fingerprint, fingerprint: inputHash([tree.fingerprint, ...sdk].join('\0')) };
}
export async function buildStateDirectory(core: string, workspace: string, root: string, create = false) {
  assertWritablePath(core, workspace, root);
  const relative = path.relative(canonicalFuturePath(core), canonicalFuturePath(workspace));
  if (!relative || /^(native|embedded|packages|templates|tools|third_party)(?:[\\/]|$)/i.test(relative)) throw new Error('Build workspace must be outside product sources');
  await nativeDirectory(workspace, root, create);
  return root;
}
export async function writeBuildReceipt(root: string, file: string, value: unknown, core: string, workspace: string) {
  const target = path.join(root, file), temp = `${target}.${randomUUID()}.tmp`, text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 65536) throw new Error('Oversized build metadata');
  assertWritablePath(core, workspace, target);
  try {
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    assertWritablePath(core, workspace, target); await fs.rename(temp, target);
  } finally { await fs.unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function prepareEmbeddedSnapshot(core: string, workspace: string, root: string, before: Awaited<ReturnType<typeof embeddedInputs>>, excluded: string | string[] = []) {
  await buildStateDirectory(core, workspace, root);
  const work = await fs.mkdtemp(path.join(root, 'w-')), snapshot = path.join(work, 'workspace'); await fs.mkdir(snapshot);
  const markWorking = (status: 'working' | 'complete' | 'failed') => writeBuildReceipt(work, '.xrb-working.json', { version: 1, core: canonicalFuturePath(core), workspace: canonicalFuturePath(workspace), cacheRoot: canonicalFuturePath(root), source: before.root, generation: path.basename(work), inputs: before.fingerprint, status }, core, workspace);
  await markWorking('working');
  for (const name of before.directories) { assertWritablePath(core, workspace, path.join(snapshot, name)); await fs.mkdir(path.join(snapshot, name), { recursive: true }); }
  for (const name of before.files) {
    const from = await containedPath(before.root, name), to = path.join(snapshot, name);
    assertWritablePath(core, workspace, to); await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to, constants.COPYFILE_EXCL); await fs.chmod(to, (await fs.stat(from)).mode | 0o200);
  }
  if (before.fingerprint !== (await embeddedInputs(core, excluded)).fingerprint || (await buildInventory(snapshot, true, excluded)).fingerprint !== before.sourceFingerprint) throw new Error('Bundled inputs changed while copying; rebuild again');
  const config = path.join(work, 'user.npmrc'), globalConfig = path.join(work, 'global.npmrc');
  await fs.writeFile(config, '', { flag: 'wx' }); await fs.writeFile(globalConfig, '', { flag: 'wx' });
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:npm_|pnpm_|git_|node_(?:options|path|auth_token)$|ssh_(?:auth_sock|askpass)$|corepack_npm_)/i.test(key)));
  const env = { ...inherited, GIT_CEILING_DIRECTORIES: snapshot, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', COREPACK_ENABLE_PROJECT_SPEC: '1', COREPACK_ENABLE_STRICT: '1', XRB_CORE: canonicalFuturePath(core), XRB_HOME: snapshot, XRB_PROJECTS_HOME: snapshot, XRB_TEST_ROOT: path.join(workspace, 'build', 'tests', inputHash(work).slice(0, 16)),
    npm_config_userconfig: config, npm_config_globalconfig: globalConfig, npm_config_store_dir: path.join(work, 'store'), npm_config_enable_pre_post_scripts: 'false' };
  const pnpm = async (ctx: JobContext, args: string[], cwd: string) => {
    assertWritablePath(core, workspace, cwd);
    if (process.platform === 'win32') await ctx.run('cmd.exe', ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`], { cwd, env });
    else await ctx.run('corepack', ['pnpm', ...args], { cwd, env });
  };
  return { work, snapshot, markWorking,
    async install(ctx: JobContext) {
      ctx.line('Installing the frozen public embedded workspace in a writable snapshot (dependency lifecycle scripts disabled).');
      await pnpm(ctx, ['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile', '--config.package-import-method=copy'], snapshot);
      const inspect = async (dir: string) => {
        assertWritablePath(core, workspace, dir);
        for (const name of await fs.readdir(dir)) {
          const file = path.join(dir, name), stat = await fs.lstat(file);
          if (stat.isSymbolicLink()) {
            if (!withinRoot(work, await fs.realpath(file))) throw new Error('Installed dependency link escapes the build generation');
          } else if (stat.isDirectory()) await inspect(file);
          else if (!stat.isFile() || stat.nlink !== 1) throw new Error('Installed dependency contains a hard link or unsupported entry');
        }
      };
      await inspect(snapshot);
    },
    async run(ctx: JobContext, relative: string, script: string) {
      if (!scriptName(script)) throw new Error('Invalid embedded package script');
      const cwd = await containedPath(snapshot, relative);
      assertWritablePath(core, workspace, cwd);
      await pnpm(ctx, ['run', script], cwd);
      assertWritablePath(core, workspace, path.join(snapshot, relative));
    },
  };
}

// Origin-aware native build/freshness and provider validation. Workspace plugins retain their source-local
// CMake/bin layout; embedded plugin output stays in a core/source-scoped user cache. Only successful,
// selected and conflict-free binary roots reach panel-managed launches or packaging. Managed host builds
// publish immutable user-cached runtimes; source-local host helpers remain for explicit developer use.
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { JobContext } from './jobs.ts';
import { containedPath, resolvePluginCatalog, type ResolvedPlugin } from './extension-catalog.ts';
import { canonicalFuturePath, nativeDirectory, nativeBinaryFingerprint, NATIVE_RECEIPT, writeNativeReceipt } from './plugin-artifacts.ts';
import { hostPaths, hostCachePaths, resolvedHostPaths, hostSourceFingerprint, validateHostCache, writeHostReceipt, HOST_LOCK } from './host-artifacts.ts';
export { hostPaths, hostCachePaths, resolvedHostPaths } from './host-artifacts.ts';
export { nativeBinaryFingerprint } from './plugin-artifacts.ts';
import { mergeProviderProbes, providerQuery } from './native-provider-validation.ts';

export const PLUGIN_BUILD_SUCCESS = '.xrb-last-successful-build';

export async function recordPluginBuildSuccess(buildDir: string): Promise<void> {
  await fs.writeFile(path.join(buildDir, PLUGIN_BUILD_SUCCESS), `${new Date().toISOString()}\n`, 'utf8');
}

export interface HostFreshness {
  exe: string;
  runtimeDir: string;
  runtimeOrigin?: 'packaged' | 'cache';
  hostProblem?: string | null;
  exists: boolean;
  exeMs: number | null;
  newestSource: string | null;
  newestSourceMs: number | null;
  outdated: boolean;
  /** workspace plugins/<dir> builds; an outdated one makes the whole host outdated */
  plugins: PluginFreshness[];
  problems?: string[];
  /**
   * Plugins installed next to the exe by a build from before the workspace: the host finds them first
   * and refuses the workspace's copies as duplicates. Managed rebuilds select a clean cached runtime
   * without deleting product-side files.
   */
  staleHostPlugins: string[];
}

export interface PluginFreshness {
  dir: string;
  key?: string;
  origin?: 'bundled' | 'workspace';
  problem?: string | null;
  built: boolean;
  newestSource: string | null;
  outdated: boolean;
}

/** A workspace plugin's built files (DLL and runtime files): plugins/<dir>/bin. */
export function pluginBinDir(workspace: string, dir: string): string {
  return path.join(workspace, 'plugins', dir, 'bin');
}

/** The bin/ folders of the workspace's plugins that have one: each is a --plugin-dir= for the host. */
export function pluginBinDirs(workspace: string, disabled: readonly string[] = []): string[] {
  const root = path.join(workspace, 'plugins');
  const dirs = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'xrb-plugin.json'))).map((e) => e.name).sort() : [];
  return dirs.filter((d) => !disabled.includes(d)).map((d) => pluginBinDir(workspace, d)).filter((d) => existsSync(d));
}

/** Panel-managed runs use the same selected origins as metadata and services. */
export async function resolvedPluginBinDirs(repo: string, workspace: string, includeDisabled = false): Promise<string[]> {
  const catalog = await resolvePluginCatalog(workspace, repo, includeDisabled);
  return (await nativeBinaries(catalog.selected, workspace)).bins;
}

async function nativeBinaries(plugins: ResolvedPlugin[], workspace: string): Promise<{ bins: string[]; problems: string[] }> {
  const bins: string[] = [], problems: string[] = [];
  for (const plugin of plugins) {
    if (plugin.nativeProblem) { problems.push(`${plugin.key}: ${plugin.nativeProblem}`); continue; }
    try {
      const bin = plugin.nativeRebuilt ? plugin.binaryRoot : await containedPath(plugin.sourceRoot, 'bin');
      if (plugin.nativeRebuilt) await nativeDirectory(workspace, bin);
      if ((await fs.stat(bin)).isDirectory()) bins.push(bin);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`${plugin.key}: ${(error as Error).message}`); }
  }
  return { bins, problems };
}

/** CMake cache variables a workspace plugin (top folder `top`) is configured with (design D3). */
export function pluginCmakeVars(repo: string, workspace: string, top: string): string[] {
  const p = (x: string) => x.split(path.sep).join('/');
  return [
    `-DXRB_PLUGIN_SDK=${p(path.join(repo, 'native', 'plugin-sdk'))}`,
    `-DXRB_THIRD_PARTY=${p(path.join(workspace, 'third_party'))}`,
    // The core's own header-only dependencies (nlohmann/json), fetched by the core's fetch-deps.
    `-DXRB_CORE_THIRD_PARTY=${p(path.join(repo, 'third_party'))}`,
    `-DXRB_PLUGIN_BIN_DIR=${p(pluginBinDir(workspace, top))}`,
  ];
}

/** Native plugin projects in the workspace: plugins/<dir> or plugins/<dir>/runtime with a CMakeLists.txt. */
export function pluginProjects(workspace: string, repo: string) {
  const root = path.join(workspace, 'plugins');
  const dirs = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'xrb-plugin.json'))).map((e) => e.name) : [];
  return dirs
    .sort()
    .flatMap((d) => [d, `${d}/runtime`])
    .filter((d) => existsSync(path.join(root, d, 'CMakeLists.txt')))
    .map((d) => {
      const dir = path.join(root, d);
      return {
        dir: d,
        sourceDir: dir,
        buildDir: path.join(dir, 'build'),
        sources: [path.join(dir, 'src'), path.join(dir, 'CMakeLists.txt'), path.join(dir, 'config'), path.join(repo, 'native', 'plugin-sdk', 'include')],
      };
    });
}

function newest(p: string): { file: string; ms: number } | null {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st) return null;
  if (st.isSymbolicLink()) throw new Error(`Native source/output scan refuses a link: ${p}`);
  if (st.isFile()) return { file: p, ms: st.mtimeMs };
  let best: { file: string; ms: number } | null = null;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const n = newest(path.join(p, e.name));
    if (n && (!best || n.ms > best.ms)) best = n;
  }
  return best;
}

function newestOf(paths: string[]) {
  let best: { file: string; ms: number } | null = null;
  for (const s of paths) {
    const n = newest(s);
    if (n && (!best || n.ms > best.ms)) best = n;
  }
  return best;
}

/** A plugin is built when it has a DLL and its last successful output or build record is newer than all sources. */
function pluginFreshness(workspace: string, p: ReturnType<typeof pluginProjects>[number]): PluginFreshness {
  const out = path.join(p.buildDir, 'Release');
  const dlls = existsSync(out) ? readdirSync(out).filter((f) => f.toLowerCase().endsWith('.dll')) : [];
  const success = statSync(path.join(p.buildDir, PLUGIN_BUILD_SUCCESS), { throwIfNoEntry: false });
  const builtMs = dlls.length ? Math.max(success?.mtimeMs ?? 0, ...dlls.map((f) => statSync(path.join(out, f)).mtimeMs)) : null;
  const src = newestOf(p.sources);
  return {
    dir: p.dir,
    built: builtMs !== null,
    newestSource: src ? path.relative(workspace, src.file) : null,
    outdated: builtMs === null || (!!src && src.ms > builtMs),
  };
}

export function hostFreshness(repo: string, workspace: string, resolved?: PluginFreshness[]): HostFreshness {
  return hostFreshnessAt(repo, workspace, hostPaths(repo), resolved);
}

function hostFreshnessAt(repo: string, workspace: string, hp: ReturnType<typeof hostPaths>, resolved?: PluginFreshness[], receipt?: { changed: boolean; builtMs: number }): HostFreshness {
  const exeSt = statSync(hp.exe, { throwIfNoEntry: false });
  // A build that changed nothing in the exe (e.g. only a copy step in CMakeLists.txt) does not
  // relink it; MSBuild's last-build stamp says the build ran after that source change. A failed
  // build (a link refused while the host runs) writes the stamp too, but leaves an
  // "unsuccessfulbuild" marker next to it until a build succeeds: the stamp then means nothing.
  const tlog = path.join(hp.buildDir, 'xrb-host.dir', 'Release', 'xrb-host.tlog');
  const failed = !!statSync(path.join(tlog, 'unsuccessfulbuild'), { throwIfNoEntry: false });
  const stamp = failed ? null : statSync(path.join(tlog, 'xrb-host.lastbuildstate'), { throwIfNoEntry: false });
  const builtMs = exeSt ? receipt?.builtMs ?? Math.max(exeSt.mtimeMs, stamp?.mtimeMs ?? 0) : null;
  const src = newestOf(hp.sources);
  const plugins = resolved ?? pluginProjects(workspace, repo).map((p) => pluginFreshness(workspace, p));
  const hostOutdated = builtMs === null || (receipt ? receipt.changed : !!src && src.ms > builtMs);
  const staleHostPlugins = staleHostPluginDirs(repo, hp);
  return {
    exe: hp.exe,
    runtimeDir: hp.releaseDir,
    exists: !!exeSt,
    exeMs: builtMs,
    // The file to name in "outdated": the host's, else that of the first outdated plugin.
    newestSource: !hostOutdated && plugins.some((p) => p.outdated) ? plugins.find((p) => p.outdated)!.newestSource : src ? path.relative(repo, src.file) : null,
    newestSourceMs: src?.ms ?? null,
    outdated: hostOutdated || plugins.some((p) => p.outdated) || staleHostPlugins.length > 0,
    plugins,
    staleHostPlugins,
  };
}

export interface NativePluginProject {
  plugin: ResolvedPlugin;
  dir: string;
  sourceDir: string;
  buildDir: string;
  outputDir: string;
  sources: string[];
}

/** Resolve native sources once; all builds and freshness checks share this ownership plan. */
export async function nativePluginPlan(repo: string, workspace: string, includeDisabled = false) {
  const catalog = await resolvePluginCatalog(workspace, repo, includeDisabled), projects: NativePluginProject[] = [];
  const problems = [...catalog.problems];
  for (const plugin of catalog.selected) {
    const own: NativePluginProject[] = [];
    try {
      for (const sub of ['', 'runtime']) {
        const file = await containedPath(plugin.sourceRoot, `${sub ? `${sub}/` : ''}CMakeLists.txt`).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        if (!file) continue;
        if (!(await fs.stat(file)).isFile()) throw new Error('CMakeLists.txt must be a regular file');
        const sourceDir = path.dirname(file);
        const buildDir = plugin.origin === 'bundled' ? path.join(plugin.nativeBuildRoot, sub ? 'r' : 'b') : path.join(sourceDir, 'build');
        const outputDir = plugin.origin === 'bundled' ? path.join(plugin.nativeStateRoot, 'bin') : path.join(plugin.sourceRoot, 'bin');
        await nativeDirectory(workspace, buildDir);
        await nativeDirectory(workspace, outputDir);
        own.push({ plugin, dir: `${plugin.id}${sub ? `/${sub}` : ''}`, sourceDir, buildDir, outputDir,
          sources: [path.join(sourceDir, 'src'), file, path.join(sourceDir, 'config'), path.join(plugin.sourceRoot, 'xrb-plugin.json'), path.join(repo, 'native/plugin-sdk/include')] });
      }
      projects.push(...own);
    } catch (error) { problems.push(`${plugin.key}: ${(error as Error).message}`); }
  }
  return { projects, problems };
}

export function resolvedPluginCmakeVars(repo: string, project: NativePluginProject): string[] {
  const p = (value: string) => value.split(path.sep).join('/');
  return [`-DXRB_PLUGIN_SDK=${p(path.join(repo, 'native/plugin-sdk'))}`, `-DXRB_THIRD_PARTY=${p(project.plugin.dependencyRoot)}`,
    `-DXRB_CORE_THIRD_PARTY=${p(path.join(repo, 'third_party'))}`, `-DXRB_PLUGIN_BIN_DIR=${p(project.outputDir)}`];
}

export async function resolvedHostFreshness(repo: string, workspace: string, coreOnly = false): Promise<HostFreshness> {
  const plan = coreOnly ? { projects: [], problems: [] } : await nativePluginPlan(repo, workspace), plugins: PluginFreshness[] = [];
  for (const project of plan.projects) {
    const plugin = project.plugin;
    try {
      if (plugin.nativeProblem) throw new Error(plugin.nativeProblem);
      const bins = await nativeBinaries([plugin], workspace);
      if (bins.problems.length) throw new Error(bins.problems.join('; '));
      const bin = bins.bins[0];
      const dlls = bin ? (await fs.readdir(bin)).filter(file => /^xrb_.*\.dll$/i.test(file)) : [];
      const output = dlls.length ? newestOf(dlls.map(file => path.join(bin, file))) : null;
      const stamp = statSync(path.join(plugin.nativeStateRoot, NATIVE_RECEIPT), { throwIfNoEntry: false });
      const legacy = statSync(path.join(project.buildDir, PLUGIN_BUILD_SUCCESS), { throwIfNoEntry: false });
      const builtMs = output ? Math.max(output.ms, plugin.nativeRebuilt ? stamp?.mtimeMs ?? 0 : legacy?.mtimeMs ?? 0) : null;
      const source = newestOf(project.sources);
      plugins.push({ dir: project.dir, key: plugin.key, origin: plugin.origin, built: builtMs !== null,
        newestSource: source ? path.relative(plugin.origin === 'bundled' ? repo : workspace, source.file) : null,
        outdated: builtMs === null || !!source && source.ms > builtMs });
    } catch (error) {
      plugins.push({ dir: project.dir, key: plugin.key, origin: plugin.origin, built: false, newestSource: null, outdated: true, problem: (error as Error).message });
    }
  }
  const hp = await resolvedHostPaths(repo, workspace);
  try {
    if (hp.problem) throw new Error(hp.problem);
    const receipt = hp.rebuilt ? { changed: hostSourceFingerprint(repo) !== hp.inputs, builtMs: hp.builtMs! } : undefined;
    return { ...hostFreshnessAt(repo, workspace, hp, plugins, receipt), runtimeOrigin: hp.rebuilt ? 'cache' : 'packaged', hostProblem: null, problems: plan.problems };
  } catch (error) {
    const hostProblem = (error as Error).message;
    return { exe: hp.exe, runtimeDir: hp.releaseDir, runtimeOrigin: 'cache', exists: false, exeMs: null, newestSource: null,
      newestSourceMs: null, outdated: true, plugins, staleHostPlugins: [], hostProblem, problems: [...plan.problems, hostProblem] };
  }
}

/** Plugin folders left in <host build>/plugins (see HostFreshness.staleHostPlugins). */
export function staleHostPluginDirs(repo: string, hp = hostPaths(repo)): string[] {
  const dir = path.join(hp.releaseDir, 'plugins');
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isSymbolicLink() || !stat.isDirectory()) return ['(unsafe plugins root)'];
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() || e.isSymbolicLink() || /^xrb_.*\.dll$/i.test(e.name)).map(e => e.name).sort();
}

/** One provider as `xrb-host --list-plugins` reports it. */
export interface ProviderInfo {
  role: 'input' | 'display' | 'platform';
  name: string;
  version: string;
  description: string;
  builtin: boolean;
  path: string | null;
}

export interface ProviderList {
  providers: ProviderInfo[];
  /** plugin DLLs the host found but refused (wrong ABI, ...) */
  rejected: { path: string; reason: string }[];
  /** why the list is empty (no host built, or it did not answer) */
  error: string | null;
  /** Only these validated binary roots may be passed to a managed host launch. */
  pluginBins?: string[];
  blockedBins?: string[];
  problems?: string[];
  unsafe?: boolean;
}

const providerCache = new Map<string, ProviderList>();
export function clearProviderCache(): void { providerCache.clear(); }

/** Parses the `@plugins {json}` line of `xrb-host --list-plugins` (log lines share stdout). */
export function parseProviderList(stdout: string): ProviderList {
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith('@plugins '));
  if (!line) return { providers: [], rejected: [], error: 'xrb-host --list-plugins printed no @plugins line' };
  return providerQuery(JSON.parse(line.slice('@plugins '.length)));
}

export type NativeProviderQuery = (exe: string, bins: string[]) => Promise<ProviderList>;
const queryNativeProviders: NativeProviderQuery = async (exe, bins) => {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(exe, ['--list-plugins', ...bins.map(bin => `--plugin-dir=${bin}`)], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, output) => error ? reject(error) : resolve(String(output ?? '')));
    });
    return parseProviderList(stdout);
  } catch (error) { return { providers: [], rejected: [], error: `cannot query native providers: ${(error as Error).message}` }; }
};

/** Independent probes reveal conflicts that a combined first-wins native scan would hide. */
export async function listProviders(repo: string, workspace: string, includeDisabled = false, query: NativeProviderQuery = queryNativeProviders): Promise<ProviderList> {
  const hp = await resolvedHostPaths(repo, workspace);
  if (hp.problem) return { providers: [], rejected: [], pluginBins: [], unsafe: true, error: hp.problem };
  const exe = statSync(hp.exe, { throwIfNoEntry: false });
  if (!exe) return { providers: [], rejected: [], error: 'xrb-host.exe is not built' };
  const local = path.join(hp.releaseDir, 'plugins');
  const localStat = lstatSync(local, { throwIfNoEntry: false });
  if (localStat && (localStat.isSymbolicLink() || !localStat.isDirectory() || readdirSync(local).length)) return { providers: [], rejected: [], pluginBins: [], unsafe: true, error: 'Host-local plugins must be preserved aside before managed provider discovery' };
  const catalog = await resolvePluginCatalog(workspace, repo, includeDisabled);
  const { bins, problems } = await nativeBinaries(catalog.selected, workspace);
  const invalid = new Map<string, string>();
  const stamps = bins.map(bin => {
    try { return `${bin}:${nativeBinaryFingerprint(bin)}`; }
    catch (error) { invalid.set(bin, (error as Error).message); return `${bin}:invalid`; }
  });
  let runtimeStamp: string;
  try { runtimeStamp = nativeBinaryFingerprint(hp.releaseDir); }
  catch (error) { return { providers: [], rejected: [], pluginBins: [], unsafe: true, error: (error as Error).message }; }
  const key = [hp.exe, exe.ino, exe.size, exe.mtimeMs, runtimeStamp, ...stamps, ...problems, ...catalog.problems].join('|');
  if (query === queryNativeProviders && providerCache.has(key)) return providerCache.get(key)!;
  const base = await query(hp.exe, []);
  if (base.error) return { ...base, pluginBins: [], problems: [...catalog.problems, ...problems] };
  const probes = await Promise.all(bins.map(async bin => ({ bin, list: invalid.has(bin)
    ? { providers: [], rejected: [], error: invalid.get(bin)! } : await query(hp.exe, [bin]) })));
  const merged = mergeProviderProbes(base, probes);
  const list = { ...merged, problems: [...catalog.problems, ...problems, ...merged.problems ?? []] };
  if (!list.error && query === queryNativeProviders) {
    providerCache.set(key, list);
    if (providerCache.size > 8) providerCache.delete(providerCache.keys().next().value!);
  }
  return list;
}

/** cmake on PATH, else one bundled with any installed Visual Studio version/edition. */
export function findCmake(): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const c = path.join(dir, 'cmake.exe');
    if (dir && existsSync(c)) return c;
  }
  for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (!pf) continue;
    const root = path.join(pf, 'Microsoft Visual Studio');
    if (!existsSync(root)) continue;
    // Newest first: current VS uses numeric folders (18), older releases used years (2022).
    for (const version of readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const versionDir = path.join(root, version);
      if (!statSync(versionDir, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const edition of readdirSync(versionDir)) {
        const c = path.join(versionDir, edition, 'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake', 'CMake', 'bin', 'cmake.exe');
        if (existsSync(c)) return c;
      }
    }
  }
  return null;
}

/** Newest Visual Studio generator supported by this CMake executable. */
export function visualStudioGenerator(cmake: string): string {
  try {
    const help = execFileSync(cmake, ['--help'], { encoding: 'utf8', windowsHide: true });
    const generators = [...help.matchAll(/^\*?\s*(Visual Studio \d+ \d+)\s*=/gm)].map((m) => m[1]);
    if (generators.length) return generators[0];
  } catch {
    // cmakeBuild reports the useful process error if the executable itself cannot run.
  }
  return 'Visual Studio 17 2022';
}

/** Source folder recorded in the build's CMakeCache.txt, or null when there is no cache. */
export async function cachedSourceDir(buildDir: string): Promise<string | null> {
  const cache = await fs.readFile(path.join(buildDir, 'CMakeCache.txt'), 'utf8').catch(() => null);
  const m = cache?.match(/^CMAKE_HOME_DIRECTORY:INTERNAL=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function cachedBuildTool(buildDir: string): Promise<{ generator: string | null; instance: string | null }> {
  const cache = await fs.readFile(path.join(buildDir, 'CMakeCache.txt'), 'utf8').catch(() => null);
  const value = (name: string) => cache?.match(new RegExp(`^${name}:INTERNAL=(.+)$`, 'm'))?.[1].trim() ?? null;
  return { generator: value('CMAKE_GENERATOR'), instance: value('CMAKE_GENERATOR_INSTANCE') };
}

const samePath = (a: string, b: string) => {
  const normalize = (value: string) => { const real = canonicalFuturePath(value); return process.platform === 'win32' ? real.toLowerCase() : real; };
  return normalize(a) === normalize(b);
};

/**
 * Configure when needed (no cache, or the source moved), then build Release. With `vars` (a workspace
 * plugin) it always configures, so the core and workspace paths in the cache follow the current ones.
 */
async function cmakeBuild(cmake: string, generator: string, sourceDir: string, buildDir: string, ctx: JobContext, vars: string[] = []) {
  const cached = await cachedSourceDir(buildDir);
  const tool = await cachedBuildTool(buildDir);
  let configure = cached === null || vars.length > 0;
  let resetReason: string | null = null;
  if (cached && !samePath(cached, sourceDir)) resetReason = `configured for ${cached}`;
  else if (tool.generator && tool.generator !== generator) resetReason = `configured with ${tool.generator}, but ${generator} is installed`;
  else if (tool.instance && !existsSync(tool.instance)) resetReason = `configured with missing Visual Studio at ${tool.instance}`;
  if (resetReason) {
    // CMake cannot change a build tree's source, generator, or VS instance in place.
    const aside = `${buildDir}.moved-${Date.now()}`;
    ctx.line(`the build folder was ${resetReason}; moving it to ${path.basename(aside)} and configuring again`);
    await fs.rename(buildDir, aside);
    configure = true;
  }
  if (configure) await ctx.run(cmake, ['-S', sourceDir, '-B', buildDir, '-G', generator, '-A', 'x64', ...vars]);
  await ctx.run(cmake, ['--build', buildDir, '--config', 'Release']);
}

export interface RebuildOptions { coreOnly?: boolean; pluginsOnly?: boolean; includeDisabled?: boolean; cmake?: string; generator?: string }

async function plainNativeTree(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) throw new Error(`Native build/output tree contains a link or unsupported entry: ${path.join(dir, entry.name)}`);
    if (entry.isFile() && (await fs.lstat(path.join(dir, entry.name))).nlink !== 1) throw new Error(`Native build/output tree contains a hard link: ${path.join(dir, entry.name)}`);
    if (entry.isDirectory()) await plainNativeTree(path.join(dir, entry.name));
  }
}

/** Build a selected origin as one transaction; partial binaries never become active via a success stamp. */
export async function rebuildNativePlugins(repo: string, workspace: string, ctx: JobContext, cmake: string, generator: string, includeDisabled = false): Promise<void> {
  const plan = await nativePluginPlan(repo, workspace, includeDisabled);
  if (plan.problems.length) throw new Error(plan.problems.join('; '));
  const groups = new Map<string, NativePluginProject[]>();
  for (const project of plan.projects) groups.set(project.plugin.key, [...(groups.get(project.plugin.key) ?? []), project]);
  for (const projects of groups.values()) {
    const plugin = projects[0].plugin;
    await nativeDirectory(workspace, plugin.nativeStateRoot, true);
    const lockFile = path.join(plugin.nativeStateRoot, '.xrb-native-build.lock');
    const lock = await fs.open(lockFile, 'wx').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new Error(`${plugin.key}: native build lock exists; verify the previous builder stopped before recovering ${lockFile}`);
      throw error;
    });
    let started = false;
    try {
      for (const project of projects) {
        await nativeDirectory(workspace, project.buildDir, true);
        await nativeDirectory(workspace, project.outputDir, true);
        await plainNativeTree(project.buildDir);
        await plainNativeTree(project.outputDir);
        newestOf(project.sources); // Reject source links before invoking CMake.
      }
      await writeNativeReceipt(repo, workspace, plugin.sourceRoot, plugin.nativeStateRoot, 'building');
      started = true;
      for (const project of projects) {
        ctx.line(`plugin ${plugin.key}${project.dir.endsWith('/runtime') ? '/runtime' : ''}`);
        await cmakeBuild(cmake, generator, project.sourceDir, project.buildDir, ctx, resolvedPluginCmakeVars(repo, project));
        await recordPluginBuildSuccess(project.buildDir);
      }
      await plainNativeTree(projects[0].outputDir);
      if (!(await fs.readdir(projects[0].outputDir)).some(file => /^xrb_.*\.dll$/i.test(file))) throw new Error(`${plugin.key}: build installed no native plugin DLL`);
      await writeNativeReceipt(repo, workspace, plugin.sourceRoot, plugin.nativeStateRoot, 'complete');
    } catch (error) {
      if (started) await writeNativeReceipt(repo, workspace, plugin.sourceRoot, plugin.nativeStateRoot, 'failed');
      throw error;
    } finally { await lock.close(); await fs.unlink(lockFile); }
  }
}

/** Build in the selected user cache, then publish a new immutable runtime for future consumers. */
async function rebuildCoreHost(repo: string, workspace: string, ctx: JobContext, cmake: string, generator: string): Promise<void> {
  const hp = hostCachePaths(repo, workspace);
  await validateHostCache(repo, workspace, false, true);
  await containedPath(canonicalFuturePath(repo), 'native/host/CMakeLists.txt');
  const inputs = hostSourceFingerprint(repo);
  await plainNativeTree(hp.buildDir);
  await validateHostCache(repo, workspace, true);
  const lockFile = path.join(hp.stateRoot, HOST_LOCK);
  const lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error('Host rebuild lock exists; verify the previous builder stopped before manual recovery');
    throw error;
  });
  let started = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    await writeHostReceipt(repo, workspace, 'building', inputs);
    started = true;
    ctx.line(`host build cache: ${hp.buildDir}`);
    await cmakeBuild(cmake, generator, hp.hostDir, hp.buildDir, ctx, [`-DXRB_ROOT=${canonicalFuturePath(repo).split(path.sep).join('/')}`]);
    await nativeDirectory(workspace, hp.releaseDir);
    await plainNativeTree(hp.buildDir);
    const legacy = path.join(hp.releaseDir, 'plugins');
    if (lstatSync(legacy, { throwIfNoEntry: false })) {
      const aside = path.join(hp.stateRoot, `plugins.stale-${randomUUID()}`);
      ctx.line(`preserving cached legacy host plugin output at ${aside}`);
      await fs.rename(legacy, aside);
    }
    if (!(await fs.lstat(hp.exe)).isFile()) throw new Error('Host build produced no executable');
    const output = nativeBinaryFingerprint(hp.releaseDir);
    const runtime = await fs.mkdtemp(path.join(hp.stateRoot, 'r-'));
    for (const name of await fs.readdir(hp.releaseDir))
      await fs.cp(path.join(hp.releaseDir, name), path.join(runtime, name), { recursive: true, force: false, errorOnExist: true });
    if (output !== nativeBinaryFingerprint(hp.releaseDir) || inputs !== hostSourceFingerprint(repo)) throw new Error('Host inputs or output changed during rebuild; rebuild again');
    await writeHostReceipt(repo, workspace, 'complete', inputs, path.basename(runtime));
  } catch (error) {
    if (started) await writeHostReceipt(repo, workspace, 'failed', inputs);
    throw error;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}

/** Core and embedded rebuilds never write installed product sources. */
export async function rebuildHost(repo: string, workspace: string, ctx: JobContext, options: RebuildOptions = {}): Promise<HostFreshness> {
  if (options.coreOnly && options.pluginsOnly) throw new Error('Choose core-only or plugins-only, not both');
  const cmake = options.cmake ?? findCmake();
  if (!cmake) throw new Error('cmake not found (install Visual Studio with Desktop development with C++, including CMake)');
  const generator = options.generator ?? visualStudioGenerator(cmake);
  ctx.line(`using ${generator} (${cmake})`);
  if (!options.pluginsOnly) await rebuildCoreHost(repo, workspace, ctx, cmake, generator);
  if (!options.coreOnly) await rebuildNativePlugins(repo, workspace, ctx, cmake, generator, options.includeDisabled);
  return resolvedHostFreshness(repo, workspace, options.coreOnly);
}

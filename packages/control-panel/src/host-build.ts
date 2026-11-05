// xrb-host and plugin freshness and rebuild (design D9). A package built from a stale host exe is
// what broke a station test once, so the panel compares each build with its sources. Plugins live in
// the user's workspace (plugins/<name>/CMakeLists.txt, or plugins/<name>/runtime/ for a plugin that also
// has a Node part): separate CMake projects, built against the core's plugin SDK and installed into the
// plugin's own bin/ folder (plugins/<name>/bin/), which the host gets with one --plugin-dir= each.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { JobContext } from './jobs.ts';
import { readPluginPrefs } from './plugin-manager.ts';

export const PLUGIN_BUILD_SUCCESS = '.xrb-last-successful-build';

export async function recordPluginBuildSuccess(buildDir: string): Promise<void> {
  await fs.writeFile(path.join(buildDir, PLUGIN_BUILD_SUCCESS), `${new Date().toISOString()}\n`, 'utf8');
}

export interface HostFreshness {
  exe: string;
  exists: boolean;
  exeMs: number | null;
  newestSource: string | null;
  newestSourceMs: number | null;
  outdated: boolean;
  /** workspace plugins/<dir> builds; an outdated one makes the whole host outdated */
  plugins: PluginFreshness[];
  /**
   * Plugins installed next to the exe by a build from before the workspace: the host finds them first
   * and refuses the workspace's copies as duplicates. A rebuild removes them.
   */
  staleHostPlugins: string[];
}

export interface PluginFreshness {
  dir: string;
  built: boolean;
  newestSource: string | null;
  outdated: boolean;
}

export function hostPaths(repo: string) {
  const hostDir = path.join(repo, 'native', 'host');
  const buildDir = path.join(hostDir, 'build');
  return {
    hostDir,
    buildDir,
    releaseDir: path.join(buildDir, 'Release'),
    exe: path.join(buildDir, 'Release', 'xrb-host.exe'),
    sources: [path.join(hostDir, 'src'), path.join(hostDir, 'CMakeLists.txt'), path.join(repo, 'native', 'plugin-sdk', 'include')],
  };
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
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return null;
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

export function hostFreshness(repo: string, workspace: string): HostFreshness {
  const hp = hostPaths(repo);
  const exeSt = statSync(hp.exe, { throwIfNoEntry: false });
  // A build that changed nothing in the exe (e.g. only a copy step in CMakeLists.txt) does not
  // relink it; MSBuild's last-build stamp says the build ran after that source change. A failed
  // build (a link refused while the host runs) writes the stamp too, but leaves an
  // "unsuccessfulbuild" marker next to it until a build succeeds: the stamp then means nothing.
  const tlog = path.join(hp.buildDir, 'xrb-host.dir', 'Release', 'xrb-host.tlog');
  const failed = !!statSync(path.join(tlog, 'unsuccessfulbuild'), { throwIfNoEntry: false });
  const stamp = failed ? null : statSync(path.join(tlog, 'xrb-host.lastbuildstate'), { throwIfNoEntry: false });
  const builtMs = exeSt ? Math.max(exeSt.mtimeMs, stamp?.mtimeMs ?? 0) : null;
  const src = newestOf(hp.sources);
  const plugins = pluginProjects(workspace, repo).map((p) => pluginFreshness(workspace, p));
  const hostOutdated = builtMs === null || (!!src && src.ms > builtMs);
  const staleHostPlugins = staleHostPluginDirs(repo);
  return {
    exe: hp.exe,
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

/** Plugin folders left in <host build>/plugins (see HostFreshness.staleHostPlugins). */
export function staleHostPluginDirs(repo: string): string[] {
  const dir = path.join(hostPaths(repo).releaseDir, 'plugins');
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
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
}

const providerCache = new Map<string, ProviderList>();

/** Parses the `@plugins {json}` line of `xrb-host --list-plugins` (log lines share stdout). */
export function parseProviderList(stdout: string): ProviderList {
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith('@plugins '));
  if (!line) return { providers: [], rejected: [], error: 'xrb-host --list-plugins printed no @plugins line' };
  const j = JSON.parse(line.slice('@plugins '.length)) as { plugins?: ProviderInfo[]; rejected?: { path: string; reason: string }[] };
  return { providers: j.plugins ?? [], rejected: j.rejected ?? [], error: null };
}

/** The providers the built host offers: its built-ins and the workspace's plugins. Cached until the exe or a plugin changes. */
export async function listProviders(repo: string, workspace: string, includeDisabled = false): Promise<ProviderList> {
  const hp = hostPaths(repo);
  const exe = statSync(hp.exe, { throwIfNoEntry: false });
  if (!exe) return { providers: [], rejected: [], error: 'xrb-host.exe is not built' };
  const bins = pluginBinDirs(workspace, includeDisabled ? [] : (await readPluginPrefs(workspace)).disabled);
  const key = [exe.mtimeMs, ...bins.map((b) => `${b}:${newest(b)?.ms ?? 0}`), newest(path.join(hp.releaseDir, 'plugins'))?.ms ?? 0].join('|');
  if (providerCache.has(key)) return providerCache.get(key)!;
  const stdout = await new Promise<string>((resolve) => {
    try {
      execFile(hp.exe, ['--list-plugins', ...bins.map((b) => `--plugin-dir=${b}`)], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (_err, out) => resolve(String(out ?? '')));
    } catch {
      resolve('');  // not a runnable exe (a broken build): no providers, reported below
    }
  });
  let list: ProviderList;
  try {
    list = parseProviderList(stdout);
  } catch (e) {
    list = { providers: [], rejected: [], error: `cannot read xrb-host --list-plugins: ${(e as Error).message}` };
  }
  if (!list.error) {
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

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

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

/** The rebuild job: the host, then every workspace plugin (each installs itself into its own bin/). */
export async function rebuildHost(repo: string, workspace: string, ctx: JobContext): Promise<HostFreshness> {
  const hp = hostPaths(repo);
  const cmake = findCmake();
  if (!cmake) throw new Error('cmake not found (install Visual Studio with Desktop development with C++, including CMake)');
  const generator = visualStudioGenerator(cmake);
  ctx.line(`using ${generator} (${cmake})`);
  await cmakeBuild(cmake, generator, hp.hostDir, hp.buildDir, ctx);
  const stale = staleHostPluginDirs(repo);
  if (stale.length) {
    // Build output of an older layout, not sources: each workspace plugin's bin/ replaces it.
    ctx.line(`removing plugins installed next to the host by an older build (${stale.join(', ')}): workspace plugins install into their own bin/`);
    await fs.rm(path.join(hp.releaseDir, 'plugins'), { recursive: true, force: true });
  }
  for (const p of pluginProjects(workspace, repo)) {
    ctx.line(`plugin ${p.dir}`);
    await cmakeBuild(cmake, generator, p.sourceDir, p.buildDir, ctx, pluginCmakeVars(repo, workspace, p.dir.split('/')[0]));
    await recordPluginBuildSuccess(p.buildDir);
  }
  return hostFreshness(repo, workspace);
}

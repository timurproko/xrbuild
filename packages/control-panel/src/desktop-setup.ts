// Explicit desktop prerequisites. Probes are read-only; HTTP supplies action IDs, never commands.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildToolInstances, findCmake, nativeToolRoots, resolvedHostFreshness } from './host-build.ts';
import { installNativeDependencies, nativeDependencyStatus, type NativeDependencyStatus } from './native-dependencies.ts';
import { assertWritablePath } from './project-access.ts';
import { validateHostCache } from './host-artifacts.ts';
import { dataDir } from './env.ts';
import { HttpError } from './http.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { installBuildToolsDirect, systemPowerShell } from './desktop-installer.ts';

export type DesktopSetupAction = 'toolchain' | 'native-deps';
export interface DesktopTools { cmake: string | null; compiler: string | null; sdk: string | null; manager: string | null; generator?: string; directInstaller?: boolean }
export interface DesktopSetupStep { id: string; label: string; state: 'ready' | 'missing' | 'blocked' | 'installing' | 'restart-required'; detail: string; action: DesktopSetupAction | null }
export interface DesktopSetupStatus { revision: string; steps: DesktopSetupStep[]; canBuild: boolean; busy: boolean; supported: boolean }
/** The trusted manager retains its package hash checks. No shell or arbitrary installation input. */
export function desktopInstallerArgs(): string[] {
  return ['install', '--id', 'Microsoft.VisualStudio.2022.BuildTools', '--exact', '--source', 'winget', '--force', '--silent', '--disable-interactivity', '--accept-source-agreements', '--accept-package-agreements', '--override',
    '--wait --quiet --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.CMake.Project --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --includeRecommended'];
}
/** Includes the package manager's public HRESULT wrappers around native restart outcomes. */
export function desktopInstallerNeedsRestart(code: number): boolean {
  return [3010, 1641, 0x8A150109, 0x8A15010A, 0x8A15010B].includes(code >>> 0);
}
export async function probeDesktopTools(): Promise<DesktopTools> {
  if (process.platform !== 'win32') return { cmake: null, compiler: null, sdk: null, manager: null };
  const compilers: Array<{ file: string; major: number }> = [];
  let sdk: string | null = null, manager: string | null = null;
  for (const instance of buildToolInstances().filter(instance => instance.major >= 17)) {
    const root = path.join(instance.root, 'VC/Tools/MSVC');
    if (!existsSync(root)) continue;
    for (const version of readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const candidate = path.join(root, version, 'bin/Hostx64/x64/cl.exe');
      if (existsSync(candidate)) { compilers.push({ file: candidate, major: instance.major }); break; }
    }
  }
  let generators = new Set<number>();
  let generatorNames: string[] = [];
  const cmake = findCmake(candidate => {
    try {
      const version = /cmake version (\d+)\.(\d+)/.exec(execFileSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }));
      if (!version || Number(version[1]) < 3 || Number(version[1]) === 3 && Number(version[2]) < 21) return false;
      const help = execFileSync(candidate, ['--help'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const supported = new Set([...help.matchAll(/Visual Studio (\d+) \d+/g)].map(match => Number(match[1])));
      if (![...supported].some(major => major >= 17) || compilers.length && !compilers.some(compiler => supported.has(compiler.major))) return false;
      generators = supported; generatorNames = [...help.matchAll(/Visual Studio \d+ \d+/g)].map(match => match[0]); return true;
    } catch { return false; }
  });
  const selectedCompiler = compilers.find(compiler => !cmake || generators.has(compiler.major));
  const compiler = selectedCompiler?.file ?? null;
  const generator = cmake && selectedCompiler ? generatorNames.find(name => name.startsWith(`Visual Studio ${selectedCompiler.major} `)) : undefined;
  const sdkRoots = [...nativeToolRoots().map(root => path.join(root, 'Windows Kits/10')), ...(process.env.WindowsSdkDir ? [process.env.WindowsSdkDir] : [])];
  for (const root of sdkRoots) {
    const include = path.join(root, 'Include'); if (!existsSync(include)) continue;
    for (const version of readdirSync(include).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      if (existsSync(path.join(include, version, 'um/Windows.h')) && existsSync(path.join(include, version, 'shared/sdkddkver.h')) && existsSync(path.join(root, 'Lib', version, 'um/x64/kernel32.lib'))) { sdk = path.join(root, version); break; }
    }
    if (sdk) break;
  }
  if (process.env.LOCALAPPDATA) {
    const candidate = path.join(process.env.LOCALAPPDATA, 'Microsoft/WindowsApps/winget.exe');
    if (existsSync(candidate)) {
      try {
        const version = /v?(\d+)\.(\d+)/.exec(execFileSync(candidate, ['--version'], { timeout: 5000, windowsHide: true, encoding: 'utf8' }));
        if (version && (Number(version[1]) > 1 || Number(version[1]) === 1 && Number(version[2]) >= 8)) manager = candidate;
      } catch { /* Manual setup remains available. */ }
    }
  }
  return { cmake, compiler, sdk, manager, generator, directInstaller: existsSync(systemPowerShell()) };
}
export interface DesktopSetupDependencies {
  tools(): Promise<DesktopTools>;
  libraries(): Promise<NativeDependencyStatus>;
  runtime(): Promise<{ exists: boolean; outdated: boolean; hostProblem?: string | null }>;
  installLibraries(ctx: JobContext): Promise<void>;
  installToolchain(ctx: JobContext): Promise<number>;
  run(command: string, args: string[], line: (text: string) => void): Promise<number>;
  bootTime(): number;
  platform: string;
  storage: string;
}
export class DesktopSetup {
  readonly core: string;
  readonly workspace: string;
  readonly deps: DesktopSetupDependencies;
  private installing: DesktopSetupAction | null = null;
  constructor(core: string, workspace: string, dependencies: Partial<DesktopSetupDependencies> = {}) {
    this.core = core; this.workspace = workspace;
    this.deps = { tools: probeDesktopTools, libraries: () => nativeDependencyStatus(core, workspace), runtime: () => resolvedHostFreshness(core, workspace, true),
      installLibraries: ctx => installNativeDependencies(core, workspace, ctx), run: (command, args, line) => runProcess(command, args, line, { cwd: core, windowsHide: true }),
      bootTime: () => Date.now() - os.uptime() * 1000, platform: process.platform, storage: path.join(dataDir(), 'desktop-setup'), ...dependencies,
      installToolchain: dependencies.installToolchain ?? (ctx => installBuildToolsDirect(core, this.deps.storage, ctx)) };
  }
  private async restartPending(): Promise<boolean> {
    const file = path.join(this.deps.storage, 'restart.json');
    assertWritablePath(this.core, this.deps.storage, file);
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return false;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw new Error('Unsafe desktop setup restart record; preserve and review it');
    let marker: { version?: number; installedMs?: number };
    try { marker = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch { throw new Error('Invalid desktop setup restart record; preserve and review it'); }
    if (!marker || Object.keys(marker).some(key => !['version', 'installedMs'].includes(key)) || marker.version !== 1 || typeof marker.installedMs !== 'number' || !Number.isFinite(marker.installedMs) || marker.installedMs <= 0) throw new Error('Invalid desktop setup restart record; preserve and review it');
    return this.deps.bootTime() < marker.installedMs;
  }
  async isBusy(): Promise<boolean> {
    const lock = await fs.lstat(path.join(this.deps.storage, 'setup.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    return !!this.installing || !!lock;
  }
  async check(): Promise<DesktopSetupStatus> {
    const supported = this.deps.platform === 'win32';
    let toolProblem = '';
    const emptyTools: DesktopTools = { cmake: null, compiler: null, sdk: null, manager: null };
    const [tools, libraries, runtime] = await Promise.all([
      supported ? Promise.resolve().then(() => this.deps.tools()).catch(error => { toolProblem = `Cannot inspect desktop tools: ${(error as Error).message}`; return emptyTools; }) : Promise.resolve(emptyTools),
      this.deps.libraries(), this.deps.runtime().catch(error => ({ exists: false, outdated: true, hostProblem: `Cannot inspect host runtime: ${(error as Error).message}` })),
    ]);
    let restart = false, restartProblem = '';
    try { restart = await this.restartPending(); } catch (error) { restartProblem = (error as Error).message; }
    let busy = false;
    try { busy = await this.isBusy(); }
    catch { busy = true; restartProblem = 'Cannot inspect the desktop setup lock; review access permissions before installing.'; }
    const tool = (id: string, label: string, value: string | null): DesktopSetupStep => ({ id, label,
      state: this.installing === 'toolchain' ? 'installing' : !supported || toolProblem || restartProblem ? 'blocked' : restart ? 'restart-required' : value ? 'ready' : tools.manager || tools.directInstaller ? 'missing' : 'blocked',
      detail: !supported ? 'Desktop builds require Windows; browser-only use does not.' : toolProblem || restartProblem || (restart ? 'Restart Windows when convenient, then refresh this checklist. No automatic reboot.' : value ?? (tools.manager || tools.directInstaller ? 'Install the desktop build-tools workload.' : 'Automatic setup is unavailable on this PC.')),
      action: supported && (tools.manager || tools.directInstaller) && !restart && !restartProblem && !toolProblem ? 'toolchain' : null });
    const steps: DesktopSetupStep[] = [tool('cmake', 'CMake 3.21+', tools.cmake), tool('compiler', 'C++ build tools', tools.compiler), tool('sdk', 'Desktop SDK', tools.sdk),
      { id: 'native-deps', label: 'Core native libraries', state: this.installing === 'native-deps' ? 'installing' : libraries.ready ? 'ready' : libraries.blocked ? 'blocked' : 'missing', detail: libraries.problem ?? 'Pinned native libraries are ready.', action: supported && !libraries.blocked ? 'native-deps' : null },
      { id: 'runtime', label: 'Host runtime', state: runtime.exists && !runtime.outdated && !runtime.hostProblem ? 'ready' : 'missing', detail: runtime.hostProblem ?? (runtime.exists ? 'Rebuild to update the desktop host.' : 'Build the desktop host after prerequisites are ready.'), action: null }];
    const canBuild = supported && !busy && steps.slice(0, 4).every(step => step.state === 'ready');
    const revision = createHash('sha256').update(JSON.stringify({ supported, steps, libraries: libraries.revision, manager: tools.manager, directInstaller: !!tools.directInstaller, generator: tools.generator, busy })).digest('hex');
    return { revision, steps, canBuild, busy, supported };
  }
  async install(action: unknown, revision: unknown, confirm: unknown, ctx: JobContext): Promise<{ restartRequired: boolean; status: DesktopSetupStatus }> {
    if (confirm !== true) throw new HttpError(400, 'Confirm the download, provider licenses and system changes before installing');
    if (action !== 'toolchain' && action !== 'native-deps') throw new HttpError(400, 'Unknown desktop setup action');
    const before = await this.check();
    if (!before.supported) throw new HttpError(409, 'Desktop installation is supported only on Windows');
    if (typeof revision !== 'string' || revision !== before.revision) throw new HttpError(409, 'Desktop setup changed; refresh the checklist before installing');
    if (before.busy) throw new HttpError(409, 'Desktop setup lock exists; wait or verify the previous installer stopped');
    if (!before.steps.some(step => step.action === action && step.state === 'missing')) throw new HttpError(409, 'This setup step is already ready, blocked or requires a restart; refresh the checklist');
    await validateHostCache(this.core, this.deps.storage, false, true);
    assertWritablePath(this.core, this.deps.storage);
    await fs.mkdir(this.deps.storage, { recursive: true });
    const lockFile = path.join(this.deps.storage, 'setup.lock');
    const lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => { if (error.code === 'EEXIST') throw new HttpError(409, 'Desktop setup lock exists; no lock was removed'); throw error; });
    let restartRequired = false;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, action, startedMs: Date.now() }));
      this.installing = action;
      if (action === 'toolchain') {
        const tools = await this.deps.tools();
        if (!tools.manager && !tools.directInstaller) throw new Error('Automatic setup is unavailable on this PC.');
        ctx.line('Installing the desktop C++ workload, CMake and SDK. A trusted administrator prompt may appear.');
        ctx.line('Large downloads and provider license acceptance were explicitly confirmed. Automatic reboot is disabled.');
        const code = tools.manager
          ? await this.deps.run(tools.manager, desktopInstallerArgs(), text => ctx.line(text.slice(0, 16384)))
          : await this.deps.installToolchain(ctx);
        restartRequired = desktopInstallerNeedsRestart(code);
        if (code !== 0 && (code >>> 0) !== 0x8A15010D && !restartRequired) throw new Error(`Desktop tool installer exited with code ${code}. Review the output and retry explicitly.`);
        if (restartRequired) {
          const file = path.join(this.deps.storage, 'restart.json'), temp = `${file}.${randomUUID()}.tmp`;
          await this.restartPending(); // Refuse unsafe pre-existing records before replacement.
          assertWritablePath(this.core, this.deps.storage, file);
          await fs.writeFile(temp, JSON.stringify({ version: 1, installedMs: Date.now() }), { flag: 'wx', mode: 0o600 });
          await fs.rename(temp, file);
          ctx.line('Restart Windows when convenient, then refresh Desktop setup. No reboot was requested.');
        }
      } else await this.deps.installLibraries(ctx);
    } finally {
      this.installing = null;
      const owned = await lock.stat(); await lock.close();
      const current = await fs.lstat(lockFile);
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== owned.ino || current.dev !== owned.dev) throw new Error('Desktop setup lock ownership changed; preserve it for review');
      await fs.unlink(lockFile);
    }
    const status = await this.check();
    const targets = status.steps.filter(step => action === 'native-deps' ? step.id === 'native-deps' : ['cmake', 'compiler', 'sdk'].includes(step.id));
    if (!restartRequired && targets.some(step => step.state !== 'ready')) throw new Error('Setup finished but readiness checks still fail. Complete the installer or restart the panel, then refresh the checklist.');
    ctx.line(restartRequired ? 'Setup requires a Windows restart.' : 'Setup completed and readiness checks passed.');
    return { restartRequired, status };
  }
}

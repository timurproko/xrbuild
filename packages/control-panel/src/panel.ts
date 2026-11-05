// The panel's services behind the HTTP routes: jobs (web build, package build, host rebuild,
// icon render), the built package list, the host runner, and quitting.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readAppSettings, saveAppSettings } from './app-settings.ts';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultIcon } from '../../app-icon/src/icon.ts';
import { finalizeBrowserBuild } from './browser-build.ts';
import { log } from './env.ts';
import { hostFreshness, hostPaths, listProviders, pluginBinDirs, rebuildHost } from './host-build.ts';
import { panelFreshness, panelSourceRoots, type PanelFreshness } from './panel-freshness.ts';
import { HostRunner, type RunMode } from './host-runner.ts';
import { effectiveSettings, pluginFolders, pluginIcon, pluginMeta, readPluginPrefs, savePluginPrefs, validateSettings, type PluginMeta } from './plugin-manager.ts';
import { HttpError, readJson, sendJson, type EventHub } from './http.ts';
import { JobRefused, JobRunner, runProcess, type Job, type JobContext } from './jobs.ts';
import { discoverPackagers, packagerFor, platformsFor, targetOf, validSetupStatus, type BuildTarget, type IdentityField, type PackagerDiscovery, type PackagerSetupStatus, type RoleSelection } from './packagers.ts';
import { PackageList } from './packages.ts';
import { ARCHIVE, buildTargetOf, compareVersions, defaultEntry, discoverAll, isArchivedId, liveId, MANIFEST, MoveRefused, nextVersion, PROJECTS, saveManifest, selectionOf, validateManifest, type FieldError, type Manifest, type Project } from './projects.ts';
import { archiveProject, removeEmptyProjectSection, unarchiveProject } from './layout.ts';
import { discoverPublishers, normalizeReleaseCatalog, publicationUrl, publisherFor, releaseIdProblem, type PublicationCard, type PublicationIdentity, type Publisher, type PublisherDiscovery, type PublisherReleaseCatalog, type PublisherStatus } from './publishers.ts';
import { compareVersions as compareReleaseVersions, highestVersion, publicationCard, publicationIdentity, receiptMatchesOutput, suggestedVersion, verifyBuildReceipt, versionProblem, writeBuildReceipt, type PublicationConfig } from './publication.ts';
import { importPluginSample, ProjectRefused } from './workspace.ts';

/** Providers compiled into xrb-host: never shipped as plugin folders. */
const BUILTIN_PROVIDERS = new Set(['desktop', 'none', 'mouse', 'keyboard', 'replay', 'simulated']);
const TARGET_LABEL: Record<BuildTarget, string> = { host: 'Desktop', webxr: 'WebXR' };

/** Resolves the requesting browser and starts one panel-owned preview window on the selected monitor. */
export function launchPreviewBrowser(url: string, clientPort: number, monitor: number, fullscreen: boolean, execute: typeof execFile = execFile, start: typeof spawn = spawn): Promise<ChildProcess> {
  if (!Number.isInteger(clientPort) || clientPort < 1 || clientPort > 65535) return Promise.reject(new Error('cannot identify the requesting browser'));
  const screen = Number.isInteger(monitor) && monitor >= 0 && monitor <= 255 ? monitor : 0;
  const script = [
    `$p = Get-NetTCPConnection -State Established -LocalPort ${clientPort} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess;`,
    'if ($p) {',
    '  $exe = (Get-CimInstance Win32_Process -Filter "ProcessId = $p").ExecutablePath;',
    '  Add-Type -AssemblyName System.Windows.Forms;',
    '  $all = @([System.Windows.Forms.Screen]::AllScreens);',
    '  $ordered = @($all | Where-Object Primary) + @($all | Where-Object { -not $_.Primary } | Sort-Object DeviceName);',
    `  $i = if (${screen} -lt $ordered.Count) { ${screen} } else { 0 };`,
    '  $bounds = $ordered[$i].Bounds; $primary = $ordered[0].Bounds;',
    // Screen.Bounds can mix physical origins with effective sizes on mixed-DPI desktops. Chromium expects effective coordinates.
    '  $horizontal = @($all | Where-Object { $_.Bounds.Y -lt ($bounds.Y + $bounds.Height) -and ($_.Bounds.Y + $_.Bounds.Height) -gt $bounds.Y });',
    '  $vertical = @($all | Where-Object { $_.Bounds.X -lt ($bounds.X + $bounds.Width) -and ($_.Bounds.X + $_.Bounds.Width) -gt $bounds.X });',
    '  $left = if ($bounds.X -gt $primary.X) { ($horizontal | Where-Object { $_.Bounds.X -ge $primary.X -and $_.Bounds.X -lt $bounds.X } | ForEach-Object { $_.Bounds.Width } | Measure-Object -Sum).Sum } elseif ($bounds.X -lt $primary.X) { -($horizontal | Where-Object { $_.Bounds.X -ge $bounds.X -and $_.Bounds.X -lt $primary.X } | ForEach-Object { $_.Bounds.Width } | Measure-Object -Sum).Sum } else { 0 };',
    '  $top = if ($bounds.Y -gt $primary.Y) { ($vertical | Where-Object { $_.Bounds.Y -ge $primary.Y -and $_.Bounds.Y -lt $bounds.Y } | ForEach-Object { $_.Bounds.Height } | Measure-Object -Sum).Sum } elseif ($bounds.Y -lt $primary.Y) { -($vertical | Where-Object { $_.Bounds.Y -ge $bounds.Y -and $_.Bounds.Y -lt $primary.Y } | ForEach-Object { $_.Bounds.Height } | Measure-Object -Sum).Sum } else { 0 };',
    '  [PSCustomObject]@{ executable = $exe; left = $left; top = $top; width = $bounds.Width; height = $bounds.Height } | ConvertTo-Json -Compress;',
    '}',
  ].join(' ');
  return new Promise((resolve, reject) => {
    execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (error, stdout) => {
      let resolved: { executable?: string; left?: number; top?: number; width?: number; height?: number } | null = null;
      try { resolved = JSON.parse(String(stdout ?? '').trim()); } catch { /* handled below */ }
      const executable = resolved?.executable?.trim();
      if (error || !executable) return reject(new Error('cannot identify the requesting browser executable or display'));
      try {
        const profile = path.join(os.tmpdir(), `xr-build-preview-${randomUUID()}`);
        const screenLeft = Math.trunc(Number(resolved?.left) || 0), screenTop = Math.trunc(Number(resolved?.top) || 0);
        const screenWidth = Math.max(320, Math.trunc(Number(resolved?.width) || 1520)), screenHeight = Math.max(240, Math.trunc(Number(resolved?.height) || 856));
        // Windowed browser previews match the native host's 1520 x 856 outer target, while retaining
        // a safety margin when the selected display is smaller.
        const width = fullscreen ? screenWidth : Math.max(320, Math.min(1520, screenWidth - 80));
        const height = fullscreen ? screenHeight : Math.max(240, Math.min(856, screenHeight - 80));
        const left = fullscreen ? screenLeft : screenLeft + Math.floor((screenWidth - width) / 2);
        const top = fullscreen ? screenTop : screenTop + Math.floor((screenHeight - height) / 2);
        const firefox = path.basename(executable).toLowerCase().startsWith('firefox');
        const geometry = firefox
          ? ['--left', String(left), '--top', String(top), '--width', String(width), '--height', String(height)]
          : [`--window-position=${left},${top}`, `--window-size=${width},${height}`];
        const args = firefox
          ? ['--new-instance', '--profile', profile, ...geometry, fullscreen ? '--kiosk' : '--new-window', url]
          : [`--user-data-dir=${profile}`, '--no-first-run', '--new-window', ...geometry, ...(fullscreen ? ['--kiosk'] : []), url];
        // Hiding a GUI subprocess leaves Chromium's DWM surface blank even though its WebGL page is running.
        const child = start(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.once('exit', () => setTimeout(() => void fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {}), 1_000));
        resolve(child);
      } catch (launchError) { reject(launchError); }
    });
  });
}
const APP_ICON = path.join('packages', 'app-icon', 'src', 'cli.ts');
const OPEN_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-folder.ps1');
const RECYCLE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recycle.ps1');

const jobSummary = (j: Job) => ({ ...j, lines: undefined });

/** Release support of the selected publisher as the UI sees it (`publication.releases`). */
export interface PublicationReleases {
  supported: true;
  /** last known catalog from the publisher; null before the first read or while unavailable */
  catalog: PublisherReleaseCatalog | null;
  error: string | null;
  /** the draft to show: the saved draft while it still exceeds retained history, else the suggestion */
  nextVersion: string;
  suggestedVersion: string;
}

/** Publication belongs to the standalone WebXR choice; headset platforms only consume its saved route. */
/** Deploying app output is independent of the chosen package target/platform. */
function publicationTargetOf(m: Manifest): boolean {
  return m.kind === 'app';
}

function packageIdentityOf(m: Manifest, platform: string, fields: readonly IdentityField[], version?: string): Record<string, string> {
  const identity = Object.fromEntries(Object.entries(m.plugins?.[platform] ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  if (fields.some((field) => field.key === 'title') && !identity.title) identity.title = m.name;
  if (fields.some((field) => field.key === 'version') && !identity.version) identity.version = version ?? '0.1.0';
  const idField = fields.find((field) => field.key === 'id' && field.deriveStyle);
  if (idField && !identity.id) {
    const title = identity.title ?? m.name;
    if (idField.deriveStyle === 'filename') identity.id = `${idField.prefix ?? ''}${title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/g, '')}`;
    else {
      const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
      identity.id = `${idField.prefix ?? ''}${/^[a-z]/.test(name) ? name : `app_${name}`}`;
    }
  }
  return identity;
}

/** Whether and how a project can be packaged (shown by the UI, enforced by packageBuild). */
export interface Packaging {
  available: boolean;
  /** Manifest plugin section that stores package identity. */
  platform: string;
  /** Folder under workspace builds/ and build/ for this package type. */
  channel: string;
  packager: string | null;
  setupSupported?: boolean;
  /** identity fields the packager declares */
  fields: IdentityField[];
  /** the packager's complaints about the project's identity, as manifest fields (package.<key>) */
  errors: FieldError[];
  /** why packaging is unavailable */
  reason: string | null;
}

const normalizedLock = (value: string) => value.replace(/\r\n/g, '\n');
const PACKAGE_GRAPH_STAMP = path.join('node_modules', '.xrb-package-graph');
const PACKAGE_GRAPH_IGNORED = new Set(['.git', 'node_modules', 'dist', 'build', 'builds', 'third_party']);
async function packageGraphFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string, rel = ''): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })) {
      if (PACKAGE_GRAPH_IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      const next = path.join(rel, entry.name);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), next);
      else if (entry.name === 'package.json' || (!rel && entry.name === 'pnpm-workspace.yaml')) files.push(next);
    }
  };
  await walk(root);
  return files.sort();
}
async function packageGraphFingerprint(root: string, files?: string[]): Promise<string> {
  files ??= await packageGraphFiles(root);
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.split(path.sep).join('/')).update('\0').update(await fs.readFile(path.join(root, file))).update('\0');
  return hash.digest('hex');
}
async function packageLinksReady(root: string, files: string[]): Promise<boolean> {
  for (const file of files) {
    if (path.basename(file) !== 'package.json' || path.dirname(file) === '.') continue;
    const manifest = JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) as Record<string, unknown>;
    const needsLinks = ['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => Object.keys(manifest[key] as Record<string, unknown> ?? {}).length > 0);
    if (needsLinks && !await fs.access(path.join(root, path.dirname(file), 'node_modules')).then(() => true, () => false)) return false;
  }
  return true;
}
async function writePackageGraphStamp(root: string): Promise<void> {
  const file = path.join(root, PACKAGE_GRAPH_STAMP);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${await packageGraphFingerprint(root)}\n`, 'utf8');
}
export async function packageGraphReady(root: string): Promise<boolean> {
  if (!await fs.access(path.join(root, 'node_modules')).then(() => true, () => false)) return false;
  const lock = await fs.readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (lock !== null) {
    const installed = await fs.readFile(path.join(root, 'node_modules', '.pnpm', 'lock.yaml'), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (installed === null || normalizedLock(lock) !== normalizedLock(installed)) return false;
  }
  const stamp = await fs.readFile(path.join(root, PACKAGE_GRAPH_STAMP), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  const files = await packageGraphFiles(root);
  return stamp?.trim() === await packageGraphFingerprint(root, files) && await packageLinksReady(root, files);
}

export class Panel {
  readonly jobs = new JobRunner();
  readonly runner = new HostRunner();
  readonly packages: PackageList;
  readonly hub: EventHub;
  /** the core repo (host build, templates) */
  readonly repo: string;
  /** the private integration workspace (plugins, dependencies, packages and generated state) */
  readonly workspace: string;
  /** project repository root (projects, layout and app package workspace) */
  readonly projects: string;
  /** User workspaces created by the panel may create their initial lockfile on first install. */
  readonly bootstrapPackageLock: boolean;
  /** packager plugins found in the workspace (loadPackagers) */
  packagers: PackagerDiscovery = { found: [], problems: [] };
  /** publisher plugins found in the workspace (loadPublishers) */
  publishers: PublisherDiscovery = { found: [], problems: [] };
  /** last status and release catalog per publisher and publication (publisher \n id \n slug); see cachedStatus */
  private readonly publicationStatuses = new Map<string, { status: PublisherStatus | null; catalog: PublisherReleaseCatalog | null; catalogError: string | null; checkedMs: number; refresh: Promise<void> | null }>();
  /** a cached status older than this is refreshed in the background */
  publicationStatusMaxAgeMs = 15_000;
  /** tests: wait for a refresh instead of answering from the cache */
  awaitPublicationStatus = false;
  /** Opaque identity for this running panel instance; restart recovery waits for it to change. */
  readonly instanceId = randomUUID();
  /** loopback URL supplied to panel-launched native apps for local workspace navigation */
  panelUrl: string | null = null;
  /** when this process started: code changed on disk after it needs a restart (panelFreshness) */
  startedMs = Math.floor(performance.timeOrigin);
  /** the last panel freshness scan, reused briefly so several open pages do not repeat it */
  private freshness: { value: PanelFreshness; checkedMs: number } | null = null;
  freshnessMaxAgeMs = 5_000;
  onQuit: () => void = () => {};
  onRestart: () => void = () => {};
  launchBrowser: typeof launchPreviewBrowser = launchPreviewBrowser;
  private previewProjection: { route: string; token: string; session: string; fullscreen: boolean; projection: 'perspective' | 'orthographic' } | null = null;

  constructor(repo: string, workspace: string, hub: EventHub, projects = workspace, bootstrapPackageLock = false) {
    this.repo = repo;
    this.workspace = workspace;
    this.projects = projects;
    this.bootstrapPackageLock = bootstrapPackageLock;
    this.hub = hub;
    this.packages = new PackageList(path.join(workspace, 'builds'));
    this.jobs.on('change', (j: Job) => {
      hub.send('job', jobSummary(j));
      const finished = j.state === 'done' || j.state === 'failed';
      if (finished && j.kind === 'publication') for (const entry of this.publicationStatuses.values()) entry.checkedMs = 0;
      if (finished) hub.send('projects-changed', { projectId: j.projectId });
    });
    this.jobs.on('line', (j: Job, text: string) => hub.send('job-line', { id: j.id, text }));
    this.runner.on('state', (s) => {
      hub.send('run', s);
      hub.send('projects-changed', { projectId: s.projectId });
    });
    this.runner.on('status', (s) => hub.send('status', s));
    this.runner.on('log', (text) => hub.send('run-log', text));
  }

  private startJob(...args: Parameters<JobRunner['start']>): Job {
    try {
      const job = this.jobs.start(...args);
      log(`[job ${job.id}] ${job.title}`);
      void this.jobs.wait(job).then((j) => log(`[job ${j.id}] ${j.state}${j.error ? `: ${j.error}` : ''}`));
      return job;
    } catch (e) {
      if (e instanceof JobRefused) throw new HttpError(409, e.message);
      throw e;
    }
  }

  private manifestOf(p: Project): Manifest {
    if (!p.manifest) throw new HttpError(409, `${p.id}: the manifest has errors`, p.errors);
    return p.manifest;
  }

  private entryOf(p: Project, m: Manifest): string {
    return path.resolve(p.dir, m.entry ?? defaultEntry(m.kind));
  }

  /** Re-reads the project (its manifest may have changed during a job) and applies `change`. */
  private async updateManifest(projectId: string, change: (m: Manifest) => Manifest): Promise<void> {
    const p = (await discoverAll(this.projects)).find((x) => x.id === projectId);
    if (!p?.manifest) return;
    const next = change(p.manifest);
    if (validateManifest(next, p.dir).length) return;
    await saveManifest(p.dir, next, p.manifestMtimeMs);
  }

  /** Disabled plugins stay in the manifest, but runs and packages use available alternatives. */
  private async effectiveSelection(m: Manifest): Promise<RoleSelection> {
    const prefs = await readPluginPrefs(this.workspace);
    const disabled = new Set(prefs.disabled);
    const all = await listProviders(this.repo, this.workspace, true);
    for (const provider of all.providers) {
      if (provider.path && prefs.disabled.includes(path.relative(path.join(this.workspace, 'plugins'), provider.path).split(path.sep)[0]))
        disabled.add(provider.name);
    }
    for (const folder of prefs.disabled)
      for (const prefix of ['input-', 'display-', 'platform-'])
        if (folder.startsWith(prefix)) disabled.add(folder.slice(prefix.length));
    const selected = selectionOf(m);
    const inputs = (selected.inputs ?? []).filter((name) => !disabled.has(name));
    return { ...selected, input: inputs.find((name) => name !== 'mouse' && name !== 'keyboard') ?? 'none', inputs,
      display: disabled.has(selected.display) ? 'desktop' : selected.display,
      platform: disabled.has(selected.platform) ? '' : selected.platform };
  }

  private async runtimeConfig(m: Manifest, selection: RoleSelection, desktop?: { fullscreen: boolean; monitor: number }): Promise<RoleSelection & { plugins: Record<string, unknown> }> {
    const plugins = structuredClone(m.plugins ?? {}) as Record<string, unknown>;
    const prefs = await readPluginPrefs(this.workspace);
    const providers = await listProviders(this.repo, this.workspace);
    const chosen = new Set([...selection.inputs ?? [], selection.display, selection.platform]);
    for (const provider of providers.providers.filter((p) => !p.builtin && p.path && chosen.has(p.name))) {
      const folder = path.relative(path.join(this.workspace, 'plugins'), provider.path!).split(path.sep)[0];
      if (!pluginFolders(this.workspace).includes(folder)) continue;
      const fields = (await pluginMeta(this.workspace, folder)).settings ?? [];
      if (fields.length) plugins[provider.name] = { ...effectiveSettings(fields, prefs.settings[folder]), ...((plugins[provider.name] as Record<string, unknown> | undefined) ?? {}) };
    }
    const desktopSettings = (plugins.desktop as Record<string, unknown> | undefined) ?? {};
    if (selection.display === 'desktop' && m.display && m.display !== 'desktop')
      plugins.desktop = { ...desktopSettings, fullscreen: desktop?.fullscreen ?? false, monitor: 0 };
    else if (desktop && selection.display === 'desktop')
      plugins.desktop = { ...desktopSettings, fullscreen: desktop.fullscreen, monitor: desktop.monitor };
    return { ...selection, plugins };
  }

  /**
   * xrb-host options from the manifest: the providers and their plugin sections as a config file
   * (--config; the host reads `{ input, display, platform, plugins }`), the host section and the icon.
   */
  async hostArgs(p: Project, m: Manifest, desktop?: { fullscreen: boolean; monitor: number }, effective?: RoleSelection): Promise<string[]> {
    const h = m.host ?? {};
    const config = path.join(os.tmpdir(), 'xrb-runs', `${p.id.replace(/[\\/:]/g, '_')}.json`);
    await fs.mkdir(path.dirname(config), { recursive: true });
    const selection = effective ?? await this.effectiveSelection(m);
    await fs.writeFile(config, JSON.stringify(await this.runtimeConfig(m, selection, desktop), null, 2));
    const prefs = await readPluginPrefs(this.workspace);
    // Plugins are built into the workspace, each into its own bin/ (user-workspace: Host loads workspace plugins).
    const args: string[] = [`--config=${config}`, ...pluginBinDirs(this.workspace, prefs.disabled).map((d) => `--plugin-dir=${d}`)];
    if (h.recordHands) {
      const file = path.resolve(p.dir, h.recordHands);
      await fs.mkdir(path.dirname(file), { recursive: true });
      args.push(`--record-hands=${file}`);
    }
    const icon = m.icon ? path.resolve(p.dir, m.icon) : null;
    if (icon && (await fs.access(icon).then(() => true, () => false))) args.push(`--icon=${icon}`);
    else if (!m.icon && ((m.iconColor && m.iconColor !== 'blue') || (m.iconShape && m.iconShape !== 'sphere'))) {
      // The host's built-in icon is the blue sphere; any other generated default goes in as a PNG.
      const file = path.join(os.tmpdir(), 'xrb-icons', `default-${m.iconColor ?? 'blue'}-${m.iconShape ?? 'sphere'}.png`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, defaultIcon(256, m.iconColor, m.iconShape));
      args.push(`--icon=${file}`);
    }
    args.push(...(h.args ?? []));
    return args;
  }

  private async finalizeBrowserOutput(p: Project, m: Manifest): Promise<boolean> {
    return (await finalizeBrowserBuild(this.entryOf(p, m), {
      file: m.icon ? path.resolve(p.dir, m.icon) : undefined,
      color: m.iconColor,
      shape: m.iconShape,
      description: m.description,
    })).changed;
  }

  private async executeBrowserBuild(p: Project, m: Manifest, ctx: JobContext): Promise<void> {
    const script = m.scripts?.build;
    if (!script) throw new Error(`${p.id} has no build script`);
    await this.ensureInstalled(ctx);
    // Corepack ships with Node and provides the workspace's pinned pnpm version without requiring
    // a global pnpm command. It runs through cmd.exe; script names are plain names (manifest rules).
    await ctx.run('cmd.exe', ['/d', '/s', '/c', `corepack pnpm run ${script}`], { cwd: p.dir, env: { ...process.env, ...this.appEnv() } });
    if (await this.finalizeBrowserOutput(p, m)) ctx.line('Applied the project icon as the browser favicon.');
  }

  private async rebuildBrowserOutput(p: Project, m: Manifest, ctx: JobContext): Promise<void> {
    await this.executeBrowserBuild(p, m, ctx);
    const currentMtimeMs = (await fs.stat(path.join(p.dir, MANIFEST))).mtimeMs;
    if (currentMtimeMs !== p.manifestMtimeMs) throw new Error('Project settings changed during Build. Review them and try again.');
    const entry = this.entryOf(p, m);
    await writeBuildReceipt(this.workspace, p.id, currentMtimeMs, entry);
    await verifyBuildReceipt(this.workspace, p.id, currentMtimeMs, entry);
  }

  private async ensureBrowserBuild(p: Project, m: Manifest, ctx: JobContext, requireScriptOnStale = false): Promise<void> {
    const entry = this.entryOf(p, m);
    let receiptError: Error | null = null;
    try {
      await verifyBuildReceipt(this.workspace, p.id, p.manifestMtimeMs, entry);
    } catch (error) {
      receiptError = error as Error;
    }
    if (!receiptError) {
      if (await this.finalizeBrowserOutput(p, m)) {
        await writeBuildReceipt(this.workspace, p.id, p.manifestMtimeMs, entry);
        ctx.line('Updated the current successful build with the project favicon.');
      } else ctx.line('The current successful build is unchanged; using it.');
      return;
    }
    if (!m.scripts?.build) {
      const exists = await fs.access(path.join(entry, 'index.html')).then(() => true, () => false);
      // A static app has nothing to rebuild: its recorded output is still current when only the manifest changed
      // (a publication draft, for example). Changed or unrecorded output is still refused for publication.
      if (!exists || (requireScriptOnStale && !(await receiptMatchesOutput(this.workspace, p.id, entry)))) throw new Error(`A current build is required, but ${p.id} has no build script.`);
      ctx.line('No build script is configured; using and recording the existing app output.');
      if (await this.finalizeBrowserOutput(p, m)) ctx.line('Applied the project icon as the browser favicon.');
      await writeBuildReceipt(this.workspace, p.id, p.manifestMtimeMs, entry);
      return;
    }
    ctx.line(`The build is not current (${receiptError.message}). Building now.`);
    await this.rebuildBrowserOutput(p, m, ctx);
  }

  webBuild(p: Project): Job {
    const m = this.manifestOf(p);
    return this.startJob('web-build', p.id, `build: ${m.name}`, (ctx) => this.ensureBrowserBuild(p, m, ctx));
  }

  rebuildApp(p: Project): Job {
    const m = this.manifestOf(p);
    if (m.kind !== 'app') throw new HttpError(409, `${p.id} is not an app`);
    if (!m.scripts?.build) throw new HttpError(409, `${p.id} has no build script`);
    return this.startJob('web-build', p.id, `rebuild: ${m.name}`, async (ctx) => this.rebuildBrowserOutput(p, m, ctx));
  }

  /** Environment of an app script: the core source tree supplying its SDK. */
  appEnv(): Record<string, string> {
    return { XRB_CORE: this.repo };
  }

  private async ensurePackageRoot(root: string, ctx: Pick<JobContext, 'run' | 'line'>): Promise<void> {
    if (await packageGraphReady(root)) return;
    if (!await fs.access(path.join(root, 'package.json')).then(() => true, () => false)) return;
    const hasLock = await fs.access(path.join(root, 'pnpm-lock.yaml')).then(() => true, () => false);
    const lockMode = this.bootstrapPackageLock ? '--no-frozen-lockfile' : '--frozen-lockfile';
    ctx.line(`${this.bootstrapPackageLock && !hasLock ? 'initializing package lock and installing packages' : 'installing packages'} (corepack pnpm install in ${root})`);
    await ctx.run('cmd.exe', ['/d', '/s', '/c', `corepack pnpm install ${lockMode}`], { cwd: root });
    await writePackageGraphStamp(root);
  }

  /** Installs the project repository with its pinned pnpm version when it has never been installed. */
  async ensureInstalled(ctx: Pick<JobContext, 'run' | 'line'>): Promise<void> {
    await this.ensurePackageRoot(this.projects, ctx);
  }

  /** Sets up a managed workspace tool without accepting a command from tool metadata. */
  async prepareManagedTools(): Promise<void> {
    if (await packageGraphReady(this.workspace)) return;
    if (!await fs.access(path.join(this.workspace, 'package.json')).then(() => true, () => false)) return;
    const job = this.startJob('tool-setup', null, 'set up workspace tools', (ctx) => this.ensurePackageRoot(this.workspace, ctx));
    const done = await this.jobs.wait(job);
    if (done.state === 'failed') throw new Error(done.error ?? 'Workspace tool setup failed');
  }

  /** Built plugins by the name they report (`xrb-host --list-plugins`) -> the folder holding their files. */
  async pluginDirs(): Promise<Record<string, string>> {
    const list = await listProviders(this.repo, this.workspace);
    return Object.fromEntries(list.providers.filter((p) => !p.builtin && p.path).map((p) => [p.name, path.dirname(p.path!)]));
  }

  /** Selected plugins the host does not find (not built in the workspace). */
  async missingPlugins(names: string[]): Promise<string[]> {
    const dirs = await this.pluginDirs();
    return names.filter((n) => !dirs[n]);
  }

  /** All workspace plugins, including disabled and packager-only plugins. */
  async managedPlugins() {
    const prefs = await readPluginPrefs(this.workspace);
    const providers = await listProviders(this.repo, this.workspace, true);
    const freshness = hostFreshness(this.repo, this.workspace).plugins;
    const plugins = await Promise.all(pluginFolders(this.workspace).map(async (id) => {
      let problem: string | null = null;
      const meta: PluginMeta = await pluginMeta(this.workspace, id).catch((e: Error) => { problem = e.message; return {}; });
      if (meta.hidden) return null;
      const root = path.join(this.workspace, 'plugins');
      const ownProviders = providers.providers.filter((p) => p.path && path.relative(root, p.path).split(path.sep)[0] === id);
      const presentedProviders = ownProviders.map((provider) => {
        const presentedName = meta.panelProviderNames?.[provider.name] ?? provider.name;
        return { name: presentedName, role: provider.role, version: provider.version, ...(presentedName !== provider.name ? { runtimeName: provider.name } : {}),
          ...(meta.panelHiddenProviders?.includes(provider.name) ? { hidden: true } : {}) };
      });
      const native = freshness.filter((p) => p.dir.split('/')[0] === id);
      const packagerDecls = await Promise.all([id, `${id}/packager`].map(async (dir) => {
        const decl = await fs.readFile(path.join(root, dir, 'package.json'), 'utf8').catch(() => '{}');
        try {
          const pkg = JSON.parse(decl);
          return pkg.xrBuild?.packager ? pkg : null;
        } catch { return null; }
      }));
      const packager = packagerDecls.find(Boolean);
      const isPackager = !!packager;
      const publisher = this.publishers.found.find(({ dir }) => dir === path.join(root, id))?.publisher;
      const packagerLabel = this.packagers.found.find(({ dir }) => dir === path.join(root, id) || dir === path.join(root, id, 'packager'))?.packager.label;
      const name = meta.name ?? presentedProviders[0]?.name ?? (isPackager ? id.replace(/^platform-/, '') : id);
      const derivedType = publisher ? 'publisher' : ownProviders[0]?.role ?? (isPackager ? 'platform' : 'plugin');
      return {
        id, name, title: meta.title ?? meta.name ?? packagerLabel ?? publisher?.label ?? name, type: meta.type ?? derivedType,
        label: packagerLabel ?? publisher?.label,
        description: meta.description ?? ownProviders[0]?.description ?? (typeof packager?.description === 'string' ? packager.description : ''),
        settingsDescription: meta.settingsDescription ?? '',
        version: meta.version ?? null,
        enabled: !prefs.disabled.includes(id), icon: !problem && await pluginIcon(this.workspace, id).catch(() => null) ? `/api/plugins/manage/${id}/icon` : null,
        glyph: meta.glyph ?? null,
        problem, providers: presentedProviders,
        packager: isPackager, built: !native.length || native.every((p) => p.built && !p.outdated),
        settings: meta.settings, values: effectiveSettings(meta.settings ?? [], prefs.settings[id]),
        panelSettings: meta.panelSettings, panelValues: effectiveSettings(meta.panelSettings ?? [], prefs.panelSettings[id]),
        samples: (meta.panelSamples ?? []).map(({ id: sampleId, name: sampleName, kind, description }) => ({ id: sampleId, name: sampleName, kind, description })),
        dir: `plugins/${id}`,
      };
    }));
    return plugins.filter((plugin) => plugin !== null);
  }

  /** Finds the packager plugins; problems are logged, never fatal. */
  async loadPackagers(): Promise<void> {
    this.packagers = await discoverPackagers(this.repo, this.workspace);
    for (const f of this.packagers.found) log(`[panel] packager ${f.packager.name} from ${f.dir}`);
    for (const problem of this.packagers.problems) log(`[panel] packager not loaded: ${problem}`);
  }

  async loadPublishers(): Promise<void> {
    this.publishers = await discoverPublishers(this.workspace);
    for (const f of this.publishers.found) log(`[panel] publisher ${f.publisher.name} from ${f.dir}`);
    for (const problem of this.publishers.problems) log(`[panel] publisher not loaded: ${problem}`);
  }

  /** Whether panel server code or a loaded packager or publisher changed after this process started. */
  panelFreshness(): PanelFreshness {
    if (this.freshness && Date.now() - this.freshness.checkedMs < this.freshnessMaxAgeMs) return this.freshness.value;
    const pluginDirs = [...this.packagers.found.map((f) => f.dir), ...this.publishers.found.map((f) => f.dir)];
    const value = panelFreshness(panelSourceRoots(this.repo, this.workspace, pluginDirs), this.startedMs);
    this.freshness = { value, checkedMs: Date.now() };
    return value;
  }

  publicationErrors(m: Manifest): FieldError[] {
    const publication = m.publication;
    if (!publication || !publicationTargetOf(m)) return [];
    const found = publisherFor(this.publishers, publication.publisher);
    if (!found) return [];
    return found.publisher.validate(publicationIdentity(publication)).map((error) => ({ field: `publication.${error.field}`, message: error.message }));
  }

  async publicationOf(m: Manifest | null): Promise<{ available: boolean; publishers: Array<{ name: string; label?: string; origin: string; routePrefix?: string; releases: boolean }>; status: PublisherStatus | null; releases: PublicationReleases | null; reason: string | null }> {
    const list = this.publishers.found.map(({ publisher }) => ({ name: publisher.name, label: publisher.label, origin: publisher.origin, routePrefix: publisher.routePrefix, releases: !!publisher.releases }));
    if (m && !publicationTargetOf(m)) return { available: false, publishers: list, status: null, releases: null, reason: 'publication is available only for app projects' };
    if (!m?.publication) return { available: false, publishers: list, status: null, releases: null, reason: 'publication is not configured' };
    const found = publisherFor(this.publishers, m.publication.publisher);
    if (!found) return { available: false, publishers: list, status: null, releases: null, reason: `publisher "${m.publication.publisher}" is unavailable` };
    const identity = publicationIdentity(m.publication);
    const status = await this.cachedStatus(found.publisher, identity);
    return { available: true, publishers: list, status, releases: this.releasesOf(found.publisher, identity, m.publication), reason: null };
  }

  /** Release support of the selected publisher: the last known catalog and the suggested or drafted next version. */
  private releasesOf(publisher: Publisher, identity: PublicationIdentity, publication: PublicationConfig): PublicationReleases | null {
    if (!publisher.releases) return null;
    const entry = this.publicationStatuses.get(`${publisher.name}\n${identity.id}\n${identity.slug}`);
    const catalog = entry?.catalog ?? null;
    const suggested = suggestedVersion(catalog?.releases.map((r) => r.version) ?? []);
    const draft = publication.versions?.[publisher.name];
    const top = catalog ? highestVersion(catalog.releases.map((r) => r.version)) : null;
    // A draft at or below the highest retained version was published (or superseded): suggest the next patch instead.
    const nextVersion = draft && !versionProblem(draft) && (!top || compareReleaseVersions(draft, top) > 0) ? draft : suggested;
    return { supported: true, catalog, error: entry?.catalogError ?? null, nextVersion, suggestedVersion: suggested };
  }

  async publicationDestinationsOf(m: Manifest | null): Promise<Record<string, { slug: string; status: PublisherStatus }>> {
    if (!m?.publication || !publicationTargetOf(m)) return {};
    const publication = m.publication;
    return Object.fromEntries(await Promise.all(this.publishers.found.map(async ({ publisher }) => {
      const slug = publication.routes?.[publisher.name] ?? publication.slug;
      return [publisher.name, { slug, status: await this.cachedStatus(publisher, { id: publication.id, slug }) }];
    })));
  }

  /**
   * A publication's status without waiting for its publisher: a status may read remote state (seconds per
   * project), which held the whole project list. Returns the last known status, or `checking` before the first
   * one; a missing or stale entry is read in the background and announced with `publication-status`.
   */
  private async cachedStatus(publisher: Publisher, identity: PublicationIdentity): Promise<PublisherStatus> {
    const selectedUrl = publicationUrl(publisher, identity.slug);
    const key = `${publisher.name}\n${identity.id}\n${identity.slug}`;
    let entry = this.publicationStatuses.get(key);
    if (!entry) this.publicationStatuses.set(key, entry = { status: null, catalog: null, catalogError: null, checkedMs: 0, refresh: null });
    if (!entry.refresh && Date.now() - entry.checkedMs >= this.publicationStatusMaxAgeMs) {
      const current = entry;
      const status = publisher.status(identity).then((status) => {
        const deployedUrl = status.deployedUrl && /^https:\/\//.test(status.deployedUrl) ? status.deployedUrl : undefined;
        return { ...status, selectedUrl, deployedUrl };
      }, (error: Error) => {
        log(`[panel] publisher ${publisher.name} status unavailable: ${error.message}`);
        return { state: 'unavailable' as const, selectedUrl, error: 'publisher status unavailable' };
      });
      // The catalog is read-only remote truth too; a malformed or failing catalog is reported, never invented.
      const catalog: Promise<{ catalog: PublisherReleaseCatalog | null; error: string | null }> = publisher.releases
        ? publisher.releases.catalog(identity).then((value) => ({ catalog: normalizeReleaseCatalog(value), error: null }), (error: Error) => {
          log(`[panel] publisher ${publisher.name} release catalog unavailable: ${error.message}`);
          return { catalog: null, error: `release history unavailable: ${error.message}` };
        })
        : Promise.resolve({ catalog: null, error: null });
      current.refresh = Promise.all([status, catalog]).then(([status, releases]) => {
        const changed = JSON.stringify([status, releases]) !== JSON.stringify([current.status, { catalog: current.catalog, error: current.catalogError }]);
        Object.assign(current, { status, catalog: releases.catalog, catalogError: releases.error, checkedMs: Date.now(), refresh: null });
        if (changed) this.hub.send('publication-status', { publisher: publisher.name, id: identity.id });
      });
    }
    if (this.awaitPublicationStatus && entry.refresh) await entry.refresh;
    return entry.status ?? { state: 'checking', selectedUrl };
  }

  /** A fresh catalog for a release decision: validation never trusts the cache or local intent. */
  private async freshCatalog(publisher: Publisher, identity: PublicationIdentity): Promise<PublisherReleaseCatalog> {
    if (!publisher.releases) throw new HttpError(409, `publisher "${publisher.name}" has no versioned release support`);
    let catalog: PublisherReleaseCatalog;
    try { catalog = normalizeReleaseCatalog(await publisher.releases.catalog(identity)); }
    catch (error) { throw new HttpError(409, `release history unavailable: ${(error as Error).message}`); }
    const entry = this.publicationStatuses.get(`${publisher.name}\n${identity.id}\n${identity.slug}`);
    if (entry && !entry.refresh) Object.assign(entry, { catalog, catalogError: null });
    return catalog;
  }

  private publicationTarget(p: Project): { m: Manifest; publication: PublicationConfig; publisher: Publisher; identity: PublicationIdentity; snapshot: PublicationConfig } {
    const m = this.manifestOf(p), publication = m.publication;
    if (!publicationTargetOf(m) || !publication) throw new HttpError(409, 'publication is available only for configured app projects');
    const found = publisherFor(this.publishers, publication.publisher);
    if (!found) throw new HttpError(409, `publisher "${publication.publisher}" is unavailable`);
    const snapshot = { ...publication, routes: publication.routes ? { ...publication.routes } : undefined, versions: publication.versions ? { ...publication.versions } : undefined };
    return { m, publication, publisher: found.publisher, identity: publicationIdentity(publication), snapshot };
  }

  /** The launcher card the publisher records with this deployment: the manifest's presentation plus whether the build ships a 3D icon. */
  private async cardOf(p: Project, m: Manifest): Promise<PublicationCard> {
    const hasModel = await fs.access(path.join(this.entryOf(p, m), 'icon.js')).then(() => true, () => false);
    return publicationCard(m, hasModel);
  }

  /**
   * Publish (no deployment) or update (an owned route exists) the current source. A release-capable publisher needs a
   * stable version above its highest retained one; the decision (version, catalog revision) is captured now and
   * rechecked by the publisher before it mutates anything. Legacy publishers keep their unversioned publish.
   */
  async publish(p: Project, body: { version?: unknown; expectedRevision?: unknown } = {}): Promise<Job> {
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    const errors = publisher.validate(identity);
    if (errors.length) throw new HttpError(400, errors.map((e) => e.message).join('; '), { errors });
    const entry = this.entryOf(p, m);
    const build = async (ctx: JobContext) => {
      if (m.scripts?.build) {
        ctx.line('Building current source before publishing.');
        await this.rebuildBrowserOutput(p, m, ctx);
      } else await this.ensureBrowserBuild(p, m, ctx, true);
    };
    if (!publisher.releases) {
      if (body.version !== undefined) throw new HttpError(409, `publisher "${publisher.name}" has no versioned release support`);
      return this.startJob('publication', p.id, `build and publish (${publisher.name}): ${m.name}`, async (ctx) => {
        await build(ctx);
        return publisher.publish({ app: entry, publication: identity, card: await this.cardOf(p, m), log: ctx.line });
      }, 'publish', snapshot);
    }
    const version = body.version;
    const problem = versionProblem(version);
    if (problem) throw new HttpError(400, `publication ${problem}`, { errors: [{ field: 'publication.version', message: problem }] });
    if (body.expectedRevision !== undefined && body.expectedRevision !== null && typeof body.expectedRevision !== 'string') throw new HttpError(400, 'expectedRevision must be a string');
    const catalog = await this.freshCatalog(publisher, identity);
    if (body.expectedRevision !== undefined && body.expectedRevision !== catalog.revision) throw new HttpError(409, 'release history changed since it was shown: review it and try again', { stale: 'release-catalog', revision: catalog.revision });
    const top = highestVersion(catalog.releases.map((r) => r.version));
    if (top && compareReleaseVersions(version as string, top) <= 0) throw new HttpError(409, `version ${version} does not exceed the highest retained version ${top}`, { errors: [{ field: 'publication.version', message: `must exceed ${top}` }], revision: catalog.revision });
    const deployed = catalog.liveReleaseId !== null || catalog.legacyLive || catalog.requestedReleaseId !== null;
    const operation = deployed ? 'update' : 'publish';
    const releases = publisher.releases;
    const release = { version: version as string, expectedRevision: catalog.revision };
    return this.startJob('publication', p.id, `build and ${operation} ${version} (${publisher.name}): ${m.name}`, async (ctx) => {
      await build(ctx);
      return releases.publish({ app: entry, publication: identity, version: release.version, expectedRevision: release.expectedRevision, card: await this.cardOf(p, m), log: ctx.line });
    }, operation, snapshot, release);
  }

  /** Make a retained release live: exact retained bytes at the canonical route, no rebuild, after confirmation. */
  async activate(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    if (!publisher.releases) throw new HttpError(409, `publisher "${publisher.name}" has no versioned release support`);
    const idProblem = releaseIdProblem(body.releaseId);
    if (idProblem) throw new HttpError(400, idProblem);
    if (body.expectedRevision !== undefined && body.expectedRevision !== null && typeof body.expectedRevision !== 'string') throw new HttpError(400, 'expectedRevision must be a string');
    const errors = publisher.validate(identity);
    if (errors.length) throw new HttpError(400, errors.map((e) => e.message).join('; '), { errors });
    const catalog = await this.freshCatalog(publisher, identity);
    const releaseId = body.releaseId as string;
    const target = catalog.releases.find((r) => r.releaseId === releaseId);
    if (!target) throw new HttpError(409, 'that release is not retained for this publication', { revision: catalog.revision });
    if (body.expectedRevision !== undefined && body.expectedRevision !== catalog.revision) throw new HttpError(409, 'release history changed since it was shown: review it and try again', { stale: 'release-catalog', revision: catalog.revision });
    if (catalog.liveReleaseId === releaseId) throw new HttpError(409, `${target.version ?? 'the legacy release'} is already live`, { alreadyLive: true, revision: catalog.revision });
    if (body.confirm !== true) throw new HttpError(409, 'making a release live requires confirmation', { needsConfirm: 'activate', revision: catalog.revision });
    const releases = publisher.releases;
    const release = { releaseId, expectedRevision: catalog.revision };
    return this.startJob('publication', p.id, `make ${target.version ?? 'legacy release'} live (${publisher.name}): ${m.name}`, async (ctx) => {
      ctx.line(`Activating retained release ${target.version ?? 'legacy'} without rebuilding current source.`);
      return releases.activate({ publication: identity, releaseId: release.releaseId, expectedRevision: release.expectedRevision, card: await this.cardOf(p, m), log: ctx.line });
    }, 'activate', snapshot, release);
  }

  /** Remove a retained release that is not live or requested, after confirmation: history shrinks, the live route is untouched. */
  async deleteRelease(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    if (!publisher.releases) throw new HttpError(409, `publisher "${publisher.name}" has no versioned release support`);
    const idProblem = releaseIdProblem(body.releaseId);
    if (idProblem) throw new HttpError(400, idProblem);
    if (body.expectedRevision !== undefined && body.expectedRevision !== null && typeof body.expectedRevision !== 'string') throw new HttpError(400, 'expectedRevision must be a string');
    const errors = publisher.validate(identity);
    if (errors.length) throw new HttpError(400, errors.map((e) => e.message).join('; '), { errors });
    const catalog = await this.freshCatalog(publisher, identity);
    const releaseId = body.releaseId as string;
    const target = catalog.releases.find((r) => r.releaseId === releaseId);
    if (!target) throw new HttpError(409, 'that release is not retained for this publication', { revision: catalog.revision });
    if (body.expectedRevision !== undefined && body.expectedRevision !== catalog.revision) throw new HttpError(409, 'release history changed since it was shown: review it and try again', { stale: 'release-catalog', revision: catalog.revision });
    const label = target.version ?? 'the legacy release';
    if (catalog.liveReleaseId === releaseId) throw new HttpError(409, `${label} is live; activate another version or unpublish before deleting it`, { live: true, revision: catalog.revision });
    if (catalog.requestedReleaseId === releaseId) throw new HttpError(409, `${label} is the requested deployment; activate another version or unpublish before deleting it`, { requested: true, revision: catalog.revision });
    if (body.confirm !== true) throw new HttpError(409, 'deleting a release requires confirmation', { needsConfirm: 'delete-release', revision: catalog.revision });
    const releases = publisher.releases;
    const release = { releaseId, expectedRevision: catalog.revision };
    return this.startJob('publication', p.id, `delete ${label} (${publisher.name}): ${m.name}`, async (ctx) => {
      ctx.line(`Deleting retained release ${label}; the live route is not changed.`);
      return releases.delete({ publication: identity, releaseId: release.releaseId, expectedRevision: release.expectedRevision, log: ctx.line });
    }, 'delete-release', snapshot, release);
  }

  async unpublish(p: Project, body: { confirm?: boolean }): Promise<Job> {
    if (!body.confirm) throw new HttpError(409, 'unpublish requires confirmation', { needsConfirm: 'unpublish' });
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    return this.startJob('publication', p.id, `unpublish (${publisher.name}): ${m.name}`, async (ctx) => publisher.unpublish({ publication: identity, log: ctx.line }), 'unpublish', snapshot);
  }

  packagingOf(m: Manifest | null): Packaging {
    const none = (platform: string, reason: string, channel = platform): Packaging => ({ available: false, platform, channel, packager: null, fields: [], errors: [], reason });
    if (!m) return none('', 'the manifest has errors');
    if (m.kind !== 'app') return none('', 'test projects are not packaged');
    const selectedPlatform = selectionOf(m).platform;
    const target = buildTargetOf(m);
    const found = selectedPlatform
      ? packagerFor(this.packagers, selectedPlatform)
      : this.packagers.found.find((item) => item.packager.standalone && targetOf(item.packager) === target) ?? null;
    const platform = selectedPlatform || found?.packager.name || '';
    const channel = selectedPlatform || (target === 'host' && found?.packager.standalone ? 'desktop' : found?.packager.name ?? '');
    if (!found) return none(platform, selectedPlatform ? `no packager plugin for platform "${selectedPlatform}"` : 'the app has no standalone packager');
    if (targetOf(found.packager) !== target) return none(platform, `the "${platform}" packager builds for the ${TARGET_LABEL[targetOf(found.packager)]} target, the app is set to ${TARGET_LABEL[target]}`);
    const effectiveIdentity = packageIdentityOf(m, platform, found.packager.identityFields);
    const errors = found.packager.validate(effectiveIdentity).map((e) => ({ field: `plugins.${platform}.${e.field}`, message: e.message }));
    return { available: true, platform, channel, packager: found.packager.name, setupSupported: !!found.packager.setup, fields: found.packager.identityFields, errors, reason: null };
  }

  packagingChoicesOf(m: Manifest | null): Record<string, Packaging> {
    if (!m || m.kind !== 'app') return {};
    const choices: Array<[BuildTarget, string]> = [['host', ''], ['webxr', ''], ...this.packagers.found
      .filter(({ packager }) => !packager.standalone)
      .map(({ packager }): [BuildTarget, string] => [targetOf(packager), packager.name])];
    return Object.fromEntries(choices.map(([target, platform]) => {
      const manifest: Manifest = { ...m };
      if (target === 'webxr') manifest.target = 'webxr'; else delete manifest.target;
      if (platform) manifest.platform = platform; else delete manifest.platform;
      return [`${target}:${platform}`, this.packagingOf(manifest)];
    }));
  }

  private selectedPackager(p: Project) {
    const packaging = this.packagingOf(this.manifestOf(p));
    if (!packaging.available) throw new HttpError(409, `packaging unavailable: ${packaging.reason}`);
    return packagerFor(this.packagers, packaging.platform)!.packager;
  }

  async packageSetupStatus(p: Project): Promise<PackagerSetupStatus> {
    const packager = this.selectedPackager(p);
    if (!packager.setupStatus) return { state: 'ready' };
    let status: unknown;
    try { status = await packager.setupStatus(); }
    catch { return { state: 'unavailable', reason: 'Could not check packaging prerequisites. Try again later.' }; }
    if (!validSetupStatus(status)) return { state: 'unavailable', reason: 'Packager returned an invalid prerequisite status.' };
    return status;
  }

  async packageSetup(p: Project, acceptTerms: boolean): Promise<Job> {
    const packager = this.selectedPackager(p);
    if (!packager.setup || !packager.setupStatus) throw new HttpError(409, 'this packager does not offer setup');
    const status = await this.packageSetupStatus(p);
    if (status.state !== 'setup-required') throw new HttpError(409, status.reason ?? `packager is ${status.state}; setup is not available`);
    if (status.termsUrl && !acceptTerms) throw new HttpError(409, 'acknowledge the packager terms before setup', { termsUrl: status.termsUrl });
    return this.startJob('packager-setup', p.id, `set up package tools (${packager.name})`, async (ctx) => {
      await packager.setup!({ log: ctx.line, acceptTerms });
      const ready = await this.packageSetupStatus(p);
      if (ready.state !== 'ready') throw new Error(ready.reason ?? 'packager prerequisites are not ready after setup');
      ctx.line('Package tools are ready. Build package is available.');
      return { platform: packager.name };
    });
  }

  async packageBuild(p: Project, body: { version?: string; confirm?: string[] }): Promise<Job> {
    const m = this.manifestOf(p);
    const packaging = this.packagingOf(m);
    if (!packaging.available) throw new HttpError(409, `packaging unavailable: ${packaging.reason}`);
    const packager = packagerFor(this.packagers, packaging.platform)!.packager;
    const setup = await this.packageSetupStatus(p);
    if (setup.state !== 'ready') throw new HttpError(409, setup.reason ?? 'package tools are not ready: run Setup before building', { needsSetup: setup.state });
    const baseIdentity = packageIdentityOf(m, packaging.platform, packager.identityFields);
    const str = (k: string) => baseIdentity[k];
    const entry = this.entryOf(p, m);
    const version = body.version ?? str('version') ?? '0.1.0';
    const identity = { ...baseIdentity, version };
    const identityErrors = packager.validate(identity).map((e) => ({ field: `plugins.${packaging.platform}.${e.field}`, message: e.message }));
    if (identityErrors.length) throw new HttpError(400, identityErrors.map((e) => e.message).join('; '), { errors: identityErrors });
    const confirm = new Set(body.confirm ?? []);
    const zipVersion = str('id') ? await this.packages.versionOf(str('id')!, packaging.channel) : null;
    const last = [str('lastPackaged'), zipVersion ?? undefined].filter((v): v is string => !!v).sort(compareVersions).pop();
    if (last && compareVersions(version, last) <= 0 && !confirm.has('version'))
      throw new HttpError(409, `version ${version} is not higher than ${last}, which was already packaged: a station may reject a version that exists. Use ${nextVersion(last)}?`, { needsConfirm: 'version', suggested: nextVersion(last) });
    // A headset package carries only the web app: no host, no native plugins.
    const headset = buildTargetOf(m) === 'webxr';
    let runtimeDir = '', pluginDirs: Record<string, string> = {}, plugins: string[] = [];
    const selection = headset ? selectionOf(m) : await this.effectiveSelection(m);
    if (!headset) {
      const fresh = hostFreshness(this.repo, this.workspace);
      if (!fresh.exists) throw new HttpError(409, 'xrb-host.exe is not built: rebuild the host first');
      if (fresh.outdated && !confirm.has('host'))
        throw new HttpError(409, `xrb-host.exe is older than ${fresh.newestSource}: the package would ship an outdated host. Rebuild the host first?`, { needsConfirm: 'host' });
      runtimeDir = hostPaths(this.repo).releaseDir;
      const built = await this.pluginDirs();
      plugins = [...selection.inputs ?? [], selection.display, selection.platform].filter((n) => n && !BUILTIN_PROVIDERS.has(n));
      const missing = plugins.filter((n) => !built[n]);
      if (missing.length) throw new HttpError(409, `plugin ${missing.join(', ')} is not built in the workspace: rebuild the host first`);
      pluginDirs = Object.fromEntries(plugins.map((n) => [n, built[n]]));
    }
    const config = headset ? undefined : await this.runtimeConfig(m, selection);
    if (config && packager.standalone) delete config.plugins[packaging.platform];
    const publicationPublisher = headset && m.publication ? publisherFor(this.publishers, m.publication.publisher) : null;
    const launchUrl = publicationPublisher && m.publication ? publicationUrl(publicationPublisher.publisher, m.publication.slug) : undefined;
    const label = str('id') ?? m.name;
    const platform = packaging.platform;
    return this.startJob('package', p.id, `build and package (${packager.name}): ${label} ${version}`, async (ctx: JobContext) => {
      await this.ensureBrowserBuild(p, m, ctx);
      ctx.line(headset
        ? `${packager.name} package of ${p.id} ${version}: WebXR headset app (no host)`
        : `${packager.name} package of ${p.id} ${version}: ${selection.display} + ${(selection.inputs ?? []).join(', ')} + ${selection.platform}; plugins ${plugins.join(', ') || 'none'}`);
      let packageIcon = m.icon ? path.resolve(p.dir, m.icon) : undefined;
      // Materialise non-sphere defaults so all packagers receive the selected thumbnail.
      if (!packageIcon && m.iconShape && m.iconShape !== 'sphere') {
        packageIcon = path.join(os.tmpdir(), 'xrb-icons', `default-${m.iconColor ?? 'blue'}-${m.iconShape}.png`);
        await fs.mkdir(path.dirname(packageIcon), { recursive: true });
        await fs.writeFile(packageIcon, defaultIcon(512, m.iconColor, m.iconShape));
      }
      const r = await packager.build({
        app: entry, runtimeDir, ...(headset ? {} : { pluginDirs }), plugins, selection, projectName: m.name, identity, config, launchUrl,
        icon: packageIcon, iconColor: m.iconColor,
        out: path.join(this.workspace, 'builds', packaging.channel), workDir: path.join(this.workspace, 'build', packaging.channel), log: (msg) => ctx.line(msg),
      });
      await this.updateManifest(p.id, (cur) => ({ ...cur, plugins: { ...cur.plugins, [platform]: { ...cur.plugins?.[platform], ...identity, lastPackaged: version, version: nextVersion(version) } } }));
      ctx.line(`package ${label} ${version}: ${r.file} (${(r.sizeBytes / 1e9).toFixed(2)} GB). Next version: ${nextVersion(version)}`);
      return { zip: r.file, sizeBytes: r.sizeBytes, version };
    });
  }

  renderIcon(p: Project): Job {
    const m = this.manifestOf(p);
    const entry = this.entryOf(p, m);
    const rel = m.icon ?? 'icon.png';
    return this.startJob('icon-render', p.id, `icon render: ${m.name}`, async (ctx) => {
      await ctx.run(process.execPath, [APP_ICON, 'render', '--app', entry, '--out', path.resolve(p.dir, rel), '--runtime', hostPaths(this.repo).releaseDir], { cwd: this.repo });
      if (!m.icon) await this.updateManifest(p.id, (cur) => ({ ...cur, icon: rel }));
    });
  }

  private async ensureDevInstalled(): Promise<void> {
    const lines: string[] = [];
    try {
      await this.ensureInstalled({ line: (l) => log(`[panel] ${l}`), run: async (cmd, args, opts) => {
        const code = await runProcess(cmd, args, (l) => lines.push(l), opts);
        if (code !== 0) throw new Error(`workspace install failed (code ${code}): ${lines.slice(-5).join(' / ')}`);
      } });
    } catch (e) {
      throw new HttpError(500, (e as Error).message);
    }
  }

  /** Starts one panel-owned standalone WebXR browser preview and returns its app URL. */
  async preview(p: Project, mode: RunMode, flat: boolean, token: string, browser: { fullscreen: boolean; monitor: number; clientPort: number }): Promise<string> {
    const m = this.manifestOf(p);
    if (buildTargetOf(m) !== 'webxr' || selectionOf(m).platform) throw new HttpError(409, `${p.id} is not a standalone WebXR preview`);
    if (!this.panelUrl) throw new HttpError(500, 'the panel preview address is unavailable');
    if (mode === 'dev') await this.ensureDevInstalled();
    const route = `/preview/${p.id.split('/').map(encodeURIComponent).join('/')}/`;
    if (this.runner.busy) throw new HttpError(409, 'stop the running app first');
    const cursor = (await readAppSettings(this.workspace)).cursor;
    const session = randomUUID();
    const projection = flat ? 'orthographic' : 'perspective';
    const mouseEnabled = (await this.effectiveSelection(m)).inputs?.includes('mouse') ?? true;
    // Settings/provider reads yielded: another request may have reserved the runner meanwhile.
    if (this.runner.busy) throw new HttpError(409, 'stop the running app first');
    this.previewProjection = { route, token, session, fullscreen: browser.fullscreen, projection };
    let href = '';
    try {
      await this.runner.startPreview({ projectId: p.id, projectDir: p.dir, devScript: m.scripts?.dev, devEnv: this.appEnv(), flat }, mode, async (devUrl) => {
        const url = devUrl ? new URL(devUrl) : new URL(route, this.panelUrl!);
        if (devUrl) url.searchParams.set('xrb-resume', '1');
        url.searchParams.set('xrb-preview-token', token);
        url.searchParams.set('xrb-preview-panel', new URL(this.panelUrl!).origin);
        url.searchParams.set('xrb-camera', projection);
        url.searchParams.set('xrb-mouse', mouseEnabled ? '1' : '0');
        url.searchParams.set('xrb-cursor', cursor);
        url.searchParams.set('xrb-preview-session', session);
        url.searchParams.set('xrb-preview-fullscreen', browser.fullscreen ? '1' : '0');
        url.searchParams.set('xrb-preview-route', route);
        href = url.href;
        if (!devUrl) return this.launchBrowser(href, browser.clientPort, browser.monitor, browser.fullscreen);
        const wrapper = new URL('/fullscreen-preview.html', this.panelUrl!);
        wrapper.searchParams.set('target', href);
        wrapper.searchParams.set('route', route);
        wrapper.searchParams.set('token', token);
        wrapper.searchParams.set('session', session);
        return this.launchBrowser(wrapper.href, browser.clientPort, browser.monitor, browser.fullscreen);
      });
    } catch (e) {
      if (this.previewProjection?.token === token) this.previewProjection = null;
      throw new HttpError(400, (e as Error).message);
    }
    return href;
  }

  /** flat: Orthographic managed camera; non-desktop displays also start mono and may switch live. */
  async run(p: Project, mode: RunMode, flat = false, cameraView = false, desktop?: { fullscreen: boolean; monitor: number }): Promise<void> {
    const m = this.manifestOf(p);
    if (buildTargetOf(m) === 'webxr') throw new HttpError(409, `${p.id} is a WebXR headset app: open it in a browser, or build a package for the headset`);
    const fresh = hostFreshness(this.repo, this.workspace);
    if (!fresh.exists) throw new HttpError(409, 'xrb-host.exe is not built: rebuild the host first');
    if (this.runner.busy) throw new HttpError(409, `${this.runner.projectId} is running: stop it first`);
    const selection = await this.effectiveSelection(m);
    const chosen = [...selection.inputs ?? [], selection.display, selection.platform].filter((n) => n && !BUILTIN_PROVIDERS.has(n));
    const missing = await this.missingPlugins(chosen);
    if (missing.length) throw new HttpError(409, `plugin ${missing.join(', ')} is not built in the workspace: rebuild the host first`, { needsRebuild: true });
    if (mode === 'dev') await this.ensureDevInstalled();
    const attemptedAt = Date.now();
    const cursor = (await readAppSettings(this.workspace)).cursor;
    try {
      await this.runner.start({
        projectId: p.id, mode, hostExe: fresh.exe, projectDir: p.dir, entryDir: this.entryOf(p, m),
        builtUrl: mode === 'built' && this.panelUrl
          ? `https://app.local/index.html?xrb-panel=${encodeURIComponent(this.panelUrl)}&xrb-mouse=${selection.inputs?.includes('mouse') ? '1' : '0'}&xrb-cursor=${cursor}` : undefined,
        devScript: m.scripts?.dev, devEnv: this.appEnv(), panelUrl: this.panelUrl, mouseEnabled: selection.inputs?.includes('mouse') ?? true, cursor, flat, switchView: selection.display !== 'desktop', cameraView,
        cameraAvailable: (selection.inputs ?? []).some((name) => !BUILTIN_PROVIDERS.has(name)),
        hostArgs: [`--title=${m.name}`, `--camera-projection=${flat ? 'orthographic' : 'perspective'}`, ...(await this.hostArgs(p, m, desktop, selection)), ...(flat && selection.display !== 'desktop' ? ['--view=2d'] : [])],
      });
    } catch (e) {
      const last = this.runner.state().last;
      const output = last?.projectId === p.id && last.endedMs >= attemptedAt ? last.lines : null;
      throw new HttpError(400, (e as Error).message, output?.length ? output.join('\n') : undefined);
    }
  }

  /**
   * Moves a project folder to the Recycle Bin (recoverable). node_modules is removed first and
   * for good: it is pnpm links into the shared store (recycling them is slow and could reach the
   * store), and the next workspace install recreates it.
   */
  private refuseIfBusy(id: string): void {
    if (this.runner.projectId === id) throw new HttpError(409, `${id} is running: stop it first`);
    const busy = this.jobs.active().find((j) => j.projectId === id);
    if (busy) throw new HttpError(409, `${busy.title} is ${busy.state} for this project`);
  }

  /** Archive (projects/<section>/x -> projects/archive/x) or unarchive (back to its section). */
  private async move(p: Project, toArchive: boolean): Promise<void> {
    try {
      const to = toArchive ? await archiveProject(this.projects, p) : await unarchiveProject(this.projects, p);
      log(`[projects] ${p.id} ${toArchive ? 'archived' : 'unarchived'}: ${path.relative(this.projects, to)}`);
    } catch (e) {
      if (e instanceof MoveRefused) throw new HttpError(409, e.message);
      throw e;
    }
  }

  async deleteProject(p: Project): Promise<void> {
    this.refuseIfBusy(p.id);
    const rel = path.relative(this.projects, p.dir);
    // projects/<section>/x, or projects/archive/x
    const segs = rel.split(path.sep);
    if (segs.length !== 3 || segs[0] !== PROJECTS || !segs[1] || !segs[2]) throw new HttpError(400, `not a project folder: ${rel}`);
    await fs.rm(path.join(p.dir, 'node_modules'), { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', RECYCLE, '-Path', p.dir],
        { windowsHide: true }, (err, _out, stderr) => (err ? reject(new HttpError(500, `could not move ${rel} to the Recycle Bin: ${stderr.trim() || err.message}`)) : resolve()));
    });
    await removeEmptyProjectSection(this.projects, p.section);
    log(`[projects] ${rel} moved to the Recycle Bin`);
  }

  /** Opens a folder in Explorer or a file in its default app, in front of the browser (open-folder.ps1). */
  openInShell(target: string): void {
    log(`[panel] open ${target}`);
    // explorer.exe started directly opens the window reliably (through PowerShell it often did
    // not); the helper then only waits for that window and brings it to the front.
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OPEN_FOLDER, '-Path', target, '-FocusOnly'],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }

  /** Routes under /api/projects/<id>/... ; true when handled. */
  async projectRoute(method: string, p: Project, rest: string[], req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (rest.length === 2 && rest[0] === 'package' && rest[1] === 'setup-status' && method === 'GET') {
      sendJson(res, 200, await this.packageSetupStatus(p));
      return true;
    }
    if (method !== 'POST' || rest.length !== 1) return false;
    switch (rest[0]) {
      case 'build-web':
        sendJson(res, 202, jobSummary(this.webBuild(p)));
        return true;
      case 'rebuild-app':
        sendJson(res, 202, jobSummary(this.rebuildApp(p)));
        return true;
      case 'package':
        sendJson(res, 202, jobSummary(await this.packageBuild(p, await readJson(req))));
        return true;
      case 'package-setup': {
        const body = await readJson<{ acceptTerms?: unknown }>(req);
        if (body.acceptTerms !== undefined && typeof body.acceptTerms !== 'boolean') throw new HttpError(400, 'acceptTerms must be a boolean');
        sendJson(res, 202, jobSummary(await this.packageSetup(p, body.acceptTerms === true)));
        return true;
      }
      case 'publish':
        sendJson(res, 202, jobSummary(await this.publish(p, await readJson(req))));
        return true;
      case 'activate':
        sendJson(res, 202, jobSummary(await this.activate(p, await readJson(req))));
        return true;
      case 'delete-release':
        sendJson(res, 202, jobSummary(await this.deleteRelease(p, await readJson(req))));
        return true;
      case 'unpublish':
        sendJson(res, 202, jobSummary(await this.unpublish(p, await readJson(req))));
        return true;
      case 'render-icon':
        sendJson(res, 202, jobSummary(this.renderIcon(p)));
        return true;
      case 'delete':
        await this.deleteProject(p);
        sendJson(res, 200, { deleted: p.id });
        return true;
      case 'archive':
        if (isArchivedId(p.id)) throw new HttpError(409, `${p.id} is already archived`);
        this.refuseIfBusy(p.id);
        await this.move(p, true);
        sendJson(res, 200, { archived: p.id, id: `${ARCHIVE}/${p.id}` });
        return true;
      case 'unarchive':
        if (!isArchivedId(p.id)) throw new HttpError(409, `${p.id} is not archived`);
        this.refuseIfBusy(p.id);
        await this.move(p, false);
        sendJson(res, 200, { unarchived: p.id, id: liveId(p.id) });
        return true;
      case 'open-folder':
        this.openInShell(p.dir);
        sendJson(res, 200, { opened: p.dir });
        return true;
      case 'open-manifest':
        this.openInShell(path.join(p.dir, MANIFEST));
        sendJson(res, 200, { opened: true });
        return true;
      case 'preview': {
        const { mode, flat, fullscreen, token, monitor } = await readJson<{ mode?: RunMode; flat?: boolean; fullscreen?: boolean; token?: string; monitor?: number }>(req);
        if (mode !== 'dev' && mode !== 'built') throw new HttpError(400, 'standalone preview mode must be built or dev');
        const runMode: RunMode = mode;
        const previewToken = typeof token === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(token) ? token : randomUUID();
        const screen = Number.isInteger(monitor) && monitor! >= 0 && monitor! <= 255 ? monitor! : 0;
        const url = await this.preview(p, runMode, flat === true, previewToken, {
          fullscreen: fullscreen === true, monitor: screen, clientPort: req.socket.remotePort ?? 0,
        });
        sendJson(res, 200, { url, fullscreen: fullscreen === true, monitor: screen });
        return true;
      }
      case 'run': {
        const { mode, flat, cameraView, fullscreen, monitor } = await readJson<{ mode?: RunMode; flat?: boolean; cameraView?: boolean; fullscreen?: boolean; monitor?: number }>(req);
        const runMode = mode === 'dev' ? 'dev' : 'built';
        if (runMode === 'built') {
          const build = this.webBuild(p);
          const done = await this.jobs.wait(build);
          if (done.state === 'failed') throw new HttpError(400, done.error ?? 'the app build failed');
        }
        const screen = Number.isInteger(monitor) && monitor! >= 0 && monitor! <= 255 ? monitor! : 0;
        await this.run(p, runMode, flat === true, cameraView === true, { fullscreen: fullscreen === true, monitor: screen });
        sendJson(res, 200, this.runner.state());
        return true;
      }
    }
    return false;
  }

  /** Other /api routes; true when handled. */
  async route(method: string, api: string[], req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const key = `${method} ${api.join('/')}`;
    if (api[0] === 'plugins' && api[1] === 'manage' && api.length >= 3) {
      const id = api[2];
      if (!pluginFolders(this.workspace).includes(id)) throw new HttpError(404, `no plugin ${id}`);
      if (method === 'GET' && api.length === 4 && api[3] === 'settings') {
        const meta = await pluginMeta(this.workspace, id), prefs = await readPluginPrefs(this.workspace);
        sendJson(res, 200, {
          enabled: !prefs.disabled.includes(id),
          runtime: effectiveSettings(meta.settings ?? [], prefs.settings[id]),
          panel: effectiveSettings(meta.panelSettings ?? [], prefs.panelSettings[id]),
        });
        return true;
      }
      if (method === 'POST' && api.length === 4 && api[3] === 'open-folder') {
        const dir = path.join(this.workspace, 'plugins', id);
        this.openInShell(dir);
        sendJson(res, 200, { opened: dir });
        return true;
      }
      if (method === 'POST' && api.length === 6 && api[3] === 'samples' && api[5] === 'import') {
        const meta = await pluginMeta(this.workspace, id), sample = meta.panelSamples?.find((item) => item.id === api[4]);
        if (!sample) throw new HttpError(404, `no sample ${api[4]} in plugin ${id}`);
        const body = await readJson<{ folder?: string; name?: string }>(req);
        if (!body.folder || !body.name?.trim()) throw new HttpError(400, 'project folder and name required');
        let projectId: string;
        try { projectId = await importPluginSample(this.projects, sample.dir, body.folder, body.name.trim()); }
        catch (error) { if (error instanceof ProjectRefused) throw new HttpError(409, error.message); throw error; }
        log(`[projects] imported ${id}/${sample.id} as projects/plugins/${projectId}`);
        this.hub.send('projects-changed', {});
        sendJson(res, 200, { id: projectId });
        return true;
      }
      if (method === 'GET' && api.length === 4 && api[3] === 'icon') {
        const file = await pluginIcon(this.workspace, id);
        if (!file) throw new HttpError(404, 'plugin has no icon');
        const png = await fs.readFile(file);
        if (png.length > 2 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new HttpError(400, 'plugin icon must be a PNG under 2 MB');
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(png);
        return true;
      }
      if (method === 'PUT' && api.length === 3) {
        const body = await readJson<{ enabled?: boolean; settings?: unknown; panelSettings?: unknown }>(req);
        if (typeof body.enabled !== 'boolean' && body.settings === undefined && body.panelSettings === undefined) throw new HttpError(400, 'enabled or settings required');
        if ((body.enabled !== undefined || body.settings !== undefined) && (this.runner.busy || this.jobs.active().length))
          throw new HttpError(409, 'stop the running app and jobs before changing plugins');
        const meta = await pluginMeta(this.workspace, id);
        const prefs = await readPluginPrefs(this.workspace);
        if (body.enabled !== undefined) {
          if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
          prefs.disabled = body.enabled ? prefs.disabled.filter((item) => item !== id) : [...new Set([...prefs.disabled, id])];
        }
        if (body.settings !== undefined) {
          try { prefs.settings[id] = validateSettings(meta.settings ?? [], body.settings); }
          catch (e) { throw new HttpError(400, (e as Error).message); }
        }
        if (body.panelSettings !== undefined) {
          if (prefs.disabled.includes(id)) throw new HttpError(409, 'enable the plugin before changing its settings');
          try { prefs.panelSettings[id] = validateSettings(meta.panelSettings ?? [], body.panelSettings); }
          catch (e) { throw new HttpError(400, (e as Error).message); }
        }
        await savePluginPrefs(this.workspace, prefs);
        await Promise.all([this.loadPackagers(), this.loadPublishers()]);
        this.hub.send('plugins-changed', { id });
        this.hub.send('projects-changed', {});
        sendJson(res, 200, { saved: true });
        return true;
      }
      return false;
    }
    if (method === 'DELETE' && api[0] === 'packages' && (api.length === 2 || api.length === 3)) {
      const channel = api.length === 3 ? api[1] : '';
      const file = api.at(-1)!;
      if (!(await this.packages.delete(channel, file))) throw new HttpError(404, `no package ${file}`);
      sendJson(res, 200, { deleted: file });
      return true;
    }
    switch (key) {
      case 'GET jobs':
        sendJson(res, 200, { jobs: this.jobs.list() });
        return true;
      case 'POST jobs/clear':
        sendJson(res, 200, { removed: this.jobs.clearFinished(), jobs: this.jobs.list() });
        return true;
      case 'GET packages':
        sendJson(res, 200, { packages: await this.packages.list() });
        return true;
      case 'POST packages/open-folder': {
        const { channel } = await readJson<{ channel?: string }>(req);
        if (typeof channel !== 'string' || !/^[a-z0-9-]+$/.test(channel)) throw new HttpError(400, 'valid package channel required');
        const out = path.join(this.workspace, 'builds', channel);
        await fs.mkdir(out, { recursive: true });
        this.openInShell(out);
        sendJson(res, 200, { opened: out });
        return true;
      }
      case 'GET host':
        sendJson(res, 200, { ...hostFreshness(this.repo, this.workspace), workspace: this.workspace });
        return true;
      case 'GET panel':
        sendJson(res, 200, this.panelFreshness());
        return true;
      case 'GET plugins': {
        // Host providers and packagers are independent; disabled plugins are excluded from both.
        const prefs = await readPluginPrefs(this.workspace);
        const folders = pluginFolders(this.workspace), metaByFolder = new Map(await Promise.all(folders.map(async (id) => [id, await pluginMeta(this.workspace, id).catch(() => null)] as const)));
        const activeMeta = folders.filter((id) => !prefs.disabled.includes(id)).map((id) => metaByFolder.get(id));
        const standaloneTargets = [...new Set(activeMeta.flatMap((meta) => meta?.panelTargets ?? []))];
        const presentProvider = (provider: Awaited<ReturnType<typeof listProviders>>['providers'][number]) => {
          if (!provider.path) return provider;
          const folder = path.relative(path.join(this.workspace, 'plugins'), provider.path).split(path.sep)[0], meta = metaByFolder.get(folder);
          if (!meta) return provider;
          const presentedName = meta.panelProviderNames?.[provider.name] ?? provider.name;
          return { ...provider, name: presentedName, ...(presentedName !== provider.name ? { runtimeName: provider.name } : {}), label: meta.title,
            ...(meta.panelHiddenProviders?.includes(provider.name) ? { hidden: true } : {}),
            screenName: provider.role === 'display' ? meta.screenName : undefined,
            displayMode: provider.role === 'display' ? meta.displayMode : undefined };
        };
        const all = await listProviders(this.repo, this.workspace, true);
        const disabled = all.providers.filter((p) => p.path && prefs.disabled.includes(path.relative(path.join(this.workspace, 'plugins'), p.path).split(path.sep)[0])).map(presentProvider);
        const disabledNames: Array<{ name: string; role: string }> = [];
        for (const id of prefs.disabled) {
          const meta = metaByFolder.get(id), role = meta?.type;
          if (role && ['input', 'display', 'platform'].includes(role) && meta?.panelProviderNames)
            disabledNames.push(...Object.values(meta.panelProviderNames).map((name) => ({ name, role })));
          else for (const candidate of ['input', 'display', 'platform']) if (id.startsWith(`${candidate}-`)) disabledNames.push({ name: id.slice(candidate.length + 1), role: candidate });
        }
        // Packager-only folders need not have a role prefix or a native provider.
        if (prefs.disabled.length) for (const plugin of await this.managedPlugins()) {
          if (!plugin.enabled && plugin.packager) disabledNames.push({ name: plugin.name, role: 'platform' });
        }
        const available = await listProviders(this.repo, this.workspace);
        const providers = available.providers.map(presentProvider);
        sendJson(res, 200, { ...available, providers,
          disabled: [...new Map([...disabled.map(({ name, role }) => ({ name, role })), ...disabledNames]
            .map((provider) => [`${provider.role}:${provider.name}`, provider])).values()],
          packagers: platformsFor(this.packagers, 'host'), headsetPlatforms: platformsFor(this.packagers, 'webxr'), standaloneTargets,
          packagerLabels: Object.fromEntries(this.packagers.found.filter(({ packager }) => packager.label)
            .map(({ packager }) => [packager.name, packager.label])), packagerProblems: this.packagers.problems });
        return true;
      }
      case 'GET plugins/manage':
        sendJson(res, 200, { plugins: await this.managedPlugins() });
        return true;
      case 'POST host/rebuild':
        if (this.runner.busy) throw new HttpError(409, 'stop the running host first: its exe is locked while it runs');
        sendJson(res, 202, jobSummary(this.startJob('host-rebuild', null, 'rebuild xrb-host', (ctx) => rebuildHost(this.repo, this.workspace, ctx))));
        return true;
      case 'GET preview/projection': {
        const query = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
        const current = this.previewProjection;
        if (!current || query.get('route') !== current.route || query.get('token') !== current.token) throw new HttpError(404, 'preview projection scope is not active');
        sendJson(res, 200, { route: current.route, projection: current.projection });
        return true;
      }
      case 'POST preview/projection': {
        const { route, token, projection } = await readJson<{ route?: string; token?: string; projection?: string }>(req);
        const current = this.previewProjection;
        if (!current || route !== current.route || token !== current.token) throw new HttpError(409, 'preview projection scope is not active');
        if (projection !== 'perspective' && projection !== 'orthographic') throw new HttpError(400, 'preview projection is invalid');
        try { this.runner.setPreviewView(projection === 'orthographic'); }
        catch (error) { throw new HttpError(409, (error as Error).message); }
        current.projection = projection;
        sendJson(res, 200, { route, projection });
        return true;
      }
      case 'POST preview/close': {
        const { route, token, session } = await readJson<{ route?: string; token?: string; session?: string }>(req);
        const current = this.previewProjection;
        if (!current || !current.fullscreen || route !== current.route || token !== current.token || session !== current.session)
          throw new HttpError(409, 'fullscreen preview scope is not active');
        try { await this.runner.closePreview(); }
        catch (error) { throw new HttpError(409, (error as Error).message); }
        if (this.previewProjection === current) this.previewProjection = null;
        sendJson(res, 200, { closed: true });
        return true;
      }
      case 'GET app-settings':
        sendJson(res, 200, await readAppSettings(this.workspace));
        return true;
      case 'PUT app-settings': {
        const body = await readJson(req);
        let saved;
        try { saved = await saveAppSettings(this.workspace, body); }
        catch (error) { throw new HttpError(400, (error as Error).message); }
        sendJson(res, 200, saved);
        return true;
      }
      case 'GET run':
        sendJson(res, 200, { state: this.runner.state(), log: this.runner.logLines() });
        return true;
      case 'POST run/clear-log':
        this.runner.clearLog();
        sendJson(res, 200, { cleared: true });
        return true;
      case 'POST run/stop':
        await this.runner.stop();
        this.previewProjection = null;
        sendJson(res, 200, this.runner.state());
        return true;
      case 'POST run/cameras': {
        const { enabled } = await readJson<{ enabled?: boolean }>(req);
        if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
        try { await this.runner.setCameras(enabled); }
        catch (e) { throw new HttpError(409, (e as Error).message); }
        sendJson(res, 200, this.runner.state());
        return true;
      }
      case 'POST run/view': {
        const { flat } = await readJson<{ flat?: boolean }>(req);
        try {
          await this.runner.setView(flat === true);
        } catch (e) {
          throw new HttpError(409, (e as Error).message);
        }
        sendJson(res, 200, this.runner.state());
        return true;
      }
      case 'POST run/stop-foreign': {
        const { pid } = await readJson<{ pid?: number }>(req);
        if (!pid || !this.runner.state().foreign.some((f) => f.pid === pid)) throw new HttpError(400, 'not a host reported as running elsewhere');
        await this.runner.stopForeign(pid);
        sendJson(res, 200, this.runner.state());
        return true;
      }
      case 'POST restart': {
        const { confirm } = await readJson<{ confirm?: boolean }>(req);
        const busy = [this.runner.busy ? `${this.runner.projectId} is running` : '', ...this.jobs.active().map((j) => `${j.title} is ${j.state}`)].filter(Boolean);
        if (busy.length && !confirm) throw new HttpError(409, `${busy.join('; ')}. Restart anyway? The host is stopped cleanly first.`, { needsConfirm: 'restart' });
        sendJson(res, 200, { restarting: true, pid: process.pid, instanceId: this.instanceId });
        log('[panel] restart requested');
        setTimeout(() => this.onRestart(), 50);
        return true;
      }
      case 'POST quit': {
        const { confirm } = await readJson<{ confirm?: boolean }>(req);
        const busy = [this.runner.busy ? `${this.runner.projectId} is running` : '', ...this.jobs.active().map((j) => `${j.title} is ${j.state}`)].filter(Boolean);
        if (busy.length && !confirm) throw new HttpError(409, `${busy.join('; ')}. Quit anyway? The host is stopped cleanly first.`, { needsConfirm: 'quit' });
        sendJson(res, 200, { quitting: true });
        log('[panel] quit requested');
        setTimeout(() => this.onQuit(), 50);
        return true;
      }
    }
    return false;
  }

  async dispose(): Promise<void> {
    if (this.runner.busy) await this.runner.stop();
  }
}

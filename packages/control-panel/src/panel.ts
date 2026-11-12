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
import { APP_FAVICON_FILE, finalizeBrowserBuild } from './browser-build.ts';
import { projectFile } from './embedded-projects.ts';
import { staticSourcesMatchBaseline, trackSourceFinalization } from './embedded-source-refresh.ts';
import { prepareEmbeddedProject, prepareEmbeddedDependencies, projectWritableRoot, embeddedProjectEnvironment, withEmbeddedProjectLock, runEmbeddedProjectScript } from './embedded-project-state.ts';
import { effectiveInputFingerprint, effectiveProjectOutput, publishEffectiveOutput, markEffectiveBuildFailed } from './embedded-project-output.ts';
import { metadataText } from './embedded-inputs.ts';
import { stagePackagerInputs } from './package-staging.ts';
import { setupEmbeddedServices, embeddedServiceRuntime } from './service-artifacts.ts';
import { pluginDiscoverySnapshot, type DiscoverySnapshot } from './plugin-discovery.ts';
import { cleanWorkingCache, reviewWorkingCache } from './cache-maintenance.ts';
import { requireProjectOutput, projectPreviewRoute } from './project-build.ts';
import { assertEditableProject, assertUserRoot, assertWritablePath } from './project-access.ts';
import { projectStateKey, readProjectRunSettings, saveProjectRunSettings, validateRunOverrides, withRunSettings } from './project-run-settings.ts';
import { launchBlocker, type LaunchState } from './launch-blockers.ts';
import { log } from './env.ts';
import { resolvedHostFreshness, listProviders, resolvedPluginBinDirs, rebuildHost, clearProviderCache } from './host-build.ts';
import { DesktopSetup } from './desktop-setup.ts';
import { panelFreshness, panelSourceRoots, type PanelFreshness } from './panel-freshness.ts';
import { HostRunner, type RunMode } from './host-runner.ts';
import { effectiveSettings, pluginIcon, updatePluginPrefs, pluginPrefsRevision, validateSettings, type PluginSetting, type SettingValue } from './plugin-manager.ts';
import { PluginConfigConflict, PluginConfigInvalid, readUserPluginConfigState, writeUserPluginConfig, type UserPluginConfigState } from './plugin-config.ts';
import { pluginByReference, pluginEnabled, pluginOwnsPath, pluginPackageDirs, pluginPreferenceValues, resolvePluginCatalog, discoverProjectCatalog, containedPath, type PluginCatalog } from './extension-catalog.ts';
import { HttpError, readJson, sendJson, type EventHub } from './http.ts';
import { JobRefused, JobRunner, runProcess, type Job, type JobContext } from './jobs.ts';
import { discoverPackagers, packagerFor, platformsFor, targetOf, validSetupStatus, type BuildTarget, type IdentityField, type PackagerDiscovery, type PackagerSetupStatus, type RoleSelection } from './packagers.ts';
import { PackageList } from './packages.ts';
import { ARCHIVE, buildTargetOf, compareVersions, defaultEntry, isArchivedId, liveId, MANIFEST, MoveRefused, nextVersion, PROJECTS, UNSORTED, readProject, saveManifest, selectionOf, validateManifest, type FieldError, type Manifest, type Project } from './projects.ts';
import { archiveProject, readLayout, removeEmptyProjectSection, unarchiveProject } from './layout.ts';
import { discoverPublishers, normalizeReleaseCatalog, publicationUrl, publisherFor, publisherUnconfigured, releaseIdProblem, type PublicationCard, type PublicationIdentity, type Publisher, type PublisherDiscovery, type PublisherReleaseCatalog, type PublisherStatus } from './publishers.ts';
import { compareVersions as compareReleaseVersions, highestVersion, publicationCard, publicationIdentity, receiptMatchesOutput, suggestedVersion, verifyBuildReceipt, versionProblem, writeBuildReceipt, type PublicationConfig } from './publication.ts';
import { importPluginSample, ProjectRefused } from './workspace.ts';
import { projectIconSource } from './project-icons.ts';

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
  private preparingNativeRun = false;
  private preparingPreview = false;
  private changingPlugins = false;
  private maintainingCache = false;
  private pluginConsumers = 0;
  private servicesRevision: string | null = null;
  private servicesPending = false;
  private servicesProblem: string | null = null;
  /** Set when executed plugin module code changed: only a panel restart clears servicesPending. */
  private servicesNeedRestart = false;
  private servicesSync: Promise<void> | null = null;
  private servicesCheckedMs = 0;
  private readonly executedPluginCode = new Map<string, string>();
  discoveryMaxAgeMs = 1000;
  onPluginSourcesChanged: (restartRequired?: boolean) => Promise<void> = async () => {};
  restartPending = false;
  restartWorkPending: () => boolean = () => false;
  private readonly settingsWrites = new Set<string>();
  readonly runner = new HostRunner();
  desktopSetup: DesktopSetup;
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
  private previewProjection: { route: string; token: string; session: string; fullscreen: boolean; monitor: number; projection: 'perspective' | 'orthographic' } | null = null;

  constructor(repo: string, workspace: string, hub: EventHub, projects = workspace, bootstrapPackageLock = false) {
    assertUserRoot(repo, workspace);
    assertUserRoot(repo, projects);
    this.repo = repo;
    this.workspace = workspace;
    this.desktopSetup = new DesktopSetup(repo, workspace);
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

  private async withPluginServices<T>(work: () => Promise<T>): Promise<T> {
    await this.synchronizePluginServices(true);
    if (this.restartPending || this.changingPlugins || this.maintainingCache || this.servicesPending) throw new HttpError(409, this.servicesProblem ?? 'Plugin services are changing; retry after the update');
    this.pluginConsumers++;
    try { return await work(); } finally { this.pluginConsumers--; }
  }

  private async withPluginMutation<T>(work: () => Promise<T>): Promise<T> {
    if (this.restartPending || this.changingPlugins || this.pluginConsumers || this.preparingNativeRun || this.preparingPreview || this.runner.busy || this.jobs.active().length || this.settingsWrites.size)
      throw new HttpError(409, 'Stop running apps and jobs and wait for launch/settings preparation before changing plugins');
    this.changingPlugins = true;
    try { return await work(); } finally { this.changingPlugins = false; }
  }

  private async catalogFingerprint(catalog: PluginCatalog): Promise<string> {
    const plugins = await Promise.all(catalog.plugins.map(async plugin => {
      const declarations = await Promise.all((await pluginPackageDirs(plugin)).map(async dir => {
        const relative = path.relative(plugin.sourceRoot, path.join(dir, 'package.json')).split(path.sep).join('/');
        const file = await containedPath(plugin.sourceRoot, relative).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        return [relative, file ? await metadataText(file) : null];
      }));
      return [plugin.key, plugin.sourceRoot, plugin.meta, declarations];
    }));
    return createHash('sha256').update(JSON.stringify({ plugins, selected: catalog.selected.map(plugin => plugin.key), problems: catalog.problems })).digest('hex');
  }

  private async pluginSourceRevision(catalog: PluginCatalog): Promise<string> {
    return createHash('sha256').update(`${await pluginPrefsRevision(this.workspace)}\0${await this.catalogFingerprint(catalog)}`).digest('hex');
  }

  pluginServiceStatus() { return { pending: this.servicesPending || this.changingPlugins || this.maintainingCache, problem: this.servicesProblem }; }

  private codeChanged(snapshot: DiscoverySnapshot): boolean {
    for (const [file, stamp] of snapshot.code) if (this.executedPluginCode.has(file) && this.executedPluginCode.get(file) !== stamp) return true;
    for (const file of this.executedPluginCode.keys()) if (snapshot.roots.some(root => file.startsWith(`${root}${path.sep}`)) && !snapshot.code.has(file)) return true;
    return false;
  }
  private rememberPluginCode(snapshot: DiscoverySnapshot): void {
    for (const [file, stamp] of snapshot.code) this.executedPluginCode.set(file, stamp);
  }
  async loadInitialServices(): Promise<void> {
    try { await this.refreshPluginServices(); }
    catch (error) {
      // Keep the control panel available for explicit setup/recovery; never activate the previous source.
      this.servicesPending = true; this.servicesProblem = (error as Error).message;
      this.packagers = { found: [], problems: [this.servicesProblem] }; this.publishers = { found: [], problems: [this.servicesProblem] };
    }
  }

  async synchronizePluginServices(force = false): Promise<void> {
    if (this.changingPlugins || !force && Date.now() - this.servicesCheckedMs < this.discoveryMaxAgeMs) return;
    if (this.servicesSync) return this.servicesSync;
    this.servicesSync = (async () => {
      try {
        const snapshot = await pluginDiscoverySnapshot(this.repo, this.workspace);
        if (this.changingPlugins) return;
        this.servicesCheckedMs = Date.now();
        if (this.servicesRevision === null && !snapshot.problem) {
          // Embedders/tests may have supplied service objects directly; establish their initial boundary.
          this.servicesRevision = snapshot.revision; this.rememberPluginCode(snapshot); return;
        }
        if (snapshot.revision === this.servicesRevision && !snapshot.problem) return;
        this.servicesPending = true;
        this.servicesProblem = snapshot.problem ?? 'Plugin discovery changed; wait for running work to finish';
        const restartRequired = this.codeChanged(snapshot);
        await this.onPluginSourcesChanged(restartRequired);
        if (snapshot.problem || restartRequired) {
          this.servicesNeedRestart = !snapshot.problem && restartRequired;
          this.servicesProblem = snapshot.problem ?? 'Plugin module code or dependencies changed; restart the panel before using plugins';
          this.packagers = { found: [], problems: [this.servicesProblem] }; this.publishers = { found: [], problems: [this.servicesProblem] };
          this.publicationStatuses.clear(); clearProviderCache(); return;
        }
        if (this.pluginConsumers || this.preparingNativeRun || this.preparingPreview || this.runner.busy || this.jobs.active().length || this.settingsWrites.size) return;
        await this.withPluginMutation(() => this.refreshPluginServices());
        this.hub.send('plugins-changed', {}); this.hub.send('projects-changed', {});
      } catch (error) {
        this.servicesPending = true; this.servicesProblem = `Plugin discovery unavailable: ${(error as Error).message}`;
        this.packagers = { found: [], problems: [this.servicesProblem] }; this.publishers = { found: [], problems: [this.servicesProblem] };
        this.publicationStatuses.clear(); clearProviderCache();
      }
    })().finally(() => { this.servicesSync = null; });
    return this.servicesSync;
  }

  private async refreshPluginServices(expected?: string): Promise<void> {
    // Never retain the previous source as fallback after a committed selection change.
    this.packagers = { found: [], problems: ['Plugin services are refreshing'] };
    this.publishers = { found: [], problems: ['Plugin services are refreshing'] };
    this.publicationStatuses.clear(); this.freshness = null; clearProviderCache();
    const before = await this.catalogFingerprint(await resolvePluginCatalog(this.workspace, this.repo, true));
    if (expected && before !== expected) throw new HttpError(409, 'Plugin declarations changed; reload and select the source again');
    const snapshot = await pluginDiscoverySnapshot(this.repo, this.workspace);
    if (snapshot.problem || this.codeChanged(snapshot)) {
      this.servicesPending = true; this.servicesNeedRestart = !snapshot.problem; this.servicesProblem = snapshot.problem ?? 'Plugin module code or dependencies changed; restart the panel before using plugins';
      throw new HttpError(409, this.servicesProblem);
    }
    this.rememberPluginCode(snapshot);
    const [packagers, publishers] = await Promise.all([discoverPackagers(this.repo, this.workspace), discoverPublishers(this.workspace, this.repo)]);
    if (before !== await this.catalogFingerprint(await resolvePluginCatalog(this.workspace, this.repo, true))) throw new HttpError(409, 'Plugin sources changed during refresh; reload and select the source again');
    const after = await pluginDiscoverySnapshot(this.repo, this.workspace);
    if (after.revision !== snapshot.revision) { this.servicesPending = true; this.servicesProblem = 'Plugin sources changed during refresh; restart or set up services again'; throw new HttpError(409, this.servicesProblem); }
    this.packagers = packagers; this.publishers = publishers;
    this.servicesRevision = after.revision; this.servicesPending = false; this.servicesNeedRestart = false; this.servicesProblem = null; this.servicesCheckedMs = Date.now();
    await this.onPluginSourcesChanged();
  }

  private startJob(...args: Parameters<JobRunner['start']>): Job {
    if (this.restartPending) throw new HttpError(409, 'The panel is restarting');
    if (this.servicesPending) throw new HttpError(409, this.servicesProblem ?? 'Plugin discovery is awaiting refresh');
    if (this.changingPlugins) throw new HttpError(409, 'Plugin services are changing; retry after the update');
    try {
      const [kind, projectId, , work] = args;
      if (projectId?.startsWith('bundled:') && kind !== 'cache-cleanup') {
        args[3] = async ctx => {
          const p = (await discoverProjectCatalog(this.repo, this.workspace, this.projects)).projects.find(record => record.project.id === projectId)?.project;
          if (!p) throw new HttpError(409, 'Project organization changed before the job started');
          return withEmbeddedProjectLock(this.repo, this.projects, p, async () => {
            // Web/icon jobs resolve their effective project inside the callback. Other
            // jobs already captured validated settings: refuse if that snapshot moved.
            if (!['web-build', 'icon-render'].includes(kind)) {
              const effective = await this.prepareProject(p);
              if (effective.workingRoot !== p.workingRoot) throw new HttpError(409, 'Project code updated before the job started; try the action again');
            }
            return work(ctx);
          });
        };
      }
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

  async prepareProject(p: Project): Promise<Project> {
    return prepareEmbeddedProject(this.repo, this.workspace, this.projects, p);
  }

  private async reloadPreparedProject(p: Project): Promise<Project> {
    const current = (await discoverProjectCatalog(this.repo, this.workspace, this.projects)).projects.find(record => record.project.id === p.id)?.project;
    if (!current || current.key !== p.key) throw new HttpError(409, 'Project organization changed; try again');
    return this.prepareProject(current);
  }

  private writableRoot(p: Project): string { return projectWritableRoot(this.projects, p); }

  private editableManifest(p: Project): Manifest {
    assertEditableProject(this.repo, this.projects, p);
    const m = this.manifestOf(p);
    for (const file of [MANIFEST, m.icon, m.entry ?? defaultEntry(m.kind)].filter((value): value is string => !!value))
      assertWritablePath(this.repo, this.writableRoot(p), path.resolve(p.dir, file));
    return m;
  }

  private entryOf(p: Project, m: Manifest): string {
    return path.resolve(p.dir, m.entry ?? defaultEntry(m.kind));
  }

  /** Re-reads the project (its manifest may have changed during a job) and applies `change`. */
  private async updateManifest(projectId: string, change: (m: Manifest) => Manifest): Promise<void> {
    const p = (await discoverProjectCatalog(this.repo, this.workspace, this.projects)).projects.find(({ project }) => project.id === projectId)?.project;
    if (!p?.manifest) return;
    const next = change(p.manifest);
    if (validateManifest(next, p.dir).length) return;
    this.editableManifest(p);
    await saveManifest(p.dir, next, p.manifestMtimeMs);
  }

  /** Disabled plugins stay in the manifest, but runs and packages use available alternatives. */
  private async effectiveSelection(m: Manifest): Promise<RoleSelection> {
    const catalog = await resolvePluginCatalog(this.workspace, this.repo, true), prefs = catalog.prefs;
    const disabled = new Set(prefs.disabled);
    const all = await listProviders(this.repo, this.workspace, true);
    for (const provider of all.providers) {
      if (provider.path && catalog.selected.some(plugin => !pluginEnabled(plugin, prefs) && pluginOwnsPath(plugin, provider.path!)))
        disabled.add(provider.name);
    }
    for (const reference of prefs.disabled) {
      const folder = pluginByReference(catalog, reference)?.id ?? reference;
      for (const prefix of ['input-', 'display-', 'platform-'])
        if (folder.startsWith(prefix)) disabled.add(folder.slice(prefix.length));
    }
    const selected = selectionOf(m);
    const inputs = (selected.inputs ?? []).filter((name) => !disabled.has(name));
    return { ...selected, input: inputs.find((name) => name !== 'mouse' && name !== 'keyboard') ?? 'none', inputs,
      display: disabled.has(selected.display) ? 'desktop' : selected.display,
      platform: disabled.has(selected.platform) ? '' : selected.platform };
  }

  private async runtimeConfig(m: Manifest, selection: RoleSelection, desktop?: { fullscreen: boolean; monitor: number }): Promise<RoleSelection & { plugins: Record<string, unknown> }> {
    const plugins = structuredClone(m.plugins ?? {}) as Record<string, unknown>;
    const catalog = await resolvePluginCatalog(this.workspace, this.repo), prefs = catalog.prefs;
    const providers = await listProviders(this.repo, this.workspace);
    const chosen = new Set([...selection.inputs ?? [], selection.display, selection.platform]);
    for (const provider of providers.providers.filter((p) => !p.builtin && p.path && chosen.has(p.name))) {
      const plugin = catalog.selected.find(plugin => pluginOwnsPath(plugin, provider.path!));
      if (!plugin) continue;
      const fields = plugin.meta.settings ?? [];
      if (fields.length) plugins[provider.name] = { ...effectiveSettings(fields, pluginPreferenceValues(plugin, prefs)), ...((plugins[provider.name] as Record<string, unknown> | undefined) ?? {}) };
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
    if (p.readOnly && h.args?.length) throw new HttpError(409, 'Prepare embedded working state before using custom host arguments');
    const key = projectStateKey(this.repo, p);
    const state = path.join(this.workspace, 'build', 'project-state', key);
    const config = path.join(state, `${this.instanceId}.json`);
    assertWritablePath(this.repo, this.workspace, config);
    await fs.mkdir(state, { recursive: true });
    const selection = effective ?? await this.effectiveSelection(m);
    await fs.writeFile(config, JSON.stringify(await this.runtimeConfig(m, selection, desktop), null, 2));
    const providers = await listProviders(this.repo, this.workspace);
    if (providers.unsafe || providers.error && (await resolvedPluginBinDirs(this.repo, this.workspace)).length)
      throw new HttpError(409, providers.error ?? 'Native provider discovery is unsafe');
    const args: string[] = [`--config=${config}`, ...(providers.pluginBins ?? []).map((d) => `--plugin-dir=${d}`)];
    if (h.recordHands) {
      const file = p.readOnly ? path.join(state, 'recordings', path.basename(h.recordHands)) : path.resolve(p.dir, h.recordHands);
      assertWritablePath(this.repo, p.readOnly ? this.workspace : this.writableRoot(p), file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      args.push(`--record-hands=${file}`);
    }
    const icon = m.icon ? await projectFile(p, m.icon).catch((error: HttpError) => { if (error.status === 404) return null; throw error; }) : null;
    if (icon && (await fs.access(icon).then(() => true, () => false))) args.push(`--icon=${icon}`);
    else if (!m.icon && ((m.iconColor && m.iconColor !== 'blue') || (m.iconShape && m.iconShape !== 'sphere'))) {
      // The host's built-in icon is the blue sphere; any other generated default goes in as a PNG.
      const file = path.join(state, `default-${m.iconColor ?? 'blue'}-${m.iconShape ?? 'sphere'}.png`);
      assertWritablePath(this.repo, this.workspace, file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, defaultIcon(256, m.iconColor, m.iconShape));
      args.push(`--icon=${file}`);
    }
    args.push(...(h.args ?? []));
    return args;
  }

  private async finalizeBrowserOutput(p: Project, m: Manifest): Promise<boolean> {
    this.editableManifest(p);
    for (const name of ['index.html', APP_FAVICON_FILE]) assertWritablePath(this.repo, this.writableRoot(p), path.join(this.entryOf(p, m), name));
    return (await trackSourceFinalization(this.repo, this.projects, p, () => finalizeBrowserBuild(this.entryOf(p, m), {
      file: m.icon ? path.resolve(p.dir, m.icon) : undefined,
      color: m.iconColor,
      shape: m.iconShape,
      description: m.description,
    }))).changed;
  }

  private async executeBrowserBuild(p: Project, m: Manifest, ctx: JobContext): Promise<void> {
    const script = m.scripts?.build;
    if (!script) throw new Error(`${p.id} has no build script`);
    if (p.workingRoot) await prepareEmbeddedDependencies(this.repo, this.projects, p, ctx);
    else await this.ensureInstalled(ctx);
    // Corepack ships with Node and provides the workspace's pinned pnpm version without requiring
    // a global pnpm command. It runs through cmd.exe; script names are plain names (manifest rules).
    if (p.workingRoot) await runEmbeddedProjectScript(this.repo, this.projects, p, ctx, script);
    else await ctx.run('cmd.exe', ['/d', '/s', '/c', `corepack pnpm run ${script}`], { cwd: p.dir, env: { ...process.env, ...this.appEnv() } });
    if (await this.finalizeBrowserOutput(p, m)) ctx.line('Applied the project icon as the browser favicon.');
  }

  private async recordBrowserBuild(p: Project, entry: string): Promise<void> {
    const file = path.join(this.workspace, '.xrb', 'state', 'builds', `${p.id.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
    assertWritablePath(this.repo, this.workspace, file);
    await writeBuildReceipt(this.workspace, p.id, p.manifestMtimeMs, entry);
    if (p.workingRoot) await publishEffectiveOutput(this.repo, this.workspace, p);
  }

  private async checkEffectiveManifest(p: Project): Promise<void> {
    if (!p.workingRoot) return;
    assertEditableProject(this.repo, this.projects, p);
    const current = await readProject(p.dir, p.id, p.section);
    if (!current || current.manifestMtimeMs !== p.manifestMtimeMs || JSON.stringify(current.manifest) !== JSON.stringify(p.manifest)) throw new HttpError(409, 'Project settings changed before Build');
  }

  private async rebuildBrowserOutput(p: Project, m: Manifest, ctx: JobContext): Promise<void> {
    await this.checkEffectiveManifest(p);
    const before = p.workingRoot ? await effectiveInputFingerprint(p) : null;
    if (p.workingRoot) await markEffectiveBuildFailed(this.repo, this.workspace, p);
    await this.executeBrowserBuild(p, m, ctx);
    if (before && before !== await effectiveInputFingerprint(p)) throw new HttpError(409, 'Project source changed during Build; try again');
    const currentMtimeMs = (await fs.stat(path.join(p.dir, MANIFEST))).mtimeMs;
    if (currentMtimeMs !== p.manifestMtimeMs) throw new Error('Project settings changed during Build. Review them and try again.');
    const entry = this.entryOf(p, m);
    await this.recordBrowserBuild(p, entry);
    await verifyBuildReceipt(this.workspace, p.id, currentMtimeMs, entry);
  }

  private async ensureBrowserBuild(p: Project, m: Manifest, ctx: JobContext, requireScriptOnStale = false): Promise<void> {
    await this.checkEffectiveManifest(p);
    const entry = this.entryOf(p, m);
    let receiptError: Error | null = null;
    try {
      await verifyBuildReceipt(this.workspace, p.id, p.manifestMtimeMs, entry);
      if (p.workingRoot) await effectiveProjectOutput(this.repo, this.workspace, p);
    } catch (error) {
      receiptError = error as Error;
    }
    if (!receiptError) {
      if (await this.finalizeBrowserOutput(p, m)) {
        await this.recordBrowserBuild(p, entry);
        ctx.line('Updated the current successful build with the project favicon.');
      } else ctx.line('The current successful build is unchanged; using it.');
      return;
    }
    if (!m.scripts?.build) {
      const exists = await fs.access(path.join(entry, 'index.html')).then(() => true, () => false);
      // A static app has nothing to rebuild: its recorded output is still current when only the manifest changed
      // (a publication draft, for example). Changed or unrecorded output is still refused for publication.
      if (!exists || (requireScriptOnStale && !(await receiptMatchesOutput(this.workspace, p.id, entry)) && !(await staticSourcesMatchBaseline(p)))) throw new Error(`A current build is required, but ${p.id} has no build script.`);
      ctx.line('No build script is configured; using and recording the existing app output.');
      if (await this.finalizeBrowserOutput(p, m)) ctx.line('Applied the project icon as the browser favicon.');
      await this.recordBrowserBuild(p, entry);
      return;
    }
    ctx.line(`The build is not current (${receiptError.message}). Building now.`);
    await this.rebuildBrowserOutput(p, m, ctx);
  }

  webBuild(p: Project): Job {
    const m = p.origin === 'bundled' ? this.manifestOf(p) : this.editableManifest(p);
    return this.startJob('web-build', p.id, `build: ${m.name}`, async ctx => {
      const effective = await this.prepareProject(p);
      return this.ensureBrowserBuild(effective, this.editableManifest(effective), ctx);
    });
  }

  rebuildApp(p: Project): Job {
    if (p.origin === 'bundled') {
      const m = this.manifestOf(p);
      if (!m.scripts?.build) throw new HttpError(409, `${p.id} has no build script`);
      this.refuseIfLaunchBlocked(p, { preparingNativeRun: this.preparingNativeRun, preparingPreview: this.preparingPreview });
      this.refuseIfBusy(p.id);
      return this.startJob('web-build', p.id, `rebuild: ${m.name}`, async ctx => {
        const effective = await this.prepareProject(p);
        await this.rebuildBrowserOutput(effective, this.editableManifest(effective), ctx);
      });
    }
    const m = this.editableManifest(p);
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
    if (list.unsafe) throw new HttpError(409, list.error ?? 'Native provider discovery is unsafe');
    return Object.fromEntries(list.providers.filter((p) => !p.builtin && p.path).map((p) => [p.name, path.dirname(p.path!)]));
  }

  /** Selected plugins the host does not find (not built in the workspace). */
  async missingPlugins(names: string[]): Promise<string[]> {
    const dirs = await this.pluginDirs();
    return names.filter((n) => !dirs[n]);
  }

  /** All workspace plugins, including disabled and packager-only plugins. */
  async managedPlugins() {
    const catalog = await resolvePluginCatalog(this.workspace, this.repo, true), prefs = catalog.prefs;
    const providers = await listProviders(this.repo, this.workspace, true);
    const freshness = (await resolvedHostFreshness(this.repo, this.workspace)).plugins;
    const sourceRevision = await this.pluginSourceRevision(catalog);
    const plugins = await Promise.all(catalog.plugins.map(async (plugin) => {
      const meta = plugin.meta;
      if (meta.hidden) return null;
      const selected = catalog.selected.some(item => item.key === plugin.key);
      let problem = selected ? plugin.nativeProblem : 'Plugin origin is conflicting or not selected';
      const id = plugin.origin === 'workspace' && !catalog.plugins.some(item => item.id === plugin.id && item.origin !== plugin.origin) ? plugin.id : plugin.key;
      const ownProviders = providers.providers.filter((p) => p.path && pluginOwnsPath(plugin, p.path));
      const presentedProviders = ownProviders.map((provider) => {
        const presentedName = meta.panelProviderNames?.[provider.name] ?? provider.name;
        return { name: presentedName, role: provider.role, version: provider.version, ...(presentedName !== provider.name ? { runtimeName: provider.name } : {}),
          ...(meta.panelHiddenProviders?.includes(provider.name) ? { hidden: true } : {}) };
      });
      const native = freshness.filter((p) => p.key === plugin.key);
      problem ??= native.find(p => p.problem)?.problem ?? null;
      if (providers.blockedBins?.includes(plugin.binaryRoot)) problem ??= 'Native provider conflict or invalid DLL; see provider diagnostics';
      const packagerDecls = await Promise.all((await pluginPackageDirs(plugin)).map(async (dir) => {
        const decl = await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}');
        try {
          const pkg = JSON.parse(decl);
          return pkg.xrBuild?.packager ? pkg : null;
        } catch { return null; }
      }));
      const packager = packagerDecls.find(Boolean);
      const isPackager = !!packager;
      const publisher = this.publishers.found.find(item => item.plugin?.key === plugin.key)?.publisher;
      const packagerLabel = this.packagers.found.find(item => item.plugin?.key === plugin.key)?.packager.label;
      const name = meta.name ?? presentedProviders[0]?.name ?? (isPackager ? plugin.id.replace(/^platform-/, '') : plugin.id);
      const derivedType = publisher ? 'publisher' : ownProviders[0]?.role ?? (isPackager ? 'platform' : 'plugin');
      return {
        id, key: plugin.key, logicalId: plugin.id.toLowerCase(), origin: plugin.origin, readOnly: plugin.readOnly, selected,
        sourceRevision, selectedOrigin: Object.hasOwn(prefs.origins ?? {}, plugin.id.toLowerCase()) ? prefs.origins![plugin.id.toLowerCase()] : null,
        availableOrigins: [...new Set(catalog.plugins.filter(item => item.id.toLowerCase() === plugin.id.toLowerCase()).map(item => item.origin))], name, title: meta.title ?? meta.name ?? packagerLabel ?? publisher?.label ?? name, type: meta.type ?? derivedType,
        label: packagerLabel ?? publisher?.label,
        description: meta.description ?? ownProviders[0]?.description ?? (typeof packager?.description === 'string' ? packager.description : ''),
        settingsDescription: meta.settingsDescription ?? '',
        version: meta.version ?? null,
        enabled: selected && pluginEnabled(plugin, prefs), icon: await pluginIcon(plugin.workspaceRoot, plugin.id).catch(() => null) ? `/api/plugins/manage/${encodeURIComponent(id)}/icon` : null,
        glyph: meta.glyph ?? null,
        problem, providers: presentedProviders,
        packager: isPackager, built: !native.length || native.every((p) => p.built && !p.outdated),
        settings: meta.settings, values: effectiveSettings(meta.settings ?? [], pluginPreferenceValues(plugin, prefs)),
        ...await this.pluginConfigView(plugin),
        panelSettings: meta.panelSettings, panelValues: effectiveSettings(meta.panelSettings ?? [], pluginPreferenceValues(plugin, prefs, 'panelSettings')),
        samples: (meta.panelSamples ?? []).map(({ id: sampleId, name: sampleName, kind, description }) => ({ id: sampleId, name: sampleName, kind, description })),
        dir: `${plugin.origin === 'bundled' ? 'embedded/' : ''}plugins/${plugin.id}`,
      };
    }));
    return plugins.filter((plugin) => plugin !== null);
  }

  async setupDesktop(body: { action?: unknown; revision?: unknown; confirm?: unknown }): Promise<Job> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['action', 'revision', 'confirm'].includes(key))
      || body.confirm !== true || typeof body.action !== 'string' || !['toolchain', 'native-deps'].includes(body.action)) throw new HttpError(400, 'Confirm a supported desktop setup action before installing');
    const requireIdle = () => {
      if (this.restartPending || this.changingPlugins || this.pluginConsumers || this.preparingNativeRun || this.preparingPreview || this.runner.busy || this.jobs.active().length || this.settingsWrites.size)
        throw new HttpError(409, 'Stop apps/jobs and wait for preparation before desktop setup');
    };
    requireIdle();
    const status = await this.desktopSetup.check();
    requireIdle();
    if (body.revision !== status.revision || status.busy) throw new HttpError(409, 'Desktop setup changed or is busy; refresh the checklist');
    if (!status.supported || !status.steps.some(step => step.action === body.action && step.state === 'missing')) throw new HttpError(409, 'This desktop setup step is unavailable or already ready');
    const job = this.startJob('desktop-setup', null, body.action === 'toolchain' ? 'install desktop build tools' : 'install core native libraries', ctx => this.desktopSetup.install(body.action, body.revision, body.confirm, ctx));
    job.setupAction = body.action === 'toolchain' ? 'toolchain' : 'native-deps';
    return job;
  }

  cleanupWorkingCache(project: Project | undefined, body: Parameters<typeof cleanWorkingCache>[1]): Job {
    if (this.maintainingCache || this.changingPlugins || this.pluginConsumers || this.preparingNativeRun || this.preparingPreview || this.runner.busy || this.jobs.active().length || this.settingsWrites.size)
      throw new HttpError(409, 'Stop apps/jobs and wait for preparation before cache maintenance');
    return this.startJob('cache-cleanup', project?.id ?? null, 'remove reviewed working cache', async () => {
      this.maintainingCache = true;
      try { return await cleanWorkingCache({ core: this.repo, workspace: this.workspace, project }, body); }
      finally { this.maintainingCache = false; }
    });
  }

  setupBundledServices(): Job {
    if (this.changingPlugins || this.pluginConsumers || this.preparingNativeRun || this.preparingPreview || this.runner.busy || this.jobs.active().length || this.settingsWrites.size)
      throw new HttpError(409, 'Stop apps/jobs and wait for preparation before setting up bundled services');
    // Setup is the explicit recovery path for a failed/stale installed service snapshot.
    this.servicesPending = false;
    return this.startJob('tool-setup', null, 'set up bundled services', async ctx => {
      this.changingPlugins = true;
      try {
        const result = await setupEmbeddedServices(this.repo, this.workspace, ctx);
        await this.refreshPluginServices();
        this.hub.send('plugins-changed', {}); this.hub.send('projects-changed', {});
        return result;
      } catch (error) {
        this.servicesPending = true; this.servicesProblem = (error as Error).message; throw error;
      } finally { this.changingPlugins = false; }
    });
  }

  async selectPluginSource(reference: string, origin: unknown, revision: unknown): Promise<void> {
    if (origin !== 'bundled' && origin !== 'workspace') throw new HttpError(400, 'Select bundled or workspace origin');
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw new HttpError(409, 'Reload plugin sources before selecting an origin');
    await this.withPluginMutation(async () => {
      let expected: string | undefined;
      await updatePluginPrefs(this.workspace, async prefs => {
        const catalog = await resolvePluginCatalog(this.workspace, this.repo, true);
        if (revision !== await this.pluginSourceRevision(catalog)) throw new HttpError(409, 'Plugin sources or preferences changed; reload before selecting an origin');
        const plugin = pluginByReference(catalog, reference);
        if (!plugin) throw new HttpError(404, 'Plugin source is unavailable or ambiguous');
        const id = plugin.id.toLowerCase();
        prefs.origins = { ...prefs.origins, [id]: origin };
        const candidate = await resolvePluginCatalog(this.workspace, this.repo, true, prefs);
        if (!candidate.selected.some(item => item.id.toLowerCase() === id && item.origin === origin)) throw new HttpError(409, 'The selected plugin origin is missing, invalid or ambiguous');
        expected = await this.catalogFingerprint(candidate);
      }, this.repo, () => this.refreshPluginServices(expected));
      this.hub.send('plugins-changed', { reference }); this.hub.send('projects-changed', {});
    });
  }

  private async acceptExplicitServiceLoad(): Promise<void> {
    const snapshot = await pluginDiscoverySnapshot(this.repo, this.workspace);
    if (snapshot.problem || this.codeChanged(snapshot)) {
      this.servicesPending = true; this.servicesNeedRestart = !snapshot.problem; this.servicesProblem = snapshot.problem ?? 'Plugin module code or dependencies changed; restart the panel'; return;
    }
    this.servicesRevision = snapshot.revision; this.servicesPending = false; this.servicesNeedRestart = false; this.servicesProblem = null;
    this.rememberPluginCode(snapshot); this.servicesCheckedMs = Date.now();
  }

  /** Finds the packager plugins; problems are logged, never fatal. */
  async loadPackagers(): Promise<void> {
    this.packagers = await discoverPackagers(this.repo, this.workspace);
    await this.acceptExplicitServiceLoad();
    for (const f of this.packagers.found) log(`[panel] packager ${f.packager.name} from ${f.dir}`);
    for (const problem of this.packagers.problems) log(`[panel] packager not loaded: ${problem}`);
  }

  async loadPublishers(): Promise<void> {
    this.publishers = await discoverPublishers(this.workspace, this.repo);
    await this.acceptExplicitServiceLoad();
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

  async publicationOf(m: Manifest | null): Promise<{ available: boolean; publishers: Array<{ name: string; label?: string; origin: string; routePrefix?: string; releases: boolean; configured: boolean; configurationProblem?: string; settingsModule?: string }>; status: PublisherStatus | null; releases: PublicationReleases | null; reason: string | null }> {
    const list = this.publishers.found.map(({ publisher, plugin }) => {
      const unconfigured = publisherUnconfigured(publisher);
      // An unconfigured destination's origin is a placeholder: never present it as a destination.
      return { name: publisher.name, label: publisher.label, origin: unconfigured ? '' : publisher.origin, routePrefix: publisher.routePrefix, releases: !!publisher.releases && !unconfigured,
        configured: !unconfigured, ...(unconfigured ? { configurationProblem: unconfigured } : {}), ...(plugin ? { settingsModule: plugin.key } : {}) };
    });
    if (m && !publicationTargetOf(m)) return { available: false, publishers: list, status: null, releases: null, reason: 'publication is available only for app projects' };
    if (!m?.publication) return { available: false, publishers: list, status: null, releases: null, reason: 'publication is not configured' };
    const found = publisherFor(this.publishers, m.publication.publisher);
    if (!found) return { available: false, publishers: list, status: null, releases: null, reason: `publisher "${m.publication.publisher}" is unavailable` };
    const unconfigured = publisherUnconfigured(found.publisher);
    if (unconfigured) return { available: false, publishers: list, status: null, releases: null, reason: unconfigured };
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
    // An unconfigured destination has no real route to check or show.
    return Object.fromEntries(await Promise.all(this.publishers.found.filter(({ publisher }) => !publisherUnconfigured(publisher)).map(async ({ publisher }) => {
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
        if (this.publicationStatuses.get(key) !== current) return;
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
    const m = this.editableManifest(p), publication = m.publication;
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
    return this.withPluginServices(async () => this.preparePublish(await this.prepareProject(p), body));
  }
  private async preparePublish(p: Project, body: { version?: unknown; expectedRevision?: unknown }): Promise<Job> {
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    const unconfigured = publisherUnconfigured(publisher);
    if (unconfigured) throw new HttpError(409, unconfigured, { configuration: true });
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
        return publisher.publish({ app: p.workingRoot ? (await effectiveProjectOutput(this.repo, this.workspace, p)).entry : entry, publication: identity, card: await this.cardOf(p, m), log: ctx.line });
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
      return releases.publish({ app: p.workingRoot ? (await effectiveProjectOutput(this.repo, this.workspace, p)).entry : entry, publication: identity, version: release.version, expectedRevision: release.expectedRevision, card: await this.cardOf(p, m), log: ctx.line });
    }, operation, snapshot, release);
  }

  /** Make a retained release live: exact retained bytes at the canonical route, no rebuild, after confirmation. */
  async activate(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
    return this.withPluginServices(async () => this.prepareActivate(await this.prepareProject(p), body));
  }
  private async prepareActivate(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
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
      await this.checkEffectiveManifest(p);
      ctx.line(`Activating retained release ${target.version ?? 'legacy'} without rebuilding current source.`);
      return releases.activate({ publication: identity, releaseId: release.releaseId, expectedRevision: release.expectedRevision, card: await this.cardOf(p, m), log: ctx.line });
    }, 'activate', snapshot, release);
  }

  /** Remove a retained release that is not live or requested, after confirmation: history shrinks, the live route is untouched. */
  async deleteRelease(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
    return this.withPluginServices(async () => this.prepareDeleteRelease(await this.prepareProject(p), body));
  }
  private async prepareDeleteRelease(p: Project, body: { releaseId?: unknown; expectedRevision?: unknown; confirm?: unknown }): Promise<Job> {
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
      await this.checkEffectiveManifest(p);
      ctx.line(`Deleting retained release ${label}; the live route is not changed.`);
      return releases.delete({ publication: identity, releaseId: release.releaseId, expectedRevision: release.expectedRevision, log: ctx.line });
    }, 'delete-release', snapshot, release);
  }

  async unpublish(p: Project, body: { confirm?: boolean }): Promise<Job> {
    return this.withPluginServices(async () => this.prepareUnpublish(await this.prepareProject(p), body));
  }
  private async prepareUnpublish(p: Project, body: { confirm?: boolean }): Promise<Job> {
    if (!body.confirm) throw new HttpError(409, 'unpublish requires confirmation', { needsConfirm: 'unpublish' });
    const { m, publisher, identity, snapshot } = this.publicationTarget(p);
    return this.startJob('publication', p.id, `unpublish (${publisher.name}): ${m.name}`, async (ctx) => {
      await this.checkEffectiveManifest(p);
      return publisher.unpublish({ publication: identity, log: ctx.line });
    }, 'unpublish', snapshot);
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
    const packaging = this.packagingOf(this.editableManifest(p));
    if (!packaging.available) throw new HttpError(409, `packaging unavailable: ${packaging.reason}`);
    return packagerFor(this.packagers, packaging.platform)!.packager;
  }

  async packageSetupStatus(p: Project): Promise<PackagerSetupStatus> {
    return this.withPluginServices(() => this.checkPackageSetupStatus(p));
  }
  private async checkPackageSetupStatus(p: Project): Promise<PackagerSetupStatus> {
    const packaging = this.packagingOf(this.manifestOf(p));
    if (!packaging.available) throw new HttpError(409, `packaging unavailable: ${packaging.reason}`);
    const packager = packagerFor(this.packagers, packaging.platform)!.packager;
    if (!packager.setupStatus) return { state: 'ready' };
    let status: unknown;
    try { status = await packager.setupStatus(); }
    catch { return { state: 'unavailable', reason: 'Could not check packaging prerequisites. Try again later.' }; }
    if (!validSetupStatus(status)) return { state: 'unavailable', reason: 'Packager returned an invalid prerequisite status.' };
    return status;
  }

  async packageSetup(p: Project, acceptTerms: boolean): Promise<Job> {
    return this.withPluginServices(async () => this.preparePackageSetup(await this.prepareProject(p), acceptTerms));
  }
  private async preparePackageSetup(p: Project, acceptTerms: boolean): Promise<Job> {
    const packager = this.selectedPackager(p);
    if (!packager.setup || !packager.setupStatus) throw new HttpError(409, 'this packager does not offer setup');
    const status = await this.packageSetupStatus(p);
    if (status.state !== 'setup-required') throw new HttpError(409, status.reason ?? `packager is ${status.state}; setup is not available`);
    if (status.termsUrl && !acceptTerms) throw new HttpError(409, 'acknowledge the packager terms before setup', { termsUrl: status.termsUrl });
    return this.startJob('packager-setup', p.id, `set up package tools (${packager.name})`, async (ctx) => {
      await this.checkEffectiveManifest(p);
      await packager.setup!({ log: ctx.line, acceptTerms });
      const ready = await this.packageSetupStatus(p);
      if (ready.state !== 'ready') throw new Error(ready.reason ?? 'packager prerequisites are not ready after setup');
      ctx.line('Package tools are ready. Build package is available.');
      return { platform: packager.name };
    });
  }

  async packageBuild(p: Project, body: { version?: string; confirm?: string[] }): Promise<Job> {
    return this.withPluginServices(async () => this.preparePackageBuild(await this.prepareProject(p), body));
  }
  private async preparePackageBuild(p: Project, body: { version?: string; confirm?: string[] }): Promise<Job> {
    const m = this.editableManifest(p);
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
      const fresh = await resolvedHostFreshness(this.repo, this.workspace);
      if (!fresh.exists) throw new HttpError(409, fresh.hostProblem ?? 'xrb-host.exe is not built: rebuild the host first');
      if (fresh.outdated && !confirm.has('host'))
        throw new HttpError(409, `Host sources or plugins changed (${fresh.newestSource ?? 'source membership'}): the package would ship outdated artifacts. Rebuild the host first?`, { needsConfirm: 'host' });
      runtimeDir = fresh.runtimeDir;
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
      const inputRoot = path.join(this.workspace, 'build', 'package-inputs');
      assertWritablePath(this.repo, this.workspace, inputRoot); await fs.mkdir(inputRoot, { recursive: true });
      const inputGeneration = await fs.mkdtemp(path.join(inputRoot, 'p-'));
      const staged = await stagePackagerInputs({
        app: p.workingRoot ? (await effectiveProjectOutput(this.repo, this.workspace, p)).entry : entry, runtimeDir, ...(headset ? {} : { pluginDirs }), plugins, selection, projectName: m.name, identity, config, launchUrl,
        icon: packageIcon, iconColor: m.iconColor,
        out: path.join(this.workspace, 'builds', packaging.channel), workDir: path.join(this.workspace, 'build', packaging.channel), log: (msg) => ctx.line(msg),
      }, path.join(inputGeneration, 'inputs'), path.resolve(entry) === path.resolve(p.dir));
      const r = await packager.build(staged);
      await this.updateManifest(p.id, (cur) => ({ ...cur, plugins: { ...cur.plugins, [platform]: { ...cur.plugins?.[platform], ...identity, lastPackaged: version, version: nextVersion(version) } } }));
      ctx.line(`package ${label} ${version}: ${r.file} (${(r.sizeBytes / 1e9).toFixed(2)} GB). Next version: ${nextVersion(version)}`);
      return { zip: r.file, sizeBytes: r.sizeBytes, version };
    });
  }

  renderIcon(p: Project): Job {
    const initial = p.origin === 'bundled' ? this.manifestOf(p) : this.editableManifest(p);
    if (p.origin !== 'bundled') assertWritablePath(this.repo, this.projects, path.resolve(p.dir, initial.icon ?? 'icon.png'));
    return this.startJob('icon-render', p.id, `icon render: ${initial.name}`, async (ctx) => {
      p = await this.prepareProject(p);
      const m = this.editableManifest(p), entry = this.entryOf(p, m);
      const rel = m.icon ?? 'icon.png', output = path.resolve(p.dir, rel);
      assertWritablePath(this.repo, this.writableRoot(p), output);
      if (p.workingRoot) await this.ensureBrowserBuild(p, m, ctx);
      const fresh = await resolvedHostFreshness(this.repo, this.workspace);
      if (!fresh.exists) throw new HttpError(409, fresh.hostProblem ?? 'xrb-host.exe is not built: rebuild the host first');
      assertWritablePath(this.repo, this.writableRoot(p), output);
      await ctx.run(process.execPath, [APP_ICON, 'render', '--app', entry, '--out', output, '--runtime', fresh.runtimeDir], { cwd: this.repo });
      if (!m.icon) await this.updateManifest(p.id, (cur) => ({ ...cur, icon: rel }));
    });
  }

  private async ensureEffectiveDevInstalled(p: Project): Promise<void> {
    await prepareEmbeddedDependencies(this.repo, this.projects, p, { line: line => log(`[panel] ${line}`), run: async (cmd, args, options) => {
      const code = await runProcess(cmd, args, line => log(`[panel] ${line}`), options);
      if (code !== 0) throw new HttpError(409, `Embedded dependency preparation failed (${code})`);
    } } as JobContext);
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

  async saveRunSettings(p: Project, overrides: unknown, revision: unknown) {
    this.refuseIfLaunchBlocked(p, { changingPlugins: this.changingPlugins, maintainingCache: this.maintainingCache, preparingNativeRun: this.preparingNativeRun, preparingPreview: this.preparingPreview });
    this.refuseIfBusy(p.id);
    this.settingsWrites.add(p.id);
    try {
      const settings = await saveProjectRunSettings(this.repo, this.workspace, p, overrides, revision);
      this.hub.send('projects-changed', { projectId: p.id });
      return settings;
    } finally { this.settingsWrites.delete(p.id); }
  }

  private holdProjectRun(release: () => Promise<void>): boolean {
    if (!this.runner.busy) return false;
    const idle = (state: { phase: string }) => {
      if (state.phase !== 'idle') return;
      this.runner.off('state', idle);
      void release().catch(error => log(`[panel] Could not release project lock: ${(error as Error).message}`));
    };
    this.runner.on('state', idle);
    return true;
  }

  /** Only an explicit catalog launch may prepare other apps; catalog GETs stay read-only. */
  async prepareCatalogIcons(p: Project): Promise<void> {
    if (!p.manifest?.catalog) return;
    const catalog = await discoverProjectCatalog(this.repo, this.workspace, this.projects);
    for (const { project } of catalog.projects) {
      if (project.id === p.id || isArchivedId(project.id) || project.manifest?.kind !== 'app' || !project.manifest.scripts?.build) continue;
      const icon = await projectIconSource(this.repo, project);
      if (!icon.authored || icon.generated) continue;
      // Jobs expose cold preparation in Activity; the managed build lane deduplicates current output.
      const done = await this.jobs.wait(this.webBuild(project));
      if (done.state === 'failed') log(`[panel] Library icon unavailable for ${project.id}: ${done.error}`);
    }
  }

  /** Starts one panel-owned standalone WebXR browser preview and returns its app URL. */
  async preview(p: Project, mode: RunMode, flat: boolean | undefined, token: string, options: { fullscreen?: boolean; monitor?: number; clientPort: number }): Promise<string> {
    if (mode === 'dev' && !p.manifest?.scripts?.dev) throw new HttpError(409, `${p.id} has no dev script`);
    await this.synchronizePluginServices(true);
    this.refuseIfLaunchBlocked(p, this.launchState(p));
    if (p.readOnly) this.refuseIfBusy(p.id);
    this.preparingPreview = true;
    try {
      return await withEmbeddedProjectLock(this.repo, this.projects, p, async () => {
        const effective = mode === 'dev' || p.workingRoot ? await this.prepareProject(p) : p;
        await this.prepareCatalogIcons(effective);
        return this.preparePreview(effective, mode, flat ?? effective.runDefaults?.flat, token, options);
      }, release => this.holdProjectRun(release));
    }
    finally { this.preparingPreview = false; }
  }

  private async preparePreview(p: Project, mode: RunMode, flat: boolean | undefined, token: string, options: { fullscreen?: boolean; monitor?: number; clientPort: number }): Promise<string> {
    const settings = p.readOnly ? await readProjectRunSettings(this.repo, this.workspace, p) : null;
    if (settings) p = withRunSettings(p, settings);
    flat ??= settings?.values.flat ?? false;
    const browser = { ...options, fullscreen: options.fullscreen ?? settings?.values.fullscreen ?? false, monitor: options.monitor ?? settings?.values.monitor ?? 0 };
    const m = this.manifestOf(p);
    if (p.readOnly && mode !== 'built') throw new HttpError(409, 'Embedded working sources are not prepared');
    const bundledOutput = p.workingRoot && mode === 'built' ? await effectiveProjectOutput(this.repo, this.workspace, p) : p.readOnly ? await requireProjectOutput(this.repo, this.workspace, p) : null;
    if (!p.readOnly && mode === 'dev') this.editableManifest(p);
    if (buildTargetOf(m) !== 'webxr' || selectionOf(m).platform) throw new HttpError(409, `${p.id} is not a standalone WebXR preview`);
    if (!this.panelUrl) throw new HttpError(500, 'the panel preview address is unavailable');
    if (mode === 'dev') {
      if (p.workingRoot) await this.ensureEffectiveDevInstalled(p); else await this.ensureDevInstalled();
    }
    const route = projectPreviewRoute(p, bundledOutput ?? undefined);
    if (this.runner.busy) throw new HttpError(409, 'stop the running app first');
    const cursor = (await readAppSettings(this.workspace)).cursor;
    const session = randomUUID();
    const projection = flat ? 'orthographic' : 'perspective';
    const mouseEnabled = (await this.effectiveSelection(m)).inputs?.includes('mouse') ?? true;
    // Settings/provider reads yielded: another request may have reserved the runner meanwhile.
    if (this.runner.busy) throw new HttpError(409, 'stop the running app first');
    this.previewProjection = { route, token, session, fullscreen: browser.fullscreen, monitor: browser.monitor, projection };
    let href = '';
    try {
      await this.runner.startPreview({ projectId: p.id, projectDir: p.dir, devScript: m.scripts?.dev, devEnv: embeddedProjectEnvironment(this.repo, this.projects, p) ?? this.appEnv(), devEnvIsolated: !!p.workingRoot, flat }, mode, async (devUrl) => {
        const url = devUrl ? new URL(devUrl) : new URL(route, this.panelUrl!);
        if (devUrl) url.searchParams.set('xrb-resume', '1');
        url.searchParams.set('xrb-preview-token', token);
        url.searchParams.set('xrb-preview-panel', new URL(this.panelUrl!).origin);
        url.searchParams.set('xrb-panel', this.panelUrl!);
        url.searchParams.set('xrb-project', p.id);
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
  async run(p: Project, mode: RunMode, flat?: boolean, cameraView?: boolean, desktop?: { fullscreen?: boolean; monitor?: number }): Promise<void> {
    if (mode === 'dev' && !p.manifest?.scripts?.dev) throw new HttpError(409, `${p.id} has no dev script`);
    await this.synchronizePluginServices(true);
    const desktopSetupBusy = await this.desktopSetup.isBusy();
    this.refuseIfLaunchBlocked(p, this.launchState(p));
    if (this.jobs.active().some(job => job.kind === 'host-rebuild')) throw new HttpError(409, 'wait for the native rebuild to finish before running');
    if (this.jobs.active().some(job => job.kind === 'desktop-setup') || desktopSetupBusy) throw new HttpError(409, 'wait for desktop setup to finish before running');
    if (p.readOnly) this.refuseIfBusy(p.id);
    this.preparingNativeRun = true;
    try {
      await withEmbeddedProjectLock(this.repo, this.projects, p, async () => {
        if (mode === 'built' && p.readOnly && p.manifest?.host?.args?.length) {
          p = await this.prepareProject(p);
          const done = await this.jobs.wait(this.webBuild(p));
          if (done.state === 'failed') throw new HttpError(409, done.error ?? 'Project build failed');
        } else if (mode === 'dev' || p.workingRoot) p = await this.prepareProject(p);
        await this.prepareCatalogIcons(p);
        const settings = p.readOnly ? await readProjectRunSettings(this.repo, this.workspace, p) : null;
        const screen = desktop || settings ? { fullscreen: desktop?.fullscreen ?? settings?.values.fullscreen ?? false, monitor: desktop?.monitor ?? settings?.values.monitor ?? 0 } : undefined;
        await this.runNative(settings ? withRunSettings(p, settings) : p, mode, flat ?? settings?.values.flat ?? p.runDefaults?.flat ?? false, cameraView ?? settings?.values.cameraView ?? p.runDefaults?.cameraView ?? false, screen);
      }, release => this.holdProjectRun(release));
    }
    finally { this.preparingNativeRun = false; }
  }

  private async runNative(p: Project, mode: RunMode, flat: boolean, cameraView: boolean, desktop?: { fullscreen: boolean; monitor: number }): Promise<void> {
    const m = this.manifestOf(p);
    if (p.readOnly && mode !== 'built') throw new HttpError(409, 'Embedded working sources are not prepared');
    const bundledOutput = p.workingRoot && mode === 'built' ? await effectiveProjectOutput(this.repo, this.workspace, p) : p.readOnly ? await requireProjectOutput(this.repo, this.workspace, p) : null;
    if (!p.readOnly && mode === 'dev') this.editableManifest(p);
    if (buildTargetOf(m) === 'webxr') throw new HttpError(409, `${p.id} is a WebXR headset app: open it in a browser, or build a package for the headset`);
    const fresh = await resolvedHostFreshness(this.repo, this.workspace);
    if (!fresh.exists) throw new HttpError(409, fresh.hostProblem ?? 'xrb-host.exe is not built: rebuild the host first');
    if (this.runner.busy) throw new HttpError(409, `${this.runner.projectId} is running: stop it first`);
    const selection = await this.effectiveSelection(m);
    const chosen = [...selection.inputs ?? [], selection.display, selection.platform].filter((n) => n && !BUILTIN_PROVIDERS.has(n));
    const missing = await this.missingPlugins(chosen);
    if (missing.length) throw new HttpError(409, `plugin ${missing.join(', ')} is not built in the workspace: rebuild the host first`, { needsRebuild: true });
    if (mode === 'dev') {
      if (p.workingRoot) await this.ensureEffectiveDevInstalled(p); else await this.ensureDevInstalled();
    }
    const attemptedAt = Date.now();
    const cursor = (await readAppSettings(this.workspace)).cursor;
    try {
      await this.runner.start({
        projectId: p.id, mode, hostExe: fresh.exe, projectDir: p.dir, entryDir: bundledOutput?.entry ?? this.entryOf(p, m),
        builtUrl: mode === 'built' && this.panelUrl
          ? `https://app.local/index.html?xrb-panel=${encodeURIComponent(this.panelUrl)}&xrb-project=${encodeURIComponent(p.id)}&xrb-mouse=${selection.inputs?.includes('mouse') ? '1' : '0'}&xrb-cursor=${cursor}` : undefined,
        devScript: m.scripts?.dev, devEnv: embeddedProjectEnvironment(this.repo, this.projects, p) ?? this.appEnv(), devEnvIsolated: !!p.workingRoot, panelUrl: this.panelUrl ?? undefined, mouseEnabled: selection.inputs?.includes('mouse') ?? true, cursor, flat, switchView: selection.display !== 'desktop', cameraView,
        cameraAvailable: (selection.inputs ?? []).some((name) => !BUILTIN_PROVIDERS.has(name)),
        hostArgs: [`--title=${m.name}`, `--camera-projection=${flat ? 'orthographic' : 'perspective'}`, ...(await this.hostArgs(p, m, desktop, selection)), ...(flat && selection.display !== 'desktop' ? ['--view=2d'] : [])],
      });
    } catch (e) {
      const last = this.runner.state().last;
      const output = last?.projectId === p.id && last.endedMs >= attemptedAt ? last.lines : null;
      throw new HttpError(400, (e as Error).message, output?.length ? output.join('\n') : undefined);
    }
  }

  private launchState(p: Project): LaunchState {
    return {
      restartPending: this.restartPending, changingPlugins: this.changingPlugins, maintainingCache: this.maintainingCache,
      servicesPending: this.servicesPending, servicesProblem: this.servicesProblem, servicesNeedRestart: this.servicesNeedRestart,
      preparingNativeRun: this.preparingNativeRun, preparingPreview: this.preparingPreview, settingsSaving: this.settingsWrites.has(p.id),
    };
  }

  /** Refuses with the first specific cause; `details.reason` lets the UI offer Restart when only a restart helps. */
  private refuseIfLaunchBlocked(p: Project, state: LaunchState): void {
    const blocked = launchBlocker({ ...state, settingsSaving: this.settingsWrites.has(p.id) });
    if (blocked) throw new HttpError(409, blocked.message, { reason: blocked.reason, restart: blocked.restart });
  }

  /** Declared user configuration for Settings; a malformed file is reported, never replaced. */
  private async pluginConfigView(plugin: { id: string; meta: { config?: PluginSetting[] } }): Promise<{ config?: PluginSetting[]; configValues?: Record<string, SettingValue>; configRevision?: string; configProblem?: string }> {
    const fields = plugin.meta.config;
    if (!fields?.length) return {};
    try {
      const state = await readUserPluginConfigState(this.workspace, plugin.id, fields);
      return { config: fields, configValues: state.values, configRevision: state.revision };
    } catch (error) { return { config: fields, configProblem: (error as Error).message }; }
  }

  /** Settings and organization cannot overlap launch preparation or that project's active work. */
  assertProjectIdle(p: Project): void {
    if (this.preparingNativeRun || this.preparingPreview || this.settingsWrites.has(p.id)) throw new HttpError(409, 'Wait for project launch/settings preparation');
    this.refuseIfBusy(p.id);
  }

  private refuseIfBusy(id: string): void {
    if (this.runner.projectId === id) throw new HttpError(409, `${id} is running: stop it first`);
    const busy = this.jobs.active().find((j) => j.projectId === id);
    if (busy) throw new HttpError(409, `${busy.title} is ${busy.state} for this project`);
  }

  /** Archive (projects/<section>/x -> projects/archive/x) or unarchive (back to its section). */
  private async move(p: Project, toArchive: boolean): Promise<void> {
    if (p.origin !== 'bundled') assertEditableProject(this.repo, this.projects, p);
    assertWritablePath(this.repo, this.projects, path.join(this.projects, 'xrb-panel.json'));
    const from = (await readLayout(this.projects, [])).archivedFrom?.[liveId(p.id)];
    for (const section of [ARCHIVE, UNSORTED, ...(from ? [from] : [])])
      assertWritablePath(this.repo, this.projects, path.join(this.projects, PROJECTS, section, path.basename(p.dir)));
    try {
      await withEmbeddedProjectLock(this.repo, this.projects, p, async () => {
        const live = (await discoverProjectCatalog(this.repo, this.workspace, this.projects)).projects.map(record => record.project).filter(project => !isArchivedId(project.id));
        const to = toArchive ? await archiveProject(this.projects, p, live) : await unarchiveProject(this.projects, p);
        log(`[projects] ${p.id} ${toArchive ? 'archived' : 'unarchived'}: ${path.relative(this.projects, to)}`);
      });
    } catch (e) {
      if (e instanceof MoveRefused) throw new HttpError(409, e.message);
      throw e;
    }
  }

  /** Recycle an ordinary project; never remove its embedded counterpart or durable working state. */
  async deleteProject(p: Project): Promise<void> {
    if (p.origin === 'bundled' || p.id.startsWith('bundled:')) throw new HttpError(409, 'Embedded projects cannot be deleted; archive instead');
    assertEditableProject(this.repo, this.projects, p);
    assertWritablePath(this.repo, this.projects, path.join(this.projects, 'xrb-panel.json'));
    this.refuseIfBusy(p.id);
    const rel = path.relative(await fs.realpath(this.projects), await fs.realpath(p.dir));
    // projects/<section>/x, or projects/archive/x
    const segs = rel.split(path.sep);
    if (segs.length !== 3 || segs[0] !== PROJECTS || !segs[1] || !segs[2]) throw new HttpError(400, `not a project folder: ${rel}`);
    await fs.rm(path.join(p.dir, 'node_modules'), { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', RECYCLE, '-Path', p.dir],
        { windowsHide: true }, (err, _out, stderr) => (err ? reject(new HttpError(500, `could not move ${rel} to the Recycle Bin: ${stderr.trim() || err.message}`)) : resolve()));
    });
    const remaining = (await discoverProjectCatalog(this.repo, this.workspace, this.projects)).projects.map(record => record.project);
    await removeEmptyProjectSection(this.projects, p.section, remaining);
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
    if (rest.length === 1 && rest[0] === 'cache' && p.origin === 'bundled') {
      if (method === 'GET') { sendJson(res, 200, await reviewWorkingCache({ core: this.repo, workspace: this.workspace, project: p })); return true; }
      if (method === 'DELETE') { sendJson(res, 202, jobSummary(this.cleanupWorkingCache(p, await readJson(req)))); return true; }
    }
    if (p.origin === 'bundled' && rest.length === 1 && rest[0] === 'delete') throw new HttpError(409, 'Embedded projects cannot be deleted; archive instead');
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
        sendJson(res, 200, { archived: p.id, id: p.origin === 'bundled' ? `bundled:archive/${p.id.replace(/^bundled:/, '')}` : `${ARCHIVE}/${p.id}` });
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
        if (p.readOnly) validateRunOverrides(Object.fromEntries(Object.entries({ flat, fullscreen, monitor }).filter(([, value]) => value !== undefined)));
        if (mode !== 'dev' && mode !== 'built') throw new HttpError(400, 'standalone preview mode must be built or dev');
        const runMode: RunMode = mode;
        if (runMode === 'built' && p.origin === 'bundled' && (!p.readOnly || !(await requireProjectOutput(this.repo, this.workspace, p).catch(() => null)))) {
          const done = await this.jobs.wait(this.webBuild(p));
          if (done.state === 'failed') throw new HttpError(409, done.error ?? 'Project build failed');
          p = await this.reloadPreparedProject(p);
        }
        const previewToken = typeof token === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(token) ? token : randomUUID();
        const screen = Number.isInteger(monitor) && monitor! >= 0 && monitor! <= 255 ? monitor! : 0;
        const url = await this.preview(p, runMode, p.readOnly && flat === undefined ? undefined : flat === true, previewToken, {
          fullscreen: p.readOnly && fullscreen === undefined ? undefined : fullscreen === true,
          monitor: p.readOnly && monitor === undefined ? undefined : screen, clientPort: req.socket.remotePort ?? 0,
        });
        sendJson(res, 200, { url, fullscreen: this.previewProjection?.fullscreen ?? false, monitor: this.previewProjection?.monitor ?? 0 });
        return true;
      }
      case 'run': {
        const { mode, flat, cameraView, fullscreen, monitor } = await readJson<{ mode?: RunMode; flat?: boolean; cameraView?: boolean; fullscreen?: boolean; monitor?: number }>(req);
        if (p.readOnly) validateRunOverrides(Object.fromEntries(Object.entries({ flat, cameraView, fullscreen, monitor }).filter(([, value]) => value !== undefined)));
        const runMode = mode === 'dev' ? 'dev' : 'built';
        if (runMode === 'built' && (!p.readOnly || !(await requireProjectOutput(this.repo, this.workspace, p).catch(() => null)))) {
          const build = this.webBuild(p);
          const done = await this.jobs.wait(build);
          if (done.state === 'failed') throw new HttpError(400, done.error ?? 'the app build failed');
          if (p.origin === 'bundled') p = await this.reloadPreparedProject(p);
        }
        const screen = Number.isInteger(monitor) && monitor! >= 0 && monitor! <= 255 ? monitor! : 0;
        await this.run(p, runMode, p.readOnly && flat === undefined ? undefined : flat === true, p.readOnly && cameraView === undefined ? undefined : cameraView === true,
          { fullscreen: p.readOnly && fullscreen === undefined ? undefined : fullscreen === true, monitor: p.readOnly && monitor === undefined ? undefined : screen });
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
      const catalog = await resolvePluginCatalog(this.workspace, this.repo, true), plugin = pluginByReference(catalog, id);
      if (!plugin) throw new HttpError(404, `no unambiguous plugin ${id}`);
      const preferenceKey = id.includes(':') || !plugin.legacyPreferences ? plugin.key : plugin.id;
      if (method === 'PUT' && api.length === 4 && api[3] === 'origin') {
        const body = await readJson<{ origin?: unknown; revision?: unknown }>(req);
        if (Object.keys(body).some(key => !['origin', 'revision'].includes(key))) throw new HttpError(400, 'Only origin and revision are accepted');
        await this.selectPluginSource(id, body.origin, body.revision);
        sendJson(res, 200, { saved: true }); return true;
      }
      if (method === 'GET' && api.length === 4 && api[3] === 'settings') {
        const meta = plugin.meta, prefs = catalog.prefs;
        sendJson(res, 200, {
          enabled: pluginEnabled(plugin, prefs),
          runtime: effectiveSettings(meta.settings ?? [], pluginPreferenceValues(plugin, prefs)),
          panel: effectiveSettings(meta.panelSettings ?? [], pluginPreferenceValues(plugin, prefs, 'panelSettings')),
        });
        return true;
      }
      if (api.length === 4 && api[3] === 'config' && (method === 'GET' || method === 'PUT')) {
        const fields = plugin.meta.config;
        if (!fields?.length) throw new HttpError(404, `plugin ${id} declares no configuration`);
        if (method === 'GET') { sendJson(res, 200, await readUserPluginConfigState(this.workspace, plugin.id, fields)); return true; }
        const body = await readJson<{ values?: unknown; revision?: unknown }>(req);
        if (Object.keys(body).some(key => !['values', 'revision'].includes(key))) throw new HttpError(400, 'Only values and revision are accepted');
        let saved: UserPluginConfigState | undefined;
        try {
          // Publishers and packagers read this file when services load: change it only while they are idle.
          await this.withPluginMutation(async () => {
            saved = await writeUserPluginConfig(this.workspace, plugin.id, fields, body.values, body.revision);
            await this.refreshPluginServices();
          });
        } catch (error) {
          if (error instanceof PluginConfigInvalid) throw new HttpError(400, error.message, { fields: [{ field: error.field, message: error.message }] });
          if (error instanceof PluginConfigConflict) throw new HttpError(409, error.message, { stale: 'config' });
          if (saved && error instanceof HttpError) throw new HttpError(409, `Configuration saved, but plugin services could not refresh: ${error.message}`, { saved: true });
          throw error;
        }
        this.hub.send('plugins-changed', { id }); this.hub.send('projects-changed', {});
        sendJson(res, 200, saved); return true;
      }
      if (method === 'POST' && api.length === 4 && api[3] === 'open-folder') {
        const dir = plugin.sourceRoot;
        this.openInShell(dir);
        sendJson(res, 200, { opened: dir });
        return true;
      }
      if (method === 'POST' && api.length === 6 && api[3] === 'samples' && api[5] === 'import') {
        const meta = plugin.meta, sample = meta.panelSamples?.find((item) => item.id === api[4]);
        if (!sample) throw new HttpError(404, `no sample ${api[4]} in plugin ${id}`);
        const body = await readJson<{ folder?: string; name?: string }>(req);
        if (!body.folder || !body.name?.trim()) throw new HttpError(400, 'project folder and name required');
        assertWritablePath(this.repo, this.projects, path.join(this.projects, PROJECTS, 'plugins', body.folder));
        let projectId: string;
        try { projectId = await importPluginSample(this.projects, sample.dir, body.folder, body.name.trim()); }
        catch (error) { if (error instanceof ProjectRefused) throw new HttpError(409, error.message); throw error; }
        log(`[projects] imported ${id}/${sample.id} as projects/plugins/${projectId}`);
        this.hub.send('projects-changed', {});
        sendJson(res, 200, { id: projectId });
        return true;
      }
      if (method === 'GET' && api.length === 4 && api[3] === 'icon') {
        const file = await pluginIcon(plugin.workspaceRoot, plugin.id);
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
        const meta = plugin.meta, runtimeChange = body.enabled !== undefined || body.settings !== undefined;
        const update = () => updatePluginPrefs(this.workspace, prefs => {
          if (body.enabled !== undefined) {
            if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
            prefs.disabled = body.enabled ? prefs.disabled.filter((item) => item !== plugin.id && item !== plugin.key) : [...new Set([...prefs.disabled, preferenceKey])];
          }
          if (body.settings !== undefined) {
            try { prefs.settings[preferenceKey] = validateSettings(meta.settings ?? [], body.settings); }
            catch (e) { throw new HttpError(400, (e as Error).message); }
          }
          if (body.panelSettings !== undefined) {
            if (!pluginEnabled(plugin, prefs)) throw new HttpError(409, 'enable the plugin before changing its settings');
            try { prefs.panelSettings[preferenceKey] = validateSettings(meta.panelSettings ?? [], body.panelSettings); }
            catch (e) { throw new HttpError(400, (e as Error).message); }
          }
        }, this.repo, runtimeChange ? () => this.refreshPluginServices() : undefined);
        if (runtimeChange) await this.withPluginMutation(update); else await update();
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
        sendJson(res, 200, { ...await resolvedHostFreshness(this.repo, this.workspace), workspace: this.workspace });
        return true;
      case 'GET panel':
        sendJson(res, 200, this.panelFreshness());
        return true;
      case 'GET plugins': {
        // Host providers and packagers are independent; disabled plugins are excluded from both.
        const catalog = await resolvePluginCatalog(this.workspace, this.repo, true), prefs = catalog.prefs;
        const activeMeta = catalog.selected.filter(plugin => pluginEnabled(plugin, prefs)).map(plugin => plugin.meta);
        const standaloneTargets = [...new Set(activeMeta.flatMap((meta) => meta?.panelTargets ?? []))];
        const presentProvider = (provider: Awaited<ReturnType<typeof listProviders>>['providers'][number]) => {
          if (!provider.path) return provider;
          const meta = catalog.selected.find(plugin => pluginOwnsPath(plugin, provider.path!))?.meta;
          if (!meta) return provider;
          const presentedName = meta.panelProviderNames?.[provider.name] ?? provider.name;
          return { ...provider, name: presentedName, ...(presentedName !== provider.name ? { runtimeName: provider.name } : {}), label: meta.title,
            ...(meta.panelHiddenProviders?.includes(provider.name) ? { hidden: true } : {}),
            screenName: provider.role === 'display' ? meta.screenName : undefined,
            displayMode: provider.role === 'display' ? meta.displayMode : undefined };
        };
        const all = await listProviders(this.repo, this.workspace, true);
        const disabled = all.providers.filter((p) => p.path && catalog.selected.some(plugin => !pluginEnabled(plugin, prefs) && pluginOwnsPath(plugin, p.path!))).map(presentProvider);
        const disabledNames: Array<{ name: string; role: string }> = [];
        for (const id of prefs.disabled) {
          const meta = pluginByReference(catalog, id)?.meta, role = meta?.type;
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
            .map(({ packager }) => [packager.name, packager.label])), packagerProblems: this.packagers.problems, pluginProblems: catalog.problems });
        return true;
      }
      case 'GET plugins/cache':
        sendJson(res, 200, await reviewWorkingCache({ core: this.repo, workspace: this.workspace })); return true;
      case 'DELETE plugins/cache':
        sendJson(res, 202, jobSummary(this.cleanupWorkingCache(undefined, await readJson(req)))); return true;
      case 'POST plugins/setup-bundled':
        sendJson(res, 202, jobSummary(this.setupBundledServices())); return true;
      case 'GET plugins/runtime': {
        try { const runtime = await embeddedServiceRuntime(this.repo, this.workspace); sendJson(res, 200, { available: true, installed: runtime.installed, problem: null }); }
        catch (error) { sendJson(res, 200, { available: false, installed: true, problem: (error as Error).message }); }
        return true;
      }
      case 'GET plugins/manage':
        sendJson(res, 200, { plugins: await this.managedPlugins(), services: this.pluginServiceStatus(), problems: (await resolvePluginCatalog(this.workspace, this.repo)).problems });
        return true;
      case 'GET host/setup':
        sendJson(res, 200, await this.desktopSetup.check()); return true;
      case 'POST host/setup':
        sendJson(res, 202, jobSummary(await this.setupDesktop(await readJson(req)))); return true;
      case 'POST host/rebuild':
        if (await this.desktopSetup.isBusy()) throw new HttpError(409, 'Wait for desktop setup to finish before rebuilding');
        if (this.preparingNativeRun || this.runner.busy) throw new HttpError(409, 'stop the running or starting host first: its exe must not overlap a rebuild');
        sendJson(res, 202, jobSummary(this.startJob('host-rebuild', null, 'rebuild xrb-host', async ctx => {
          const tools = await this.desktopSetup.deps.tools();
          return rebuildHost(this.repo, this.workspace, ctx, { cmake: tools.cmake ?? undefined, generator: tools.generator });
        })));
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
        if (this.jobs.active().some(job => job.kind === 'desktop-setup')) throw new HttpError(409, 'Wait for desktop setup to finish; the installer must not be interrupted', { retryWhenIdle: true });
        const { confirm, ifIdle, expectedInstanceId } = await readJson<{ confirm?: boolean; ifIdle?: boolean; expectedInstanceId?: string }>(req);
        if ((confirm !== undefined && typeof confirm !== 'boolean') || (ifIdle !== undefined && typeof ifIdle !== 'boolean')) throw new HttpError(400, 'Restart flags must be boolean');
        if (ifIdle && (confirm !== false || expectedInstanceId !== this.instanceId)) throw new HttpError(409, 'Automatic restart requires the current panel instance and cannot force active work');
        const busy = [this.runner.busy ? `${this.runner.projectId} is running` : '', ...this.jobs.active().map((j) => `${j.title} is ${j.state}`),
          this.preparingNativeRun || this.preparingPreview || this.pluginConsumers || this.settingsWrites.size || this.changingPlugins || this.maintainingCache || this.restartWorkPending() ? 'Panel work is preparing or changing' : ''].filter(Boolean);
        if (busy.length && !confirm) throw new HttpError(409, ifIdle ? 'Waiting for the panel to become idle' : `${busy.join('; ')}. Restart anyway? The host is stopped cleanly first.`, ifIdle ? { retryWhenIdle: true } : { needsConfirm: 'restart' });
        sendJson(res, 200, { restarting: true, pid: process.pid, instanceId: this.instanceId, repo: this.repo, workspace: this.workspace, projects: this.projects });
        if (!this.restartPending) {
          this.restartPending = true;
          log('[panel] restart requested');
          setTimeout(() => this.onRestart(), 50);
        }
        return true;
      }
      case 'POST quit': {
        if (this.jobs.active().some(job => job.kind === 'desktop-setup')) throw new HttpError(409, 'Wait for desktop setup to finish; the installer must not be interrupted');
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

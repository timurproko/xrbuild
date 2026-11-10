#!/usr/bin/env node
// XR Build control panel: a local server (127.0.0.1 only) with a browser UI for the
// projects in the user's workspace (projects/<section>/<project>): settings, web and package builds, runs on the
// display, live status and debug views. Start: start.vbs (no console) or `pnpm panel`.
import { execFile, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultIcon } from '../../app-icon/src/icon.ts';
import { DEFAULT_PORT, log, openLog, panelPort, PANEL_DIR, projectsDir, projectsFromArgs, REPO, shortcutWorkspace, WORKSPACE, workspaceDir, workspaceFromArgs } from './env.ts';
import { checkRequest, EventHub, HttpError, readBody, readJson, sendJson, serveStatic } from './http.ts';
import {
  ARCHIVE,
  defaultEntry,
  defaultManifest,
  discoverProjects,
  identityOf,
  isArchivedId,
  isInside,
  MoveRefused,
  PROJECTS,
  UNSORTED,
  ManifestConflictError,
  MANIFEST,
  saveManifest,
  unregisteredApps,
  type Manifest,
  type Project,
  readProject,
} from './projects.ts';
import { Panel } from './panel.ts';
import { projectWritableRoot, withEmbeddedProjectLock, keepEmbeddedWorkingSources, embeddedProjectRoot, embeddedManifestRevision } from './embedded-project-state.ts';
import { effectiveProjectOutput, effectiveOutputRoot } from './embedded-project-output.ts';
import { discoverProjectCatalog } from './extension-catalog.ts';
import { bundledBuildPlan, resolveProjectOutput, requireProjectOutput, projectPreviewRoute, projectBuildRoot } from './project-build.ts';
import { copyBundledProject, projectFile, projectPath } from './embedded-projects.ts';
import { assertEditableProject, assertUserRoot, assertWritablePath } from './project-access.ts';
import { projectRunSettingsFile, readProjectRunSettings, withRunSettings } from './project-run-settings.ts';
import { publicationCard } from './publication.ts';
import { ManagedTools } from './managed-tools.ts';
import { applyLayout, readLayout, validateLayout, type Layout } from './layout.ts';
import { createProject, createProjectWorkspace, createWorkspace, isWorkspace, ProjectRefused, writeEditorConfig } from './workspace.ts';

export const APP_NAME = 'xrb-control-panel';
const ICON_LIMIT = 8 * 1024 * 1024;
const LIST_MONITORS = path.join(PANEL_DIR, 'src', 'list-monitors.ps1');
const RESTART_SILENT = path.join(PANEL_DIR, 'src', 'restart-silent.vbs');
/** SDK modules the icon preview page loads (`/sdk/<name>`); they import only `three`. */
const SDK_MODULES = new Set(['icon.js', 'icon-object.js']);

async function listMonitors(): Promise<unknown[]> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LIST_MONITORS], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve([]);
      try {
        const parsed = JSON.parse(stdout.trim() || '[]');
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch { resolve([]); }
    });
  });
}

export type WorkspaceKind = 'user' | 'repository' | 'explicit';

export interface AutoRouteSelection {
  workspace: string;
  projects: string;
  port: number;
  kind: 'user' | 'repository';
}

export interface AutoRouteOptions {
  env?: NodeJS.ProcessEnv;
  explicitProjects?: string;
  argv?: string[];
  cwd?: string;
  execPath?: string;
  select?: () => AutoRouteSelection;
  probe?: (port: number) => Promise<ProbeResult>;
  start?: (selection: AutoRouteSelection) => Promise<void> | void;
  timeoutMs?: number;
}

export interface ServerOptions {
  /** the core repo (default: the one the panel runs from) */
  repo?: string;
  /** the integration workspace (explicit CLI/API value, else XRB_HOME or ~/.xrbuild) */
  workspace?: string;
  /** the project repository root (explicit value, else the integration workspace) */
  projects?: string;
  port?: number;
  workspaceKind?: WorkspaceKind;
  /** Re-evaluate the Start-menu auto route on browser document refreshes. */
  autoRoute?: AutoRouteOptions;
  /** override for tests: the panel's services */
  panel?: Panel;
}

export interface PanelServer {
  server: http.Server;
  panel: Panel;
  managedTools: ManagedTools;
  hub: EventHub;
  port: number;
  url: string;
  close(): Promise<void>;
}

export type ShortcutLaunch = 'user' | 'repository' | 'auto';

export interface ShortcutRecoveryOptions {
  marker: ShortcutLaunch;
  serverPath?: string;
  find?: (port: number, marker: ShortcutLaunch, serverPath: string) => Promise<number | null>;
  stop?: (pid: number) => Promise<void>;
  probe?: (port: number) => Promise<ProbeResult>;
  timeoutMs?: number;
  intervalMs?: number;
}

const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a;
const canonicalPath = (p: string) => {
  try { return realpathSync.native(p).toLowerCase(); } catch { return path.resolve(p).toLowerCase(); }
};

export function autoRouteSelection(env: NodeJS.ProcessEnv = process.env, repo = REPO, explicitProjects?: string): AutoRouteSelection {
  const repositoryWorkspace = shortcutWorkspace(env, repo);
  const workspace = repositoryWorkspace ?? workspaceDir(env);
  return {
    workspace,
    projects: explicitProjects ?? projectsDir(env, workspace),
    port: panelPort(repositoryWorkspace, env, explicitProjects ?? env.XRB_PROJECTS_HOME),
    kind: repositoryWorkspace ? 'repository' : 'user',
  };
}

function samePanel(found: ProbeResult, selection: AutoRouteSelection): boolean {
  const runningProjects = found.projects ?? found.workspace;
  return found.state === 'panel' && !!found.workspace && !!runningProjects
    && canonicalPath(found.workspace) === canonicalPath(selection.workspace)
    && canonicalPath(runningProjects) === canonicalPath(selection.projects);
}

export async function ensureAutoRouteTarget(
  current: { workspace: string; projects: string; port: number },
  selection: AutoRouteSelection,
  dependencies: { probe?: (port: number) => Promise<ProbeResult>; start: (selection: AutoRouteSelection) => Promise<void> | void; timeoutMs?: number },
): Promise<string | null> {
  if (current.port === selection.port && canonicalPath(current.workspace) === canonicalPath(selection.workspace)
      && canonicalPath(current.projects) === canonicalPath(selection.projects)) return null;
  const inspect = dependencies.probe ?? probePanel;
  let found = await inspect(selection.port);
  if (samePanel(found, selection)) return `http://127.0.0.1:${selection.port}/`;
  if (found.state !== 'free') throw new Error(`port ${selection.port} does not serve the selected workspace`);
  await dependencies.start(selection);
  const until = Date.now() + (dependencies.timeoutMs ?? 8_000);
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    found = await inspect(selection.port);
    if (samePanel(found, selection)) return `http://127.0.0.1:${selection.port}/`;
    if (found.state !== 'free') throw new Error(`port ${selection.port} was taken by another workspace`);
  }
  throw new Error('the selected panel did not start in time');
}

function isDocumentRefresh(method: string, req: IncomingMessage, pathname: string): boolean {
  if (method !== 'GET') return false;
  if (req.headers['sec-fetch-dest'] === 'document') return true;
  return pathname === '/' || pathname === '/plugins' || pathname === '/plugins/' || pathname === '/settings' || pathname === '/settings/';
}

function sendAutoRouteError(res: ServerResponse, message: string): void {
  const safe = message.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  res.writeHead(409, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>XR Build · Workspace unavailable</title><h1>Workspace unavailable</h1><p>${safe}</p>`);
}

/** Project for an id ("x", or "archive/x" when archived), or a 404. */
async function resolveProject(core: string, workspace: string, projects: string, id: string): Promise<Project> {
  const catalog = await discoverProjectCatalog(core, workspace, projects);
  const p = catalog.projects.find(record => record.key === id || record.project.id === id)?.project;
  if (!p) throw new HttpError(404, `no project ${id}`);
  return p;
}

function usable(p: Project): Manifest {
  if (!p.manifest) throw new HttpError(409, `${p.id}: the manifest has errors`, p.errors);
  return p.manifest;
}

export function entryDir(p: Project, m: Manifest): string {
  return path.resolve(p.dir, m.entry ?? defaultEntry(m.kind));
}

export function iconPath(p: Project, m: Manifest | null): string | null {
  return m?.icon ? path.resolve(p.dir, m.icon) : null;
}

async function mtime(file: string | null): Promise<number | null> {
  if (!file) return null;
  return fs.stat(file).then((s) => s.mtimeMs, () => null);
}

/** A project as the UI sees it (`projects`: the project repository root). */
export async function describeProject(projects: string, p: Project, panel: Panel) {
  const runSettings = p.readOnly && p.manifest ? await readProjectRunSettings(panel.repo, panel.workspace, p)
    .then(value => ({ value, problem: null as string | null }), error => ({ value: null, problem: (error as Error).message })) : null;
  const m = runSettings?.value ? withRunSettings(p, runSettings.value).manifest : p.manifest;
  const output = p.workingRoot && m ? await effectiveProjectOutput(panel.repo, panel.workspace, p).catch(error => ({ entry: null, origin: 'cache' as const, generation: null, problem: (error as Error).message }))
    : p.readOnly && m ? await resolveProjectOutput(panel.repo, panel.workspace, p) : null;
  const buildPlan = p.readOnly && m ? await bundledBuildPlan(panel.repo, p).then(() => ({ available: true, reason: null as string | null }), error => ({ available: false, reason: (error as Error).message })) : null;
  const entry = output ? output.entry : m ? entryDir(p, m) : null;
  const assetTime = async (relative: string) => projectFile(p, relative).then(mtime, () => null);
  const relativeEntry = m?.entry ?? (m ? defaultEntry(m.kind) : '.');
  const staticReady = p.workingRoot && m && !m.scripts?.build ? await assetTime(`${relativeEntry}/index.html`) : null;
  const webBuildMs = entry ? output ? await mtime(path.join(entry, 'index.html')) : await assetTime(`${relativeEntry}/index.html`) : staticReady;
  // The build's 3D icon (icon.js next to index.html), which a launcher imports from the preview route.
  const iconModelMs = entry ? output ? await mtime(path.join(entry, 'icon.js')) : await assetTime(`${relativeEntry}/icon.js`) : null;
  const iconMs = m?.icon ? await assetTime(m.icon) : null;
  const packageId = m ? identityOf(m)?.id : undefined;
  const zipMs = typeof packageId === 'string' ? await mtime(path.join(panel.workspace, 'builds', `${packageId}.zip`)) : null;
  const publicationPromise = panel.publicationOf(m);
  let standalone = m;
  let publicationStandalonePromise = publicationPromise;
  if (m && (m.target !== 'webxr' || m.platform)) {
    standalone = { ...m, target: 'webxr' };
    delete standalone.platform;
    publicationStandalonePromise = panel.publicationOf(standalone);
  }
  const publicationDestinationsPromise = panel.publicationDestinationsOf(standalone);
  const [publication, publicationStandalone, publicationDestinations] = await Promise.all([publicationPromise, publicationStandalonePromise, publicationDestinationsPromise]);
  return {
    id: p.id,
    key: p.key ?? `workspace:${p.id}`,
    origin: p.origin ?? 'workspace',
    readOnly: p.readOnly ?? false,
    canDelete: p.origin !== 'bundled',
    preferenceKey: p.origin === 'bundled' ? `bundled:${path.basename(embeddedProjectRoot(panel.repo, panel.workspace, projects, p))}` : p.id,
    stateProblem: p.stateProblem ?? null,
    sourceUpdate: p.sourceUpdate ?? null,
    runDefaults: p.runDefaults ?? runSettings?.value?.values ?? null,
    build: output ? { path: path.relative(panel.workspace, projectBuildRoot(panel.repo, panel.workspace, p)).split(path.sep).join('/'), origin: output.origin, generation: output.generation, problem: output.problem, canRebuild: buildPlan?.available ?? false, reason: buildPlan?.reason ?? null } : null,
    runSettings: runSettings?.value ?? null,
    runSettingsProblem: runSettings?.problem ?? null,
    runSettingsPath: p.readOnly ? path.relative(panel.workspace, projectRunSettingsFile(panel.repo, panel.workspace, p)).split(path.sep).join('/') : null,
    section: p.section,
    dir: path.relative(await fs.realpath(p.readOnly ? panel.repo : projects), p.dir).split(path.sep).join('/'),
    manifest: m,
    errors: [...p.errors, ...(p.stateProblem ? [{ field: '', message: p.stateProblem }] : []), ...(runSettings?.problem ? [{ field: '', message: `${runSettings.problem} (${projectRunSettingsFile(panel.repo, panel.workspace, p)})` }] : [])],
    manifestMtimeMs: p.manifestMtimeMs,
    manifestRevision: p.origin === 'bundled' ? embeddedManifestRevision(p, runSettings?.value?.revision) : undefined,
    entryExists: webBuildMs !== null,
    webBuildMs,
    icon: {
      custom: iconMs !== null, mtimeMs: iconMs, changedSincePackage: iconMs !== null && zipMs !== null && iconMs > zipMs,
      model: iconModelMs !== null ? `${projectPreviewRoute(p, output ?? undefined)}icon.js` : null,
    },
    running: panel.runner.projectId === p.id,
    // The launcher card this project presents everywhere: the same contract a publisher records with a deployment.
    card: m ? publicationCard(m, iconModelMs !== null) : null,
    canDev: !!m?.scripts?.dev,
    archived: isArchivedId(p.id),
    packaging: panel.packagingOf(m),
    packagingChoices: panel.packagingChoicesOf(m),
    publication,
    publicationStandalone,
    publicationDestinations,
  };
}

export function createServer(opts: ServerOptions = {}): PanelServer {
  const core = opts.repo ?? opts.panel?.repo ?? REPO;
  const workspace = opts.workspace ?? opts.panel?.workspace ?? WORKSPACE;
  const projects = opts.projects ?? opts.panel?.projects ?? workspace;
  assertUserRoot(core, workspace);
  assertUserRoot(core, projects);
  const findProject = (id: string) => resolveProject(core, workspace, projects, id);
  const port = opts.port ?? DEFAULT_PORT;
  const url = `http://127.0.0.1:${port}/`;
  const workspaceKind = opts.workspaceKind ?? 'explicit';
  const hub = new EventHub();
  const panel = opts.panel ?? new Panel(core, workspace, hub, projects, workspaceKind === 'user' || workspaceKind === 'repository');
  panel.panelUrl = url;
  const uiDir = path.join(PANEL_DIR, 'ui');
  let server: http.Server;
  let closing = false, activeMutations = 0;
  panel.restartWorkPending = () => activeMutations > 0 || managedTools.pendingWork();
  const managedTools = new ManagedTools({ core, workspace, projects, port, server: () => server, prepare: () => panel.prepareManagedTools(), available: () => { const status = panel.pluginServiceStatus(); return status.pending ? status.problem ?? 'Plugin services are changing; wait for setup/refresh to finish' : null; } });
  panel.onPluginSourcesChanged = async (restartRequired) => { if (restartRequired) managedTools.invalidatePluginRuntimes(); await managedTools.navigation(); };
  const autoRoute = opts.autoRoute;
  let autoRouteWork: Promise<string | null> | null = null;

  async function refreshAutoRoute(): Promise<string | null> {
    if (!autoRoute) return null;
    const selection = autoRoute.select?.() ?? autoRouteSelection(autoRoute.env ?? process.env, core, autoRoute.explicitProjects);
    const start = autoRoute.start ?? (() => {
      const invocation = hiddenNodeInvocation(autoRoute.argv ?? process.argv.slice(1), autoRoute.cwd ?? process.cwd(), autoRoute.execPath ?? process.execPath, autoRoute.env ?? process.env);
      spawn(invocation.command, invocation.args, invocation.options).unref();
    });
    const work = autoRouteWork ?? ensureAutoRouteTarget({ workspace, projects, port }, selection, {
      probe: autoRoute.probe,
      start,
      timeoutMs: autoRoute.timeoutMs,
    });
    autoRouteWork = work;
    try { return await work; }
    finally { if (autoRouteWork === work) autoRouteWork = null; }
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const reject = checkRequest(method, req.headers, port);
    if (reject) throw new HttpError(403, reject);
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (closing || panel.restartPending && !['/api/ping', '/api/restart'].includes(url.pathname)) {
      res.setHeader('connection', 'close');
      return sendJson(res, 503, { error: 'The panel is restarting' });
    }

    if (autoRoute && isDocumentRefresh(method, req, url.pathname) && !['api', 'preview', 'vendor', 'sdk'].includes(parts[0])) {
      try {
        const destination = await refreshAutoRoute();
        if (destination) {
          res.writeHead(302, { location: destination, 'cache-control': 'no-store' });
          res.end();
          return;
        }
      } catch (error) {
        sendAutoRouteError(res, (error as Error).message);
        return;
      }
    }

    if (parts[0] === 'preview') {
      // /preview/[archive/]<project>/<file...>: a project's entry folder, for browser Run and the icon studio.
      if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'method not allowed');
      const decoded = parts.slice(1).map(decodeURIComponent);
      const n = /^(?:(?:bundled|workspace):)?archive$/.test(decoded[0]) ? 2 : 1;
      let p = await findProject(decoded.slice(0, n).join('/'));
      let file = parts.slice(1 + n).join('/');
      let bundledEntry: string | null = null;
      if (p.origin === 'bundled') {
        const marker = decodeURIComponent(parts[1 + n] ?? '');
        const generation = marker.startsWith('@r-') ? marker.slice(1) : undefined;
        if (generation !== undefined) {
          if (!/^r-[a-zA-Z0-9]{6}$/.test(generation)) throw new HttpError(409, 'Invalid project output generation');
          file = parts.slice(2 + n).join('/');
        }
        if (!generation && p.workingRoot) {
          const done = await panel.jobs.wait(panel.webBuild(p));
          if (done.state === 'failed') throw new HttpError(409, done.error ?? 'Project build failed');
          p = await findProject(p.id);
        }
        let output;
        const effectiveGeneration = p.workingRoot && generation ? path.join(effectiveOutputRoot(core, workspace, p), generation) : null;
        if (effectiveGeneration) assertWritablePath(core, workspace, effectiveGeneration);
        const oldGeneration = effectiveGeneration && !await fs.lstat(effectiveGeneration).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        if (oldGeneration && p.productDir) {
          const source = await readProject(p.productDir, p.id, p.section);
          if (!source) throw new HttpError(409, 'Installed project is unavailable');
          output = await requireProjectOutput(core, workspace, { ...source, origin: 'bundled', readOnly: true, key: p.key }, generation);
        } else output = p.workingRoot ? await effectiveProjectOutput(core, workspace, p, generation) : await requireProjectOutput(core, workspace, p, generation);
        bundledEntry = output.entry;
        if (!generation && output.generation) {
          res.writeHead(302, { location: `${projectPreviewRoute(p, output)}${file}${url.search}`, 'cache-control': 'no-store' }); res.end(); return;
        }
      }
      if (p.origin !== 'bundled' && (!file || file === 'index.html')) {
        const job = panel.webBuild(p);
        const done = await panel.jobs.wait(job);
        if (done.state === 'failed') throw new HttpError(400, done.error ?? 'the app build failed');
      }
      const entry = bundledEntry ?? await projectPath(p, usable(p).entry ?? defaultEntry(usable(p).kind));
      if (p.origin === 'bundled') {
        const relative = decodeURIComponent(file || 'index.html'), owner = { ...p, dir: entry };
        const asset = await projectPath(owner, relative);
        if ((await fs.stat(asset)).isDirectory()) await projectFile(owner, `${relative}/index.html`);
      }
      return serveStatic(res, entry, file);
    }
    if (method === 'GET' && url.pathname === '/vendor/three.module.js') {
      // three.js for the icon preview page (ui/icon-preview.html), from the SDK's own dependency.
      return serveStatic(res, path.dirname(createRequire(path.join(core, 'packages', 'sdk', 'package.json')).resolve('three')), 'three.module.js');
    }
    if (method === 'GET' && parts[0] === 'sdk' && parts.length === 2 && SDK_MODULES.has(parts[1])) {
      // The SDK's icon modules as browser JS (types stripped), so the preview page draws icons as apps do.
      const source = await fs.readFile(path.join(core, 'packages', 'sdk', 'src', parts[1].replace(/\.js$/, '.ts')), 'utf8');
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(stripTypeScriptTypes(source));
      return;
    }
    if (parts[0] !== 'api') {
      if (url.pathname.endsWith('/') || parts[0]?.startsWith('__')) await panel.synchronizePluginServices(true);
      if (await managedTools.handle(req, res, url.pathname)) return;
      if (method !== 'GET') throw new HttpError(405, 'method not allowed');
      if (url.pathname === '/' || url.pathname === '/plugins' || url.pathname === '/plugins/' || url.pathname === '/settings' || url.pathname === '/settings/') return serveStatic(res, uiDir, 'index.html');
      return serveStatic(res, uiDir, url.pathname);
    }

    const api = parts.slice(1).map(decodeURIComponent);
    const is = (m: string, ...segs: string[]) => method === m && api.length === segs.length && segs.every((s, i) => s === '*' || s === api[i]);

    if (is('GET', 'ping')) return sendJson(res, 200, { app: APP_NAME, repo: core, workspace, projects, pid: process.pid, instanceId: panel.instanceId });
    if (!(method !== 'GET' && ['plugins', 'restart', 'quit'].includes(api[0]))) await panel.synchronizePluginServices(method !== 'GET');
    if (is('GET', 'navigation')) return sendJson(res, 200, await managedTools.navigation());
    if (api[0] === 'tools' && api.length === 3) {
      const id = api[1], action = api[2];
      if (method === 'GET' && action === 'status') {
        const status = await managedTools.status(id);
        if (!status) throw new HttpError(404, `no managed tool ${id}`);
        return sendJson(res, 200, status);
      }
      if (method === 'POST' && action === 'retry') {
        const status = await managedTools.retry(id);
        if (!status) throw new HttpError(404, `no managed tool ${id}`);
        return sendJson(res, 202, status);
      }
    }
    if (is('GET', 'workspace')) return sendJson(res, 200, { path: projects, integrationPath: workspace, exists: await isWorkspace(projects), kind: workspaceKind, autoRoute: !!autoRoute });
    if (is('GET', 'monitors')) return sendJson(res, 200, { monitors: await listMonitors() });
    if (is('POST', 'workspace', 'open-folder')) {
      assertWritablePath(core, projects);
      await fs.mkdir(projects, { recursive: true });
      panel.openInShell(projects);
      return sendJson(res, 200, { opened: projects });
    }
    if (is('POST', 'workspace', 'create')) {
      const added = canonicalPath(projects) === canonicalPath(workspace) ? await createWorkspace(core, projects) : await createProjectWorkspace(core, projects);
      await writeEditorConfig(core, projects);
      log(`[projects] ${projects}: added ${added.length} files`);
      await Promise.all([panel.loadPackagers(), panel.loadPublishers()]);
      hub.send('projects-changed', {});
      return sendJson(res, 200, { path: projects, added });
    }
    if (is('POST', 'projects', 'new')) {
      const { folder, name } = await readJson<{ folder?: string; name?: string }>(req);
      if (!folder) throw new HttpError(400, 'folder missing');
      try {
        await createProject(core, projects, folder, name?.trim() || folder, canonicalPath(projects) === canonicalPath(workspace) ? 'combined' : 'projects');
        await writeEditorConfig(core, projects);
      } catch (e) {
        if (e instanceof ProjectRefused) throw new HttpError(409, e.message);
        throw e;
      }
      log(`[projects] created ${folder} from the template (projects/${UNSORTED}/${folder})`);
      hub.send('projects-changed', {});
      return sendJson(res, 200, await describeProject(projects, await findProject(folder), panel));
    }
    if (is('GET', 'events')) {
      if (closing || panel.restartPending) { res.setHeader('connection', 'close'); return sendJson(res, 503, { error: 'The panel is restarting' }); }
      hub.attach(res);
      hub.send('run', panel.runner.state());
      return;
    }
    if (is('GET', 'projects')) {
      const catalog = await discoverProjectCatalog(core, workspace, projects);
      const liveProjects = catalog.projects.map(record => record.project).filter(p => !isArchivedId(p.id));
      const archived = catalog.projects.map(record => record.project).filter(p => isArchivedId(p.id));
      return sendJson(res, 200, {
        projects: await Promise.all(liveProjects.map((p) => describeProject(projects, p, panel))),
        archived: await Promise.all(archived.map((p) => describeProject(projects, p, panel))),
        layout: await readLayout(projects, liveProjects),
        problems: catalog.problems,
        unregistered: await unregisteredApps(projects),
      });
    }
    if (is('PUT', 'layout')) {
      const l = await readJson<Layout>(req);
      const problem = validateLayout(l);
      if (problem) throw new HttpError(400, problem);
      assertWritablePath(core, projects, path.join(projects, 'xrb-panel.json'));
      assertWritablePath(core, projects, path.join(projects, PROJECTS, UNSORTED));
      if (typeof l.revision !== 'string' || !/^[a-f0-9]{64}$/.test(l.revision)) throw new HttpError(400, 'The current project layout revision is required');
      for (const section of l.sections) {
        assertWritablePath(core, projects, path.join(projects, PROJECTS, section.name.trim().toLowerCase()));
        if (section.from) assertWritablePath(core, projects, path.join(projects, PROJECTS, section.from));
      }
      const editable = (await discoverProjectCatalog(core, workspace, projects)).projects.map(record => record.project).filter(p => !isArchivedId(p.id));
      const known = new Set(editable.map(p => p.id));
      if (l.sections.some(section => section.items.some(id => !known.has(id)))) throw new HttpError(409, 'Unknown or archived project in layout');
      for (const project of editable) if (project.origin !== 'bundled') assertEditableProject(core, projects, project);
      if (panel.runner.busy || panel.jobs.active().length) throw new HttpError(409, 'Stop active runs and jobs before rearranging projects');
      try {
        const bundled = editable.filter(p => p.origin === 'bundled').sort((a, b) => a.id.localeCompare(b.id));
        const apply = (index: number): Promise<void> => index === bundled.length ? applyLayout(projects, l, editable)
          : withEmbeddedProjectLock(core, projects, bundled[index], () => apply(index + 1));
        await apply(0);
      } catch (e) {
        if (e instanceof MoveRefused) throw new HttpError(409, e.message);
        throw e;
      }
      hub.send('projects-changed', {});
      return sendJson(res, 200, { saved: true });
    }
    if (is('POST', 'projects', 'create')) {
      const { id } = await readJson<{ id?: string }>(req);
      if (!id || !(await unregisteredApps(projects)).includes(id)) throw new HttpError(400, `${id} is not an app folder without a manifest`);
      const dir = path.join(projects, PROJECTS, id);
      assertWritablePath(core, projects, path.join(dir, MANIFEST));
      // The new app runs like the workspace's first app (same providers and platform).
      const like = (await discoverProjects(projects)).find((x) => x.manifest?.kind === 'app')?.manifest ?? null;
      const r = await saveManifest(dir, await defaultManifest(dir, like));
      if (r.errors.length) throw new HttpError(400, 'default manifest is invalid', r.errors);
      log(`[projects] created ${id}/${MANIFEST}`);
      return sendJson(res, 200, await describeProject(projects, await findProject(path.basename(dir)), panel));
    }
    // /api/projects/[archive/]<project>/...
    if (api[0] === 'projects' && api.length >= 2) {
      const n = /^(?:(?:bundled|workspace):)?archive$/.test(api[1]) ? 2 : 1;
      const id = api.slice(1, 1 + n).join('/');
      const rest = api.slice(1 + n);
      let p = await findProject(id);
      let writeRevision = p.manifestMtimeMs;
      let writeManifestRevision = embeddedManifestRevision(p);
      if (rest.length === 1 && rest[0] === 'run-settings') {
        if (p.workingRoot) throw new HttpError(409, 'Personal choices were imported into normal project settings; use the normal controls or Open JSON');
        if (method === 'GET') return sendJson(res, 200, await readProjectRunSettings(core, workspace, p));
        if (method === 'PUT' || method === 'DELETE') {
          const body = await readJson<{ overrides?: unknown; revision?: unknown }>(req);
          return sendJson(res, 200, await panel.saveRunSettings(p, method === 'DELETE' ? {} : body?.overrides, body?.revision));
        }
      }
      if (method === 'POST' && rest.length === 1 && rest[0] === 'keep-working-sources') {
        if (p.origin !== 'bundled' || !p.workingRoot) throw new HttpError(409, 'Only prepared embedded projects have working sources');
        panel.assertProjectIdle(p);
        const body = await readJson<{ revision?: unknown; confirm?: unknown }>(req);
        await keepEmbeddedWorkingSources(core, workspace, projects, p, body.revision, body.confirm);
        hub.send('projects-changed', {});
        return sendJson(res, 200, await describeProject(projects, await findProject(id), panel));
      }
      if (method === 'POST' && rest.length === 1 && rest[0] === 'copy') {
        const body = await readJson<{ folder: string; name?: string }>(req);
        const copied = await withEmbeddedProjectLock(core, projects, p, () => copyBundledProject(core, projects, p, body.folder, body.name));
        hub.send('projects-changed', {});
        return sendJson(res, 201, await describeProject(projects, await findProject(copied), panel));
      }
      if (p.origin === 'bundled' && rest[0] === 'delete') throw new HttpError(409, 'Embedded projects cannot be deleted; archive instead');
      if (p.origin === 'bundled' && (method === 'PUT' && rest[0] === 'icon' || method === 'DELETE' && rest[0] === 'icon'
        || method === 'POST' && ['open-folder', 'open-manifest'].includes(rest[0]))) {
        panel.assertProjectIdle(p);
        p = await panel.prepareProject(p);
        writeRevision = p.manifestMtimeMs;
        writeManifestRevision = embeddedManifestRevision(p);
      }
      if (p.origin !== 'bundled' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) assertEditableProject(core, projects, p);
      let writable = projectWritableRoot(projects, p);
      const checkWriteRevision = async () => {
        const current = p.origin === 'bundled' ? await readProject(p.dir, p.id, p.section) : null;
        if (p.origin === 'bundled' && (!current || embeddedManifestRevision({ ...p, ...current }) !== writeManifestRevision)) throw new HttpError(409, 'Project settings changed; reload before saving');
        if ((await fs.stat(path.join(p.dir, MANIFEST))).mtimeMs !== writeRevision) throw new ManifestConflictError('Project settings changed; reload before saving');
      };
      if (method === 'GET' && rest.length === 0) return sendJson(res, 200, await describeProject(projects, p, panel));
      if (method === 'PUT' && rest[0] === 'manifest' && rest.length === 1) {
        const body = await readJson<{ manifest?: Manifest; mtimeMs?: number; revision?: string; confirm?: string[] }>(req);
        if (!body.manifest) throw new HttpError(400, 'manifest missing');
        const publicationErrors = panel.publicationErrors(body.manifest);
        if (publicationErrors.length) return sendJson(res, 400, { error: 'invalid publication settings', fields: publicationErrors });
        const editTime = p.manifestMtimeMs;
        if (p.origin === 'bundled') {
          const legacy = p.readOnly && p.manifest ? await readProjectRunSettings(core, workspace, p) : null;
          if (typeof body.revision !== 'string') throw new HttpError(400, 'The current project manifest revision is required');
          if (body.revision !== embeddedManifestRevision(p, legacy?.revision)) throw new HttpError(409, 'Project settings changed; reload before saving');
          const wasRaw = p.readOnly;
          panel.assertProjectIdle(p);
          p = await panel.prepareProject(p);
          if (wasRaw && legacy && p.importedRunRevision !== legacy.revision) throw new HttpError(409, 'Personal settings changed during preparation; reload before saving');
          writeRevision = p.manifestMtimeMs;
          writeManifestRevision = embeddedManifestRevision(p);
          writable = projectWritableRoot(projects, p);
        }
        const before = p.manifest?.publication, after = body.manifest.publication;
        const selectsAnotherPublisher = !!before && !!after && before.publisher !== after.publisher;
        const changesSelectedRoute = !!before && (!after || (!selectsAnotherPublisher && before.slug !== after.slug));
        if (changesSelectedRoute && !body.confirm?.includes('publication-route')) {
          const state = await panel.publicationOf(p.manifest);
          if (state.status?.state !== 'unpublished')
            throw new HttpError(409, 'Changing an active publication route may strand installed packages.', { needsConfirm: 'publication-route', previousUrl: state.status?.selectedUrl });
        }
        try {
          assertEditableProject(core, projects, p);
          assertWritablePath(core, writable, path.join(p.dir, MANIFEST));
          if (body.mtimeMs !== undefined && body.mtimeMs !== editTime) throw new ManifestConflictError('Project settings changed; reload before saving');
          const r = await withEmbeddedProjectLock(core, projects, p, async () => {
            await checkWriteRevision();
            return saveManifest(p.dir, body.manifest!, writeRevision);
          });
          if (r.errors.length) return sendJson(res, 400, { error: 'invalid settings', fields: r.errors });
        } catch (e) {
          if (e instanceof ManifestConflictError) throw new HttpError(409, e.message);
          throw e;
        }
        log(`[projects] saved ${id}/${MANIFEST}`);
        return sendJson(res, 200, await describeProject(projects, await findProject(id), panel));
      }
      if (rest[0] === 'icon' && rest.length === 1) {
        if (method === 'GET') {
          const file = p.manifest?.icon ? await projectFile(p, p.manifest.icon).catch((error: HttpError) => { if (error.status === 404) return null; throw error; }) : null;
          const png = file ? await fs.readFile(file) : null;
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
          res.end(png ?? defaultIcon(256, p.manifest?.iconColor, p.manifest?.iconShape));
          return;
        }
        if (method === 'PUT') {
          const m = usable(p);
          const png = await readBody(req, ICON_LIMIT);
          if (!isPng(png)) throw new HttpError(400, 'the icon must be a PNG');
          const rel = m.icon ?? 'icon.png';
          const file = path.resolve(p.dir, rel);
          if (!isInside(p.dir, rel)) throw new HttpError(400, 'icon path outside the project');
          assertWritablePath(core, writable, file);
          assertWritablePath(core, writable, path.join(p.dir, MANIFEST));
          await withEmbeddedProjectLock(core, projects, p, async () => {
            await checkWriteRevision();
            await fs.writeFile(file, png);
            if (!m.icon) await saveManifest(p.dir, { ...m, icon: rel }, writeRevision);
          });
          log(`[projects] icon of ${id} written (${png.length} bytes)`);
          const d = await describeProject(projects, await findProject(id), panel);
          hub.send('project', d);
          return sendJson(res, 200, d);
        }
        if (method === 'DELETE') {
          const m = usable(p);
          if (m.icon) {
            const file = path.resolve(p.dir, m.icon);
            assertWritablePath(core, writable, file);
            assertWritablePath(core, writable, path.join(p.dir, MANIFEST));
            const next = { ...m };
            delete next.icon;
            await withEmbeddedProjectLock(core, projects, p, async () => {
              await checkWriteRevision();
              await saveManifest(p.dir, next, writeRevision);
              await fs.unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
            });
            log(`[projects] custom icon of ${id} removed`);
          }
          const d = await describeProject(projects, await findProject(id), panel);
          hub.send('project', d);
          return sendJson(res, 200, d);
        }
      }
      const handled = await panel.projectRoute(method, p, rest, req, res);
      if (handled) return;
    }
    if (await panel.route(method, api, req, res)) return;
    throw new HttpError(404, `no route ${method} ${url.pathname}`);
  }

  server = http.createServer((req, res) => {
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET') && !/^\/api\/(?:restart|quit)\/?(?:\?|$)/.test(req.url ?? '');
    if (mutation) activeMutations++;
    const localRead = req.url === '/api/projects' || /^\/api\/projects\/(?:[^/?]+\/){1,2}icon(?:\?|$)/.test(req.url ?? '')
      || /^\/preview\//.test(req.url ?? '');
    const previewProjectionRead = /^\/api\/preview\/projection(?:\?|$)/.test(req.url ?? '');
    let loopbackOrigin = '';
    try {
      const origin = new URL(req.headers.origin ?? '');
      if (['127.0.0.1', 'localhost', '::1', '[::1]'].includes(origin.hostname.toLowerCase())) loopbackOrigin = origin.origin;
    } catch { /* no CORS origin */ }
    if ((localRead && req.headers.origin === 'https://app.local' || previewProjectionRead && loopbackOrigin)
      && ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) {
      res.setHeader('access-control-allow-origin', localRead && req.headers.origin === 'https://app.local' ? 'https://app.local' : loopbackOrigin);
      res.setHeader('vary', 'Origin');
    }
    route(req, res).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) log(`[http] ${req.method} ${req.url}: ${(e as Error).stack ?? e}`);
      if (res.headersSent) return res.end();
      sendJson(res, status, { error: (e as Error).message, details: e instanceof HttpError ? e.details : undefined });
    }).finally(() => { if (mutation) activeMutations--; });
  });
  panel.onQuit = () => void closeServer();
  panel.onRestart = () => void closeServer();
  let closeWork: Promise<void> | null = null;
  function closeServer(): Promise<void> {
    return closeWork ??= (async () => {
      closing = true;
      // Stop accepting reconnects BEFORE draining event streams and tool startup.
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      hub.closeAll();
      await managedTools.close();
      await panel.dispose();
      server.closeIdleConnections();
      await closed;
    })();
  }
  return { server, panel, managedTools, hub, port, url, close: closeServer };
}

interface ProbeResult {
  state: 'panel' | 'other' | 'free';
  workspace?: string;
  projects?: string;
}

/** What answers on the port, including the workspace when it is our panel. */
async function probePanel(port: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', headers: { host: `127.0.0.1:${port}` }, timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          const ping = JSON.parse(body) as { app?: string; workspace?: string; projects?: string };
          resolve(ping.app === APP_NAME ? { state: 'panel', workspace: ping.workspace, projects: ping.projects } : { state: 'other' });
        } catch {
          resolve({ state: 'other' });
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', (e: NodeJS.ErrnoException) => resolve({ state: e.code === 'ECONNREFUSED' ? 'free' : 'other' }));
  });
}

export async function probe(port: number): Promise<'panel' | 'other' | 'free'> {
  return (await probePanel(port)).state;
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Current markers are unambiguous; legacy auto/repository arguments are also checkout-local. */
export function shortcutRecoveryPatterns(marker: ShortcutLaunch): { marker: string; legacy?: string } {
  const boundary = (argument: string) => `(?<!\\S)${argument}(?!\\S)`;
  return {
    marker: boundary(`--shortcut-launch=${marker}`),
    legacy: marker === 'auto' ? boundary('--auto-workspace') : marker === 'repository' ? boundary('--workspace=\\.xrbuild') : undefined,
  };
}

/** Finds a listener only when it is this checkout's marked shortcut process. */
export function findStaleShortcutPanel(port: number, marker: ShortcutLaunch, serverPath = path.resolve(process.argv[1] ?? '')): Promise<number | null> {
  const patterns = shortcutRecoveryPatterns(marker);
  const script = [
    `$listener = @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue);`,
    'if ($listener.Count -ne 1) { exit 0 }',
    '$process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listener[0].OwningProcess);',
    `$server = ${powerShellString(serverPath)}; $marker = ${powerShellString(patterns.marker)}; $legacy = ${powerShellString(patterns.legacy ?? '')};`,
    'if ($process -and $process.CommandLine -and $process.CommandLine.Contains($server) -and ([regex]::IsMatch($process.CommandLine, $marker) -or ($legacy -and [regex]::IsMatch($process.CommandLine, $legacy)))) { [Console]::Out.WriteLine($process.ProcessId) }',
  ].join(' ');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      const pid = Number(stdout.trim());
      resolve(Number.isInteger(pid) && pid > 0 ? pid : null);
    });
  });
}

function stopStaleShortcutPanel(pid: number): Promise<void> {
  return new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(pid), '/F'], { windowsHide: true }, () => resolve()));
}

/** Stops a verified stale shortcut panel and waits until its loopback port is free. */
export async function recoverStaleShortcutPanel(port: number, options: ShortcutRecoveryOptions): Promise<boolean> {
  const serverPath = options.serverPath ?? path.resolve(process.argv[1] ?? '');
  const pid = await (options.find ?? findStaleShortcutPanel)(port, options.marker, serverPath);
  if (!pid) return false;
  await (options.stop ?? stopStaleShortcutPanel)(pid);
  const inspect = options.probe ?? probePanel;
  const until = Date.now() + (options.timeoutMs ?? 5_000);
  while (Date.now() < until) {
    if ((await inspect(port)).state === 'free') return true;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 50));
  }
  return false;
}

export function shortcutLaunchFromArgs(args: readonly string[]): ShortcutLaunch | undefined {
  if (args.includes('--shortcut-launch')) throw new Error('--shortcut-launch requires --shortcut-launch=<mode>');
  const values = args.filter((arg) => arg.startsWith('--shortcut-launch=')).map((arg) => arg.slice('--shortcut-launch='.length));
  if (values.length > 1) throw new Error('--shortcut-launch may be given only once');
  if (!values.length) return undefined;
  if (values[0] === 'user') return 'user';
  if (values[0] === 'repository') return 'repository';
  if (values[0] === 'auto') return 'auto';
  throw new Error('--shortcut-launch must be user, repository, or auto');
}

/** Opens a URL in the default browser without a console window. */
export function openBrowser(url: string): void {
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/** Starts a detached Node process with CREATE_NO_WINDOW on Windows. */
export function hiddenNodeInvocation(argv = process.argv.slice(1), cwd = process.cwd(), execPath = process.execPath, env = process.env) {
  return { command: execPath, args: argv.filter((arg) => arg !== '--open'),
    options: { cwd, env, detached: true, stdio: 'ignore' as const, windowsHide: true } };
}

/** WScript starts the console-subsystem Node process with window style 0, avoiding terminal flashes. */
export function silentRestartInvocation(argv = process.argv.slice(1), cwd = process.cwd(), execPath = process.execPath, env = process.env) {
  return { command: 'wscript.exe', args: [RESTART_SILENT, cwd, execPath, ...argv.filter((arg) => arg !== '--open')],
    options: { cwd, env, detached: true, stdio: 'ignore' as const, windowsHide: true } };
}

/**
 * Single-instance start (design D2): when a panel already answers on the port, only open the
 * browser on it; when another program holds the port, give up with a message.
 */
export async function launch(opts: { port: number; open: boolean; repo?: string; workspace?: string; projects?: string; workspaceKind?: WorkspaceKind; autoRoute?: AutoRouteOptions; shortcutRecovery?: ShortcutRecoveryOptions; browser?: (url: string) => void }): Promise<
  { result: 'started'; server: PanelServer } | { result: 'already-running' | 'workspace-mismatch' | 'port-taken'; server: null }
> {
  const browser = opts.browser ?? openBrowser;
  const url = `http://127.0.0.1:${opts.port}/`;
  const selectedProjects = opts.projects ?? projectsDir(process.env, opts.workspace ?? WORKSPACE);
  let found = await probePanel(opts.port);
  if (found.state === 'other' && opts.shortcutRecovery) {
    if (await recoverStaleShortcutPanel(opts.port, { ...opts.shortcutRecovery, probe: probePanel })) {
      found = await probePanel(opts.port);
    } else {
      log(`[panel] ${url} is occupied and no verified stale shortcut panel could be recovered`);
    }
  }
  if (found.state === 'panel') {
    const expectedWorkspace = canonicalPath(opts.workspace ?? WORKSPACE);
    const expectedProjects = canonicalPath(selectedProjects);
    const runningWorkspace = found.workspace ? canonicalPath(found.workspace) : null;
    const runningProjects = found.projects ?? found.workspace;
    if (runningWorkspace !== expectedWorkspace || !runningProjects || canonicalPath(runningProjects) !== expectedProjects) {
      log(`[panel] ${url} is already running with workspace ${found.workspace} and projects ${runningProjects}; quit it or use another XRB_PANEL_PORT before opening workspace ${opts.workspace ?? WORKSPACE} and projects ${selectedProjects}`);
      return { result: 'workspace-mismatch', server: null };
    }
    log(`[panel] already running at ${url}`);
    if (opts.open) browser(url);
    return { result: 'already-running', server: null };
  }
  if (found.state === 'other') {
    log(`[panel] port ${opts.port} is used by another program; set XRB_PANEL_PORT to use another port`);
    return { result: 'port-taken', server: null };
  }
  const s = createServer({ port: opts.port, repo: opts.repo, workspace: opts.workspace, projects: selectedProjects, workspaceKind: opts.workspaceKind, autoRoute: opts.autoRoute });
  // Workspace packagers load the core's modules from XRB_CORE (they never import it by a relative path).
  process.env.XRB_CORE ??= s.panel.repo;
  await s.panel.loadInitialServices();
  await s.managedTools.prepareConfigured();
  await new Promise<void>((resolve, reject) => {
    s.server.once('error', reject);
    s.server.listen(opts.port, '127.0.0.1', () => resolve());
  });
  log(`[panel] listening on ${url} (core ${s.panel.repo}, workspace ${s.panel.workspace}, projects ${s.panel.projects})`);
  if (opts.open) browser(url);
  return { result: 'started', server: s };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const explicitWorkspace = workspaceFromArgs(args);
  const explicitProjects = projectsFromArgs(args);
  const autoRoute = args.includes('--auto-workspace');
  const shortcutLaunch = shortcutLaunchFromArgs(args);
  if (autoRoute && explicitWorkspace) throw new Error('--auto-workspace cannot be combined with --workspace');
  const selection = autoRoute ? autoRouteSelection(process.env, REPO, explicitProjects) : null;
  const workspace = selection?.workspace ?? explicitWorkspace ?? WORKSPACE;
  const projects = selection?.projects ?? explicitProjects ?? projectsDir(process.env, workspace);
  const port = selection?.port ?? panelPort(explicitWorkspace, process.env, explicitProjects ?? process.env.XRB_PROJECTS_HOME);
  const workspaceKind: WorkspaceKind = selection?.kind ?? (explicitWorkspace ? 'repository' : 'user');
  openLog((await probe(port)) === 'free');
  const r = await launch({
    port,
    open: process.argv.includes('--open'),
    workspace,
    projects,
    workspaceKind,
    autoRoute: autoRoute ? { explicitProjects, argv: process.argv.slice(1), cwd: process.cwd(), execPath: process.execPath } : undefined,
    shortcutRecovery: shortcutLaunch ? { marker: shortcutLaunch } : undefined,
  });
  if (r.result === 'port-taken' || r.result === 'workspace-mismatch') process.exitCode = 1;
  if (r.server) {
    const s = r.server;
    s.panel.onQuit = () => {
      void s.close().then(() => {
        log('[panel] stopped');
        process.exit(0);
      });
    };
    s.panel.onRestart = () => {
      void s.close().then(() => {
        log('[panel] restarting');
        const restart = silentRestartInvocation();
        spawn(restart.command, restart.args, restart.options).unref();
        process.exit(0);
      });
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    log(`[panel] ${(e as Error).stack ?? e}`);
    process.exitCode = 1;
  });
}

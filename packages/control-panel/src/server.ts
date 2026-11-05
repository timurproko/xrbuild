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
  discoverAll,
  discoverArchived,
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
} from './projects.ts';
import { Panel } from './panel.ts';
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
async function findProject(repo: string, id: string): Promise<Project> {
  const p = (await discoverAll(repo)).find((x) => x.id === id);
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
  const m = p.manifest;
  const entry = m ? entryDir(p, m) : null;
  const webBuildMs = entry ? await mtime(path.join(entry, 'index.html')) : null;
  // The build's 3D icon (icon.js next to index.html), which a launcher imports from the preview route.
  const iconModelMs = entry ? await mtime(path.join(entry, 'icon.js')) : null;
  const icon = iconPath(p, m);
  const iconMs = await mtime(icon);
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
    section: p.section,
    dir: path.relative(projects, p.dir).split(path.sep).join('/'),
    manifest: m,
    errors: p.errors,
    manifestMtimeMs: p.manifestMtimeMs,
    entryExists: webBuildMs !== null,
    webBuildMs,
    icon: {
      custom: iconMs !== null, mtimeMs: iconMs, changedSincePackage: iconMs !== null && zipMs !== null && iconMs > zipMs,
      model: iconModelMs !== null ? `/preview/${p.id.split('/').map(encodeURIComponent).join('/')}/icon.js` : null,
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
  const core = opts.repo ?? REPO;
  const workspace = opts.workspace ?? opts.panel?.workspace ?? WORKSPACE;
  const projects = opts.projects ?? opts.panel?.projects ?? workspace;
  const port = opts.port ?? DEFAULT_PORT;
  const url = `http://127.0.0.1:${port}/`;
  const workspaceKind = opts.workspaceKind ?? 'explicit';
  const hub = new EventHub();
  const panel = opts.panel ?? new Panel(core, workspace, hub, projects, workspaceKind === 'user' || workspaceKind === 'repository');
  panel.panelUrl = url;
  const uiDir = path.join(PANEL_DIR, 'ui');
  let server: http.Server;
  const managedTools = new ManagedTools({ core, workspace, projects, port, server: () => server, prepare: () => panel.prepareManagedTools() });
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
      const n = parts[1] === ARCHIVE ? 2 : 1;
      const p = await findProject(projects, parts.slice(1, 1 + n).join('/'));
      const file = url.pathname.split('/').slice(2 + n).join('/');
      if (!file || file === 'index.html') {
        const job = panel.webBuild(p);
        const done = await panel.jobs.wait(job);
        if (done.state === 'failed') throw new HttpError(400, done.error ?? 'the app build failed');
      }
      return serveStatic(res, entryDir(p, usable(p)), file);
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
      if (await managedTools.handle(req, res, url.pathname)) return;
      if (method !== 'GET') throw new HttpError(405, 'method not allowed');
      if (url.pathname === '/' || url.pathname === '/plugins' || url.pathname === '/plugins/' || url.pathname === '/settings' || url.pathname === '/settings/') return serveStatic(res, uiDir, 'index.html');
      return serveStatic(res, uiDir, url.pathname);
    }

    const api = parts.slice(1).map(decodeURIComponent);
    const is = (m: string, ...segs: string[]) => method === m && api.length === segs.length && segs.every((s, i) => s === '*' || s === api[i]);

    if (is('GET', 'ping')) return sendJson(res, 200, { app: APP_NAME, repo: core, workspace, projects, pid: process.pid, instanceId: panel.instanceId });
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
        await createProject(core, projects, folder, name?.trim() || folder);
      } catch (e) {
        if (e instanceof ProjectRefused) throw new HttpError(409, e.message);
        throw e;
      }
      log(`[projects] created ${folder} from the template (projects/${UNSORTED}/${folder})`);
      hub.send('projects-changed', {});
      return sendJson(res, 200, await describeProject(projects, await findProject(projects, folder), panel));
    }
    if (is('GET', 'events')) {
      hub.attach(res);
      hub.send('run', panel.runner.state());
      return;
    }
    if (is('GET', 'projects')) {
      const [liveProjects, archived] = await Promise.all([discoverProjects(projects), discoverArchived(projects)]);
      return sendJson(res, 200, {
        projects: await Promise.all(liveProjects.map((p) => describeProject(projects, p, panel))),
        archived: await Promise.all(archived.map((p) => describeProject(projects, p, panel))),
        layout: await readLayout(projects, liveProjects),
        unregistered: await unregisteredApps(projects),
      });
    }
    if (is('PUT', 'layout')) {
      const l = await readJson<Layout>(req);
      const problem = validateLayout(l);
      if (problem) throw new HttpError(400, problem);
      try {
        await applyLayout(projects, l, await discoverProjects(projects));
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
      // The new app runs like the workspace's first app (same providers and platform).
      const like = (await discoverProjects(projects)).find((x) => x.manifest?.kind === 'app')?.manifest ?? null;
      const r = await saveManifest(dir, await defaultManifest(dir, like));
      if (r.errors.length) throw new HttpError(400, 'default manifest is invalid', r.errors);
      log(`[projects] created ${id}/${MANIFEST}`);
      return sendJson(res, 200, await describeProject(projects, await findProject(projects, path.basename(dir)), panel));
    }
    // /api/projects/[archive/]<project>/...
    if (api[0] === 'projects' && api.length >= 2) {
      const n = api[1] === ARCHIVE ? 2 : 1;
      const id = api.slice(1, 1 + n).join('/');
      const rest = api.slice(1 + n);
      const p = await findProject(projects, id);
      if (method === 'GET' && rest.length === 0) return sendJson(res, 200, await describeProject(projects, p, panel));
      if (method === 'PUT' && rest[0] === 'manifest' && rest.length === 1) {
        const body = await readJson<{ manifest?: Manifest; mtimeMs?: number; confirm?: string[] }>(req);
        if (!body.manifest) throw new HttpError(400, 'manifest missing');
        const publicationErrors = panel.publicationErrors(body.manifest);
        if (publicationErrors.length) return sendJson(res, 400, { error: 'invalid publication settings', fields: publicationErrors });
        const before = p.manifest?.publication, after = body.manifest.publication;
        const selectsAnotherPublisher = !!before && !!after && before.publisher !== after.publisher;
        const changesSelectedRoute = !!before && (!after || (!selectsAnotherPublisher && before.slug !== after.slug));
        if (changesSelectedRoute && !body.confirm?.includes('publication-route')) {
          const state = await panel.publicationOf(p.manifest);
          if (state.status?.state !== 'unpublished')
            throw new HttpError(409, 'Changing an active publication route may strand installed packages.', { needsConfirm: 'publication-route', previousUrl: state.status?.selectedUrl });
        }
        try {
          const r = await saveManifest(p.dir, body.manifest, body.mtimeMs);
          if (r.errors.length) return sendJson(res, 400, { error: 'invalid settings', fields: r.errors });
        } catch (e) {
          if (e instanceof ManifestConflictError) throw new HttpError(409, e.message);
          throw e;
        }
        log(`[projects] saved ${id}/${MANIFEST}`);
        return sendJson(res, 200, await describeProject(projects, await findProject(projects, id), panel));
      }
      if (rest[0] === 'icon' && rest.length === 1) {
        if (method === 'GET') {
          const file = iconPath(p, p.manifest);
          const png = file ? await fs.readFile(file).catch(() => null) : null;
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
          await fs.writeFile(file, png);
          if (!m.icon) await saveManifest(p.dir, { ...m, icon: rel }, p.manifestMtimeMs);
          log(`[projects] icon of ${id} written (${png.length} bytes)`);
          const d = await describeProject(projects, await findProject(projects, id), panel);
          hub.send('project', d);
          return sendJson(res, 200, d);
        }
        if (method === 'DELETE') {
          const m = usable(p);
          if (m.icon) {
            const file = path.resolve(p.dir, m.icon);
            const next = { ...m };
            delete next.icon;
            await saveManifest(p.dir, next, p.manifestMtimeMs);
            await fs.unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
            log(`[projects] custom icon of ${id} removed`);
          }
          const d = await describeProject(projects, await findProject(projects, id), panel);
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
    const localRead = req.url === '/api/projects' || /^\/api\/projects\/[^/?]+\/icon(?:\?|$)/.test(req.url ?? '')
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
    });
  });
  panel.onQuit = () => void closeServer();
  panel.onRestart = () => void closeServer();
  let closeWork: Promise<void> | null = null;
  function closeServer(): Promise<void> {
    return closeWork ??= (async () => {
      hub.closeAll();
      await managedTools.close();
      await panel.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
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
  await Promise.all([s.panel.loadPackagers(), s.panel.loadPublishers()]);
  await s.managedTools.prepareConfigured();
  if (await isWorkspace(s.panel.projects)) await writeEditorConfig(s.panel.repo, s.panel.projects).catch((e) => log(`[projects] jsconfig.json not written: ${(e as Error).message}`));
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

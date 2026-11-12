import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type http from 'node:http';
import { pathToFileURL } from 'node:url';
import { log } from './env.ts';
import { isManagedTool, readToolLinks, type ManagedToolLink, type ToolLink } from './navigation.ts';
import { resolvePluginModule } from './component-resolver.ts';
import { containedModule, resolvePluginCatalog } from './extension-catalog.ts';
import { pluginServiceContext, type PluginServiceContext } from './plugin-service.ts';

export interface WorkspaceToolContext {
  id: string;
  route: string;
  panelOrigin: string;
  core: string;
  workspace: string;
  projects: string;
  server: http.Server;
  signal: AbortSignal;
  plugin?: PluginServiceContext['plugin'];
  config?: PluginServiceContext['config'];
  runtimeRoot?: string | null;
}
export interface WorkspaceToolInstance {
  handle(req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): unknown;
  close?(): unknown;
}
interface WorkspaceToolModule { createWorkspaceTool?(context: WorkspaceToolContext): WorkspaceToolInstance | Promise<WorkspaceToolInstance> }
type ToolState = 'idle' | 'starting' | 'ready' | 'error' | 'stopping';
interface Runtime { tool: ManagedToolLink; state: ToolState; error: string; work: Promise<void> | null; instance: WorkspaceToolInstance | null; stop: AbortController; sourceChanged?: boolean; identity?: string; retireWork?: Promise<void> }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const owns = (prefix: string, pathname: string) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix);
const bounded = (work: unknown, ms: number): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  Promise.resolve(work).then(() => { clearTimeout(timer); resolve(); }, (error) => { clearTimeout(timer); reject(error); });
});

export class ManagedTools {
  private readonly options: { core: string; workspace: string; projects: string; port: number; server: () => http.Server; prepare?: () => Promise<void>; available?: () => string | null };
  private loaded: Promise<ToolLink[]> | null = null;
  private loadError = '';
  private runtimes = new Map<string, Runtime>();
  private prepareWork: Promise<void> | null = null;
  private closing = false;

  constructor(options: { core: string; workspace: string; projects: string; port: number; server: () => http.Server; prepare?: () => Promise<void>; available?: () => string | null }) { this.options = options; }

  private async tools(): Promise<ToolLink[]> {
    if (!this.loaded) this.loaded = readToolLinks(this.options.workspace, this.options.core).catch((error) => {
      this.loadError = error instanceof Error ? error.message : 'Tool configuration is unavailable';
      return [];
    });
    return this.loaded;
  }

  async prepareConfigured(): Promise<void> {
    const tools = (await this.tools()).filter((tool): tool is ManagedToolLink => isManagedTool(tool));
    if (!tools.length) return;
    for (const tool of tools) this.start(this.runtime(tool));
    await Promise.all(tools.map((tool) => this.runtime(tool).work));
  }

  async navigation(): Promise<{ tools: Array<ToolLink | { id: string; label: string; route: string }>; error?: string }> {
    this.loaded = null;
    this.loadError = '';
    const current = await this.tools();
    for (const runtime of this.runtimes.values()) {
      const selected = current.find(tool => tool.id === runtime.tool.id);
      if (!selected || JSON.stringify(selected) !== JSON.stringify(runtime.tool)) this.invalidate(runtime);
      else if (isManagedTool(selected) && runtime.identity && !runtime.sourceChanged) {
        try { if (this.moduleIdentity(await this.toolModule(selected)) !== runtime.identity) this.invalidate(runtime); }
        catch { this.invalidate(runtime); }
      }
    }
    const tools = current.map((tool) => isManagedTool(tool) ? { id: tool.id, label: tool.label, route: tool.route } : tool);
    return { tools, ...(this.loadError ? { error: this.loadError } : {}) };
  }

  private prepare(): Promise<void> {
    if (!this.options.prepare) return Promise.resolve();
    return this.prepareWork ??= Promise.resolve().then(() => this.options.prepare!()).finally(() => { this.prepareWork = null; });
  }

  pendingWork(): boolean {
    return [...this.runtimes.values()].some(runtime => !!runtime.retireWork || !!runtime.work && !runtime.sourceChanged);
  }

  invalidatePluginRuntimes(): void {
    this.pluginRestartRequired = true;
    for (const [id, runtime] of this.runtimes) if (runtime.tool.owner) {
      if (runtime.state === 'idle' && !runtime.instance && !runtime.work) this.runtimes.delete(id);
      else this.invalidate(runtime);
    }
    this.loaded = null;
  }

  private invalidate(runtime: Runtime): void {
    if (runtime.sourceChanged) return;
    runtime.sourceChanged = true;
    runtime.state = 'error';
    runtime.error = 'Tool source or routes changed; restart the panel before using this tool';
    runtime.stop.abort();
    if (runtime.instance) {
      const instance = runtime.instance;
      runtime.instance = null;
      runtime.retireWork = bounded(Promise.resolve().then(() => instance.close?.()), 5_000)
        .catch(error => log(`[tools] ${runtime.tool.id} cleanup failed: ${error}`)).finally(() => { runtime.retireWork = undefined; });
    }
  }

  private runtime(tool: ManagedToolLink): Runtime {
    let runtime = this.runtimes.get(tool.id);
    if (runtime && JSON.stringify(runtime.tool) !== JSON.stringify(tool)) {
      this.invalidate(runtime);
    }
    if (!runtime) {
      runtime = { tool, state: 'idle', error: '', work: null, instance: null, stop: new AbortController() };
      this.runtimes.set(tool.id, runtime);
    }
    return runtime;
  }

  private async toolModule(tool: ManagedToolLink): Promise<{ file: string; modified: number; size: number; context?: PluginServiceContext }> {
    let file: string, context: PluginServiceContext | undefined;
    if (tool.owner) {
      const catalog = await resolvePluginCatalog(this.options.workspace, this.options.core);
      const plugin = catalog.selected.find(plugin => plugin.key === tool.owner!.key && plugin.sourceRoot === tool.owner!.root);
      if (!plugin) throw new Error('Managed tool plugin is no longer selected');
      const resolved = await resolvePluginModule(plugin, plugin.sourceRoot, tool.owner.module, this.options.workspace, this.options.core, catalog);
      context = await pluginServiceContext(plugin, this.options.workspace, this.options.core, resolved.runtimeRoot);
      file = resolved.file;
    } else file = await containedModule(this.options.workspace, this.options.workspace, tool.module);
    const stat = await fs.stat(file);
    return { file, modified: stat.mtimeMs, size: stat.size, context };
  }

  private moduleIdentity(value: { file: string; modified: number; size: number; context?: PluginServiceContext }): string {
    return JSON.stringify([value.file, value.modified, value.size, value.context?.runtimeRoot ?? null, value.context?.config?.values ?? null]);
  }

  private start(runtime: Runtime): void {
    if (this.closing || this.pluginRestartRequired || this.options.available?.() || runtime.sourceChanged || runtime.state === 'starting' || runtime.state === 'ready') return;
    runtime.state = 'starting';
    runtime.error = '';
    if (runtime.stop.signal.aborted) runtime.stop = new AbortController();
    runtime.work = (async () => {
      try {
        // A bundled tool must not install the user's/private package workspace as a dependency side effect.
        if (!runtime.tool.owner?.key.startsWith('bundled:')) await this.prepare();
        const resolved = await this.toolModule(runtime.tool), { file, modified, context } = resolved;
        runtime.identity = this.moduleIdentity(resolved);
        const loaded = await import(`${pathToFileURL(file).href}?xrbTool=${modified}-${resolved.size}`) as WorkspaceToolModule;
        if (typeof loaded.createWorkspaceTool !== 'function') throw new Error('Managed tool module must export createWorkspaceTool(context)');
        const instance = await loaded.createWorkspaceTool({
          ...(context ? { plugin: context.plugin, config: context.config, runtimeRoot: context.runtimeRoot } : {}),
          id: runtime.tool.id,
          route: runtime.tool.route,
          panelOrigin: `http://127.0.0.1:${this.options.port}`,
          core: this.options.core,
          workspace: this.options.workspace,
          projects: this.options.projects,
          server: this.options.server(),
          signal: runtime.stop.signal,
        });
        if (!instance || typeof instance.handle !== 'function') throw new Error('Managed tool module returned no request handler');
        if (this.closing || runtime.sourceChanged) { await bounded(instance.close?.(), 5_000); return; }
        runtime.instance = instance;
        runtime.state = 'ready';
        log(`[tools] ${runtime.tool.id} ready at ${runtime.tool.route}`);
      } catch (error) {
        runtime.instance = null;
        runtime.state = 'error';
        runtime.error = error instanceof Error ? error.message : 'Managed tool startup failed';
        log(`[tools] ${runtime.tool.id} failed: ${runtime.error}`);
      } finally { runtime.work = null; }
    })();
  }

  private pluginRestartRequired = false;

  private failurePage(res: ServerResponse, runtime: Runtime): void {
    if (runtime.sourceChanged || this.pluginRestartRequired) {
      res.writeHead(303, { location: `/tool-recovery.html?tool=${encodeURIComponent(runtime.tool.id)}`, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    const label = escapeHtml(runtime.tool.label), error = runtime.error || 'Tool startup failed.';
    if (runtime.tool.independentView) {
      // A declared independent view keeps the standard shell even when checked browser output is unavailable.
      // This is an honest unavailable state, never permission to serve stale output or install on a GET.
      const publicSetup = runtime.tool.owner?.key.startsWith('bundled:') === true;
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XR Build · ${label}</title><script src="/theme.js"></script><link rel="stylesheet" href="/design-system.css"></head><body data-tool-view="${escapeHtml(runtime.tool.id)}"><header class="xrb-app-bar"><h1 class="xrb-brand">XR Build <button id="panel-menu-button" class="xrb-product-menu" type="button" aria-haspopup="menu" aria-expanded="false">${label}</button></h1></header><div id="panel-menu" class="menu panel-menu" role="menu" hidden></div><main class="xrb-workspace-layout xrb-stack"><section class="xrb-card xrb-stack"><h2>View unavailable</h2><p class="xrb-help" id="tool-view-status" role="status">${escapeHtml(error)}</p><div class="row"><button id="tool-view-setup" type="button" ${publicSetup ? '' : 'hidden'}>Set up public services</button><button id="tool-view-retry" type="button">Reload view</button><a href="/">Back to Apps</a></div><pre id="tool-view-output" class="log" hidden></pre></section></main><script type="module" src="/tool-view.js"></script></body></html>`;
      res.writeHead(503, {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"frame-ancestors 'self'",'x-frame-options':'SAMEORIGIN'});res.end(body);return;
    }
    const statusUrl = `/api/tools/${encodeURIComponent(runtime.tool.id)}/status`, retryUrl = `/api/tools/${encodeURIComponent(runtime.tool.id)}/retry`;
    const script = `const status=${JSON.stringify(statusUrl)},retry=${JSON.stringify(retryUrl)},message=document.getElementById('message'),button=document.getElementById('retry');async function check(){try{const r=await fetch(status,{cache:'no-store'}),v=await r.json();if(v.restartRequired===true)return location.replace(${JSON.stringify(`/tool-recovery.html?tool=${encodeURIComponent(runtime.tool.id)}`)});if(v.state==='ready')return location.reload();if(v.state==='error'){message.textContent=v.error||'Tool startup failed.';button.hidden=false;return;}setTimeout(check,250);}catch{message.textContent='Tool status unavailable.';button.hidden=false;}}button.onclick=async()=>{button.hidden=true;message.textContent='Retrying…';await fetch(retry,{method:'POST'});check();};`;
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XR Build · ${label}</title><link rel="stylesheet" href="/design-system.css"><style>html,body{height:100%}body{margin:0;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:var(--font-sans)}main{width:min(420px,calc(100% - 48px));text-align:center}.tool-start-card{padding:28px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}h1{margin:0 0 12px;font-size:20px}p{color:var(--muted)}button{margin-top:12px}</style></head><body><main><section class="tool-start-card"><h1>${label}</h1><p id="message" role="alert" aria-live="polite">${escapeHtml(error)}</p><button id="retry" class="primary">Retry</button></section></main><script>${script}</script></body></html>`;
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  }

  async status(id: string): Promise<{ state: ToolState; error: string; restartRequired?: boolean } | null> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate) && candidate.id === id);
    if (!tool) return null;
    const runtime = this.runtime(tool), blocked = this.options.available?.();
    return { state: blocked || this.pluginRestartRequired ? 'error' : runtime.state, error: blocked ?? runtime.error, ...(runtime.sourceChanged || this.pluginRestartRequired ? { restartRequired: true } : {}) };
  }

  async retry(id: string): Promise<{ state: ToolState; error: string; restartRequired?: boolean } | null> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate) && candidate.id === id);
    if (!tool) return null;
    const runtime = this.runtime(tool), blocked = this.options.available?.();
    if (!blocked && (runtime.state === 'error' || runtime.state === 'idle')) this.start(runtime);
    return { state: blocked || this.pluginRestartRequired ? 'error' : runtime.state, error: blocked ?? runtime.error, ...(runtime.sourceChanged || this.pluginRestartRequired ? { restartRequired: true } : {}) };
  }

  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate)
      && (owns(candidate.route, pathname) || candidate.endpoints.some((endpoint) => owns(endpoint, pathname)) || !!candidate.aliases?.some(alias => owns(alias, pathname))));
    if (!tool) {
      const previous = [...this.runtimes.values()].find(runtime => runtime.sourceChanged && (pathname === runtime.tool.route || pathname === `${runtime.tool.route}index.html`));
      if (previous && ['GET', 'HEAD'].includes(req.method ?? 'GET')) { this.failurePage(res, previous); return true; }
      return false;
    }
    const alias = tool.aliases?.find(alias => owns(alias, pathname));
    if (alias) {
      if (!['GET','HEAD'].includes(req.method ?? 'GET')) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return true; }
      const suffix = pathname === alias.slice(0, -1) ? '' : pathname.slice(alias.length);
      const search = new URL(req.url ?? '/', 'http://127.0.0.1').search;
      res.writeHead(302, {location: `${tool.route}${suffix}${search}`, 'cache-control':'no-store'}); res.end(); return true;
    }
    const runtime = this.runtime(tool), isPage = owns(tool.route, pathname), rootPage = pathname === tool.route || pathname === `${tool.route}index.html`;
    const blocked = this.options.available?.();
    if (blocked) {
      if (isPage && rootPage && ['GET', 'HEAD'].includes(req.method ?? 'GET')) this.failurePage(res, { ...runtime, state: 'error', error: blocked });
      else { res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ error: blocked })); }
      return true;
    }
    if (runtime.state !== 'ready' || !runtime.instance) {
      if (isPage && rootPage && ['GET', 'HEAD'].includes(req.method ?? 'GET')) {
        if (runtime.state === 'idle' || runtime.state === 'error') this.start(runtime);
        await runtime.work;
        if (runtime.state !== 'ready' || !runtime.instance) { this.failurePage(res, runtime); return true; }
      } else {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: runtime.error || 'Managed tool is starting' }));
        return true;
      }
    }
    const next = (error?: unknown) => {
      if (res.writableEnded) return;
      if (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : 'Managed tool request failed');
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    };
    try {
      const result = runtime.instance.handle(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === 'function') void (result as Promise<unknown>).catch(next);
    } catch (error) { next(error); }
    return true;
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await Promise.all([...this.runtimes.values()].map(async (runtime) => {
      runtime.state = 'stopping';
      runtime.stop.abort();
      await bounded(runtime.work?.catch(() => {}), 5_000);
      await runtime.retireWork;
      if (runtime.instance) await bounded(runtime.instance.close?.(), 5_000).catch((error) => log(`[tools] ${runtime.tool.id} cleanup failed: ${error}`));
      runtime.instance = null;
    }));
  }
}

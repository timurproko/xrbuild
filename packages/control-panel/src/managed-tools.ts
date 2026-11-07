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
interface Runtime { tool: ManagedToolLink; state: ToolState; error: string; work: Promise<void> | null; instance: WorkspaceToolInstance | null; stop: AbortController; sourceChanged?: boolean }

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
    }
    const tools = current.map((tool) => isManagedTool(tool) ? { id: tool.id, label: tool.label, route: tool.route } : tool);
    return { tools, ...(this.loadError ? { error: this.loadError } : {}) };
  }

  private prepare(): Promise<void> {
    if (!this.options.prepare) return Promise.resolve();
    return this.prepareWork ??= Promise.resolve().then(() => this.options.prepare!()).finally(() => { this.prepareWork = null; });
  }

  invalidatePluginRuntimes(): void {
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
      void bounded(Promise.resolve().then(() => instance.close?.()), 5_000).catch(error => log(`[tools] ${runtime.tool.id} cleanup failed: ${error}`));
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

  private async toolModule(tool: ManagedToolLink): Promise<{ file: string; modified: number; context?: PluginServiceContext }> {
    let context: PluginServiceContext | undefined;
    if (tool.owner) {
      const catalog = await resolvePluginCatalog(this.options.workspace, this.options.core);
      const plugin = catalog.selected.find(plugin => plugin.key === tool.owner!.key && plugin.sourceRoot === tool.owner!.root);
      if (!plugin) throw new Error('Managed tool plugin is no longer selected');
      const resolved = await resolvePluginModule(plugin, plugin.sourceRoot, tool.owner.module, this.options.workspace, this.options.core, catalog);
      context = await pluginServiceContext(plugin, this.options.workspace, this.options.core, resolved.runtimeRoot);
      return { file: resolved.file, modified: (await fs.stat(resolved.file)).mtimeMs, context };
    }
    const root = this.options.workspace;
    const file = await containedModule(root, root, tool.module);
    return { file, modified: (await fs.stat(file)).mtimeMs, context };
  }

  private start(runtime: Runtime): void {
    if (this.closing || this.options.available?.() || runtime.sourceChanged || runtime.state === 'starting' || runtime.state === 'ready') return;
    runtime.state = 'starting';
    runtime.error = '';
    if (runtime.stop.signal.aborted) runtime.stop = new AbortController();
    runtime.work = (async () => {
      try {
        // A bundled tool must not install the user's/private package workspace as a dependency side effect.
        if (!runtime.tool.owner?.key.startsWith('bundled:')) await this.prepare();
        const { file, modified, context } = await this.toolModule(runtime.tool);
        const loaded = await import(`${pathToFileURL(file).href}?xrbTool=${modified}`) as WorkspaceToolModule;
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

  private failurePage(res: ServerResponse, runtime: Runtime): void {
    const label = escapeHtml(runtime.tool.label), error = runtime.error || 'Tool startup failed.';
    const statusUrl = `/api/tools/${encodeURIComponent(runtime.tool.id)}/status`, retryUrl = `/api/tools/${encodeURIComponent(runtime.tool.id)}/retry`;
    const script = `const status=${JSON.stringify(statusUrl)},retry=${JSON.stringify(retryUrl)},message=document.getElementById('message'),button=document.getElementById('retry');async function check(){try{const r=await fetch(status,{cache:'no-store'}),v=await r.json();if(v.state==='ready')return location.reload();if(v.state==='error'){message.textContent=v.error||'Tool startup failed.';button.hidden=false;return;}setTimeout(check,250);}catch{message.textContent='Tool status unavailable.';button.hidden=false;}}button.onclick=async()=>{button.hidden=true;message.textContent='Retrying…';await fetch(retry,{method:'POST'});check();};`;
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XR Build · ${label}</title><link rel="stylesheet" href="/design-system.css"><style>html,body{height:100%}body{margin:0;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:var(--font-sans)}main{width:min(420px,calc(100% - 48px));text-align:center}.tool-start-card{padding:28px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}h1{margin:0 0 12px;font-size:20px}p{color:var(--muted)}button{margin-top:12px}</style></head><body><main><section class="tool-start-card"><h1>${label}</h1><p id="message" role="alert" aria-live="polite">${escapeHtml(error)}</p><button id="retry" class="primary">Retry</button></section></main><script>${script}</script></body></html>`;
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  }

  async status(id: string): Promise<{ state: ToolState; error: string } | null> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate) && candidate.id === id);
    if (!tool) return null;
    const blocked = this.options.available?.();
    if (blocked) return { state: 'error', error: blocked };
    const runtime = this.runtime(tool);
    return { state: runtime.state, error: runtime.error };
  }

  async retry(id: string): Promise<{ state: ToolState; error: string } | null> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate) && candidate.id === id);
    if (!tool) return null;
    const blocked = this.options.available?.();
    if (blocked) return { state: 'error', error: blocked };
    const runtime = this.runtime(tool);
    if (runtime.state === 'error' || runtime.state === 'idle') this.start(runtime);
    return { state: runtime.state, error: runtime.error };
  }

  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
    const tool = (await this.tools()).find((candidate): candidate is ManagedToolLink => isManagedTool(candidate)
      && (owns(candidate.route, pathname) || candidate.endpoints.some((endpoint) => owns(endpoint, pathname))));
    if (!tool) return false;
    const runtime = this.runtime(tool), isPage = owns(tool.route, pathname), rootPage = pathname === tool.route || pathname === `${tool.route}index.html`;
    const blocked = this.options.available?.();
    if (blocked) {
      if (isPage) this.failurePage(res, { ...runtime, state: 'error', error: blocked });
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
      if (runtime.instance) await bounded(runtime.instance.close?.(), 5_000).catch((error) => log(`[tools] ${runtime.tool.id} cleanup failed: ${error}`));
      runtime.instance = null;
    }));
  }
}

import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolvePluginCatalog } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import { pluginServiceContext } from './plugin-service.ts';

interface Instance { handle(req: IncomingMessage, res: ServerResponse): boolean | Promise<boolean>; close?(): unknown }
/** Optional recording compatibility contribution. Selection is metadata-only and owner qualified. */
export class HandsTools {
  private identity = '';
  private instance: Instance | null = null;
  private pending: Promise<Instance> | null = null;
  private closed = false;
  private readonly core: string;
  private readonly workspace: string;
  constructor(core: string, workspace: string) { this.core = core; this.workspace = workspace; }
  private async get(): Promise<Instance> {
    if (this.closed) throw new Error('Recording tools are closed.');
    const catalog = await resolvePluginCatalog(this.workspace, this.core);
    if (catalog.problems.length) throw new Error(catalog.problems.join('; '));
    const owners = catalog.selected.filter(plugin => plugin.meta.exports?.['hands-recordings']);
    if (owners.length !== 1) throw new Error(owners.length ? 'Recording tool owners conflict.' : 'Recording tools are not installed.');
    const owner = owners[0], resolved = await resolvePluginModule(owner, owner.sourceRoot, owner.meta.exports!['hands-recordings'], this.workspace, this.core, catalog);
    const stat = await fs.stat(resolved.file), identity = JSON.stringify([owner.key, resolved.file, stat.mtimeMs, stat.size]);
    if (this.identity && this.identity !== identity) throw new Error('Recording tools changed. Restart the panel.');
    if (this.instance) return this.instance;
    if (!this.pending) this.pending = (async () => {
      const context = await pluginServiceContext(owner, this.workspace, this.core, resolved.runtimeRoot);
      const module = await import(`${pathToFileURL(resolved.file).href}?hands=${stat.mtimeMs}-${stat.size}`);
      if (typeof module.createHandsTools !== 'function') throw new Error('Recording tools have no compatible mount.');
      const instance = await module.createHandsTools({ ...context, core: this.core, workspace: this.workspace }) as Instance;
      if (!instance || typeof instance.handle !== 'function') throw new Error('Recording tools have no compatible handler.');
      if (this.closed) { await instance.close?.(); throw new Error('Recording tools are closed.'); }
      this.identity = identity; this.instance = instance; return instance;
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
  async status() {
    try { await this.get(); return { available: true, module: '/hands/tools/browser.mjs' }; }
    catch (error) { return { available: false, reason: (error as Error).message }; }
  }
  async handle(req: IncomingMessage, res: ServerResponse) { return (await this.get()).handle(req, res); }
  async close() { this.closed = true; await this.pending?.catch(() => {}); await this.instance?.close?.(); this.instance = null; }
}

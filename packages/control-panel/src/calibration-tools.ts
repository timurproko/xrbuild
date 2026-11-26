import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolvePluginCatalog } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import { pluginServiceContext } from './plugin-service.ts';

interface Instance {
  handle(req: IncomingMessage, res: ServerResponse): boolean | Promise<boolean>;
  status(): unknown;
  close?(): unknown;
}
/** A checked optional contribution; discovery never opens native services or cameras. */
export class CalibrationTools {
  private identity = '';
  private instance: Instance | null = null;
  private pending: Promise<Instance> | null = null;
  private closed = false;
  private core: string;
  private workspace: string;
  private acquire: () => () => void;
  constructor(core: string, workspace: string, acquire: () => () => void) { this.core = core; this.workspace = workspace; this.acquire = acquire; }
  private async get(): Promise<Instance> {
    if (this.closed) throw new Error('Calibration is closed.');
    const catalog = await resolvePluginCatalog(this.workspace, this.core);
    if (catalog.problems.length) throw new Error(catalog.problems.join('; '));
    const owners = catalog.selected.filter(plugin => plugin.meta.exports?.['camera-calibration']);
    if (owners.length !== 1) throw new Error(owners.length ? 'Calibration plugin owners conflict.' : 'Calibration plugin is not installed.');
    const owner = owners[0], resolved = await resolvePluginModule(owner, owner.sourceRoot, owner.meta.exports!['camera-calibration'], this.workspace, this.core, catalog);
    const stat = await fs.stat(resolved.file), identity = JSON.stringify([owner.key, resolved.file, stat.mtimeMs, stat.size]);
    if (this.identity && identity !== this.identity) throw new Error('Calibration plugin changed. Restart the panel.');
    if (this.instance) return this.instance;
    if (!this.pending) this.pending = (async () => {
      const context = await pluginServiceContext(owner, this.workspace, this.core, resolved.runtimeRoot);
      const module = await import(`${pathToFileURL(resolved.file).href}?calibration=${stat.mtimeMs}-${stat.size}`);
      if (typeof module.createCalibrationTools !== 'function') throw new Error('Calibration plugin has no compatible mount.');
      const instance = await module.createCalibrationTools({ ...context, acquireCapture: this.acquire }) as Instance;
      if (!instance || typeof instance.handle !== 'function' || typeof instance.status !== 'function') throw new Error('Calibration plugin is incompatible.');
      if (this.closed) { await instance.close?.(); throw new Error('Calibration is closed.'); }
      this.identity = identity; this.instance = instance; return instance;
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
  async status() {
    try { const instance = await this.get(); return { available: true, module: '/calibration/tools/calibration-browser.mjs', capture: await instance.status() }; }
    catch (error) { return { available: false, reason: (error as Error).message }; }
  }
  async handle(req: IncomingMessage, res: ServerResponse) { return (await this.get()).handle(req, res); }
  async close() { this.closed = true; await this.pending?.catch(() => {}); await this.instance?.close?.(); this.instance = null; }
}

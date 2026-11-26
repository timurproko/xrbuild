// Neutral opt-in rebuild contributions run in fresh workers, never from stale service/module caches.
import { fileURLToPath } from 'node:url';
import { containedModule, resolvePluginCatalog } from './extension-catalog.ts';
import type { JobContext } from './jobs.ts';

export async function rebuildPluginContributions(core: string, workspace: string, job: JobContext, tools: { cmake: string; generator: string }, includeDisabled = false, origin?: 'bundled' | 'workspace') {
  const catalog = await resolvePluginCatalog(workspace, core, includeDisabled, undefined, origin ? [origin] : undefined);
  if (catalog.problems.length) throw new Error(catalog.problems.join('; '));
  for (const plugin of catalog.selected) {
    const declaration = plugin.meta.exports?.['native-rebuild'];
    if (!declaration) continue;
    await containedModule(plugin.sourceRoot, plugin.sourceRoot, declaration);
    job.line(`Rebuild: ${plugin.key}`);
    await job.run(process.execPath, [fileURLToPath(new URL('./plugin-native-rebuild-worker.ts', import.meta.url)), core, workspace, plugin.key, tools.cmake, tools.generator, String(includeDisabled), ...(origin ? [origin] : [])], { cwd: core });
  }
}

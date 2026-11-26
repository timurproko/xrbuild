// Each explicit build loads the current dependency closure in a disposable process.
import { pathToFileURL } from 'node:url';
import { containedModule, resolvePluginCatalog } from './extension-catalog.ts';
import { pluginServiceContext } from './plugin-service.ts';
import { runProcess, type JobContext } from './jobs.ts';

const [core, workspace, key, cmake, generator, includeDisabled] = process.argv.slice(2);
try {
  const catalog = await resolvePluginCatalog(workspace, core, includeDisabled === 'true');
  if (catalog.problems.length) throw new Error(catalog.problems.join('; '));
  const plugin = catalog.selected.find(candidate => candidate.key === key);
  const declaration = plugin?.meta.exports?.['native-rebuild'];
  if (!plugin || !declaration) throw new Error('Selected native rebuild contribution changed; retry Rebuild.');
  const file = await containedModule(plugin.sourceRoot, plugin.sourceRoot, declaration);
  const module = await import(pathToFileURL(file).href);
  if (typeof module.rebuildNative !== 'function') throw new Error(`${key}: native rebuild contribution is incompatible`);
  const job: JobContext = {
    line: text => console.log(text),
    async run(cmd, args, options) { const code = await runProcess(cmd, args, text => console.log(text), options); if (code) throw new Error(`Native rebuild command exited with ${code}`); },
  };
  await module.rebuildNative(await pluginServiceContext(plugin, workspace, core), job, { cmake, generator });
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }

// Shared adapter input boundary; adapter code is trusted, not sandboxed.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { PackagerBuildOptions } from './packagers.ts';
import { appContent, hostContent, pluginContent, portableHostConfig, iconContent, assertPackageDestination, copyContent, verifyContent, RUNTIME_MANIFEST } from './package-content.ts';

export async function stagePackagerInputs(options: PackagerBuildOptions, folder: string, staticProjectRoot = false): Promise<PackagerBuildOptions> {
  const hosted = !!options.runtimeDir;
  if (!hosted && (options.plugins.length || Object.keys(options.pluginDirs ?? {}).length || options.config)) throw new Error('WebXR package inputs must not contain host runtime state');
  const config = hosted ? portableHostConfig(options) : undefined;
  const app = await appContent(options.app, staticProjectRoot), runtime = hosted ? await hostContent(options.runtimeDir) : null;
  const plugins = await Promise.all(options.plugins.map(async name => ({ name, content: await pluginContent(options.pluginDirs?.[name] ?? path.join(options.runtimeDir, 'plugins', name)) })));
  const iconHash = options.icon ? await iconContent(options.icon) : null;
  const sources = [options.app, ...(hosted ? [options.runtimeDir] : []), ...plugins.map(plugin => plugin.content.root), ...(options.icon ? [options.icon] : [])];
  for (const [key, value] of Object.entries(options.identity)) if (/secret|password|token|credential|signing|certificate|private.?key/i.test(key) || typeof value !== 'string' || value.length > 4096 || /^(?:[a-zA-Z]:[\\/]|[\\/]|file:)/i.test(value)) throw new Error('Package identity contains private or machine-local state');
  await assertPackageDestination(folder, sources); await assertPackageDestination(options.out, sources); await assertPackageDestination(options.workDir, sources);
  await fs.mkdir(path.dirname(folder), { recursive: true }); await fs.mkdir(folder);
  await copyContent(app, path.join(folder, 'app'));
  if (runtime) await copyContent(runtime, path.join(folder, 'runtime'));
  const pluginDirs: Record<string, string> = {};
  for (const plugin of plugins) {
    const target = path.join(folder, 'plugins', plugin.name);
    await copyContent(plugin.content, target);
    await fs.writeFile(path.join(target, RUNTIME_MANIFEST), JSON.stringify({ version: 1, files: plugin.content.files.map(file => file.relative) }), { flag: 'wx' });
    pluginDirs[plugin.name] = target;
  }
  let icon: string | undefined;
  if (options.icon) {
    icon = path.join(folder, 'app-icon.png'); await fs.copyFile(options.icon, icon, constants.COPYFILE_EXCL);
    if (await iconContent(options.icon) !== iconHash || await iconContent(icon) !== iconHash) throw new Error('Package icon changed during input staging');
  }
  await Promise.all([verifyContent(app), ...(runtime ? [verifyContent(runtime)] : []), ...plugins.map(plugin => verifyContent(plugin.content))]);
  return { app: path.join(folder, 'app'), runtimeDir: hosted ? path.join(folder, 'runtime') : '',
    ...(hosted ? { pluginDirs } : {}), plugins: [...options.plugins], selection: structuredClone(options.selection),
    projectName: options.projectName, identity: { ...options.identity }, config, launchUrl: options.launchUrl,
    icon, iconColor: options.iconColor, out: options.out, workDir: options.workDir, log: options.log };
}

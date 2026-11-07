import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PackagerBuildOptions } from '../../control-panel/src/packagers.ts';
import { appContent, hostContent, pluginContent, copyContent, verifyContent, iconContent, plainPath, portableHostConfig, assertPackageDestination, stagedContentFingerprint } from '../../control-panel/src/package-content.ts';

const invalidFile = /[\\/:*?"<>|\x00-\x1f]/g;
const safeName = (value: string) => {
  const name = value.replace(invalidFile, '-').replace(/[. ]+$/g, '').trim() || 'app';
  return /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ? `app-${name}` : name;
};

function archive(folder: string, file: string): Promise<void> {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const command = `$ErrorActionPreference='Stop'; Compress-Archive -Path (Join-Path ${quote(folder)} '*') -DestinationPath ${quote(file)} -CompressionLevel Optimal`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`could not create the desktop package: ${stderr.trim() || error.message}`));
      else resolve();
    });
  });
}

/** Materialises the portable folder before it is zipped. Exported for focused tests. */
export async function stageDesktopPackage(o: PackagerBuildOptions, folder: string): Promise<{ id: string; title: string; version: string }> {
  if (!o.runtimeDir) throw new Error('the desktop package needs the host runtime');
  const config = portableHostConfig(o);
  const title = o.identity.title || o.projectName;
  const id = o.identity.id || safeName(title);
  const version = o.identity.version || '0.1.0';
  if (!/^\d+(\.\d+){1,3}$/.test(version)) throw new Error('Package version must be dotted numbers');
  const runtime = await hostContent(o.runtimeDir), app = await appContent(o.app);
  const plugins = await Promise.all(o.plugins.map(async name => ({ name, content: await pluginContent(o.pluginDirs?.[name] ?? path.join(o.runtimeDir, 'plugins', name)) })));
  const sources = [o.runtimeDir, o.app, ...plugins.map(plugin => plugin.content.root), ...(o.icon ? [o.icon] : [])];
  const iconHash = o.icon ? await iconContent(o.icon) : null;
  await assertPackageDestination(folder, sources);
  await fs.mkdir(path.dirname(folder), { recursive: true });
  // Reserve an entirely new folder. Never reset or recursively delete caller data.
  await fs.mkdir(folder);
  await copyContent(runtime, folder);
  await copyContent(app, path.join(folder, 'app'));
  for (const plugin of plugins) await copyContent(plugin.content, path.join(folder, 'plugins', plugin.name));
  await fs.writeFile(path.join(folder, 'xrb-app.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ id, title, version, executable: 'xrb-host.exe' }, null, 2) + '\n', { flag: 'wx' });
  if (o.icon) {
    await fs.copyFile(o.icon, path.join(folder, 'app-icon.png'), constants.COPYFILE_EXCL);
    if (await iconContent(o.icon) !== iconHash || await iconContent(path.join(folder, 'app-icon.png')) !== iconHash) throw new Error('Package icon changed during staging');
  }
  await fs.writeFile(path.join(folder, 'README.txt'), `${title} ${version}\r\n\r\nExtract the whole folder, then run xrb-host.exe.\r\n`, { flag: 'wx' });
  await Promise.all([verifyContent(runtime), verifyContent(app), ...plugins.map(plugin => verifyContent(plugin.content))]);
  return { id, title, version };
}

export const packager = {
  name: 'desktop-package',
  target: 'host' as const,
  standalone: true,
  identityFields: [
    { key: 'id', label: 'Package ID', kind: 'text' as const, required: true, fixed: true, hidden: true, deriveStyle: 'filename' as const },
    { key: 'title', label: 'Title', kind: 'text' as const, required: true },
    { key: 'version', label: 'Version', kind: 'version' as const, required: true, hint: 'each package should use a higher version' },
  ],
  validate(identity: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    if (typeof identity.id !== 'string' || !identity.id.trim()) errors.push({ field: 'id', message: 'the package ID is required' });
    if (typeof identity.title !== 'string' || !identity.title.trim()) errors.push({ field: 'title', message: 'the package title is required' });
    if (typeof identity.version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(identity.version)) errors.push({ field: 'version', message: 'the version must be dotted numbers' });
    return errors;
  },
  async build(o: PackagerBuildOptions) {
    const sources = [o.runtimeDir, o.app, ...Object.values(o.pluginDirs ?? {}), ...(o.icon ? [o.icon] : [])];
    await assertPackageDestination(o.workDir, sources); await assertPackageDestination(o.out, sources);
    await fs.mkdir(o.workDir, { recursive: true });
    const generation = await fs.mkdtemp(path.join(o.workDir, 'desktop-')), stage = path.join(generation, 'payload');
    const metadata = await stageDesktopPackage(o, stage);
    await plainPath(o.out, true); await fs.mkdir(o.out, { recursive: true });
    const file = path.join(o.out, `${safeName(metadata.id)}-${metadata.version}.zip`), temporary = path.join(generation, 'package.zip');
    await plainPath(file, true);
    o.log(`desktop folder: ${stage}`);
    const staged = await stagedContentFingerprint(stage);
    await archive(stage, temporary);
    if (await stagedContentFingerprint(stage) !== staged) throw new Error('Package staging changed during archive creation');
    await plainPath(temporary);
    // Exclusive atomic publication on the same filesystem. Existing versions are preserved.
    await fs.link(temporary, file);
    await fs.unlink(temporary);
    o.log(`desktop package: ${file}`);
    return { file, sizeBytes: (await fs.stat(file)).size };
  },
};

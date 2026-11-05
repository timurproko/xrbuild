import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PackagerBuildOptions } from '../../control-panel/src/packagers.ts';

const invalidFile = /[\\/:*?"<>|\x00-\x1f]/g;
const safeName = (value: string) => value.replace(invalidFile, '-').replace(/[. ]+$/g, '').trim() || 'app';

function archive(folder: string, file: string): Promise<void> {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const command = `$ErrorActionPreference='Stop'; Compress-Archive -Path (Join-Path ${quote(folder)} '*') -DestinationPath ${quote(file)} -CompressionLevel Optimal -Force`;
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
  if (!o.config) throw new Error('the desktop package needs the effective host configuration');
  const title = o.identity.title || o.projectName;
  const id = o.identity.id || safeName(title);
  const version = o.identity.version || '0.1.0';
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(folder, { recursive: true });

  const runtime = path.resolve(o.runtimeDir);
  const oldPlugins = path.join(runtime, 'plugins');
  await fs.cp(runtime, folder, {
    recursive: true,
    filter(source) {
      const resolved = path.resolve(source);
      if (resolved === oldPlugins || resolved.startsWith(`${oldPlugins}${path.sep}`)) return false;
      const name = path.basename(source).toLowerCase();
      return !name.endsWith('.pdb') && !name.endsWith('.lib') && !name.endsWith('.exp') && name !== 'host-tests.exe';
    },
  });
  if (!(await fs.stat(path.join(folder, 'xrb-host.exe')).then((stat) => stat.isFile(), () => false)))
    throw new Error('the host runtime has no xrb-host.exe');

  await fs.cp(o.app, path.join(folder, 'app'), { recursive: true });
  for (const name of o.plugins) {
    const source = o.pluginDirs?.[name] ?? path.join(o.runtimeDir, 'plugins', name);
    await fs.cp(source, path.join(folder, 'plugins', name), { recursive: true });
  }
  await fs.writeFile(path.join(folder, 'xrb-app.json'), JSON.stringify(o.config, null, 2) + '\n');
  await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ id, title, version, executable: 'xrb-host.exe' }, null, 2) + '\n');
  if (o.icon) await fs.copyFile(o.icon, path.join(folder, 'app-icon.png'));
  await fs.writeFile(path.join(folder, 'README.txt'), `${title} ${version}\r\n\r\nExtract the whole folder, then run xrb-host.exe.\r\n`);
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
    const stage = path.join(o.workDir, safeName(o.identity.id || o.projectName));
    const metadata = await stageDesktopPackage(o, stage);
    await fs.mkdir(o.out, { recursive: true });
    const file = path.join(o.out, `${safeName(metadata.id)}-${metadata.version}.zip`);
    o.log(`desktop folder: ${stage}`);
    await archive(stage, file);
    o.log(`desktop package: ${file}`);
    return { file, sizeBytes: (await fs.stat(file)).size };
  },
};

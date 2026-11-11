// Safe first-run defaults. Existing configuration bytes (including unknown fields) are never rewritten.
import fs from 'node:fs/promises';
import path from 'node:path';
import { effectiveSettings, validateSettings, type PluginSetting, type SettingValue } from './plugin-manager.ts';

async function configDirectory(workspace: string, id: string, create: boolean, allowMissing = false): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new Error('Invalid plugin config ID');
  let dir = path.resolve(workspace);
  if (create) await fs.mkdir(dir, { recursive: true });
  for (const part of ['', 'config', 'plugins', id]) {
    if (part) dir = path.join(dir, part);
    if (create && part) await fs.mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(dir).catch((error: NodeJS.ErrnoException) => { if (allowMissing && error.code === 'ENOENT') return null; throw error; });
    if (!stat) continue;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Plugin config path must be a plain directory: ${dir}`);
  }
  return dir;
}
const MAX_BYTES = 64 * 1024;
async function readConfig(file: string): Promise<Record<string, unknown>> {
  // An atomic first creator briefly owns a second hard link. Wait for its staging cleanup.
  for (let attempt = 0; attempt < 100; attempt++) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Plugin config must be a regular file: ${file}`);
    if (stat.nlink !== 1) {
      if (attempt === 99) throw new Error(`Plugin config is multiply linked or busy: ${file}`);
      await new Promise(resolve => setTimeout(resolve, 10));
      continue;
    }
    if (stat.size > MAX_BYTES) throw new Error(`Plugin config exceeds 64 KiB: ${file}`);
    const handle = await fs.open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error(`Plugin config changed while opening: ${file}`);
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > MAX_BYTES) throw new Error(`Plugin config exceeds 64 KiB: ${file}`);
      let saved: unknown;
      try { saved = JSON.parse(buffer.subarray(0, size).toString('utf8').replace(/^\uFEFF/, '')); }
      catch { throw new Error(`Invalid JSON in plugin config: ${file}`); }
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error(`Plugin config must contain an object: ${file}`);
      return saved as Record<string, unknown>;
    } finally { await handle.close(); }
  }
  throw new Error(`Plugin config is busy: ${file}`);
}

export interface UserPluginConfig { file: string; created: boolean; values: Record<string, SettingValue> }
/** Discovery can use defaults in memory; explicit initialization publishes them exclusively without replacement. */
export async function readUserPluginConfig(workspace: string, id: string, fields: PluginSetting[], options: { create?: boolean } = {}): Promise<UserPluginConfig> {
  const defaults = Object.fromEntries(fields.filter(field => field.default !== undefined).map(field => [field.key, field.default!]));
  validateSettings(fields, defaults);
  const create = options.create !== false;
  const dir = await configDirectory(workspace, id, create, !create), file = path.join(dir, 'config.json');
  let created = false;
  const present = await fs.lstat(file).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
  if (!present && !create) return { file, created: false, values: effectiveSettings(fields, {}) };
  if (!present) {
    const staging = await fs.mkdtemp(path.join(dir, '.defaults-')), temporary = path.join(staging, 'config.json');
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify(defaults, null, 2)}\n`); await handle.sync(); }
      finally { await handle.close(); }
      await configDirectory(workspace, id, false);
      try { await fs.link(temporary, file); created = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await fs.rmdir(staging);
    }
  }
  const saved = await readConfig(file);
  await configDirectory(workspace, id, false);
  const known = Object.fromEntries(Object.entries(saved).filter(([key]) => fields.some(field => field.key === key)));
  try { validateSettings(fields, known); }
  catch { throw new Error(`Plugin config values do not match their schema: ${file}`); }
  return { file, created, values: effectiveSettings(fields, known as Record<string, SettingValue>) };
}

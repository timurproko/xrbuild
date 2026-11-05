// Built packages in builds/ (design D8). The identity is read from each zip's package.json with
// Windows' own tar (bsdtar): .NET's ZipArchive rejects the DotNetZip zips, bsdtar reads them.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface BuiltPackage {
  /** Package channel folder under builds/ (`desktop`, `cx`, `quest`, ...); empty for legacy root files. */
  channel: string;
  file: string;
  path: string;
  id: string | null;
  title: string | null;
  version: string | null;
  sizeBytes: number;
  builtMs: number;
  error: string | null;
}

const TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

/** package.json of a zip, as text. */
export function readZipEntry(zip: string, entry: string, tar = TAR): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(tar, ['-xOf', zip, entry], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export class PackageList {
  private readonly cache = new Map<string, { key: string; pkg: BuiltPackage }>();
  private readonly outDir: string;
  private readonly read: typeof readZipEntry;

  constructor(outDir: string, read = readZipEntry) {
    this.outDir = outDir;
    this.read = read;
  }

  async list(): Promise<BuiltPackage[]> {
    const files: Array<{ channel: string; name: string; file: string }> = [];
    let entries;
    try { entries = await fs.readdir(this.outDir, { withFileTypes: true }); }
    catch { return []; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) files.push({ channel: '', name: entry.name, file: path.join(this.outDir, entry.name) });
      if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
      const channel = entry.name;
      const folder = path.join(this.outDir, channel);
      for (const name of await fs.readdir(folder).catch(() => [] as string[])) {
        if (name.toLowerCase().endsWith('.zip')) files.push({ channel, name, file: path.join(folder, name) });
      }
    }
    const out: BuiltPackage[] = [];
    for (const { channel, name, file } of files) {
      const st = await fs.stat(file).catch(() => null);
      if (!st?.isFile()) continue;
      const key = `${st.size}:${st.mtimeMs}`;
      const hit = this.cache.get(file);
      if (hit?.key === key) {
        out.push(hit.pkg);
        continue;
      }
      const pkg: BuiltPackage = { channel, file: name, path: file, id: null, title: null, version: null, sizeBytes: st.size, builtMs: st.mtimeMs, error: null };
      try {
        const j = JSON.parse(await this.read(file, 'package.json')) as { id?: string; title?: string; version?: string };
        pkg.id = j.id ?? null;
        pkg.title = j.title ?? null;
        pkg.version = j.version ?? null;
      } catch (e) {
        pkg.error = `cannot read package.json: ${(e as Error).message.split('\n')[0]}`;
      }
      this.cache.set(file, { key, pkg });
      out.push(pkg);
    }
    return out.sort((a, b) => b.builtMs - a.builtMs);
  }

  /** Deletes one package by channel and listed file name, never a path outside builds/. */
  async delete(channel: string, file: string): Promise<boolean> {
    if ((channel && !/^[a-z0-9-]+$/.test(channel)) || path.basename(file) !== file || !file.toLowerCase().endsWith('.zip')) return false;
    const target = path.join(this.outDir, channel, file);
    try { await fs.unlink(target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    this.cache.delete(target);
    return true;
  }

  /** Version of a package with this identity in the selected channel, if one exists. */
  async versionOf(id: string, channel?: string): Promise<string | null> {
    return (await this.list()).find((p) => p.id === id && (channel === undefined || p.channel === channel))?.version ?? null;
  }
}

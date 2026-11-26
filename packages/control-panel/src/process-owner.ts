// A PID can be reused after an interrupted writer exits. Bind new records to an OS process generation.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } };
/** Digits identify a live generation; empty means exited, null means identity is unavailable (fail closed). */
export async function processBirth(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === 'linux') {
    try {
      const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
      return fields[0] === 'Z' ? '' : /^\d+$/.test(fields[19] ?? '') ? fields[19]! : null;
    } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? '' : null; }
  }
  if (process.platform !== 'win32') return null;
  try {
    const shell = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const { stdout } = await promisify(execFile)(shell, ['-NoProfile', '-NonInteractive', '-Command',
      `try {$p=[Diagnostics.Process]::GetProcessById(${pid}); if($p.HasExited){'dead'}else{$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)}}catch [ArgumentException]{'dead'}catch{'unknown'}`], { windowsHide: true, timeout: 5000 });
    const value = stdout.trim();
    return value === 'dead' ? '' : /^\d+$/.test(value) ? value : null;
  } catch { return null; }
}
let ownBirth: Promise<string | null> | undefined;
export const ownProcessBirth = () => ownBirth ??= processBirth(process.pid);
export async function recordedOwnerAlive(pid: number, birth?: string,
  read: (pid: number) => Promise<string | null> = processBirth, alive: (pid: number) => boolean = pidAlive): Promise<boolean> {
  if (!birth) return alive(pid); // Legacy records have no generation: preserve an apparently live owner.
  const current = await read(pid);
  return current === null ? alive(pid) : current === birth;
}

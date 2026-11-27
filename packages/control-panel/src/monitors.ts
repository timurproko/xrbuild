import {execFile} from 'node:child_process';
import path from 'node:path';
import {PANEL_DIR} from './env.ts';

export interface Monitor {
  index: number;
  device: string;
  name: string;
  primary: boolean;
  width: number;
  height: number;
  internal?: boolean;
  mirrored?: boolean;
}

/** Friendly presentation never changes the device identity, order or saved numeric selection. */
export function monitorNames(value: unknown): Monitor[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((entry): entry is Monitor => !!entry && typeof entry === 'object'
    && Number.isSafeInteger(entry.index) && entry.index >= 0
    && typeof entry.device === 'string' && entry.device.length <= 256
    && typeof entry.primary === 'boolean' && Number.isFinite(entry.width) && Number.isFinite(entry.height)).map(entry => {
      const reported = typeof entry.name === 'string' ? entry.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160) : '';
      const generic = !reported || reported.toLowerCase() === entry.device.toLowerCase()
        || /^\\\\\.\\DISPLAY\d+$/i.test(reported)
        || /^(?:generic(?: pnp| non-pnp)? monitor|default monitor|monitor)$/i.test(reported);
      const name = entry.mirrored === true ? 'Mirrored displays' : entry.internal === true ? 'Built-in display'
        : !generic ? reported : entry.primary ? 'Primary display' : `Display ${entry.index + 1}`;
      return {...entry, name};
    });
}

export async function listMonitors(): Promise<Monitor[]> {
  if (process.platform !== 'win32') return [];
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PANEL_DIR, 'src/list-monitors.ps1')],
      {windowsHide:true, timeout:10_000, maxBuffer:256 * 1024, encoding:'utf8'}, (error, stdout) => {
        if (error) return resolve([]);
        try { resolve(monitorNames(JSON.parse(stdout.trim() || '[]'))); } catch { resolve([]); }
      });
  });
}

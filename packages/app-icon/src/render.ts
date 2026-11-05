// The app renders its own icon: xrb-host opens it in a hidden square view (`?xrb-icon=<size>`, transparent
// background, no devices) and saves the frame when the page calls the SDK's iconReady().
import { spawn } from 'node:child_process';
import path from 'node:path';

export interface RenderIconOptions {
  /** built web app (index.html at its root) */
  app: string;
  /** PNG to write */
  out: string;
  /** square size in pixels (default 512) */
  size?: number;
  /** folder with xrb-host.exe */
  runtimeDir: string;
}

/** Resolves when the icon is written; rejects with the host's exit code otherwise. */
export async function renderIcon(o: RenderIconOptions): Promise<void> {
  const exe = path.join(o.runtimeDir, 'xrb-host.exe');
  const code = await new Promise<number>((resolve, reject) => {
    const p = spawn(exe, [`--app-dir=${path.resolve(o.app)}`, `--render-icon=${path.resolve(o.out)}`, `--icon-size=${o.size ?? 512}`], { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (c) => resolve(c ?? 1));
  });
  if (code !== 0) throw new Error(`icon render failed (exit ${code}); see %LOCALAPPDATA%\\XRBuild\\logs\\xrb-host.log`);
}

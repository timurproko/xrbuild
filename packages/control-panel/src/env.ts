// Paths and the panel's own log. The panel runs hidden (start.vbs), so its log file is the
// only place its messages show up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The core repo the panel runs from: host, plugin SDK, SDK, templates. */
export const REPO = path.resolve(PANEL_DIR, '../..');
export const DEFAULT_PORT = 5180;
export const EXPLICIT_WORKSPACE_PORT = 5181;

/** Keep a separately selected workspace off the ordinary panel's default port. */
export function panelPort(explicitWorkspace: string | undefined, env: NodeJS.ProcessEnv = process.env, explicitProjects?: string): number {
  return Number(env.XRB_PANEL_PORT) || (explicitWorkspace || explicitProjects ? EXPLICIT_WORKSPACE_PORT : DEFAULT_PORT);
}

/** Runtime data of this machine (logs, run state): never versioned. */
export function dataDir(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'XRBuild');
}

/** The user's workspace (projects, plugins, panel layout, packages): XRB_HOME, else ~/.xrbuild. */
export function workspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.XRB_HOME) return path.resolve(env.XRB_HOME);
  return path.join(env.USERPROFILE || os.homedir(), '.xrbuild');
}

/** Project repository: explicit environment override, else projects remain in the selected workspace. */
export function projectsDir(env: NodeJS.ProcessEnv = process.env, workspace = workspaceDir(env)): string {
  return env.XRB_PROJECTS_HOME ? path.resolve(env.XRB_PROJECTS_HOME) : workspace;
}

/** The auto Start-menu launcher stays in user mode; repository mode has its own explicit launcher. */
export function shortcutWorkspace(_env: NodeJS.ProcessEnv = process.env, _repo = REPO): string | undefined {
  return undefined;
}

/** Explicit `--workspace=<path>` selection; relative paths resolve from the launcher's checkout. */
export function workspaceFromArgs(args: readonly string[], cwd = process.cwd()): string | undefined {
  if (args.includes('--workspace')) throw new Error('--workspace requires --workspace=<path>');
  const values = args.filter((arg) => arg.startsWith('--workspace=')).map((arg) => arg.slice('--workspace='.length));
  if (values.length > 1) throw new Error('--workspace may be given only once');
  if (!values.length) return undefined;
  if (!values[0]) throw new Error('--workspace requires a path');
  return path.resolve(cwd, values[0]);
}

/** Explicit `--projects=<path>` selection; relative paths resolve from the launcher's checkout. */
export function projectsFromArgs(args: readonly string[], cwd = process.cwd()): string | undefined {
  if (args.includes('--projects')) throw new Error('--projects requires --projects=<path>');
  const values = args.filter((arg) => arg.startsWith('--projects=')).map((arg) => arg.slice('--projects='.length));
  if (values.length > 1) throw new Error('--projects may be given only once');
  if (!values.length) return undefined;
  if (!values[0]) throw new Error('--projects requires a path');
  return path.resolve(cwd, values[0]);
}

export const WORKSPACE = workspaceDir();
export const PROJECTS_ROOT = projectsDir(process.env, WORKSPACE);

let logFile: string | null = null;

/**
 * Starts logging to the panel's log file. `rotate` keeps the previous run as .prev (like the
 * host does); only the instance that becomes the server rotates, a second start just appends.
 */
export function openLog(rotate: boolean, file = path.join(dataDir(), 'logs', 'control-panel.log')): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (rotate) {
    try {
      fs.renameSync(file, file + '.prev');
    } catch { /* first run */ }
  }
  logFile = file;
}

export function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line + '\n');
    } catch { /* log must never break the panel */ }
  }
}

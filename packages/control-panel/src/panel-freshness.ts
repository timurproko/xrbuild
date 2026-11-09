// Panel freshness (panel-restart-hint): the server process loads its own code and the workspace's packagers and
// publishers once, at start, so a change on disk after that needs a restart. A publisher whose target had moved kept
// reporting a live app as unpublished until the panel was restarted by hand. UI files are read per request and a page
// reload shows them: they are not scanned.
import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export interface PanelFreshness {
  pid: number;
  startedMs: number;
  outdated: boolean;
  /** the newest file changed after the start, relative to its root; null when up to date */
  newestSource: string | null;
}

/** A folder to scan; `base` names its files in `newestSource`. */
export interface PanelSourceRoot { dir: string; base: string }

const SKIP = new Set(['node_modules', 'bin', 'build', 'dist', 'test']);
const MODULE = /\.(ts|mts|cts|js|mjs|cjs)$/i;

/**
 * What a restart reloads: modules, package.json (the plugin declaration) and anything under a config folder. Other
 * files may be state a plugin keeps next to its code at runtime, which a restart would not change.
 */
const loadedAtStart = (file: string, inConfig: boolean) => inConfig || MODULE.test(file) || path.basename(file) === 'package.json';

function newest(p: string, inConfig = false): { file: string; ms: number } | null {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return null;
  if (st.isFile()) return loadedAtStart(p, inConfig) ? { file: p, ms: st.mtimeMs } : null;
  if (!st.isDirectory()) return null;
  let best: { file: string; ms: number } | null = null;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name.startsWith('.') || (e.isDirectory() && SKIP.has(e.name))) continue;
    const n = newest(path.join(p, e.name), inConfig || (e.isDirectory() && e.name === 'config'));
    if (n && (!best || n.ms > best.ms)) best = n;
  }
  return best;
}

/** The core's panel server code and the folders of the loaded packagers and publishers. */
export function panelSourceRoots(repo: string, workspace: string, pluginDirs: string[]): PanelSourceRoot[] {
  const core = ['control-panel', 'app-icon'].map((p) => ({ dir: path.join(repo, 'packages', p, 'src'), base: repo }));
  const canonical = (dir: string) => { try { return realpathSync.native(dir); } catch { return path.resolve(dir); } };
  const userRoot = canonical(workspace);
  const plugins = [...new Set(pluginDirs.map(canonical))].map((dir) => {
    const relative = path.relative(userRoot, dir);
    const inWorkspace = relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    return { dir, base: inWorkspace ? userRoot : canonical(repo) };
  });
  return [...core, ...plugins];
}

export function panelFreshness(roots: PanelSourceRoot[], startedMs: number, pid = process.pid): PanelFreshness {
  let best: { file: string; ms: number; base: string } | null = null;
  for (const root of roots) {
    const n = newest(root.dir);
    if (n && (!best || n.ms > best.ms)) best = { ...n, base: root.base };
  }
  const outdated = !!best && best.ms > startedMs;
  return { pid, startedMs, outdated, newestSource: outdated ? path.relative(best!.base, best!.file) : null };
}

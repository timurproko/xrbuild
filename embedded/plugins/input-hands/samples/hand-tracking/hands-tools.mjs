import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { recordingStorePlugin } from './recording-store.mjs';
import { plainPath } from './state-paths.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
// The browser receives only recording format/read helpers, never a camera/inference/fusion boot module.
const assets = new Set(['browser.mjs', 'src/live/recording/archive.ts', 'src/live/recording/csv.ts', 'src/live/recording/format.ts', 'src/live/recording/depth-format.ts', 'src/live/recording/immutable.ts', 'src/live/recording/depth-recorder.ts', 'src/live/multiview/recording.ts', 'src/live/contracts.ts', 'src/live/observations.ts', 'src/live/legacy.ts', 'src/live/rgbd/protocol.ts', 'src/live/rgbd/profiles.ts', 'src/live/rgbd/geometry.ts', 'src/live/rgbd/reconstruction.ts', 'src/live/rgbd/point-sampling.ts']);
export async function createHandsTools(context) {
  const handlers = [];
  recordingStorePlugin(context).configureServer({ middlewares: { use(handler) { handlers.push(handler); } } });
  return { async handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/hands/tools/')) {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return true; }
      const name = url.pathname.slice('/hands/tools/'.length);
      if (!assets.has(name)) return false;
      const file = plainPath(path.join(root, name)), stat = await fs.lstat(file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) throw new Error('Unsafe recording module.');
      const source = await fs.readFile(file, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : name.endsWith('.ts') ? stripTypeScriptTypes(source) : source); return true;
    }
    if (!url.pathname.startsWith('/api/hands/tools/')) return false;
    let handled = true;
    await handlers[0](req, res, () => { handled = false; }); return handled;
  } };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { recordingStorePlugin } from './recording-store.mjs';
import { plainPath } from './state-paths.mjs';
import { calibrationCapture } from './calibration-capture.mjs';
import { importSpatialCalibration } from './src/live/multiview/calibration.ts';
const root = path.dirname(fileURLToPath(import.meta.url));
// Exact calibration dependency closure, separate from recording and retired page boot assets.
export const calibrationAssets = new Set(['calibration-browser.mjs', 'calibration-storage.mjs', 'assets/tag36h11-0.svg', 'assets/APRILTAG-LICENSE.txt', 'src/live/multiview/calibration-document.ts', 'src/live/multiview/viewer.ts', 'src/live/multiview/calibration.ts', 'src/live/multiview/automatic-calibration.ts', 'src/live/multiview/marker.ts', 'src/live/rgbd/protocol.ts', 'src/live/rgbd/profiles.ts', 'src/live/rgbd/geometry.ts', 'src/live/rgbd/point-sampling.ts', 'src/live/multiview/calibration-port.ts', 'src/live/recording/format.ts', 'src/live/recording/immutable.ts', 'src/live/contracts.ts', 'src/live/observations.ts', 'src/live/legacy.ts']);
export async function createCalibrationTools(context) {
  const handlers = [];
  recordingStorePlugin({ ...context, async validatePreference(key, text) {
    if (key !== 'handtracking.fusion-calibrations.v1' || typeof text !== 'string' || text.length > 524288) throw new Error('Invalid calibration preference.');
    const inventory = JSON.parse(text);
    if (inventory?.version !== 1 || !Array.isArray(inventory.values) || inventory.values.length < 1 || inventory.values.length > 8) throw new Error('Invalid calibration inventory.');
    for (const [index, value] of inventory.values.entries()) {
      if (typeof value !== 'string' || value.length > 65536) throw new Error('Invalid scalar calibration record.');
      const result = await importSpatialCalibration(new Blob([value]));
      if (index === 0 && !result.spatialQualified) throw new Error('Only qualified spatial results can be saved.');
    }
  } }).configureServer({ middlewares: { use(handler) { handlers.push(handler); } } });
  const capture = calibrationCapture(context);
  return {
    status: () => capture.status(),
    close: () => capture.close(),
    async handle(req, res) {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/calibration/tools/')) {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return true; }
        const name = url.pathname.slice('/calibration/tools/'.length);
        if (!calibrationAssets.has(name)) return false;
        const file = plainPath(path.join(root, name)), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) throw new Error('Unsafe calibration module.');
        const source = await fs.readFile(file, 'utf8');
        const asset = name.startsWith('assets/');
        res.writeHead(200, { 'Content-Type': name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(asset ? { 'Content-Disposition': `attachment; filename="${path.basename(name)}"` } : {}) });
        res.end(req.method === 'HEAD' ? undefined : name.endsWith('.ts') ? stripTypeScriptTypes(source) : source); return true;
      }
      if (await capture.handle(req, res)) return true;
      if (url.pathname !== '/api/calibration/preferences') return false;
      const original = req.url; req.url = '/api/hands/tools/preferences';
      try { await handlers[0](req, res, () => {}); } finally { req.url = original; }
      return true;
    },
  };
}

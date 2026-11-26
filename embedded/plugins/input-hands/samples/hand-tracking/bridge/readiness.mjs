// Passive checks only: never build, allocate services, enumerate devices or create state.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertRuntimeSync, runtimePaths } from './runtime.mjs';
import { sensorDependency } from './sensor-dependency.mjs';
import { plainPath } from '../state-paths.mjs';
const require = createRequire(import.meta.url);
export async function bridgeReadiness(context, { dependency = sensorDependency, runtime = assertRuntimeSync, services = () => require.resolve('ws') } = {}) {
  try { await dependency(context); }
  catch (error) {
    const code = ['device-dependency-missing', 'device-runtime-missing'].includes(error.code) ? error.code : 'device-dependency-invalid';
    const reason = code === 'device-dependency-missing' ? 'Camera device SDK is missing; add the reviewed SDK under third_party/hand-tracking/sensor.' : code === 'device-runtime-missing' ? 'Camera device runtime is missing; restore the reviewed SDK runtime.' : 'Camera device SDK files are incomplete or invalid; restore the reviewed dependency.';
    return { available: false, code, reason, detail: error.message };
  }
  try { runtime(context); }
  catch (error) {
    if (error.code === 'bridge-missing') {
      const parent = plainPath(path.dirname(runtimePaths(context).runtimeRoot));
      const prior = (await fs.readdir(parent).catch(reason => { if (reason.code === 'ENOENT') return []; throw reason; })).some(name => /^r-[a-f0-9]{16}$/.test(name));
      return { available: false, code: prior ? 'bridge-stale' : 'bridge-missing', reason: prior ? 'Native bridge needs rebuilding for this version.' : 'Native bridge is not built.', recovery: 'rebuild' };
    }
    return { available: false, code: 'bridge-invalid', reason: 'Native bridge files are invalid; inspect the preserved runtime before rebuilding.', detail: error.message };
  }
  try { services(); }
  catch (error) { return { available: false, code: 'services-missing', reason: 'Camera service dependencies are missing.', recovery: 'rebuild', detail: error.message }; }
  return { available: true, reason: 'Connect to check depth cameras.' };
}

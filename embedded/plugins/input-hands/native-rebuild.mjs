// Invoked only by an explicit native rebuild; never starts services or devices.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridgeReadiness } from './samples/hand-tracking/bridge/readiness.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
export async function rebuildNative(context, job, tools, { readiness = bridgeReadiness } = {}) {
  const ready = await readiness(context, { services() {} });
  if (ready.available) { job.line('Camera bridge is current.'); return; }
  if (ready.code === 'device-dependency-missing') { job.line(ready.reason); return; }
  if (ready.recovery !== 'rebuild') throw new Error(`${ready.reason}${ready.detail ? ' ' + ready.detail : ''}`);
  job.line('Rebuild: compiling and staging the camera bridge…');
  await job.run(process.execPath, [path.join(root, 'samples/hand-tracking/bridge/build.mjs'), '--stage-runtime'], {
    cwd: context.core,
    env: { ...process.env, XRB_CORE: context.core, XRB_HOME: context.workspace, XRB_BRIDGE_CMAKE: tools.cmake, XRB_BRIDGE_GENERATOR: tools.generator },
  });
  const after = await readiness(context, { services() {} });
  if (!after.available) throw new Error(after.reason);
  job.line('Camera bridge is ready.');
}

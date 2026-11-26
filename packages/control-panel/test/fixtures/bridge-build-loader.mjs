// Exercise the real build recipe and dependency resolver, mocking only device/compiler boundaries.
export async function resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/bridge/build.mjs')) {
    const source = specifier === './prepare-markers.mjs'
      ? 'export async function prepareMarkers(){return "C:/fixture-marker-source";}'
      : specifier === './sensor-dependency.mjs'
        ? 'export async function sensorDependency(){return {include:"C:/fixture-sdk/include",library:"C:/fixture-sdk/device.lib",runtime:"C:/fixture-sdk/device.dll",cppHeader:"C:/fixture-sdk/include/device.hpp",geometryHeader:"C:/fixture-sdk/include/geometry.hpp"};}'
        : specifier === 'node:child_process'
          ? `import fs from 'node:fs';export function execFileSync(exe,args){fs.appendFileSync(process.env.XRB_BRIDGE_TEST_COMMANDS,JSON.stringify({exe,args})+'\\n');}`
          : null;
    if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  }
  return next(specifier, context);
}

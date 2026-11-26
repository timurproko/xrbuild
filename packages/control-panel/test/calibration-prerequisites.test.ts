import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { REPO } from '../src/env.ts';
import { bridgeReadiness } from '../../../embedded/plugins/input-hands/samples/hand-tracking/bridge/readiness.mjs';
import { runtimePaths, sourceSha256, assertRuntimeSync, runtimeValueSha256 } from '../../../embedded/plugins/input-hands/samples/hand-tracking/bridge/runtime.mjs';
import { sensorDependency } from '../../../embedded/plugins/input-hands/samples/hand-tracking/bridge/sensor-dependency.mjs';
import { rebuildNative } from '../../../embedded/plugins/input-hands/native-rebuild.mjs';
import { calibrationCapture } from '../../../embedded/plugins/input-hands/samples/hand-tracking/calibration-capture.mjs';
import { CalibrationTools } from '../src/calibration-tools.ts';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture(t: any) {
  const parent = process.env.XRB_TEST_ROOT ?? path.join(REPO, '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'cal-prereq-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const context = { core: path.join(root, 'core'), workspace: path.join(root, 'user') };
  await fs.mkdir(context.core); await fs.mkdir(context.workspace);
  const write = async (file: string, value: any) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const sensor = path.join(context.core, 'third_party/hand-tracking/sensor');
  const dependency = async () => {
    const files = Object.fromEntries(['include/device.hpp', 'device.lib', 'device.dll', 'NOTICE.txt'].map(name => [name, digest(name)]));
    for (const name of Object.keys(files)) await write(path.join(sensor, name), name);
    await write(path.join(sensor, 'dependency.json'), { version: 1, upstreamVersion: '1', source: { url: 'https://example.test/device', sha256: '1'.repeat(64) }, license: 'MIT', files, include: 'include', cppHeader: 'include/device.hpp', geometryHeader: 'include/device.hpp', library: 'device.lib', runtime: 'device.dll', notices: ['NOTICE.txt'] });
  };
  const stage = async () => {
    const runtime = runtimePaths(context).runtimeRoot, files = { 'hand-tracking-rgbd.exe': 'fixture executable, never run', 'device.dll': 'fixture runtime', 'apriltag-LICENSE.md': 'fixture notice' };
    for (const [name, bytes] of Object.entries(files)) await write(path.join(runtime, name), bytes);
    await write(path.join(runtime, 'manifest.json'), { version: 1, platform: 'win32-x64', sourceSha256: await sourceSha256(), dependencySha256: '1'.repeat(64), files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, runtimeValueSha256(name, bytes)])) });
  };
  return { context, write, sensor, dependency, stage };
}

test('passive prerequisites distinguish missing SDK, absent/stale bridge, invalid inventory and missing services', async t => {
  const f = await fixture(t), services = () => {};
  let ready = await bridgeReadiness(f.context, { services });
  assert.equal(ready.code, 'device-dependency-missing'); assert.equal(ready.recovery, undefined);
  assert.equal(ready.reason, 'Camera device SDK is missing; add the reviewed SDK under third_party/hand-tracking/sensor.');
  await assert.rejects(fs.stat(path.join(f.context.workspace, 'build')));
  await f.dependency();
  assert.equal((await sensorDependency(f.context)).runtime, path.join(f.sensor, 'device.dll'));
  ready = await bridgeReadiness(f.context, { services });
  assert.equal(ready.code, 'bridge-missing'); assert.equal(ready.recovery, 'rebuild');
  const runtime = runtimePaths(f.context).runtimeRoot, parent = path.dirname(runtime);
  await f.write(path.join(parent, 'r-0000000000000000/manifest.json'), 'old generation');
  ready = await bridgeReadiness(f.context, { services }); assert.equal(ready.code, 'bridge-stale');
  await f.stage(); assert.equal((await bridgeReadiness(f.context, { services })).available, true);
  const original = await fs.readFile(path.join(runtime, 'manifest.json'), 'utf8');
  for (const bad of ['{', JSON.stringify({ ...JSON.parse(original), sourceSha256: '0'.repeat(64) }), JSON.stringify({ ...JSON.parse(original), files: { ...JSON.parse(original).files, '../bad.exe': '0'.repeat(64) } })]) {
    await f.write(path.join(runtime, 'manifest.json'), bad);
    ready = await bridgeReadiness(f.context, { services }); assert.equal(ready.code, 'bridge-invalid'); assert.equal(ready.recovery, undefined);
    assert.equal(await fs.readFile(path.join(runtime, 'manifest.json'), 'utf8'), bad);
  }
  await f.write(path.join(runtime, 'manifest.json'), original);
  await f.write(path.join(runtime, 'device.dll'), 'changed');
  assert.equal((await bridgeReadiness(f.context, { services })).code, 'bridge-invalid');
  await assert.rejects(rebuildNative(f.context, { line() {}, async run() { assert.fail('invalid immutable runtime must not be overwritten'); } }, {}), /bridge files are invalid/);
  await fs.unlink(path.join(runtime, 'device.dll'));
  assert.equal((await bridgeReadiness(f.context, { services })).code, 'bridge-invalid');
  const shared = path.join(f.context.workspace, 'shared.dll'); await f.write(shared, 'fixture runtime');
  await fs.link(shared, path.join(runtime, 'device.dll'));
  assert.equal((await bridgeReadiness(f.context, { services })).code, 'bridge-invalid');
  await fs.unlink(path.join(runtime, 'device.dll')); await f.stage();
  ready = await bridgeReadiness(f.context, { services() { throw new Error('ws not installed'); } });
  assert.equal(ready.code, 'services-missing'); assert.equal(ready.recovery, 'rebuild');
  await f.write(path.join(f.sensor, 'device.dll'), 'changed');
  ready = await bridgeReadiness(f.context, { services }); assert.equal(ready.code, 'device-dependency-invalid'); assert.equal(ready.recovery, undefined);
  await fs.unlink(path.join(f.sensor, 'device.dll'));
  ready = await bridgeReadiness(f.context, { services }); assert.equal(ready.code, 'device-runtime-missing'); assert.match(ready.reason, /device runtime is missing/);
});

test('explicit rebuild stages current bridge after source update using checked tools and selected workspace', async t => {
  const f = await fixture(t); await f.dependency();
  await f.write(path.join(path.dirname(runtimePaths(f.context).runtimeRoot), 'r-0000000000000000/manifest.json'), 'old');
  let calls = 0; const lines: string[] = [];
  await rebuildNative(f.context, { line: (line: string) => lines.push(line), async run(cmd: string, args: string[], options: any) {
    calls++; assert.equal(cmd, process.execPath); assert.equal(args.at(-1), '--stage-runtime'); assert.match(args[0], /bridge[\\/]build.mjs$/);
    assert.equal(options.env.XRB_HOME, f.context.workspace); assert.equal(options.env.XRB_CORE, f.context.core);
    assert.equal(options.env.XRB_BRIDGE_CMAKE, 'checked-cmake'); assert.equal(options.env.XRB_BRIDGE_GENERATOR, 'checked-generator');
    await f.stage();
  } }, { cmake: 'checked-cmake', generator: 'checked-generator' });
  assert.equal(calls, 1); assert.ok(lines.includes('Camera bridge is ready.')); assertRuntimeSync(f.context);
  await rebuildNative(f.context, { line() {}, async run() { assert.fail('current bridge must not rebuild'); } }, {});
  await fs.unlink(path.join(f.sensor, 'dependency.json'));
  await rebuildNative(f.context, { line: (line: string) => lines.push(line), async run() { assert.fail('missing SDK must not install or compile'); } }, {});
  assert.equal(lines.at(-1), 'Camera device SDK is missing; add the reviewed SDK under third_party/hand-tracking/sensor.');
});

test('core discovery distinguishes absent, disabled, conflicting and incompatible calibration contributions', async t => {
  const f = await fixture(t), tools = new CalibrationTools(f.context.core, f.context.workspace, () => { assert.fail('passive discovery must not acquire'); });
  t.after(() => tools.close());
  assert.equal((await tools.status()).code, 'plugin-unavailable');
  const plugin = async (name: string) => {
    const root = path.join(f.context.workspace, 'plugins', name);
    await f.write(path.join(root, 'xrb-plugin.json'), { title: name, type: 'input', version: '1.0.0', exports: { 'camera-calibration': './calibration.mjs' } });
    await f.write(path.join(root, 'calibration.mjs'), 'export const incompatible=true;');
  };
  await plugin('camera-one');
  await f.write(path.join(f.context.workspace, 'xrb-plugins.json'), { disabled: ['camera-one'], settings: {} });
  assert.equal((await tools.status()).code, 'plugin-unavailable');
  await f.write(path.join(f.context.workspace, 'xrb-plugins.json'), { disabled: [], settings: {} });
  assert.match((await tools.status()).reason!, /no compatible mount/);
  await plugin('camera-two');
  const conflict = await tools.status(); assert.match(conflict.reason!, /owners conflict/); assert.equal(conflict.recovery, 'plugins');
});

test('unavailable capture preserves specific preparation reason and never allocates services', async () => {
  const ready = { available: false, code: 'services-missing', reason: 'Camera service dependencies are missing.', recovery: 'rebuild' };
  const capture = calibrationCapture({ acquireCapture() { assert.fail('no acquisition'); } }, { prepare: async () => ready, factory() { assert.fail('no native service'); } });
  assert.deepEqual(await capture.status(), ready); assert.equal(capture.busy(), false); await capture.close();
});

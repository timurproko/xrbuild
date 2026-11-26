import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import childProcess from 'node:child_process';
import { test, type TestContext } from 'node:test';
import { handMeshDeclaration, handMeshSettings } from '../src/hand-mesh-contract.ts';
import { discoverHandMeshPlugins } from '../src/hand-mesh-plugins.ts';

const declaration = () => ({ version: 1, id: 'surface', label: 'Example mesh', program: 'runtime/sidecar.mjs', args: [], settingsVersion: 1,
  settings: [
    { key: 'quality', label: 'Quality', type: 'select', default: 'mid', options: [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }] },
    { key: 'iterations', label: 'Iterations', type: 'number', default: 2, min: 1, max: 4, step: 1 },
    { key: 'normals', label: 'Normals', type: 'boolean', default: true },
  ] });
async function fixture(t: TestContext) {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'hand-mesh-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  await fs.mkdir(core); await fs.mkdir(workspace);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const install = async (origin = 'user', program = 'runtime/sidecar.mjs', extra: object = {}) => {
    const base = path.join(root, origin, 'plugins/example');
    await fs.mkdir(path.dirname(path.join(base, program)), { recursive: true });
    // Any execution/import fails, while fetch/spawn calls would also trip the test's traps.
    await fs.writeFile(path.join(base, program), `throw new Error('Mesh discovery executed a program');`);
    await fs.writeFile(path.join(base, 'xrb-plugin.json'), JSON.stringify({ title: 'Example mesh plugin', type: 'plugin', version: '1.0.0', handMesh: { ...declaration(), program, ...extra } }));
    return base;
  };
  return { root, core, workspace, install };
}

test('mesh declaration allows one bounded geometry sidecar and validates all setting defaults/values', () => {
  const parsed = handMeshDeclaration(declaration());
  assert.deepEqual(handMeshSettings(parsed, {}), { quality: 'mid', iterations: 2, normals: true });
  assert.deepEqual(handMeshSettings(parsed, { quality: 'low', iterations: 4, normals: false }), { quality: 'low', iterations: 4, normals: false });
  for (const patch of [
    { version: 2 }, { id: '../escape' }, { program: '../outside.exe' }, { program: 'C:/outside.exe' }, { program: 'runtime\\outside.exe' },
    { program: '/outside.exe' }, { args: ['\0'] }, { args: Array(17).fill('x') }, { settingsVersion: 0 },
    { slot: 'skeleton' }, { order: 1 }, { supportsBypass: true }, { module: 'load.mjs' },
    { settings: Array(9).fill(declaration().settings[0]) }, { settings: [declaration().settings[0], declaration().settings[0]] },
    { settings: [{ key: 'path', label: 'Path', type: 'text', default: 'anything' }] },
    { settings: [{ key: 'constructor', label: 'Bad', type: 'boolean', default: true }] },
    { settings: [{ ...declaration().settings[1], default: 10 }] }, { settings: [{ ...declaration().settings[1], max: Infinity }] },
    { settings: [{ ...declaration().settings[1], options: [] }] }, { settings: [{ ...declaration().settings[0], default: 'unknown' }] },
    { settings: [{ ...declaration().settings[2], default: 'true' }] },
  ]) assert.throws(() => handMeshDeclaration({ ...declaration(), ...patch }), /handMesh/);
  for (const values of [{ iterations: NaN }, { iterations: 10 }, { normals: 1 }, { quality: 'other' }, { unknown: true }, { quality: 'x'.repeat(2049) }])
    assert.throws(() => handMeshSettings(parsed, values), /handMesh/);
});

test('catalog discovery reads metadata/file existence only and never imports, probes, spawns or downloads', async t => {
  const f = await fixture(t); await f.install();
  t.mock.method(globalThis, 'fetch', () => { throw new Error('discovery downloaded'); });
  for (const method of ['spawn', 'execFile', 'execFileSync', 'fork'] as const)
    t.mock.method(childProcess, method, () => { throw new Error('discovery started a process'); });
  const result = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.equal(result.problems.length, 0);
  assert.equal(result.plugins.length, 1);
  assert.equal(result.plugins[0].owner, 'workspace:example');
  assert.equal(result.plugins[0].available, true);
  assert.match(result.plugins[0].reason, /Not started/);
  assert.equal(await fs.stat(path.join(f.workspace, 'config')).catch(() => null), null);
  assert.equal(await fs.stat(path.join(f.workspace, 'build')).catch(() => null), null);
  assert.deepEqual(await fs.readdir(f.workspace), ['plugins']);
  assert.equal((await discoverHandMeshPlugins(f.core, f.workspace)).revision, result.revision);
});

test('registry keeps disabled and conflicting origins unavailable and does not silently substitute', async t => {
  const f = await fixture(t); await f.install(); await f.install('core/embedded');
  const ambiguous = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.equal(ambiguous.plugins.length, 2);
  assert.ok(ambiguous.plugins.every(p => !p.available && p.program === null && /origin/.test(p.reason)));
  await fs.writeFile(path.join(f.workspace, 'xrb-plugins.json'), JSON.stringify({ origins: { example: 'workspace' }, disabled: ['workspace:example'] }));
  const disabled = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.match(disabled.plugins.find(p => p.owner === 'workspace:example')!.reason, /disabled/);
  assert.ok(disabled.plugins.every(p => !p.available));
  assert.notEqual(disabled.revision, ambiguous.revision);
  await fs.writeFile(path.join(f.workspace, 'xrb-plugins.json'), JSON.stringify({ origins: { example: 'workspace' } }));
  const selected = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.deepEqual(selected.plugins.filter(p => p.available).map(p => p.owner), ['workspace:example']);
});

test('missing, unsafe and malformed declarations are diagnosed without executing code', async t => {
  const f = await fixture(t), base = await f.install();
  await fs.unlink(path.join(base, declaration().program));
  const missing = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.equal(missing.plugins[0].available, false); assert.match(missing.plugins[0].reason, /missing/);
  await fs.writeFile(path.join(f.root, 'outside.mjs'), 'throw new Error("foreign code");');
  await fs.link(path.join(f.root, 'outside.mjs'), path.join(base, declaration().program));
  const hardlink = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.equal(hardlink.plugins[0].available, false);
  assert.notEqual(hardlink.revision, missing.revision);
  await fs.writeFile(path.join(base, 'xrb-plugin.json'), JSON.stringify({ title: 'Invalid', type: 'plugin', version: '1.0.0', handMesh: { ...declaration(), slot: 'skeleton' } }));
  const malformed = await discoverHandMeshPlugins(f.core, f.workspace);
  assert.equal(malformed.plugins.length, 0); assert.match(malformed.problems.join(' '), /handMesh/);
});

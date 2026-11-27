import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { handMeshRegistry } from '../src/hand-mesh-plugins.ts';
import type { PluginCatalog } from '../src/extension-catalog.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { meshRuntimeReceipt, resolveMeshRuntime, meshUserRoot, MESH_RUNTIME_RECEIPT } from '../src/hand-mesh-runtime.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? '.artifacts', 'mesh-runtime-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source'), userRoot = path.join(root, 'user'), runtime = path.join(userRoot, 'plugins', 'surface-runtime', 'g1');
  await fs.mkdir(sourceRoot); await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, 'source.txt'), 'source');
  await fs.writeFile(path.join(runtime, 'worker.exe'), 'fake-not-executed'); await fs.writeFile(path.join(runtime, 'model.bin'), 'fake-model');
  const declaration = handMeshDeclaration({ version: 2, id: 'surface', label: 'Surface', program: 'worker.exe', args: [], settingsVersion: 1, settings: [], capabilities: MESH_CAPABILITIES,
    runtime: { id: 'surface-runtime', generation: 'g1' } });
  const owner = { owner: 'workspace:surface', sourceRoot, declaration };
  const receipt = await meshRuntimeReceipt(owner, runtime); const file = path.join(runtime, MESH_RUNTIME_RECEIPT);
  await fs.writeFile(file, JSON.stringify(receipt));
  return { root, sourceRoot, userRoot, runtime, owner, receipt, file };
}
test('runtime default is user home, independent of selected workspace and XRB_HOME', () => {
  assert.equal(meshUserRoot(), path.join(os.homedir(), '.xrbuild'));
});
test('checked runtime resolves models/program outside source without creating or executing anything', async t => {
  const f = await fixture(t), before = await fs.readdir(f.root);
  const result = await resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true });
  assert.equal(result.program, await fs.realpath(path.join(f.runtime, 'worker.exe'))); assert.equal(result.cwd, await fs.realpath(f.runtime));
  assert.deepEqual(await fs.readdir(f.root), before); assert.deepEqual(await fs.readdir(f.sourceRoot), ['source.txt']);
  await fs.writeFile(path.join(f.runtime, 'model.bin'), 'changed');
  await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true }), /changed/);
});
test('receipt source, declaration, ownership, completeness and source changes are checked', async t => {
  const f = await fixture(t);
  for (const change of [{ owner: 'workspace:foreign' }, { status: 'building' }, { declaration: 'a'.repeat(64) }, { source: f.userRoot }, { files: [] }]) {
    await fs.writeFile(f.file, JSON.stringify({ ...f.receipt, ...change }));
    await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true }));
  }
  await fs.writeFile(f.file, JSON.stringify(f.receipt)); await fs.writeFile(path.join(f.sourceRoot, 'source.txt'), 'new source');
  await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true }), /changed/);
});
test('registry retains passive checked launch and refuses post-discovery mutation', async t => {
  const f = await fixture(t);
  const plugin = { key: f.owner.owner, id: 'surface', sourceRoot: f.sourceRoot, meta: { handMesh: f.owner.declaration } };
  const catalog = { plugins: [plugin], selected: [plugin], prefs: { disabled: [] }, problems: [] } as unknown as PluginCatalog;
  const registry = await handMeshRegistry(catalog, { userRoot: f.userRoot });
  assert.equal(registry.plugins[0].available, true); assert.ok(registry.plugins[0].launch);
  await registry.plugins[0].launch!();
  await fs.writeFile(path.join(f.runtime, 'worker.exe'), 'mutated-after-discovery');
  await assert.rejects(registry.plugins[0].launch!(), /changed/);
});
test('linked receipt/program, added output, traversing reference and cancelled validation are refused', async t => {
  const f = await fixture(t);
  await fs.link(path.join(f.runtime, 'worker.exe'), path.join(f.root, 'linked.exe'));
  await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true })); await fs.unlink(path.join(f.root, 'linked.exe'));
  await fs.writeFile(path.join(f.runtime, 'extra.dll'), 'unexpected');
  await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true }), /changed/); await fs.unlink(path.join(f.runtime, 'extra.dll'));
  assert.throws(() => handMeshDeclaration({ ...f.owner.declaration, runtime: { id: '../source', generation: 'g1' } }));
  const c = new AbortController(); c.abort(); await assert.rejects(resolveMeshRuntime(f.owner, { userRoot: f.userRoot, verify: true, signal: c.signal }));
  const link = path.join(f.userRoot, 'plugins', 'alias'); await fs.symlink(f.runtime, link, 'junction');
  await assert.rejects(resolveMeshRuntime({ ...f.owner, declaration: { ...f.owner.declaration, runtime: { id: 'alias', generation: 'g1' } } }, { userRoot: f.userRoot }));
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { meshSetupOwners, meshSetupPlan, installMeshSetup, MeshSetupUnavailable } from '../src/hand-mesh-setup.ts';
import { handMeshRegistry } from '../src/hand-mesh-plugins.ts';
import { resolvePluginCatalog } from '../src/extension-catalog.ts';
import { restartBlocker } from '../src/launch-blockers.ts';

const core = path.resolve(import.meta.dirname, '../../..');
const handMesh = { version: 2, id: 'surface', label: 'Fixture mesh', program: 'python/python.exe', args: [], runtime: { id: 'fixture-mesh', generation: 'g1' },
  capabilities: ['final-pose-observations-v1'], settingsVersion: 1, settings: [{ key: 'quality', label: 'Quality', type: 'number', min: 1, max: 3, default: 2 }] };
// A stand-in installer: it records the call instead of downloading anything.
const setupModule = `export const calls = [];
export function plan() { return { consent: 'c0ffee', destination: 'home/g1', downloadBytes: 2097152, installedBytes: 4194304, licences: ['MIT'],
  items: [{ kind: 'asset', name: 'model', version: '1', publisher: 'Example', licence: 'MIT', bytes: 2097152, url: 'https://example.invalid/m', sha256: 'x' }] }; }
export async function status() { return { cpu: { installed: false } }; }
export async function install(options) { globalThis.fixtureInstall = options; options.onProgress({ step: 'download', done: 1048576, total: 2097152 }); options.onProgress({ step: 'self-check' }); }`;

test('post-processing plugins offer their prerequisite setup and stay selectable before it runs', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-mesh-setup-')), plugin = path.join(workspace, 'plugins', 'fixture-mesh');
  try {
    await fs.mkdir(path.join(plugin, 'setup'), { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Fixture mesh', type: 'plugin', version: '1.0.0', exports: { 'mesh-runtime-setup': './setup/runtime-setup.mjs' }, handMesh }));
    await fs.writeFile(path.join(plugin, 'setup', 'runtime-setup.mjs'), setupModule);
    const [entry] = (await handMeshRegistry(await resolvePluginCatalog(workspace, core, true), { userRoot: path.join(workspace, 'user') })).plugins;
    assert.equal(entry.available, false); assert.equal(entry.needsSetup, true, 'a missing runtime is a setup step, not an unavailable plugin');
    assert.deepEqual([...await meshSetupOwners(core, workspace)], ['workspace:fixture-mesh']);
    const plan = await meshSetupPlan(core, workspace, 'workspace:fixture-mesh');
    assert.deepEqual({ consent: plan.consent, installed: plan.installed, items: plan.items }, { consent: 'c0ffee', installed: false,
      items: [{ name: 'model', version: '1', publisher: 'Example', licence: 'MIT', bytes: 2097152 }] }, 'the plan exposes sizes and licences, not download URLs');
    const lines: string[] = [];
    await installMeshSetup(core, workspace, 'workspace:fixture-mesh', 'c0ffee', { line: text => lines.push(text), run: async () => {} });
    const options = (globalThis as any).fixtureInstall;
    assert.equal(options.consent, 'c0ffee'); assert.equal(options.owner, 'workspace:fixture-mesh'); assert.equal(options.core, core); assert.equal(options.workspace, workspace);
    assert.deepEqual(lines.slice(1), ['download: 1.0 MB of 2.0 MB (50%)', 'self-check…', 'Prerequisites installed.']);
    await assert.rejects(meshSetupPlan(core, workspace, 'workspace:missing'), MeshSetupUnavailable);
    assert.match(restartBlocker(['mesh-setup']) ?? '', /post-processing install/);
  } finally {
    delete (globalThis as any).fixtureInstall;
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

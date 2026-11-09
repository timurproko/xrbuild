import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { readProjectRunSettings, saveProjectRunSettings, projectRunSettingsFile, withRunSettings } from '../src/project-run-settings.ts';
import { savePluginPrefs } from '../src/plugin-manager.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import type { ProviderList } from '../src/host-build.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/provider-overrides-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (relative: string, value: unknown) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
  const fields = [{ key: 'quality', label: 'Quality', type: 'number', min: 0, max: 10, default: 1 }, { key: 'debug', label: 'Debug', type: 'boolean', default: false }, { key: 'mode', label: 'Mode', type: 'select', default: 'balanced', options: [{ value: 'balanced', label: 'Balanced' }, { value: 'fast', label: 'Fast' }] }, { key: 'destination', label: 'Destination', type: 'text' }, { key: 'recordFile', label: 'Recording', type: 'boolean', default: false }];
  for (const owner of ['core/embedded', 'user']) {
    await write(`${owner}/plugins/input-tracker/xrb-plugin.json`, { title: 'Tracker fixture', type: 'input', version: '1.0.0', settings: fields });
    await write(`${owner}/plugins/input-tracker/bin/fixture.dll`, 'fixture binary');
  }
  await write('core/embedded/projects/core/demo/xrb-project.json', { name: 'Demo', kind: 'app', entry: 'dist', inputs: ['tracker'], plugins: { tracker: { quality: 2 } } });
  await savePluginPrefs(workspace, { disabled: [], settings: {}, panelSettings: {}, origins: { 'input-tracker': 'workspace' } });
  const p = (await discoverProjectCatalog(core, workspace)).projects.find(item => item.key === 'bundled:demo')!.project;
  let owner = workspace;
  const options = { probe: async (): Promise<ProviderList> => ({ providers: [{ role: 'input', name: 'tracker', version: '1.0.0', description: 'fixture', builtin: false, path: path.join(owner, 'plugins/input-tracker/bin/fixture.dll') }], rejected: [], error: null }) };
  return { root, core, workspace, p, write, options, changeProbe(value: string) { owner = value; } };
}

test('advanced run options bind actual provider ownership/schema, inherit defaults and never edit the product', async t => {
  const f = await fixture(t), source = await fs.readFile(path.join(f.p.dir, 'xrb-project.json'));
  const first = await readProjectRunSettings(f.core, f.workspace, f.p, f.options), schema = first.providerSchemas![0];
  assert.equal(schema.owner, 'workspace:input-tracker'); assert.equal(schema.provider, 'tracker'); assert.equal(schema.values.quality, 2);
  assert.deepEqual(schema.fields.map(field => field.key), ['quality', 'debug', 'mode']);
  const record = { owner: schema.owner, schema: schema.schema, values: { quality: 9, mode: 'fast', debug: true } };
  const saved = await saveProjectRunSettings(f.core, f.workspace, f.p, { providerSettings: { tracker: record } }, first.revision, f.options);
  const projected = withRunSettings(f.p, saved);
  assert.deepEqual(projected.manifest!.plugins!.tracker, { quality: 9, mode: 'fast', debug: true });
  assert.deepEqual(f.p.manifest!.plugins!.tracker, { quality: 2 }); assert.deepEqual(await fs.readFile(path.join(f.p.dir, 'xrb-project.json')), source);
  assert.equal(saved.providerSchemas![0].values.quality, 9);
  const inactive = await saveProjectRunSettings(f.core, f.workspace, f.p, { inputs: [], providerSettings: { tracker: record } }, saved.revision, f.options);
  assert.equal(withRunSettings(f.p, inactive).manifest!.plugins!.tracker.quality, 2, 'inactive saved choices are retained but never applied');
});

test('unknown, secret, text/path, out-of-range and forged schema values preserve saved settings', async t => {
  const f = await fixture(t), initial = await readProjectRunSettings(f.core, f.workspace, f.p, f.options), schema = initial.providerSchemas![0];
  const good = { owner: schema.owner, schema: schema.schema, values: { quality: 4 } };
  const saved = await saveProjectRunSettings(f.core, f.workspace, f.p, { providerSettings: { tracker: good } }, initial.revision, f.options), file = projectRunSettingsFile(f.core, f.workspace, f.p), bytes = await fs.readFile(file);
  for (const record of [{ ...good, owner: 'bundled:input-tracker' }, { ...good, schema: 'f'.repeat(64) }, { ...good, values: { quality: 11 } }, { ...good, values: { unknown: true } }, { ...good, values: { destination: 'outside' } }, { ...good, values: { mode: 'C:\\private' } }, { ...good, values: { recordFile: true } }, { ...good, values: { token: 'secret' } }]) {
    await assert.rejects(saveProjectRunSettings(f.core, f.workspace, f.p, { providerSettings: { tracker: record } }, saved.revision, f.options));
    assert.deepEqual(await fs.readFile(file), bytes);
  }
});

test('changing selected source/schema invalidates advanced choices without reinterpreting or resetting bytes', async t => {
  const f = await fixture(t), first = await readProjectRunSettings(f.core, f.workspace, f.p, f.options), schema = first.providerSchemas![0];
  await saveProjectRunSettings(f.core, f.workspace, f.p, { providerSettings: { tracker: { owner: schema.owner, schema: schema.schema, values: { quality: 8 } } } }, first.revision, f.options);
  const file = projectRunSettingsFile(f.core, f.workspace, f.p), bytes = await fs.readFile(file);
  await savePluginPrefs(f.workspace, { disabled: [], settings: {}, panelSettings: {}, origins: { 'input-tracker': 'bundled' } });
  f.changeProbe(path.join(f.core, 'embedded'));
  await assert.rejects(readProjectRunSettings(f.core, f.workspace, f.p, f.options), /Saved run settings are invalid/);
  assert.deepEqual(await fs.readFile(file), bytes);
  await savePluginPrefs(f.workspace, { disabled: [], settings: {}, panelSettings: {}, origins: { 'input-tracker': 'workspace' } });
  f.changeProbe(f.workspace);
  assert.equal((await readProjectRunSettings(f.core, f.workspace, f.p, f.options)).providerSchemas![0].values.quality, 8);
});

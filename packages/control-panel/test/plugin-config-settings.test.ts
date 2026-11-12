import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { PluginConfigConflict, PluginConfigInvalid, readUserPluginConfigState, writeUserPluginConfig } from '../src/plugin-config.ts';
import { pluginMeta, type PluginSetting } from '../src/plugin-manager.ts';

const fields: PluginSetting[] = [
  { key: 'configured', label: 'Configured', type: 'boolean', default: false },
  { key: 'origin', label: 'HTTPS origin', type: 'text', default: '' },
  { key: 'timeout', label: 'Timeout', type: 'number', default: 10, min: 1, max: 100 },
];

async function workspace(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/plugin-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'config/plugins/publisher/config.json') };
}

test('reading state never creates the config and reports an absent revision', async t => {
  const w = await workspace(t);
  const state = await readUserPluginConfigState(w.root, 'publisher', fields);
  assert.deepEqual(state, { revision: 'absent', values: { configured: false, origin: '', timeout: 10 } });
  await assert.rejects(fs.access(path.join(w.root, 'config')));
});

test('an explicit save writes defaults plus changes and returns the new revision', async t => {
  const w = await workspace(t);
  const saved = await writeUserPluginConfig(w.root, 'publisher', fields, { configured: true, origin: 'https://site.example' }, 'absent');
  assert.deepEqual(saved.values, { configured: true, origin: 'https://site.example', timeout: 10 });
  assert.match(saved.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await fs.readFile(w.file, 'utf8')), { configured: true, origin: 'https://site.example', timeout: 10 });
  assert.deepEqual(await readUserPluginConfigState(w.root, 'publisher', fields), saved);
});

test('saves preserve unknown fields and replace only the declared values', async t => {
  const w = await workspace(t);
  await fs.mkdir(path.dirname(w.file), { recursive: true });
  await fs.writeFile(w.file, '{"origin":"https://old.example","future":{"keep":1}}\n');
  const { revision } = await readUserPluginConfigState(w.root, 'publisher', fields);
  await writeUserPluginConfig(w.root, 'publisher', fields, { origin: 'https://new.example' }, revision);
  const saved = JSON.parse(await fs.readFile(w.file, 'utf8'));
  assert.deepEqual(saved.future, { keep: 1 });
  assert.equal(saved.origin, 'https://new.example');
  assert.deepEqual((await fs.readdir(path.dirname(w.file))).sort(), ['config.json'], 'no staging leftovers');
});

test('a stale revision is refused without touching the file', async t => {
  const w = await workspace(t);
  const first = await writeUserPluginConfig(w.root, 'publisher', fields, { origin: 'https://a.example' }, 'absent');
  const bytes = '{"origin":"https://edited.example"}\n';
  await fs.writeFile(w.file, bytes);
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { origin: 'https://b.example' }, first.revision), PluginConfigConflict);
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { origin: 'https://b.example' }, 'absent'), PluginConfigConflict);
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { origin: 'https://b.example' }, undefined), PluginConfigConflict);
  assert.equal(await fs.readFile(w.file, 'utf8'), bytes);
});

test('invalid and undeclared values are refused per field', async t => {
  const w = await workspace(t);
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { timeout: 0 }, 'absent'), (error: unknown) => error instanceof PluginConfigInvalid && error.field === 'timeout' && /Timeout/.test(error.message));
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { configured: 'yes' }, 'absent'), (error: unknown) => error instanceof PluginConfigInvalid && error.field === 'configured');
  await assert.rejects(writeUserPluginConfig(w.root, 'publisher', fields, { token: 'x' }, 'absent'), (error: unknown) => error instanceof PluginConfigInvalid && error.field === 'token');
  await assert.rejects(fs.access(w.file));
});

async function metaWith(t: TestContext, config: unknown[], settings: unknown[] = [{ key: 'production', label: 'Production', type: 'boolean', default: false }, { key: 'mode', label: 'Mode', type: 'text', default: '' }]) {
  const w = await workspace(t), dir = path.join(w.root, 'plugins', 'publisher');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Publisher', type: 'publisher', version: '0.1.0', settings, config }));
  return pluginMeta(w.root, 'publisher');
}

test('config fields may be shown only while one of the plugin\'s boolean settings is on', async t => {
  const meta = await metaWith(t, [{ key: 'origin', label: 'Origin', type: 'text', default: '', section: 'Production', shownWhen: 'production' }]);
  assert.equal(meta.config![0].shownWhen, 'production');
  await assert.rejects(metaWith(t, [{ key: 'origin', label: 'Origin', type: 'text', shownWhen: 'missing' }]), /shownWhen must name a boolean runtime setting/);
  await assert.rejects(metaWith(t, [{ key: 'origin', label: 'Origin', type: 'text', shownWhen: 'mode' }]), /shownWhen must name a boolean runtime setting/);
  await assert.rejects(metaWith(t, [{ key: 'origin', label: 'Origin', type: 'text', shownWhen: 'bad key' }]), /invalid shownWhen/);
  await assert.rejects(metaWith(t, [], [{ key: 'production', label: 'Production', type: 'boolean', shownWhen: 'production' }]), /invalid shownWhen/, 'only configuration fields are scoped');
});

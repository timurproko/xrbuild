import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalInputs, readProject, saveManifest, selectionOf, type Manifest } from '../src/projects.ts';
import { resolveHandInput } from '../src/hands-state.ts';

test('old provider names, singular and multi-source inputs all mean Hand, without an adoption/version field', () => {
  const base: Manifest = { name: 'Old app', kind: 'app', plugins: { tracker: { exposureUs: 8000 }, other: { enabled: true } } };
  for (const selection of [{ input: 'tracker' }, { inputs: ['mouse', 'unknown-provider', 'other'] }, { inputs: ['hand'] }]) {
    const old = { ...base, ...selection }, canonical = canonicalInputs(old);
    assert.ok(selectionOf(old).inputs?.includes('hand'));
    assert.equal(canonical.input, undefined);
    assert.deepEqual(canonical.plugins, base.plugins);
    assert.equal(Object.hasOwn(canonical, 'inputVersion'), false);
    const resolved = resolveHandInput(selectionOf(old).inputs!, { exists: true, provider: { owner: 'core', id: 'simulated' }, revision: 'state', raw: {} }, {
      revision: 'registry', problems: [], providers: [{ owner: 'core', id: 'simulated', label: 'Synthetic', purpose: 'synthetic', runtimeName: 'simulated', transport: 'native', available: true, reason: '', aliases: [] }],
    }, 'native');
    assert.equal(resolved.input, 'simulated', 'no old concrete assignment survives');
  }
  const tabs = canonicalInputs({ ...base, input: 'tracker', platformSettings: { 'host:station': { input: 'other' }, 'host:': { inputs: ['mouse', 'tracker', 'other'] } } });
  assert.deepEqual(tabs.platformSettings, { 'host:station': { inputs: ['mouse', 'keyboard', 'hand'] }, 'host:': { inputs: ['mouse', 'hand'] } });
});

test('project reads preserve original bytes; next settings save canonicalizes all saved input scopes and retains plugins', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-input-save-'));
  try {
    const file = path.join(root, 'xrb-project.json'), original = JSON.stringify({ name: 'Old', kind: 'app', input: 'tracker', plugins: { tracker: { threshold: 0.7 } }, platformSettings: { 'host:': { inputs: ['other', 'tracker'] } } }, null, 4);
    await fs.writeFile(file, original);
    const p = await readProject(root, 'old', 'examples');
    assert.equal(selectionOf(p!.manifest!).input, 'hand');
    assert.equal(await fs.readFile(file, 'utf8'), original);
    await saveManifest(root, { ...p!.manifest!, name: 'Renamed' }, p!.manifestMtimeMs);
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.deepEqual(saved.inputs, ['mouse', 'keyboard', 'hand']); assert.equal(saved.input, undefined);
    assert.deepEqual(saved.platformSettings['host:'].inputs, ['hand']);
    assert.deepEqual(saved.plugins, { tracker: { threshold: 0.7 } });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

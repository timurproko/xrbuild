import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { componentSettingsFixture } from './component-settings.fixture.ts';
import { portableProjectManifest } from '../src/embedded-projects.ts';
import { refreshManifest } from '../src/embedded-source-refresh.ts';

test('normal settings validate choices, preserve fields, reject stale writes and isolate projects', async t => {
  const f = await componentSettingsFixture(t), p = await f.get();
  assert.equal(p.componentGroups[0].id, 'bundled:ui-kit');
  assert.equal((await f.save(p, 'unknown')).status, 400);
  const result = await f.save(p, 'accent');
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.manifest.description, 'Keep me');
  assert.equal((await f.get()).componentGroups[0].values.theme, 'accent');
  assert.equal((await f.get('bundled:launcher')).componentGroups[0].values.theme, 'default');
  // Ensure a genuinely changed revision even on coarse Windows timestamp volumes.
  const file = path.join(f.workspace, 'projects/unsorted/launcher/xrb-project.json');
  await fs.utimes(file, new Date('2001-01-01'), new Date('2001-01-01'));
  assert.equal((await f.save(p, 'default')).status, 409);
  assert.equal((await f.get()).componentGroups[0].values.theme, 'accent');
  assert.deepEqual((await f.get('plain')).componentGroups, []);
});

test('bundled settings survive ordinary materialization, copy and source refresh without product writes', async t => {
  const f = await componentSettingsFixture(t), p = await f.get('bundled:launcher');
  const file = path.join(f.source, 'xrb-project.json'), before = await fs.readFile(file, 'utf8');
  const result = await f.save(p, 'accent');
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.readOnly, false);
  assert.equal((await f.get('bundled:launcher')).componentGroups[0].values.theme, 'accent');
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.equal((await f.save(p, 'default')).status, 409);
  const copy = await f.request('POST', '/api/projects/bundled%3Alauncher/copy', { folder: 'copy' });
  assert.equal(copy.status, 201, JSON.stringify(copy.json));
  assert.equal(copy.json.componentGroups[0].values.theme, 'accent');
  const portable = portableProjectManifest(result.json.manifest, 'Copy');
  assert.deepEqual(portable.componentSettings, result.json.manifest.componentSettings);
  const next = { ...p.manifest, description: 'New product copy' };
  const refreshed = refreshManifest(p.manifest, result.json.manifest, next, f.source)!;
  assert.deepEqual(refreshed.componentSettings, result.json.manifest.componentSettings);
  assert.equal(refreshed.description, 'New product copy');
});

test('bundled consumers keep normal settings writable when their unchanged library becomes unavailable', async t => {
  const f = await componentSettingsFixture(t);
  const selected = await f.save(await f.get('bundled:launcher'), 'accent');
  assert.equal(selected.status, 200, JSON.stringify(selected));
  await fs.rm(path.join(f.core, 'embedded/projects/unsorted/ui-kit'), { recursive: true });
  const current = await f.get('bundled:launcher');
  assert.deepEqual(current.componentGroups, []);
  const saved = await f.request('PUT', '/api/projects/bundled%3Alauncher/manifest', {
    manifest: { ...current.manifest, description: 'Unrelated bundled edit' },
    mtimeMs: current.manifestMtimeMs, revision: current.manifestRevision,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.json.manifest.componentLibraries, current.manifest.componentLibraries);
  assert.deepEqual(saved.json.manifest.componentSettings, current.manifest.componentSettings);
  assert.deepEqual(saved.json.componentGroups, []);
});

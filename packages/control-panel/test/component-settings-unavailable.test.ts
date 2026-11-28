import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { componentSettingsFixture } from './component-settings.fixture.ts';

for (const state of ['missing', 'archived', 'archived-defaults-only']) {
  test(`unrelated consumer saves preserve unchanged ${state} library metadata but reject new selections`, async t => {
    const f = await componentSettingsFixture(t);
    const copied = await f.request('POST', '/api/projects/bundled%3Aui-kit/copy', { folder: 'local-ui-kit' });
    assert.equal(copied.status, 201, JSON.stringify(copied));
    const library = 'workspace:local-ui-kit', p = await f.get();
    const enrolled = await f.request('PUT', '/api/projects/launcher/manifest', {
      manifest: { ...p.manifest, componentLibraries: { [library]: { props: { theme: 'theme' }, defaults: { theme: 'default' } } },
        ...(state === 'archived-defaults-only' ? {} : { componentSettings: { [library]: { theme: 'chamfer' } } }) },
      mtimeMs: p.manifestMtimeMs,
    });
    assert.equal(enrolled.status, 200, JSON.stringify(enrolled));
    assert.equal((await f.get()).componentGroups[0].id, library);
    if (state === 'missing') await fs.rm(path.join(f.workspace, 'projects/unsorted/local-ui-kit'), { recursive: true });
    else {
      const archived = await f.request('POST', '/api/projects/local-ui-kit/archive', {});
      assert.equal(archived.status, 200, JSON.stringify(archived));
    }
    const current = await f.get();
    assert.deepEqual(current.componentGroups, []);
    const save = (manifest: any, p = current) => f.request('PUT', '/api/projects/launcher/manifest', { manifest, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
    const unrelated = await save({ ...current.manifest, display: 'desktop', description: 'Unrelated edit' });
    assert.equal(unrelated.status, 200, JSON.stringify(unrelated));
    assert.deepEqual(unrelated.json.manifest.componentLibraries, current.manifest.componentLibraries);
    assert.deepEqual(unrelated.json.manifest.componentSettings, current.manifest.componentSettings);
    assert.deepEqual(unrelated.json.componentGroups, [], 'no unavailable-library UI is introduced');
    const next = unrelated.json;
    for (const theme of ['default', 'unknown']) {
      const changed = await save({ ...next.manifest, componentSettings: { [library]: { theme } } }, next);
      assert.equal(changed.status, 400, 'new selections cannot be validated against an unavailable library');
    }
    const defaults = await save({ ...next.manifest, componentLibraries: { [library]: { props: { theme: 'theme' }, defaults: { theme: 'chamfer' } } } }, next);
    assert.equal(defaults.status, 400, 'new unavailable defaults are rejected');
    const binding = await save({ ...next.manifest, componentLibraries: { [library]: { props: { theme: 'other' }, defaults: { theme: 'default' } } } }, next);
    assert.equal(binding.status, 400, 'changed unavailable declarations are not grandfathered');
    const invalidShape = await save({ ...next.manifest, componentSettings: { [library]: ['chamfer'] } }, next);
    assert.equal(invalidShape.status, 400, 'structural validation still applies');
    const reloaded = await f.get();
    assert.equal(reloaded.manifest.description, 'Unrelated edit');
    assert.deepEqual(reloaded.manifest.componentLibraries, current.manifest.componentLibraries);
    assert.deepEqual(reloaded.manifest.componentSettings, current.manifest.componentSettings);
  });
}

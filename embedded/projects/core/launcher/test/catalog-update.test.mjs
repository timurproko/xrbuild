import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { excludeCurrentPublication, isLoopbackDevelopment, isPanelPreview, loadRuntimeCatalog, workspaceCatalogBase } from '../src/catalog.js';

test('catalog refresh redraws an unchanged local library after an intervening failure', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('async function updateCatalog()'), source.indexOf('activateOnRelease(previous'))
    .replaceAll('import.meta.env.', 'env.');
  const href = 'http://127.0.0.1:54321/?xrb-panel=http%3A%2F%2F127.0.0.1%3A5191%2F&xrb-project=bundled%3Alauncher';
  let available = true;
  const frames = [], requests = [];
  const context = {
    AbortController, location: { href }, env: {}, console: { warn() {} },
    loading: false, controller: null, apps: [], page: 0, PAGE_SIZE: 8,
    catalogLoaded: false, catalogError: null, catalogSignature: '',
    isPanelPreview, workspaceCatalogBase, isLoopbackDevelopment, excludeCurrentPublication,
    catalogBase: () => assert.fail('local previews must not evaluate publication origin configuration'),
    localizePublishedApp: () => assert.fail('bound panel routes must not be replaced'),
    loadRuntimeCatalog: options => loadRuntimeCatalog({ ...options, fetchImpl: async input => {
      requests.push(String(input));
      return available ? Response.json({ projects: [
        { id: 'bundled:launcher', entryExists: true, manifest: { kind: 'app', name: 'Launcher' } },
        { id: 'custom', entryExists: true, manifest: { kind: 'app', name: 'Custom' } },
      ] }) : new Response('', { status: 503 });
    } }),
    renderPage: () => frames.push(context.apps.map(app => app.projectId)),
  };
  runInNewContext(update, context);
  await runInNewContext('updateCatalog()', context);
  assert.deepEqual(Array.from(context.apps, app => app.projectId), ['custom']);
  available = false;
  await runInNewContext('updateCatalog()', context);
  assert.ok(context.catalogError);
  assert.equal(context.apps.length, 0);
  available = true;
  await runInNewContext('updateCatalog()', context);
  assert.equal(context.catalogError, null);
  assert.deepEqual(Array.from(context.apps, app => app.projectId), ['custom']);
  assert.deepEqual(frames.map(frame => Array.from(frame)), [['custom'], [], ['custom']], 'recovery restores cards even with an identical signature');
  assert.ok(requests.every(url => url === 'http://127.0.0.1:5191/api/projects'));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inProject = (file) => path.join(root, file);

test('the published build includes the headset launcher resources', async () => {
  const [index, manifestText, sourceManifest, icon, sourceIcon, project] = await Promise.all([
    readFile(inProject('dist/index.html'), 'utf8'),
    readFile(inProject('dist/manifest.webmanifest'), 'utf8'),
    readFile(inProject('public/manifest.webmanifest'), 'utf8'),
    readFile(inProject('dist/icon.png')),
    readFile(inProject('icon.png')),
    readFile(inProject('xrb-project.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(index, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);
  assert.equal(manifestText, sourceManifest);
  assert.equal(manifest.name, JSON.parse(project).name);
  assert.equal(JSON.parse(project).publication, undefined);
  assert.equal(JSON.parse(project).plugins, undefined);
  assert.equal(manifest.description, 'Library of spatial UI controls.');
  assert.equal(manifest.start_url, './?xrb-xr=enter');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.icons[0].src, 'icon.png');
  assert.deepEqual(icon, sourceIcon);
});

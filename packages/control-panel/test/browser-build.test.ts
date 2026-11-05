import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { defaultIcon } from '../../app-icon/src/icon.ts';
import { APP_FAVICON_FILE, finalizeBrowserBuild } from '../src/browser-build.ts';
import { verifyBuildReceipt, writeBuildReceipt } from '../src/publication.ts';

const roots: string[] = [];
async function root() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-browser-build-'));
  roots.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

const faviconLinks = (html: string) => [...html.matchAll(/<link\b[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    return (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? '').toLowerCase().split(/\s+/).includes('icon');
  });

test('uses the custom project icon and replaces only page favicons', async () => {
  const dir = await root(), entry = path.join(dir, 'dist'), icon = path.join(dir, 'icon.png');
  const image = defaultIcon(32, 'purple', 'cube');
  await fs.mkdir(entry);
  await fs.writeFile(icon, image);
  await fs.writeFile(path.join(dir, 'index.html'), '<p>source stays unchanged</p>');
  await fs.writeFile(path.join(entry, 'index.html'), `<!doctype html>
<html><head>
  <title>Demo</title>
  <link rel="icon" href="/generic.ico">
  <link href='/old.png' rel='shortcut icon'>
  <link rel="apple-touch-icon" href="./touch.png">
  <link rel="mask-icon" href="./mask.svg">
  <link rel="manifest" href="./manifest.webmanifest">
</head><body>Demo</body></html>`);

  const first = await finalizeBrowserBuild(entry, { file: icon });
  const html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.equal(first.changed, true);
  assert.equal(first.iconChanged, true);
  assert.equal(first.htmlChanged, true);
  assert.deepEqual(await fs.readFile(path.join(entry, APP_FAVICON_FILE)), image);
  assert.equal(faviconLinks(html).length, 1);
  assert.match(html, /rel="icon" type="image\/png" href="\.\/xrb-app-icon\.png\?v=[0-9a-f]{12}" data-xrb-app-icon/);
  assert.match(html, /<meta name="xrb-app-card" content="custom" data-color="blue" data-shape="sphere" data-model="0">/, 'launchers learn that the icon is authored and the build has no 3D icon');
  assert.doesNotMatch(html, /data-xrb-description/, 'no card copy without a manifest description');
  assert.doesNotMatch(html, /generic\.ico|old\.png/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /mask-icon/);
  assert.match(html, /manifest\.webmanifest/);
  assert.equal(await fs.readFile(path.join(dir, 'index.html'), 'utf8'), '<p>source stays unchanged</p>');

  const before = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  const second = await finalizeBrowserBuild(entry, { file: icon });
  assert.deepEqual(second, { ...first, changed: false, htmlChanged: false, iconChanged: false });
  assert.equal(await fs.readFile(path.join(entry, 'index.html'), 'utf8'), before);
});

test('uses the selected generated default when a custom icon is absent', async () => {
  const dir = await root(), entry = path.join(dir, 'dist');
  await fs.mkdir(entry);
  await fs.writeFile(path.join(entry, 'index.html'), '<h1>No explicit head</h1>');
  await finalizeBrowserBuild(entry, { file: path.join(dir, 'missing.png'), color: 'green', shape: 'diamond' });
  assert.deepEqual(await fs.readFile(path.join(entry, APP_FAVICON_FILE)), defaultIcon(256, 'green', 'diamond'));
  const html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.match(html, /^<head>[\s\S]*data-xrb-app-icon[\s\S]*<\/head>/);
  assert.equal(faviconLinks(html).length, 1);
  assert.match(html, /<meta name="xrb-app-card" content="default" data-color="green" data-shape="diamond" data-model="0">/, 'launchers render the generated default icon like a local preview');
});

test('stamps the manifest card copy and the 3D icon flag, without overriding an authored description', async () => {
  const dir = await root(), entry = path.join(dir, 'dist');
  await fs.mkdir(entry);
  await fs.writeFile(path.join(entry, 'icon.js'), 'export default {}');
  await fs.writeFile(path.join(entry, 'index.html'), '<!doctype html>\n<html><head><title>Demo</title></head><body></body></html>');
  await finalizeBrowserBuild(entry, { description: 'Spins a "cube" & more' });
  let html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.match(html, /<meta name="xrb-app-card" content="default" data-color="blue" data-shape="sphere" data-model="1">/, 'a build with icon.js advertises its 3D icon');
  assert.match(html, /<meta name="description" content="Spins a &quot;cube&quot; &amp; more" data-xrb-description>/, 'the manifest description becomes the page description');
  await finalizeBrowserBuild(entry, { description: 'Updated copy' });
  html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.equal((html.match(/name="description"/g) ?? []).length, 1, 'the stamped description is replaced, not duplicated');
  assert.match(html, /content="Updated copy" data-xrb-description/);
  await finalizeBrowserBuild(entry, {});
  html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /name="description"/, 'clearing the manifest description removes the stamped one');
  await fs.writeFile(path.join(entry, 'index.html'), '<!doctype html>\n<html><head><meta name="description" content="Authored by the app"><title>Demo</title></head><body></body></html>');
  await finalizeBrowserBuild(entry, { description: 'Manifest copy' });
  html = await fs.readFile(path.join(entry, 'index.html'), 'utf8');
  assert.match(html, /content="Authored by the app"/);
  assert.doesNotMatch(html, /Manifest copy/, 'an authored page description wins over the manifest copy');
});

test('refreshes the finalized icon and build receipt when icon bytes change', async () => {
  const workspace = await root(), entry = path.join(workspace, 'dist'), icon = path.join(workspace, 'icon.png');
  await fs.mkdir(entry);
  await fs.writeFile(path.join(entry, 'index.html'), '<!doctype html><html><head><title>Demo</title></head><body></body></html>');
  await fs.writeFile(icon, defaultIcon(24, 'blue', 'sphere'));
  const first = await finalizeBrowserBuild(entry, { file: icon });
  await writeBuildReceipt(workspace, 'demo', 10, entry);
  await verifyBuildReceipt(workspace, 'demo', 10, entry);

  await fs.writeFile(icon, defaultIcon(24, 'amber', 'hexagon'));
  const second = await finalizeBrowserBuild(entry, { file: icon });
  assert.equal(second.changed, true);
  assert.notEqual(second.href, first.href);
  await assert.rejects(verifyBuildReceipt(workspace, 'demo', 10, entry), /changed after Build/);
  await writeBuildReceipt(workspace, 'demo', 10, entry);
  await verifyBuildReceipt(workspace, 'demo', 10, entry);
});

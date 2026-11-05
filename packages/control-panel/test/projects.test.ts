import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  defaultManifest,
  discoverProjects,
  identityOf,
  ManifestConflictError,
  selectionOf,
  nextVersion,
  saveManifest,
  unregisteredApps,
  validateManifest,
  type Manifest,
} from '../src/projects.ts';

const dir = path.resolve('/ws/projects/Demos/demo');
const fields = (m: unknown) => validateManifest(m, dir).map((e) => e.field);

test('generated icon colour and shape use supported values', () => {
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', iconColor: 'green', iconShape: 'diamond' }), []);
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', iconColor: 'pink' }), ['iconColor']);
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', iconShape: 'triangle' }), ['iconShape']);
});

test('accepts minimal app and test manifests', () => {
  assert.deepEqual(fields({ name: 'Demo', description: 'A concise launcher card description.', kind: 'app' }), []);
  assert.deepEqual(fields({ name: 'Demo', description: 42, kind: 'app' }), ['description']);
  assert.deepEqual(fields({ name: 'Demo', description: 'x'.repeat(161), kind: 'app' }), ['description']);
  assert.deepEqual(fields({ name: 'Rig check', kind: 'test', entry: '.' }), []);
  assert.deepEqual(
    fields({
      name: 'Demo', kind: 'app', entry: 'dist', icon: 'icon.png', scripts: { build: 'build', dev: 'dev' },
      input: 'tracker', display: 'stereo-panel', platform: 'station',
      plugins: { station: { id: 'Demo App', title: 'Demo App', version: '0.1.1', lastPackaged: '0.1.0' }, tracker: { exposureUs: 8000 } },
      host: { recordHands: 'out/touch.hands', args: ['--eye-res=960x540'] },
    }),
    [],
  );
});

test('publication identity is normalized and may stay dormant on another target', () => {
  const publication = { enabled: true, publisher: 'web', id: '11111111-1111-4111-8111-111111111111', slug: 'demo-app', routes: { web: 'demo-app', local: 'demo-local' } };
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', target: 'webxr', publication }), []);
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', publication }), [], 'configuration is preserved while publication controls are hidden');
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', target: 'webxr', publication: { ...publication, slug: '../demo' } }), ['publication.slug']);
  assert.deepEqual(fields({ name: 'Demo', kind: 'app', target: 'webxr', publication: { ...publication, routes: { web: 'Bad Slug' } } }), ['publication.routes.web']);
});

test('requires name and kind', () => {
  assert.deepEqual(fields({}), ['name', 'kind']);
  assert.deepEqual(fields({ name: ' ', kind: 'demo' }), ['name', 'kind']);
  assert.deepEqual(fields(null), ['']);
  assert.deepEqual(fields([]), ['']);
});

test('roles and plugin sections; the identity is the platform section (the packager checks its own fields)', () => {
  const app = (plugins: unknown, extra = {}) => fields({ name: 'D', kind: 'app', platform: 'station', plugins, ...extra });
  const v = validateManifest({ name: 'D', kind: 'app', platform: 'station', plugins: { station: { id: 'D', version: 'v1-beta' } } }, dir);
  assert.deepEqual(v.map((e) => e.field), ['plugins.station.version']);
  assert.match(v[0].message, /1\.0\.0/);
  assert.deepEqual(app({ station: { id: '', version: '1.0' } }), [], 'ids and titles are the packager\'s to check');
  assert.deepEqual(app({ station: { version: '1.0', lastPackaged: 'x' } }), ['plugins.station.lastPackaged']);
  assert.deepEqual(app({ station: 'x' }), ['plugins.station']);
  assert.deepEqual(app({ 'Bad Name': {} }), ['plugins.Bad Name']);
  assert.deepEqual(app([]), ['plugins']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', input: 'Some Tracker', display: '', platform: '' }), ['input', 'display']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', package: { id: 'D', version: '1.0' } }), ['package'], 'the old field is not written back');
  assert.deepEqual(selectionOf({ name: 'D', kind: 'app' }), { input: 'none', inputs: ['mouse', 'keyboard'], display: 'desktop', platform: '' });
  assert.deepEqual(selectionOf({ name: 'D', kind: 'app', inputs: ['mouse', 'tracker', 'simulated'] }),
    { input: 'tracker', inputs: ['mouse', 'tracker', 'simulated'], display: 'desktop', platform: '' });
  assert.deepEqual(fields({ name: 'D', kind: 'app', inputs: ['tracker', 'tracker'] }), ['inputs']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', inputs: ['bad name'] }), ['inputs']);
  assert.deepEqual(identityOf({ name: 'D', kind: 'app', platform: 'station', plugins: { station: { id: 'X' } } }), { id: 'X' });
  assert.equal(identityOf({ name: 'D', kind: 'app', plugins: { station: { id: 'X' } } }), null, 'standalone: no identity');
});

test('entry, icon and recording stay inside the project; icon is a PNG', () => {
  assert.deepEqual(fields({ name: 'D', kind: 'app', entry: '../other/dist' }), ['entry']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', entry: path.resolve('/elsewhere') }), ['entry']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', icon: '../icon.png' }), ['icon']);
  assert.deepEqual(fields({ name: 'D', kind: 'app', icon: 'icon.jpg' }), ['icon']);
  assert.deepEqual(fields({ name: 'D', kind: 'test', host: { recordHands: '../x.hands' } }), ['host.recordHands']);
});

test('script names cannot carry shell commands', () => {
  assert.deepEqual(fields({ name: 'D', kind: 'app', scripts: { build: 'build & del x', dev: 'dev:watch' } }), ['scripts.build']);
});

test('host options', () => {
  assert.deepEqual(fields({ name: 'D', kind: 'app', host: { args: ['eye-res=1'] } }), ['host.args']);
});

test('next version is the patch after the highest', () => {
  assert.equal(nextVersion(), '0.1.0');
  assert.equal(nextVersion('0.1.0'), '0.1.1');
  assert.equal(nextVersion('0.1.9', '0.1.10', undefined), '0.1.11');
  assert.equal(nextVersion('1.2', '1.1.5'), '1.2.1');
  assert.equal(nextVersion('bad'), '0.1.0');
});

async function tempRepo() {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-projects-'));
  const write = async (rel: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(repo, rel)), { recursive: true });
    await fs.writeFile(path.join(repo, rel), text);
  };
  return { repo, write };
}

test('discovers projects by manifest, lists broken ones, finds unregistered apps', async () => {
  const { repo, write } = await tempRepo();
  await write('projects/Demos/good/xrb-project.json', JSON.stringify({ name: 'Good', kind: 'app' }));
  await write('projects/Demos/good/package.json', '{}');
  await write('projects/Unsorted/plain/package.json', JSON.stringify({ name: '@x/plain', scripts: { build: 'vite build', dev: 'vite' } }));
  await write('projects/Demos/broken/xrb-project.json', '{ not json');
  await write('projects/Checks/rig-check/xrb-project.json', JSON.stringify({ name: 'Rig check', kind: 'test', entry: '.' }));
  await write('projects/Checks/bad-kind/xrb-project.json', JSON.stringify({ name: 'X', kind: 'demo' }));
  await write('projects/Checks/notes.txt', 'not a folder');
  await write('projects/Unsorted/bom/xrb-project.json', '﻿' + JSON.stringify({ name: 'With BOM', kind: 'test', entry: '.' }));
  await write('projects/Checks/good/xrb-project.json', JSON.stringify({ name: 'Second good', kind: 'app' }));
  await write('projects/archive/old/xrb-project.json', JSON.stringify({ name: 'Old', kind: 'app' }));

  const projects = await discoverProjects(repo);
  assert.deepEqual(projects.map((p) => [p.id, p.section]), [['bad-kind', 'Checks'], ['bom', 'Unsorted'], ['broken', 'Demos'], ['good', 'Checks'], ['good@Demos', 'Demos'], ['rig-check', 'Checks']]);
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  assert.equal(byId['bom'].manifest?.name, 'With BOM', 'a UTF-8 byte-order mark is accepted');
  assert.equal(byId['good'].manifest?.name, 'Second good', 'sections are read in order; the first one of a name wins');
  assert.match(byId['good@Demos'].errors[0].message, /another project named good is in Checks/);
  assert.equal(byId['broken'].manifest, null);
  assert.match(byId['broken'].errors[0].message, /xrb-project\.json/);
  assert.deepEqual(byId['bad-kind'].errors.map((e) => e.field), ['kind']);
  assert.ok(!projects.some((p) => p.id.includes('old')), 'archived projects are not live ones');

  assert.deepEqual(await unregisteredApps(repo), ['Unsorted/plain']);
  const plain = await defaultManifest(path.join(repo, 'projects/Unsorted/plain'));
  assert.deepEqual(plain, { name: 'plain', kind: 'app', entry: 'dist', scripts: { build: 'build', dev: 'dev' } }, 'nothing to copy: standalone');
  // A new app runs like an existing one, with its own identity on the same platform.
  const like: Manifest = { name: 'Other', kind: 'app', input: 'tracker', display: 'stereo-panel', platform: 'station', plugins: { station: { id: 'Other', version: '2.0.0' }, tracker: { x: 1 } } };
  const m = await defaultManifest(path.join(repo, 'projects/Unsorted/plain'), like);
  assert.deepEqual(m, { ...plain, input: 'tracker', display: 'stereo-panel', platform: 'station', plugins: { station: { id: 'plain', title: 'plain', version: '0.1.0' } } });
  assert.deepEqual(validateManifest(m, path.join(repo, 'projects/Unsorted/plain')), []);
});

test('saves valid manifests and refuses stale or invalid ones', async () => {
  const { repo, write } = await tempRepo();
  await write('projects/Unsorted/a/xrb-project.json', JSON.stringify({ name: 'A', kind: 'app' }));
  const dir = path.join(repo, 'projects/Unsorted/a');
  // Windows file times move in ~16 ms ticks: date the file back so the save below surely changes it.
  const past = new Date(Date.now() - 60_000);
  await fs.utimes(path.join(dir, 'xrb-project.json'), past, past);
  const [p] = await discoverProjects(repo);
  const m: Manifest = { ...p.manifest!, platform: 'station', plugins: { station: { id: 'Demo App', title: 'Demo App', version: '0.1.1' } } };

  const bad = await saveManifest(dir, { ...m, plugins: { station: { id: 'Demo App', version: 'v1' } } }, p.manifestMtimeMs);
  assert.deepEqual(bad.errors.map((e) => e.field), ['plugins.station.version']);

  const ok = await saveManifest(dir, m, p.manifestMtimeMs);
  assert.deepEqual(ok.errors, []);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'xrb-project.json'), 'utf8')).plugins.station.id, 'Demo App');

  await assert.rejects(saveManifest(dir, m, p.manifestMtimeMs), ManifestConflictError, 'old mtime: changed on disk');
});

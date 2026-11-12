import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REPO } from '../src/env.ts';
import { projectIconSource } from '../src/project-icons.ts';
import { readProject, validateManifest } from '../src/projects.ts';
import { Panel } from '../src/panel.ts';
import { EventHub } from '../src/http.ts';

test('cold template icon detection is read-only and does not misclassify authored geometry', async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/project-icons-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(REPO, 'templates/app'), root, { recursive: true });
  await fs.writeFile(path.join(root, 'xrb-project.json'), JSON.stringify({ name: 'Fresh', kind: 'app' }));
  const p = (await readProject(root, 'fresh', 'unsorted'))!;
  assert.deepEqual(await projectIconSource(REPO, p), { authored: true, generated: true });
  await assert.rejects(fs.access(path.join(root, 'dist')));
  await fs.appendFile(path.join(root, 'src/icon.js'), '\n// authored change');
  assert.deepEqual(await projectIconSource(REPO, p), { authored: true, generated: false });
  assert.ok(validateManifest({ ...p.manifest, catalog: 'yes' }, root).some(e => e.field === 'catalog'));
});

test('catalog capability is read from refreshed project state before a development preview opens', async t => {
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/refreshed-catalog-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const panel = new Panel(REPO, root, new EventHub());
  panel.panelUrl = 'http://127.0.0.1:5191/';
  const dir = path.join(root, 'projects/core/demo');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'xrb-project.json'), '{}');
  const p = { id: 'demo', dir, section: 'core', errors: [], manifestMtimeMs: 0,
    manifest: { name: 'Demo', kind: 'app' as const, target: 'webxr' as const, scripts: { dev: 'dev' } } };
  panel.prepareProject = async () => ({ ...p, manifest: { ...p.manifest, catalog: true } });
  (panel as any).ensureDevInstalled = async () => {};
  let prepared = false;
  panel.prepareCatalogIcons = async effective => { assert.equal(effective.manifest?.catalog, true); prepared = true; };
  panel.runner.startPreview = async () => { assert.equal(prepared, true); };
  await panel.preview(p, 'dev', false, 'fixture-preview-token', { clientPort: 0 });
});

test('only explicit catalog launch prepares active authored icons; ordinary launches and discovery do not', async t => {
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/catalog-preparation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const make = async (id: string, generated = false) => {
    const dir = path.join(root, 'projects', id);
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    if (generated) for (const file of ['icon.js', 'icon-theme.js']) await fs.copyFile(path.join(REPO, 'templates/app/src', file), path.join(dir, 'src', file));
    else await fs.writeFile(path.join(dir, 'src/icon.js'), 'export default function icon() {}');
    await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name: id, kind: 'app', scripts: { build: 'build' } }));
    return (await readProject(dir, path.basename(id), path.dirname(id)))!;
  };
  const launcher = await make('core/catalog'); await make('core/model'); await make('unsorted/fresh', true); await make('archive/old');
  const panel = new Panel(REPO, root, new EventHub());
  const built: string[] = [];
  panel.webBuild = ((p: any) => { built.push(p.id); return { state: 'done' }; }) as any;
  panel.jobs.wait = (async job => job) as any;
  await panel.prepareCatalogIcons(launcher); assert.deepEqual(built, []);
  launcher.manifest!.catalog = true;
  await panel.prepareCatalogIcons(launcher);
  assert.ok(built.includes('model')); assert.ok(!built.includes('fresh')); assert.ok(!built.includes('archive/old'));
});

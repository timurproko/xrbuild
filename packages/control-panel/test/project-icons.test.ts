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

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { REPO } from '../src/env.ts';
import { discoverProjects } from '../src/projects.ts';
import { createProject, createProjectWorkspace, createWorkspace, importPluginSample, isWorkspace, PLUGIN_PROJECTS_SECTION, ProjectRefused, STARTER_APP, writeEditorConfig } from '../src/workspace.ts';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'xrb-ws-'));

test('a new workspace gets the standard layout and a starter app the panel lists', async () => {
  const ws = await tmp();
  assert.equal(await isWorkspace(ws), false);
  const added = await createWorkspace(REPO, ws);
  assert.ok(added.includes('.gitignore') && added.includes('pnpm-workspace.yaml') && added.includes(`projects/unsorted/${STARTER_APP}/xrb-project.json`));
  assert.deepEqual(await fs.readdir(path.join(ws, 'projects')), ['.gitkeep', 'unsorted']);
  assert.equal(await isWorkspace(ws), true);
  for (const d of ['projects', 'plugins']) assert.ok((await fs.stat(path.join(ws, d))).isDirectory());
  const ignore = await fs.readFile(path.join(ws, '.gitignore'), 'utf8');
  for (const d of ['plugins/*/bin/', 'third_party/', 'config/plugins/', 'node_modules/', 'dist/', 'build/']) assert.ok(ignore.split(/\r?\n/).includes(d), d);
  const projects = await discoverProjects(ws);
  assert.deepEqual(projects.map((p) => [p.id, p.manifest?.name, p.manifest?.kind]), [[STARTER_APP, 'Hello XR', 'app']]);
  const pkg = JSON.parse(await fs.readFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'package.json'), 'utf8'));
  assert.equal(pkg.name, STARTER_APP);
  assert.equal(pkg.dependencies['@xr-build/sdk'], undefined, 'the SDK comes from the core, not a dependency');
  const main = await fs.readFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'src', 'main.js'), 'utf8');
  assert.match(main, /createXrbApp/);
  assert.match(main, /iconTheme\.(?:main|ring|rim)/);
  assert.doesNotMatch(main, /new THREE\.(?:PerspectiveCamera|OrthographicCamera)|addEventListener\('resize'|setAnimationLoop|xrb\.render/);
  const theme = await fs.readFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'src', 'icon-theme.js'), 'utf8');
  assert.match(theme, /import manifest from '\.\.\/xrb-project\.json'/);
  assert.match(theme, /manifest\.iconColor/);
  const vite = await fs.readFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'vite.config.js'), 'utf8');
  assert.doesNotMatch(vite, /XRB_CAMERA_PROJECTION|__XRB_CAMERA_PROJECTION__/);
});

test('a separate project repository omits private integration folders', async () => {
  const ws = await tmp();
  const added = await createProjectWorkspace(REPO, ws);
  assert.ok(added.includes('pnpm-workspace.yaml'));
  assert.ok(added.includes(`projects/unsorted/${STARTER_APP}/xrb-project.json`));
  await assert.rejects(fs.access(path.join(ws, 'plugins')));
  assert.deepEqual((await fs.readFile(path.join(ws, 'pnpm-workspace.yaml'), 'utf8')).trim().split(/\r?\n/), ['packages:', '  - projects/*/*', "  - '!projects/archive/**'"]);
});

test('creating into an existing folder only adds what is missing', async () => {
  const ws = await tmp();
  await fs.writeFile(path.join(ws, '.gitignore'), 'mine\n');
  await fs.mkdir(path.join(ws, 'projects', 'unsorted', STARTER_APP), { recursive: true });
  await fs.writeFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'notes.txt'), 'keep');
  const added = await createWorkspace(REPO, ws);
  assert.equal(await fs.readFile(path.join(ws, '.gitignore'), 'utf8'), 'mine\n');
  assert.ok(!added.includes('.gitignore'));
  assert.ok(!added.some((f) => f.startsWith(`projects/unsorted/${STARTER_APP}/`)), 'an existing starter folder is left alone');
  assert.equal(await fs.readFile(path.join(ws, 'projects', 'unsorted', STARTER_APP, 'notes.txt'), 'utf8'), 'keep');
});

test('a new project takes its name, and an existing folder or a bad name is refused', async () => {
  const ws = await tmp();
  await createProject(REPO, ws, 'globe', 'Globe <Demo>');
  const m = JSON.parse(await fs.readFile(path.join(ws, 'projects', 'unsorted', 'globe', 'xrb-project.json'), 'utf8'));
  assert.equal(m.name, 'Globe <Demo>');
  assert.match(await fs.readFile(path.join(ws, 'projects', 'unsorted', 'globe', 'index.html'), 'utf8'), /<title>Globe &lt;Demo&gt;<\/title>/);
  await assert.rejects(createProject(REPO, ws, 'globe'), ProjectRefused);
  await assert.rejects(createProject(REPO, ws, '../out'), ProjectRefused);
});

test('a plugin sample imports as an independent project in the plugins section', async t => {
  const ws = await tmp(), source = path.join(ws, 'source');
  await fs.mkdir(path.join(source, 'src'), { recursive: true });
  await fs.mkdir(path.join(source, 'node_modules', 'linked'), { recursive: true });
  await fs.mkdir(path.join(source, 'dist'), { recursive: true });
  await fs.mkdir(path.join(source, 'public', 'vendor'), { recursive: true });
  await fs.writeFile(path.join(source, 'xrb-project.json'), JSON.stringify({ name: 'Original Sample', kind: 'test', entry: 'dist' }));
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'original-sample', private: true }));
  await fs.writeFile(path.join(source, 'src', 'main.js'), 'export const sample = true;');
  await fs.writeFile(path.join(source, 'node_modules', 'linked', 'ignored.js'), 'ignored');
  await fs.writeFile(path.join(source, 'dist', 'index.html'), 'ignored');
  await fs.writeFile(path.join(source, 'public', 'vendor', 'runtime.js'), 'ignored');

  assert.equal(await importPluginSample(ws, source, 'tracker-lab', 'Tracker Lab'), 'tracker-lab');
  const destination = path.join(ws, 'projects', PLUGIN_PROJECTS_SECTION, 'tracker-lab');
  assert.equal(JSON.parse(await fs.readFile(path.join(destination, 'xrb-project.json'), 'utf8')).name, 'Tracker Lab');
  assert.equal(JSON.parse(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).name, 'tracker-lab');
  assert.equal(await fs.readFile(path.join(destination, 'src', 'main.js'), 'utf8'), 'export const sample = true;');
  await assert.rejects(fs.access(path.join(destination, 'node_modules')));
  await assert.rejects(fs.access(path.join(destination, 'dist')));
  await assert.rejects(fs.access(path.join(destination, 'public', 'vendor')));
  assert.equal(JSON.parse(await fs.readFile(path.join(source, 'xrb-project.json'), 'utf8')).name, 'Original Sample');
  assert.deepEqual((await discoverProjects(ws)).map((project) => [project.id, project.section]), [['tracker-lab', PLUGIN_PROJECTS_SECTION]]);
  await assert.rejects(importPluginSample(ws, source, 'tracker-lab', 'Duplicate'), ProjectRefused);
  await fs.mkdir(path.join(ws, 'projects', 'unsorted', 'Case-Sample'), { recursive: true });
  await fs.writeFile(path.join(ws, 'projects', 'unsorted', 'Case-Sample', 'xrb-project.json'), JSON.stringify({ name: 'Case sample', kind: 'test' }));
  await assert.rejects(importPluginSample(ws, source, 'case-sample', 'Case collision'), ProjectRefused);
  await fs.mkdir(path.join(ws, 'projects', 'archive', 'archived-sample'), { recursive: true });
  await fs.writeFile(path.join(ws, 'projects', 'archive', 'archived-sample', 'xrb-project.json'), JSON.stringify({ name: 'Archived sample', kind: 'test' }));
  await assert.rejects(importPluginSample(ws, source, 'archived-sample', 'Archive collision'), ProjectRefused);
  try {
    await fs.symlink(path.join(source, 'src', 'main.js'), path.join(source, 'linked.js'));
    await assert.rejects(importPluginSample(ws, source, 'linked-sample', 'Linked sample'), /symbolic link/);
    assert.ok(!(await fs.readdir(path.join(ws, 'projects', PLUGIN_PROJECTS_SECTION))).some((entry) => entry.startsWith('.linked-sample.')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') t.diagnostic('symlink privilege unavailable');
    else throw error;
  }

  const broken = path.join(ws, 'broken');
  await fs.mkdir(broken);
  await fs.writeFile(path.join(broken, 'xrb-project.json'), JSON.stringify({ name: 'Broken', kind: 'test' }));
  await fs.writeFile(path.join(broken, 'package.json'), '{');
  await assert.rejects(importPluginSample(ws, broken, 'broken', 'Broken'), /invalid package.json/);
  assert.ok(!(await fs.readdir(path.join(ws, 'projects', PLUGIN_PROJECTS_SECTION))).some((name) => name.startsWith('.broken.')));
});

test('the editor config maps the SDK names to the core sources', async () => {
  const ws = await tmp();
  assert.equal(await writeEditorConfig(REPO, ws), true);
  const c = JSON.parse(await fs.readFile(path.join(ws, 'jsconfig.json'), 'utf8'));
  const sdk = c.compilerOptions.paths['@xr-build/sdk'][0];
  assert.equal(path.resolve(sdk), path.join(REPO, 'packages', 'sdk', 'src', 'index.ts'));
  await fs.access(sdk);
  await fs.access(c.compilerOptions.paths['@xr-build/ui-kit'][0]);
  assert.equal(await writeEditorConfig(REPO, ws), false, 'unchanged: not rewritten');
});

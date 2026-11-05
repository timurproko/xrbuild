import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyLayout, archiveProject, LAYOUT_FILE, readLayout, removeEmptyProjectSection, unarchiveProject, validateLayout } from '../src/layout.ts';
import { discoverArchived, discoverProjects } from '../src/projects.ts';

test('layout rules: named, unique sections that can be folders; a project in at most one', () => {
  assert.equal(validateLayout({ sections: [] }), null);
  assert.equal(validateLayout({ sections: [{ name: 'Demos', items: ['a'] }, { name: 'Checks', items: [] }] }), null);
  assert.match(validateLayout(null)!, /sections/);
  assert.match(validateLayout({ sections: [{ name: ' ', items: [] }] })!, /name/);
  assert.match(validateLayout({ sections: [{ name: 'A', items: [] }, { name: 'a', items: [] }] })!, /two sections named/);
  assert.match(validateLayout({ sections: [{ name: 'A', items: ['x'] }, { name: 'B', items: ['x'] }] })!, /in two sections/);
  assert.match(validateLayout({ sections: [{ name: 'A', items: [1] }] })!, /bad item list/);
  assert.match(validateLayout({ sections: [{ name: 'A/B', items: [] }] })!, /folder name/);
  assert.match(validateLayout({ sections: [{ name: 'archive', items: [] }] })!, /reserved/);
  assert.match(validateLayout({ sections: [{ name: 'Unsorted', items: [] }] })!, /reserved/);
  assert.equal(validateLayout({ sections: [], colors: { a: 'purple' } }), null);
  assert.match(validateLayout({ sections: [], colors: { a: 'pink' } })!, /unknown colour/);
});

async function workspace() {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-layout-'));
  const project = async (rel: string, kind = 'app') => {
    await fs.mkdir(path.join(ws, 'projects', rel), { recursive: true });
    await fs.writeFile(path.join(ws, 'projects', rel, 'xrb-project.json'), JSON.stringify({ name: path.basename(rel), kind }));
  };
  return { ws, project };
}

test('sections are the folders under projects/, in the saved order; Unsorted is not a section', async () => {
  const { ws, project } = await workspace();
  await project('Demos/b');
  await project('Demos/a');
  await project('Checks/rig', 'test');
  await project('Unsorted/loose');
  let l = await readLayout(ws, await discoverProjects(ws));
  assert.deepEqual(l.sections, [{ name: 'Checks', items: ['rig'] }, { name: 'Demos', items: ['a', 'b'] }], 'alphabetical without a saved layout');
  await fs.writeFile(path.join(ws, LAYOUT_FILE), JSON.stringify({ sections: [{ name: 'Demos', items: ['b', 'a'] }, { name: 'Checks', items: [] }], colors: { b: 'teal' } }));
  l = await readLayout(ws, await discoverProjects(ws));
  assert.deepEqual(l.sections, [{ name: 'Demos', items: ['b', 'a'] }, { name: 'Checks', items: ['rig'] }]);
  assert.deepEqual(l.colors, { b: 'teal' });
  await fs.writeFile(path.join(ws, LAYOUT_FILE), '{ broken');
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).sections.map((s) => s.name), ['Checks', 'Demos'], 'unreadable file: the folders still count');
});

test('layout ignores orphan empty folders but keeps explicitly saved empty sections', async () => {
  const { ws } = await workspace();
  await fs.mkdir(path.join(ws, 'projects', 'orphan'), { recursive: true });
  await fs.mkdir(path.join(ws, 'projects', 'intentional'), { recursive: true });
  await fs.writeFile(path.join(ws, LAYOUT_FILE), JSON.stringify({ sections: [{ name: 'intentional', items: [] }] }));
  assert.deepEqual((await readLayout(ws, [])).sections, [{ name: 'intentional', items: [] }]);
});

test('moving the final project removes its source section but keeps a deliberately empty section', async () => {
  const { ws, project } = await workspace();
  await project('demos/a');
  await project('apps/b');
  await applyLayout(ws, { sections: [{ name: 'demos', items: ['a'] }, { name: 'apps', items: ['b'] }, { name: 'empty', items: [] }] }, await discoverProjects(ws));
  await applyLayout(ws, { sections: [{ name: 'demos', items: [] }, { name: 'apps', items: ['b', 'a'] }, { name: 'empty', items: [] }] }, await discoverProjects(ws));
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).sections.map((section) => section.name), ['apps', 'empty']);
  await assert.rejects(fs.access(path.join(ws, 'projects', 'demos')));
});

test('saving a layout moves project folders: drag, new, renamed and deleted sections', async () => {
  const { ws, project } = await workspace();
  await project('Demos/a');
  await project('Demos/b');
  await project('Unsorted/c');
  const apply = async (sections: { name: string; items: string[] }[]) => applyLayout(ws, { sections, colors: {} }, await discoverProjects(ws));
  const where = async () => Object.fromEntries((await discoverProjects(ws)).map((p) => [p.id, p.section]));

  await apply([{ name: 'Demos', items: ['a'] }, { name: 'Tours', items: ['c'] }]);
  assert.deepEqual(await where(), { a: 'demos', b: 'Unsorted', c: 'tours' }, 'b left every section: Unsorted; c dragged into the new Tours');

  await apply([{ name: 'Showcase', items: ['a'] }, { name: 'Tours', items: ['c'] }]);
  assert.deepEqual(await where(), { a: 'showcase', b: 'Unsorted', c: 'tours' }, 'renaming Demos moves its projects');
  await assert.rejects(fs.access(path.join(ws, 'projects', 'Demos')), 'the old section folder is gone');

  await apply([{ name: 'Showcase', items: ['a', 'b', 'c'] }, { name: 'Empty', items: [] }]);
  assert.deepEqual(await where(), { a: 'showcase', b: 'showcase', c: 'showcase' });
  await assert.rejects(fs.access(path.join(ws, 'projects', 'tours')), 'a deleted, emptied section folder is removed');
  await assert.rejects(fs.access(path.join(ws, 'projects', 'Unsorted')), 'an empty Unsorted folder is removed');
  await fs.access(path.join(ws, 'projects', 'empty', '.gitkeep'));
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).sections.map((s) => s.name), ['showcase', 'empty'], 'the saved order (section folders are lower case)');
});

test('a section holding other files renames as one folder and deletes completely', async () => {
  const { ws, project } = await workspace();
  await project('Tests/rig');
  await fs.writeFile(path.join(ws, 'projects', 'Tests', 'README.md'), '# Test projects');
  const recycled: string[] = [];
  const recycle = async (dir: string) => { recycled.push(path.basename(dir)); await fs.rm(dir, { recursive: true }); };
  const apply = async (sections: { name: string; items: string[]; from?: string }[]) =>
    applyLayout(ws, { sections, colors: {} }, await discoverProjects(ws), recycle);
  const sections = async () => (await readLayout(ws, await discoverProjects(ws))).sections.map((s) => s.name);

  await apply([{ name: 'Checks', items: ['rig'], from: 'Tests' }]);
  assert.deepEqual(await sections(), ['checks'], 'renamed, not a second section beside the old one');
  assert.equal(await fs.readFile(path.join(ws, 'projects', 'checks', 'README.md'), 'utf8'), '# Test projects', 'the README moved with it');
  await assert.rejects(fs.access(path.join(ws, 'projects', 'Tests')));

  await apply([]);
  assert.deepEqual(await sections(), [], 'deleted: no section shows up again');
  assert.deepEqual(recycled, ['checks'], 'its left-over files went to the Recycle Bin');
  assert.deepEqual((await discoverProjects(ws)).map((p) => [p.id, p.section]), [['rig', 'Unsorted']], 'its project moved to Unsorted');
});

test('the platform tab order is saved with the layout and kept by archive moves', async () => {
  assert.match(validateLayout({ sections: [], platformOrder: [1] })!, /platformOrder/);
  const { ws, project } = await workspace();
  await project('Demos/a');
  const order = ['webxr:', 'host:station', 'host:'];
  await applyLayout(ws, { sections: [{ name: 'Demos', items: ['a'] }], platformOrder: order }, await discoverProjects(ws));
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).platformOrder, order);
  await archiveProject(ws, (await discoverProjects(ws))[0]);
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).platformOrder, order, 'other saves keep it');
  await applyLayout(ws, { sections: [] }, await discoverProjects(ws));
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).platformOrder, order, 'a layout without one keeps the saved order');
});

test('section folders are lower case: a name with capitals is saved lower case and its folder renamed', async () => {
  const { ws, project } = await workspace();
  await project('CORE/launcher');
  await applyLayout(ws, { sections: [{ name: 'CORE', items: ['launcher'] }, { name: 'New Apps', items: [] }] }, await discoverProjects(ws));
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).sections.map((s) => s.name), ['core', 'new apps']);
  assert.deepEqual((await discoverProjects(ws)).map((p) => [p.id, p.section]), [['launcher', 'core']]);
  assert.deepEqual((await fs.readdir(path.join(ws, 'projects'))).sort(), ['core', 'new apps']);
});

test('archive and delete cleanup remove a section after its final project leaves', async () => {
  const { ws, project } = await workspace();
  await project('plugins/sample');
  await applyLayout(ws, { sections: [{ name: 'plugins', items: ['sample'] }] }, await discoverProjects(ws));
  await archiveProject(ws, (await discoverProjects(ws))[0]);
  assert.deepEqual((await readLayout(ws, await discoverProjects(ws))).sections, []);
  const [archived] = await discoverArchived(ws);
  await unarchiveProject(ws, archived);
  assert.equal((await discoverProjects(ws))[0].section, 'Unsorted', 'the removed section is not recreated on unarchive');

  await project('solo/only');
  await applyLayout(ws, { sections: [{ name: 'solo', items: ['only'] }] }, await discoverProjects(ws));
  const only = (await discoverProjects(ws)).find((item) => item.id === 'only')!;
  await fs.rm(only.dir, { recursive: true, force: true });
  assert.equal(await removeEmptyProjectSection(ws, only.section), true);
  assert.ok(!(await readLayout(ws, await discoverProjects(ws))).sections.some((section) => section.name === 'solo'));
});

test('archive is flat and unarchive returns a project to its section', async () => {
  const { ws, project } = await workspace();
  await project('Demos/a');
  await project('Demos/keep');
  const [a] = (await discoverProjects(ws)).filter((p) => p.id === 'a');
  await archiveProject(ws, a);
  const [archived] = await discoverArchived(ws);
  assert.equal(archived.id, 'archive/a');
  await fs.access(path.join(ws, 'projects', 'archive', 'a', 'xrb-project.json'));
  await unarchiveProject(ws, archived);
  assert.equal((await discoverProjects(ws)).find((p) => p.id === 'a')?.section, 'Demos');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(ws, LAYOUT_FILE), 'utf8')).archivedFrom, {});
});

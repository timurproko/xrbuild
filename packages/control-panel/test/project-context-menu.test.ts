import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
const openMenu = app.slice(app.indexOf('function openMenu('), app.indexOf('// A dropdown\'s option list closes itself:'));

test('shared project menu recomputes Delete visibility for embedded, ordinary, archived and running projects', () => {
  const projects = [
    { id: 'bundled:demo', origin: 'bundled', archived: false, running: false },
    { id: 'demo', origin: 'workspace', archived: false, running: false },
    { id: 'bundled:archive/demo', origin: 'bundled', archived: true, running: false },
    { id: 'archive/demo', origin: 'workspace', archived: true, running: false },
    { id: 'running', origin: 'workspace', archived: false, running: true },
    { id: 'bundled:running', origin: 'bundled', archived: false, running: true },
  ].map(project => ({ ...project, manifest: { kind: 'app', scripts: { build: 'build' } } }));
  const items = new Map(['rename', 'favicon', 'rebuild-app', 'delete', 'archive'].map(action => [action, { hidden: false, disabled: false, dataset: {} as Record<string, string>, textContent: '' }]));
  const menu = {
    dataset: {} as Record<string, string>,
    querySelector(selector: string) {
      const action = /^\[data-act="([^"]+)"\]$/.exec(selector)?.[1];
      assert.ok(action && items.has(action), `unexpected menu action: ${selector}`);
      return items.get(action)!;
    },
  };
  let positioned = 0;
  const context = {
    $: (selector: string) => { assert.equal(selector, '#ctx-menu'); return menu; },
    allProjects: () => projects,
    closeMenu() {},
    placeMenu(target: unknown, x: number, y: number) { assert.equal(target, menu); assert.equal(x, 80); assert.equal(y, 300); positioned++; },
  };
  runInNewContext(openMenu, context);
  // Revisit an ordinary project after both embedded and running contexts on the same menu.
  for (const project of [...projects, projects[1], projects[0], projects[3]]) {
    runInNewContext(`openMenu(80, 300, ${JSON.stringify(project.id)})`, context);
    const deletion = items.get('delete')!, archive = items.get('archive')!;
    assert.equal(menu.dataset.project, project.id);
    assert.equal(deletion.hidden, project.origin === 'bundled' || project.running, project.id);
    assert.equal(deletion.disabled, false, project.id);
    assert.equal(deletion.dataset.tooltip, undefined, project.id);
    assert.equal(archive.hidden, project.running, project.id);
    assert.equal(archive.textContent, project.archived ? 'Unarchive' : 'Archive', project.id);
    for (const action of ['rename', 'favicon', 'rebuild-app']) assert.equal(items.get(action)!.hidden, false, `${project.id}: ${action}`);
  }
  assert.equal(positioned, 9);
});

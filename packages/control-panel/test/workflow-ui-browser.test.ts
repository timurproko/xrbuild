import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';
import { defaultProjectSlug, hasProjectPublishers } from '../ui/project-workflow.js';

test('default publication slugs exclude catalog origin and archive prefixes', () => {
  for (const id of ['launcher', 'archive/launcher', 'bundled:launcher', 'bundled:archive/launcher', 'workspace:launcher', 'workspace:archive/launcher']) {
    assert.equal(defaultProjectSlug(id), 'launcher', id);
  }
  assert.equal(defaultProjectSlug('bundled:ui-kit'), 'ui-kit');
});

test('Publish visibility uses installed publishers, not configured/stale destinations', () => {
  assert.equal(hasProjectPublishers({}), false);
  assert.equal(hasProjectPublishers({ manifest: { publication: { publisher: 'gone' } }, publication: { publishers: [] } }), false);
  assert.equal(hasProjectPublishers({ publication: { available: false, publishers: [{ name: 'fixture' }] } }), true);
  assert.equal(hasProjectPublishers({ publicationStandalone: { publishers: [] }, publication: { publishers: [{ name: 'stale' }] } }), false);
});

test('empty capability UI hides Publish/All and workflow switches retain the title without flicker', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const workspace = await fs.mkdtemp(path.join(REPO, '.artifacts/workflow-ui-'));
  const project = path.join(workspace, 'projects/unsorted/sample'); await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify({ name: 'Stable Sample', kind: 'app', entry: 'dist' }));
  const core = path.join(workspace, 'core'); await fs.mkdir(core);
  const port = await freePort(), panel = createServer({ repo: core, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); });
  const publisher = { dir: workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [], status: async () => ({ state: 'unpublished' as const, selectedUrl: '' }), publish: async () => ({}) } };
  await withBrowser(async ({ evaluate, navigate }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(50); } assert.fail(expr); };
    await navigate(panel.url, `!!document.querySelector('[data-surface="display"]')`);
    await evaluate(`localStorage.setItem('panel.surface','publish')`);
    await navigate(panel.url, `!!document.querySelector('[data-surface="display"][aria-selected="true"]')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-surface="publish"], #build-settings [name="publication.publisher"]')`), false);
    assert.equal(await evaluate(`localStorage.getItem('panel.surface')`), 'display');
    for (const query of ['', '?module=all', '?module=missing', '?module=control-panel']) {
      await navigate(`${panel.url}settings/${query}`, `!!document.querySelector('#app-preferences')`);
      assert.deepEqual(await evaluate(`({all:!!document.querySelector('[data-settings-filter="all"]'),current:document.querySelector('[data-settings-filter="control-panel"]').getAttribute('aria-current'), count:document.querySelectorAll('[data-settings-filter]').length})`), { all: false, current: 'true', count: 1 });
    }
    // Adding a second settings owner restores All, including disabled modules with inspectable settings.
    await fs.mkdir(path.join(workspace, 'plugins/settings-fixture'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'plugins/settings-fixture/xrb-plugin.json'), JSON.stringify({ title: 'Settings fixture', type: 'input', version: '0.1.0', settings: [{ key: 'debug', label: 'Debug', type: 'boolean', default: false }] }));
    await navigate(`${panel.url}settings/?module=all`, `!!document.querySelector('[data-settings-filter="all"][aria-current="true"]')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-settings-filter]').length`), 3);
    panel.panel.publishers = { found: [publisher], problems: [] };
    await navigate(panel.url, `!!document.querySelector('[data-surface="publish"]')`);
    await evaluate(`document.querySelector('[data-surface="publish"]').click()`);
    await until(`document.querySelector('[data-surface="publish"]').getAttribute('aria-selected') === 'true'`);
    await sleep(350);
    await evaluate(`window.fixtureTitle=document.querySelector('.project-title-row h3'); window.fixtureHeader=document.querySelector('.project-hero-top'); window.fixtureTitleRemoved=false;
      window.fixtureObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===fixtureTitle || node.contains?.(fixtureTitle))fixtureTitleRemoved=true;});
      fixtureObserver.observe(document.querySelector('#detail'),{childList:true,subtree:true});`);
    for (const surface of ['display', 'publish', 'display']) {
      await evaluate(`document.querySelector('[data-surface="${surface}"]').click()`);
      await until(`document.querySelector('[data-surface="${surface}"]').getAttribute('aria-selected') === 'true'`);
      const frames = await evaluate(`new Promise(resolve=>{const frames=[];let start;const tick=time=>{start??=time;const title=document.querySelector('.project-title-row h3');const box=title.getBoundingClientRect();frames.push({same:title===fixtureTitle,connected:fixtureTitle.isConnected,top:box.top,opacity:getComputedStyle(title).opacity});if(time-start<300)requestAnimationFrame(tick);else resolve(frames);};requestAnimationFrame(tick);})`);
      assert.ok(frames.every((frame: any) => frame.same && frame.connected && frame.opacity === '1'), JSON.stringify(frames));
      assert.ok(Math.max(...frames.map((frame: any) => frame.top)) - Math.min(...frames.map((frame: any) => frame.top)) < 1, 'title stays in place during height easing');
    }
    assert.equal(await evaluate('fixtureTitleRemoved'), false);
    await evaluate('fixtureObserver.disconnect()');
    panel.panel.publishers = { found: [], problems: [] };
    await evaluate(`localStorage.setItem('panel.surface','publish')`);
    await navigate(panel.url, `!!document.querySelector('[data-surface="display"][aria-selected="true"]')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-surface="publish"]')`), false);
  });
});

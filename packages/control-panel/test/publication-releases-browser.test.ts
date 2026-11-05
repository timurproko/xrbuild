import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer } from '../src/server.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

interface Release { releaseId: string; version: string | null; digest: string; createdMs: number; url?: string }

test('release-capable publishing: Update, version bumps, history, Make live, legacy, Unpublish and responsive keyboard use', { skip: !process.env.XRB_TEST_BROWSER, timeout: 90000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../../..'), artifacts = path.join(root, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(artifacts, 'publication-releases-ui-'));
  const project = path.join(workspace, 'projects/Apps/sample');
  await fs.mkdir(path.join(project, 'dist'), { recursive: true });
  const manifest = { name: 'Sample', kind: 'app', entry: 'dist', target: 'webxr',
    publication: { enabled: true, publisher: 'fixture', id: '55555555-5555-4555-8555-555555555555', slug: 'sample' } };
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(project, 'dist/index.html'), '<title>Sample</title>');
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const panel = createServer({ repo: root, workspace, port });
  const store = { releases: [] as Release[], live: null as string | null, requested: null as string | null, legacy: false, publishes: 0, activations: 0, removals: 0, deletions: 0 };
  const revision = () => JSON.stringify([store.releases.map(r => r.releaseId), store.live, store.requested]).length.toString(36) + ':' + store.releases.length + ':' + (store.live ?? '-');
  const url = 'https://example.test/apps/sample/';
  panel.panel.awaitPublicationStatus = true;
  panel.panel.publicationStatusMaxAgeMs = 0;
  panel.panel.publishers = { found: [{ dir: workspace, publisher: {
    name: 'fixture', origin: 'https://example.test', routePrefix: 'apps', validate: () => [],
    status: async () => { const live = store.live !== null || store.legacy; return { state: live ? 'published' : 'unpublished', selectedUrl: url, ...(live ? { deployedUrl: url, deployedSlug: 'sample' } : {}) }; },
    publish: async () => { throw new Error('legacy publish must not be used'); },
    unpublish: async () => { await sleep(150); store.live = null; store.legacy = false; store.requested = null; store.removals++; return {}; },
    releases: {
      catalog: async () => ({ revision: revision(), releases: store.releases.map(r => ({ ...r })), requestedReleaseId: store.requested, liveReleaseId: store.live, legacyLive: store.legacy && store.live === null }),
      publish: async (o) => { await sleep(150); if (o.expectedRevision !== revision()) throw new Error('stale release decision'); const release = { releaseId: `rel-${store.releases.length + 1}`, version: o.version, digest: 'a'.repeat(64), createdMs: Date.now() + store.releases.length, url: `https://example.test/.xrb-releases/rel-${store.releases.length + 1}/` }; store.releases.push(release); store.live = store.requested = release.releaseId; store.legacy = false; store.publishes++; return { url, releaseId: release.releaseId, version: o.version }; },
      activate: async (o) => { await sleep(150); if (o.expectedRevision !== revision()) throw new Error('stale release decision'); const release = store.releases.find(r => r.releaseId === o.releaseId)!; store.live = store.requested = release.releaseId; store.activations++; return { url, releaseId: release.releaseId, version: release.version }; },
      delete: async (o) => { await sleep(150); if (o.expectedRevision !== revision()) throw new Error('stale release decision'); if (o.releaseId === store.live || o.releaseId === store.requested) throw new Error('release is deployed'); store.releases = store.releases.filter(r => r.releaseId !== o.releaseId); store.deletions++; return {}; },
    },
  } }, { dir: workspace, publisher: {
    // A second, legacy destination that is always live: the hero must list both once the first one is published.
    name: 'other', origin: 'https://other.example.test', routePrefix: 'apps', validate: () => [],
    status: async () => ({ state: 'published', selectedUrl: 'https://other.example.test/apps/sample/', deployedUrl: 'https://other.example.test/apps/sample/', deployedSlug: 'sample' }),
    publish: async () => ({}), unpublish: async () => ({}),
  } }], problems: [] };
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  try {
    assert.equal((await fetch(`${panel.url}preview/sample/`)).status, 200, 'the preview finalizes a current browser build');
    await withBrowser(async ({ send, evaluate, navigate }) => {
      const until = async (expression: string, what = expression) => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(100); } assert.fail(what + '\n' + await evaluate(`document.querySelector('#detail').innerText`)); };
      const show = async () => { await navigate(panel.url, `!!document.querySelector('[data-surface="publish"]') && !document.body.classList.contains('workspace-pending')`); await sleep(150); await evaluate(`document.querySelector('[data-surface="publish"]').click()`); await until(`!!document.querySelector('[name="publication.version"]')`); };
      const key = async (name: string, code = name, keyCode = 0) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, ...(name === 'Enter' ? { text: '\r' } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
      };
      const versionValue = () => evaluate(`document.querySelector('[name="publication.version"]').value`);
      // Live version: a read-only label without history, otherwise the shared dropdown over every retained release.
      const liveBtn = "document.querySelector('[name=\"publication.live\"]')?.closest('.dropdown')?.querySelector('.dropdown-btn')";
      const liveExpr = (v: string) => `((document.querySelector('.publication-live')?.value ?? ${liveBtn}?.querySelector('.xrb-option-label')?.textContent ?? '') === ${JSON.stringify(v)})`;
      const liveText = () => evaluate(`document.querySelector('.publication-live')?.value ?? ${liveBtn}?.querySelector('.xrb-option-label')?.textContent ?? ''`);
      const openLive = async () => { await evaluate(`${liveBtn}.click()`); await until(`!!document.querySelector('.dropdown-list [role="option"]')`, 'Live version opens'); };
      const liveList = async () => { if (!(await evaluate(`!!${liveBtn}`))) return []; await openLive(); const list = await evaluate(`[...document.querySelectorAll('.dropdown-list [role="option"]')].map(o => ({ version: o.querySelector('.xrb-option-label').textContent, live: !!o.querySelector('.xrb-status-dot.ok'), detail: o.querySelector('.xrb-option-detail')?.textContent ?? '' }))`); await key('Escape', 'Escape', 27); await until(`!document.querySelector('.dropdown-list')`); return list; };
      const chooseLive = async (index: number) => { await openLive(); await evaluate(`document.querySelectorAll('.dropdown-list [role="option"]')[${index}].click()`); };
      const openVersionMenu = () => evaluate(`{ const i = document.querySelector('[name="publication.version"]'); const r = i.getBoundingClientRect(); i.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.bottom - 5 })); }`);
      // The panel may be mid-write: an unreadable manifest is "not yet", not a failure.
      const savedVersion = async () => { try { return JSON.parse(await fs.readFile(path.join(project, 'xrb-project.json'), 'utf8')).publication.versions?.fixture; } catch { return undefined; } };

      await show();
      await until(`!!document.querySelector('#act-publish:not(:disabled)')`);
      assert.equal(await versionValue(), '0.1.0', 'no history suggests 0.1.0');
      assert.equal(await evaluate(`!!document.querySelector('#act-unpublish')`), false, 'nothing to unpublish yet');
      assert.equal(await evaluate(`!!${liveBtn}`), false, 'no history, no dropdown');
      assert.equal(await liveText(), 'Not live');
      assert.equal(await evaluate(`!!document.querySelector('.project-surface-content > .project-actions:last-child #act-publish')`), true, 'the primary action sits below all surface content');

      // Patch/Minor/Major from the field's context menu: it opens with Patch focused; Enter commits the draft.
      await openVersionMenu();
      await until(`!document.querySelector('#version-menu').hidden && document.activeElement?.dataset.versionBump === 'patch'`, 'menu opens with Patch focused');
      assert.equal(await evaluate(`document.querySelector('#version-menu [data-version-bump="minor"] .version-next').textContent`), '0.2.0');
      await key('Enter', 'Enter', 13);
      await until(`document.querySelector('[name="publication.version"]').value === '0.1.1'`);
      await until(`document.querySelector('#version-menu').hidden`);
      for (let i = 0; i < 30 && (await savedVersion()) !== '0.1.1'; i++) await sleep(100);
      assert.equal(await savedVersion(), '0.1.1', 'the draft is saved per publisher');
      assert.equal(store.publishes, 0, 'bumping publishes nothing');
      await sleep(500);  // the save's project refresh repaints the surface; a scroll from that repaint closes open menus
      await openVersionMenu();
      await until(`!document.querySelector('#version-menu').hidden`);
      await evaluate(`document.querySelector('#version-menu [data-version-bump="major"]').click()`);
      await until(`document.querySelector('[name="publication.version"]').value === '1.0.0'`);
      const settle = async (version: string) => { for (let i = 0; i < 30 && (await savedVersion()) !== version; i++) await sleep(100); assert.equal(await savedVersion(), version); await sleep(500); };
      await settle('1.0.0');
      const type = (value: string) => evaluate(`{ const i = document.querySelector('[name="publication.version"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('change', { bubbles: true })); }`);
      await type('0.5.0');
      await settle('0.5.0');
      await type('abc');
      await until(`document.querySelector('[name="publication.version"]').getAttribute('aria-invalid') === 'true'`, 'malformed draft shows an inline error');
      assert.equal(await evaluate(`document.querySelector('#ask').open`), false, 'no error dialog for an inline field error');
      assert.equal(await savedVersion(), '0.5.0', 'a malformed draft is not saved');
      await type('0.5.0');
      await until(`document.querySelector('[name="publication.version"]').getAttribute('aria-invalid') !== 'true'`);
      await settle('0.5.0');

      // Publish: the running operation keeps its name; completion switches to Update with the Live marker.
      await evaluate(`document.querySelector('#act-publish').click()`);
      await until(`document.querySelector('#ask').open && document.querySelector('#ask-title').textContent === 'Publish 0.5.0 version?'`, 'publishing a new version asks first');
      assert.equal(await evaluate(`document.querySelector('#ask-message').textContent`), `Sample is built from your current source and published as 0.5.0 at ${url}.`);
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`document.querySelector('#act-publish[aria-label="Publishing…"]') !== null`, 'Publishing… accessible name');
      assert.equal(await evaluate(`document.querySelector('[name="publication.version"]').disabled`), true, 'version editing is locked during publication');
      await until(`!!document.querySelector('#act-update:not(:disabled)')`);
      assert.equal(store.publishes, 1);
      assert.equal(await evaluate(`!!document.querySelector('#act-unpublish.publication-secondary:not(:disabled)')`), true, 'Unpublish is a separate secondary action');
      await until(liveExpr('0.5.0'));
      assert.deepEqual((await liveList()).map((r: any) => [r.version, r.live, r.detail.length > 0]), [['0.5.0', true, true]], 'the dropdown lists the release with the live mark and its creation time');
      await until(`!!document.querySelector('[name="publication.publisher"]').closest('.dropdown').querySelector('.dropdown-btn .xrb-status-dot.ok')`, 'the published destination shows a green dot in the Publisher field');
      assert.deepEqual(await evaluate(`[document.querySelector('#open-live')?.href, document.querySelector('#open-live')?.target]`), [url, '_blank'], 'the identity row offers a one-click link to the live app');
      await evaluate(`document.querySelector('[name="publication.publisher"]').closest('.dropdown').querySelector('.dropdown-btn').click()`);
      await until(`!!document.querySelector('.dropdown-list [role="option"] .xrb-status-dot.ok')`, 'the published destination shows a green dot in the option list');
      await key('Escape', 'Escape', 27);
      await until(`!document.querySelector('.dropdown-list')`);
      await until(`document.querySelector('[name="publication.version"]').value === '0.5.1'`, 'success suggests the next patch');
      // Two live destinations: the hero collapses into "2 published" with a menu of links.
      await until(`document.querySelector('#publication-links')?.textContent.trim() === '2 published'`, 'the hero counts live destinations');
      await evaluate(`document.querySelector('#publication-links').click()`);
      await until(`!document.querySelector('#publication-links-menu').hidden && document.activeElement?.role === 'menuitem'`, 'the menu opens with its first link focused');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('#publication-links-menu a[role="menuitem"]')].map(a => [a.href, a.target, !!a.querySelector('.xrb-status-dot.ok')])`), [[url, '_blank', true], ['https://other.example.test/apps/sample/', '_blank', true]], 'every live destination is a new-tab link, selected publisher first');
      assert.equal(await evaluate(`document.querySelector('#publication-links').getAttribute('aria-expanded')`), 'true');
      await key('Escape', 'Escape', 27);
      await until(`document.querySelector('#publication-links-menu').hidden && document.querySelector('#publication-links').getAttribute('aria-expanded') === 'false'`);

      // Update in place: no Unpublish, the previous release is retained and the Live marker moves after verification.
      assert.equal(await evaluate(`document.querySelector('#act-update').textContent.trim()`), 'Publish', 'an update in place still reads Publish');
      await evaluate(`document.querySelector('#act-update').click()`);
      await until(`document.querySelector('#ask').open && document.querySelector('#ask-title').textContent === 'Publish 0.5.1 version?'`);
      assert.match(await evaluate(`document.querySelector('#ask-message').textContent`), /published as 0\.5\.1 at https:\/\/example\.test\/apps\/sample\/, replacing 0\.5\.0, which is live now\. Earlier versions stay available in Live version\./, 'the confirmation says what replaces what');
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`document.querySelector('#act-update[aria-label="Publishing…"]') !== null`, 'Publishing… accessible name while updating');
      assert.equal(await liveText(), '0.5.0', 'the previous live version holds until verification');
      await until(`!!document.querySelector('#act-update:not(:disabled)') && ${liveExpr('0.5.1')}`);
      assert.equal(store.removals, 0, 'Update never unpublishes');
      assert.deepEqual((await liveList()).map((r: any) => [r.version, r.live]), [['0.5.1', true], ['0.5.0', false]], 'newest first, only the verified release marked');
      await evaluate(`document.querySelector('#publication-links').click()`);
      await until(`!document.querySelector('#publication-links-menu').hidden`);
      assert.equal(await evaluate(`document.querySelector('#publication-links-menu a[role="menuitem"]').href`), url, 'the canonical URL is unchanged');
      await key('Escape', 'Escape', 27);
      await until(`document.querySelector('#publication-links-menu').hidden`);

      // Make live: cancel changes nothing; confirmation deploys the retained release without rebuilding.
      await chooseLive(1);
      await until(`!!document.querySelector('#act-make-live') && !!document.querySelector('#act-delete-release')`, 'choosing a release inspects it: Activate and Delete appear, nothing deploys');
      assert.equal(await evaluate(`document.querySelector('#act-delete-release').disabled`), false, 'a retained version that is not live can be deleted');
      assert.equal(await evaluate(`!!document.querySelector('#act-preview-release')`), false, 'Preview left the action row: the identity-row link opens the archive');
      assert.equal(await evaluate(`!!document.querySelector('#act-update') || !!document.querySelector('#act-unpublish')`), false, 'Update and Unpublish step aside while inspecting');
      assert.deepEqual(await evaluate(`[document.querySelector('#open-live')?.href, document.querySelector('#open-live')?.getAttribute('aria-label')]`), ['https://example.test/.xrb-releases/rel-1/', 'Open 0.5.0'], 'the identity-row link follows the inspected version');
      assert.equal(await evaluate(`document.querySelector('[name="publication.version"]').disabled`), true, 'Next version is disabled while inspecting: no new version is being published');
      assert.equal(store.activations, 0, 'choosing deploys nothing');
      await evaluate(`document.querySelector('#act-make-live').click()`);
      await until(`document.querySelector('#ask').open && document.querySelector('#ask-title').textContent === 'Activate 0.5.0 version?'`);
      assert.match(await evaluate(`document.querySelector('#ask-message').textContent`), /^Sample replaces 0\.5\.1, which is live now at https:\/\/example\.test\/apps\/sample\/\. The saved 0\.5\.0 build is used as it was published before; nothing is rebuilt from your current source\.$/);
      await evaluate(`document.querySelector('#ask-cancel').click()`);
      await until(`!document.querySelector('#ask').open`);
      await sleep(200);
      assert.equal(store.activations, 0, 'cancel deploys nothing');
      await until(`!!document.querySelector('#act-make-live')`, 'cancel keeps the inspection');
      assert.equal(await liveText(), '0.5.0', 'the inspected release stays chosen');
      await evaluate(`document.querySelector('#act-make-live').click()`);
      await until(`document.querySelector('#ask').open`);
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`document.querySelector('#act-activate[aria-label="Activating…"]') !== null`, 'Activating… accessible name while a retained version is activated');
      await until(`${liveExpr('0.5.0')} && !!document.querySelector('#act-update:not(:disabled)')`);
      assert.equal(store.activations, 1);
      assert.equal(store.publishes, 2, 'activation does not rebuild or republish');
      assert.deepEqual((await liveList()).map((r: any) => [r.version, r.live]), [['0.5.1', false], ['0.5.0', true]]);
      assert.equal(await versionValue(), '0.5.2', 'after a rollback the next version still follows the highest retained version');

      // A decision made against outdated history is refused and the history refreshes.
      store.releases.push({ releaseId: 'rel-9', version: '0.9.0', digest: 'b'.repeat(64), createdMs: Date.now() + 10 });
      await evaluate(`document.querySelector('#act-update').click()`);
      await until(`document.querySelector('#ask').open && document.querySelector('#ask-title').textContent === 'Publish 0.5.2 version?'`);
      await evaluate(`document.querySelector('#ask-ok').click()`);
      try { await until(`document.querySelector('#ask').open && document.querySelector('#ask-title').textContent === 'Release history changed'`); }
      catch (error) { throw new Error(`stale flow: ${await evaluate(`document.querySelector('#ask').open + ' | ' + document.querySelector('#ask-title').textContent + ' | ' + document.querySelector('#ask-message').textContent + ' | ' + document.querySelector('#ask-details').textContent`)}\n${(error as Error).message.slice(0, 300)}`); }
      await evaluate(`document.querySelector('#ask-close').click()`);
      for (let i = 0; i < 40 && (await liveList()).length !== 3; i++) await sleep(100);
      assert.equal((await liveList()).length, 3, 'history refreshed after the conflict');
      assert.equal(store.publishes, 2, 'no deployment from a stale decision');
      await until(`document.querySelector('[name="publication.version"]').value === '0.9.1'`, 'the suggestion follows the refreshed history');

      // Narrow layout, dark theme and keyboard reach of Make live.
      // The panel's narrow breakpoint (720px) stacks the publication fields beside the fixed project list.
      await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      await sleep(200);
      assert.equal(await evaluate(`{ const s = document.querySelector('.publication-fields'); s.scrollWidth <= s.clientWidth + 1; }`), true, 'the publication section does not overflow at the narrow breakpoint');
      const narrowRects = await evaluate(`{ const d = document.querySelector('#detail').getBoundingClientRect(); JSON.stringify({ detail: [d.left, d.right], controls: [...document.querySelectorAll('[name="publication.version"], .publication-version .dropdown-btn')].map(b => { const r = b.getBoundingClientRect(); return [b.id || b.className, r.left, r.right, b.offsetWidth]; }) }); }`);
      assert.equal(await evaluate(`{ const d = document.querySelector('#detail').getBoundingClientRect(); [...document.querySelectorAll('[name="publication.version"], .publication-version .dropdown-btn')].every(b => { const r = b.getBoundingClientRect(); return b.offsetWidth > 0 && r.right <= d.right + 1 && r.left >= d.left - 1; }); }`), true, `version and Make live controls stay inside the detail panel when narrow: ${narrowRects}`);
      const darkBackground = await evaluate(`getComputedStyle(document.querySelector('.publication-version .dropdown-btn')).backgroundColor`);
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
      await sleep(200);
      assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.publication-version .dropdown-btn')).backgroundColor`), darkBackground, 'rows follow the theme tokens');
      await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
      // A background project refresh can repaint the field under the first key press; focus and press again if so.
      for (let attempt = 0; attempt < 5 && !(await evaluate(`!!document.querySelector('.dropdown-list [role="option"]')`)); attempt++) {
        await evaluate(`${liveBtn}.focus()`);
        await key('ArrowDown', 'ArrowDown', 40);
        await sleep(300);
      }
      await until(`!!document.querySelector('.dropdown-list [role="option"]')`, 'keyboard opens Live version');
      await key('ArrowDown', 'ArrowDown', 40);
      await key('Enter', 'Enter', 13);
      await until(`!!document.querySelector('#act-make-live') && !!document.querySelector('#act-delete-release')`, 'keyboard choice inspects the release');
      await evaluate(`document.querySelector('#act-make-live').focus()`);
      await key('Enter', 'Enter', 13);
      await until(`document.querySelector('#ask').open`, 'keyboard opens the confirmation');
      await key('Escape', 'Escape', 27);
      await until(`!document.querySelector('#ask').open`);
      await chooseLive(2);
      await until(`!!document.querySelector('#act-unpublish')`, 'choosing the live release again ends the inspection');

      // Unpublish keeps history: no Live marker, every release stays available for Make live.
      await evaluate(`document.querySelector('#act-unpublish').click()`);
      await until(`document.querySelector('#ask').open`);
      assert.match(await evaluate(`document.querySelector('#ask-message').textContent`), /Retained releases stay available to activate again/);
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`!!document.querySelector('#act-publish:not(:disabled)')`);
      assert.equal(store.removals, 1);
      await until(liveExpr('Not live'));
      assert.deepEqual((await liveList()).map((r: any) => [r.version, r.live]).slice(0, 1), [['Not live', false]], 'Not live stays a permanent first entry while nothing is live');
      assert.deepEqual((await liveList()).map((r: any) => r.live), [false, false, false, false], 'every retained release stays listed, none marked live');
      await chooseLive(2);
      await until(`!!document.querySelector('#act-make-live') && !!document.querySelector('#act-delete-release:not(:disabled)')`, 'an unpublished app can still inspect a retained release, and delete it');
      await chooseLive(0);
      await until(`!!document.querySelector('#act-publish') && !document.querySelector('#act-make-live')`, 'choosing Not live again ends the inspection');
      assert.equal(await evaluate(`!!document.querySelector('#act-unpublish')`), false);

      // Delete: cancel changes nothing; confirmation removes only that release and ends the inspection.
      const retainedBefore = store.releases.length;
      await chooseLive(2);
      await until(`!!document.querySelector('#act-delete-release:not(:disabled)')`);
      await evaluate(`document.querySelector('#act-delete-release').click()`);
      await until(`document.querySelector('#ask').open && /^Delete .+ version\\?$/.test(document.querySelector('#ask-title').textContent)`, 'Delete asks with the version in the title');
      assert.match(await evaluate(`document.querySelector('#ask-message').textContent`), /^The saved .+ build of Sample is removed from fixture and can no longer be activated or opened\. The live app is not changed\.$/);
      await evaluate(`document.querySelector('#ask-cancel').click()`);
      await until(`!document.querySelector('#ask').open`);
      await sleep(200);
      assert.equal(store.deletions, 0, 'cancel deletes nothing');
      await until(`!!document.querySelector('#act-delete-release:not(:disabled)')`, 'cancel keeps the inspection');
      await evaluate(`document.querySelector('#act-delete-release').click()`);
      await until(`document.querySelector('#ask').open`);
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`document.querySelector('#act-delete-release[aria-label="Deleting…"]') !== null`, 'Deleting… accessible name while a release is deleted');
      await until(`!!document.querySelector('#act-publish') && !document.querySelector('#act-make-live')`, 'a finished deletion ends the inspection');
      assert.equal(store.deletions, 1);
      assert.equal(store.releases.length, retainedBefore - 1, 'only the chosen release was deleted');
      for (let i = 0; i < 20 && (await liveList()).length !== retainedBefore; i++) await sleep(250);
      assert.equal((await liveList()).length, retainedBefore, 'the deleted release left the list; Not live stays');
      await until(liveExpr('Not live'), 'nothing went live');

      // A legacy (unversioned) deployment is labelled, never given an invented version, and offers Update.
      store.releases = []; store.live = null; store.requested = null; store.legacy = true;
      await show();
      await until(`!!document.querySelector('#act-update:not(:disabled)')`);
      assert.equal(await liveText(), 'Legacy (unversioned)');
      assert.equal(await versionValue(), '0.5.0', 'the saved draft survives reload; legacy history suggests nothing of its own');
      assert.equal(await evaluate(`!!${liveBtn}`), false, 'a legacy deployment without history has no dropdown');
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(project, 'xrb-project.json'), 'utf8')).publication.id, manifest.publication.id, 'identity is untouched');
    });
  } finally { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

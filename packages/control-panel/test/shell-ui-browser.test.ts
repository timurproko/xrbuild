import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer } from '../src/server.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Activity header and Settings remain accessible in narrow/wide and light/dark layouts', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../../..'), artifacts = path.join(root, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(artifacts, 'shell-ui-'));
  await fs.mkdir(path.join(workspace, 'projects/Apps/sample'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'projects/Apps/sample/xrb-project.json'), JSON.stringify({ name: 'Sample', kind: 'app', entry: 'dist' }));
  // This layout fixture exercises the multi-module All view; single-module navigation is covered separately.
  await fs.mkdir(path.join(workspace, 'plugins/settings-fixture'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'plugins/settings-fixture/xrb-plugin.json'), JSON.stringify({ title: 'Settings fixture', type: 'input', version: '0.1.0', settings: [{ key: 'enabled', label: 'Enabled', type: 'boolean', default: false }] }));
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const panel = createServer({ repo: root, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  try {
    await withBrowser(async ({ send, evaluate, navigate }) => {
      await navigate(panel.url, `!!document.querySelector('.proj') && !!document.querySelector('#activity-log-tab')`);
      await sleep(600);
      panel.hub.send('run-log', '0.001 [host] header check');
      panel.hub.send('run-log', '0.002 [tracker debug] debug check');
      await sleep(150);
      const completed = panel.panel.jobs.start('web-build', null, 'Completed check', async () => {});
      await sleep(150);
      for (const width of [1500, 900, 500]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const tab of ['jobs', 'log']) {
          await evaluate(`document.querySelector('#activity-${tab}-tab').click()`);
          const layout = await evaluate(`(() => {
            const head=document.querySelector('.xrb-tab-toolbar'), tabs=head.querySelector('[role=tablist]'), center=head.querySelector('.xrb-tab-toolbar-center'), end=head.querySelector('.xrb-tab-toolbar-end');
            const a=tabs.getBoundingClientRect(),b=center.getBoundingClientRect(),c=end.getBoundingClientRect();
            const svg=end.querySelector('span:not([hidden]) button svg'), box=svg.getBBox(),s=svg.getBoundingClientRect(),h=head.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(tabs.querySelector('[role=tab]'));
            const leftInset=range.getBoundingClientRect().left-h.left,rightInset=h.right-(s.left+(box.x+box.width+0.75)*s.width/16);
            return {leftInset,rightInset,hitWidth:svg.closest('button').getBoundingClientRect().width,visible:!document.querySelector('#activity-${tab}-filters').hidden,otherHidden:document.querySelector('#activity-${tab === 'jobs' ? 'log' : 'jobs'}-filters').hidden,
              tabChildren:[...tabs.children].every(e=>e.getAttribute('role')==='tab'||e.getAttribute('aria-hidden')==='true'), overlap:a.right>b.left+1||b.right>c.left+1,
              innerTools:!!document.querySelector('#activity-${tab} .log-filters'), height:head.getBoundingClientRect().height};})()`);
          assert.equal(layout.visible, true); assert.equal(layout.otherHidden, true); assert.equal(layout.tabChildren, true);
          assert.equal(layout.overlap, false, `${width}/${tab}`); assert.equal(layout.innerTools, false); assert.ok(layout.height < 55);
          assert.ok(Math.abs(layout.leftInset-layout.rightInset)<2, `balanced visible insets: ${JSON.stringify(layout)}`);
          assert.equal(layout.hitWidth, 28);
        }
      }
      assert.equal(await evaluate(`!!document.querySelector('#log-debug [data-source="tracker"]')`), true);
      await evaluate(`document.querySelector('#activity-jobs-tab').click();document.querySelector('[data-state="done"]').click()`);
      await evaluate(`document.querySelector('#activity-log-tab').click();document.querySelector('#activity-jobs-tab').click()`);
      assert.equal(await evaluate(`document.querySelector('[data-state="done"]').getAttribute('aria-pressed')`), 'false');
      let finish!: () => void;
      const active = panel.panel.jobs.start('host-rebuild', null, 'Running check', () => new Promise<void>(resolve => finish = resolve));
      await sleep(100);
      await evaluate(`document.querySelector('[data-state="done"]').click();document.querySelector('#jobs-clear').click()`);
      await sleep(200); assert.equal(panel.panel.jobs.get(completed.id), undefined);
      assert.equal(panel.panel.jobs.get(active.id)?.state, 'running', 'X never stops active work');
      finish();
      assert.equal(await evaluate(`document.querySelector('#activity-jobs').hidden`), false, 'X clears jobs rather than closing Activity');
      await evaluate(`document.querySelector('#activity-log-tab').click();document.querySelector('#log-clear').click()`);
      for (let i = 0; i < 30 && await evaluate(`document.querySelector('#run-log').textContent.includes('header check')`); i++) await sleep(100);
      assert.equal(await evaluate(`document.querySelector('#run-log').textContent.includes('header check')`), false);
      await evaluate(`document.querySelector('#activity-jobs-tab').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
      assert.equal(await evaluate(`document.activeElement.id`), 'activity-log-tab');
      await evaluate(`document.querySelector('#activity-jobs-tab').click()`);
      await navigate(panel.url, `document.querySelector('#activity-jobs-tab')?.getAttribute('aria-selected')==='true'`);
      const appsFavicon = await evaluate(`document.querySelector('link[rel=icon]').href`);
      await navigate(`${panel.url}settings`, `!!document.querySelector('#app-preferences') && !!document.querySelector('[data-settings-filter="all"]')`);
      assert.equal(await evaluate(`document.querySelector('[data-settings-filter="all"] .meta').textContent`), 'settings');
      assert.equal(await evaluate(`document.querySelector('[data-settings-filter="control-panel"] .meta').textContent`), 'core');
      const appsEmoji = await evaluate(`document.querySelector('[data-settings-filter="control-panel"] .plugin-symbol-emoji').textContent`);
      assert.ok(decodeURIComponent(appsFavicon).includes(appsEmoji), 'Settings Apps shares the favicon emoji');
      let previousFavicon = '', previousAppsFavicon = '';
      for (const theme of ['light', 'dark']) {
        await navigate(panel.url, `!!document.body && !document.body.classList.contains('workspace-pending') && !!document.querySelector('.proj')`);
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await sleep(100);
        const appsIdentity = await evaluate(`({favicon:document.querySelector('link[rel=icon]').href,filter:getComputedStyle(document.documentElement).getPropertyValue('--xrb-glyph-detail-filter').trim()})`);
        assert.ok(appsIdentity.filter);
        assert.ok(decodeURIComponent(appsIdentity.favicon).includes(`filter:${appsIdentity.filter}`), 'Apps favicon uses the sidebar detail tint');
        if (previousAppsFavicon) assert.notEqual(appsIdentity.favicon, previousAppsFavicon, 'Apps favicon updates on theme change');
        previousAppsFavicon = appsIdentity.favicon;
        await navigate(`${panel.url}settings`, `!!document.querySelector('#app-preferences') && !!document.querySelector('[data-settings-filter="all"]')`);
        const detail = await evaluate(`(async () => {
          const {emojiFavicon}=await import('/design-system.js');
          const image=new Image();image.src=emojiFavicon(${JSON.stringify(appsEmoji)});await image.decode();
          const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const filter=getComputedStyle(document.querySelector('.xrb-glyph-detail')).filter;
          ctx.filter=filter;ctx.drawImage(image,0,0,64,64);
          const pixels=ctx.getImageData(0,0,64,64).data,colors=new Set();
          for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]===255)colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
          const sample=value=>{ctx.clearRect(0,0,64,64);ctx.filter=value;ctx.fillStyle='white';ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
          return {colors:colors.size,tint:sample(filter),expected:sample(getComputedStyle(document.querySelector('[data-settings-filter="all"] .plugin-symbol-tinted')).filter)};
        })()`);
        assert.ok(detail.colors > 20, `Apps emoji retains shaded detail: ${detail.colors} colors`);
        assert.ok(Math.hypot(...detail.tint.map((value: number, i: number) => value - detail.expected[i])) < 12,
          `Apps tint matches other sidebar glyphs in ${theme}: ${JSON.stringify(detail)}`);
        for (const width of [1500, 900, 500]) {
          await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          const scroll = await evaluate(`(() => {const row=document.querySelector('[data-settings-filter="all"]'),list=row.parentElement,filler=document.createElement('div');filler.style.cssText='height:2000px;flex:none';filler.tabIndex=0;list.append(filler);filler.focus();list.scrollTop=300;const moved=list.scrollTop>0;row.focus();const restored=list.scrollTop===0;filler.remove();return {moved,restored};})()`);
          assert.deepEqual(scroll, { moved: true, restored: true }, 'keyboard focus reveals the first card after scrolling');
          const rendered = await evaluate(`(() => {
            const row=document.querySelector('[data-settings-filter="all"]'), heading=document.querySelector('.settings-module-heading'), list=row.parentElement;
            const r=row.getBoundingClientRect(),h=heading.getBoundingClientRect(),l=list.getBoundingClientRect();
            return {gap:r.top-h.bottom,mask:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--xrb-sticky-mask-gap')),inside:r.top>=l.top,offset:parseFloat(getComputedStyle(row).outlineOffset),
              filter:getComputedStyle(row.querySelector('.plugin-symbol-tinted')).filter, favicon:document.querySelector('link[rel=icon]').href,
              guidance:document.querySelector('#app-preferences').textContent};})()`);
          assert.ok(rendered.gap >= 12); assert.ok(rendered.mask < rendered.gap, 'sticky paint cannot cover the first border'); assert.equal(rendered.inside, true); assert.ok(rendered.offset < 0);
          assert.notEqual(rendered.filter, 'none'); assert.match(rendered.guidance, /next run.*Mouse/s);
          if (width === 1500) {
            if (previousFavicon) assert.notEqual(rendered.favicon, previousFavicon, 'favicon tracks theme tint');
            previousFavicon = rendered.favicon;
            const image = await send('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(path.join(artifacts, `settings-${theme}.png`), Buffer.from(image.data, 'base64'));
          }
        }
      }
      await evaluate(`const input=document.querySelector('#app-preferences [name=cursor]');input.value='system';input.dispatchEvent(new Event('change',{bubbles:true}))`);
      await sleep(200);
      await navigate(`${panel.url}settings?module=control-panel`, `location.pathname==='/settings/'&&document.querySelector('#app-preferences [name=cursor]')?.value==='system'&&document.querySelector('[data-settings-filter="control-panel"]')?.getAttribute('aria-current')==='true'`);
      assert.equal(await evaluate(`document.querySelector('[data-settings-filter="control-panel"]').getAttribute('aria-current')`), 'true');
      // A stale local selection must not override a fresh Settings menu destination.
      await evaluate(`localStorage.setItem('panel.settingsFilter','control-panel');document.querySelector('#panel-menu-button').click();document.querySelector('#settings-open').click()`);
      for(let i=0;i<80&& !await evaluate(`location.pathname==='/settings/'&&!location.search&&document.querySelector('[data-settings-filter="all"]')?.getAttribute('aria-current')==='true'`);i++)await sleep(50);
      assert.equal(await evaluate(`document.querySelector('[data-settings-filter="all"]').getAttribute('aria-current')`),'true','Settings menu returns to All after the core selection');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-settings-module]')].map(section=>section.dataset.settingsModule).sort()`),await evaluate(`[...document.querySelectorAll('[data-settings-filter]:not([data-settings-filter="all"])')].map(row=>row.dataset.settingsFilter).sort()`),'plain Settings includes every available core and plugin section');
      await navigate(`${panel.url}settings/?module=settings-fixture`, `document.querySelector('[data-settings-filter="settings-fixture"]')?.getAttribute('aria-current')==='true'`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-settings-module]').length`),1,'explicit plugin settings link remains scoped');
      await navigate(`${panel.url}settings/?module=settings-fixture`, `document.querySelector('[data-settings-filter="settings-fixture"]')?.getAttribute('aria-current')==='true'`);
      await evaluate(`localStorage.setItem('panel.settingsFilter','settings-fixture');document.querySelector('#panel-menu-button').click();document.querySelector('#settings-open').click()`);
      for(let i=0;i<80&& !await evaluate(`location.pathname==='/settings/'&&!location.search&&document.querySelector('[data-settings-filter="all"]')?.getAttribute('aria-current')==='true'`);i++)await sleep(50);
      assert.equal(await evaluate(`document.querySelector('[data-settings-filter="all"]').getAttribute('aria-current')`),'true','Settings menu returns to All after a plugin selection');
    });
  } finally { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Apps and Design Main use the same layout templates, card rhythm and document scrollbar track', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/design-layout-')), core = path.join(root, 'core');
  await fs.mkdir(core); await fs.mkdir(path.join(root, 'projects/unsorted/demo'), { recursive: true });
  await fs.writeFile(path.join(root, 'projects/unsorted/demo/xrb-project.json'), JSON.stringify({ name: 'Demo', kind: 'app' }));
  const port = await freePort(), panel = createServer({ repo: core, workspace: root, port, developerMode: true });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(root, { recursive: true, force: true }); });
  for (let i = 0; i < 8; i++) await panel.panel.jobs.wait(panel.panel.jobs.start('web-build', null, `Fixture ${i}`, async ctx => ctx.line('Local job output')));
  await withBrowser(async ({ navigate, evaluate, send }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(40); } assert.fail(expr); };
    const pageBar = `.xrb-scrollbar-y[aria-controls="'+document.scrollingElement.id+'"]`;
    const measure = (design: boolean) => evaluate(`(()=>{
      const header=document.querySelector('.xrb-app-bar'),layout=document.querySelector('${design ? '.design-layout' : '#dashboard'}'),sidebar=document.querySelector('${design ? '#states' : '#projects'}'),cards=[...document.querySelectorAll('${design ? '.component-catalog > .xrb-card' : '#side > .card'}')],first=document.querySelector('${design ? '.component-catalog > .xrb-card' : '#detail > .card'}');
      const sh=sidebar.firstElementChild,style=getComputedStyle(layout),h=header.getBoundingClientRect(),r=layout.getBoundingClientRect(),s=sidebar.getBoundingClientRect(),card=first.getBoundingClientRect(),cs=getComputedStyle(first),a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect(),bar=document.querySelector('${pageBar}').getBoundingClientRect();
      return {padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft],edges:[r.left,innerWidth-r.right],header:h.height,sidebar:s.width,sidebarHeading:[sh.getBoundingClientRect().height,getComputedStyle(sh).marginBottom],font:cs.fontFamily,contentLeft:card.left,firstTop:card.top-h.bottom,cardPadding:[cs.paddingTop,cs.paddingRight,cs.paddingLeft],cardGap:b.top-a.bottom,track:[bar.top,innerWidth-bar.right,bar.width,bar.height],gutter:innerWidth-document.documentElement.clientWidth,shared:layout.classList.contains('xrb-workspace-grid')&&sidebar.classList.contains('xrb-workspace-sidebar')};
    })()`);
    for (const width of [1900, 1280, 900, 390]) for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 650, deviceScaleFactor: 1, mobile: false });
      await navigate(panel.url, `!!document.querySelector('#settings')`);
      await evaluate(`window.xrbTheme.set('${theme}');document.querySelector('#activity-jobs-tab').click();scrollTo(0,0)`);
      await until(`!!document.querySelector('${pageBar}')`);
      const apps = await measure(false);
      await navigate(`${panel.url}design?case=main&state=all`, `document.querySelector('#design-main')?.dataset.fixtureReady==='true'`);
      await until(`!!document.querySelector('${pageBar}')`);
      const design = await measure(true);
      assert.equal(design.shared, true);assert.equal(apps.shared, true);
      for (const key of ['padding','edges','sidebar','sidebarHeading','font','contentLeft','cardPadding','cardGap','track','gutter']) assert.deepEqual(design[key], apps[key], `${width}/${theme}: ${key}`);
      if (width > 700) {assert.equal(design.firstTop, apps.firstTop);assert.equal(design.header, apps.header);}
      assert.equal(await evaluate(`document.querySelector('#preview').parentElement.hidden`), true, 'Main has no second scroll document');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.component-catalog')).padding`), '0px', 'no nested catalog padding');
      await evaluate(`document.querySelector('${pageBar}').dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}))`);
      assert.ok(await evaluate(`scrollY`)>0);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true);
    }
    await evaluate(`document.querySelector('[data-state="status"]').click()`);
    await until(`document.querySelector('#design-main').dataset.state==='status'`);
    assert.ok(await evaluate('scrollY') > 0, 'category selection scrolls the actual document');
    await evaluate(`document.querySelectorAll('[data-component-section]:not(#status)').forEach(section=>section.remove());scrollTo(0,0)`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 2000, deviceScaleFactor: 1, mobile: false });
    await until(`!document.querySelector('${pageBar}')`);
    await evaluate(`const picker=document.querySelector('#case');picker.value='install-dependencies';picker.dispatchEvent(new Event('change'))`);
    await until(`document.querySelector('#preview')?.contentDocument?.documentElement?.dataset.fixtureReady==='true'`);
    assert.equal(await evaluate(`document.querySelector('#design-main').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#preview').parentElement.hidden`), false);
    assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('sandbox')`), 'allow-scripts allow-same-origin');
  });
});

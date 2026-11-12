import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Apps and Design Main use the same viewport-edge scrollbar inset, without a framed Main gutter', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/design-scroll-')), core = path.join(root, 'core');
  await fs.mkdir(core); await fs.mkdir(path.join(root, 'projects/unsorted/demo'), { recursive: true });
  await fs.writeFile(path.join(root, 'projects/unsorted/demo/xrb-project.json'), JSON.stringify({ name: 'Demo', kind: 'app' }));
  const port = await freePort(), panel = createServer({ repo: core, workspace: root, port, developerMode: true });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(root, { recursive: true, force: true }); });
  await withBrowser(async ({ navigate, evaluate, send }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(40); } assert.fail(expr); };
    const ready = `document.querySelector('#preview')?.contentDocument?.documentElement?.dataset.fixtureReady==='true'`;
    for (const width of [1500, 900, 500]) for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
      await navigate(panel.url, `!!document.querySelector('#settings')`);
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};const filler=document.createElement('div');filler.style.height='2500px';document.body.append(filler)`);
      await until(`!!document.querySelector('.xrb-scrollbar-y[aria-controls="'+document.scrollingElement.id+'"]')`);
      const apps = await evaluate(`(()=>{const bar=document.querySelector('.xrb-scrollbar-y[aria-controls="'+document.scrollingElement.id+'"]');return {edge:innerWidth-bar.getBoundingClientRect().right,gutter:innerWidth-document.documentElement.clientWidth};})()`);
      await navigate(`${panel.url}design?case=main&state=all`, ready);
      await until(`!!document.querySelector('#preview').contentDocument.querySelector('.xrb-scrollbar-y')`);
      const design = await evaluate(`(()=>{const frame=document.querySelector('#preview'),doc=frame.contentDocument,bar=doc.querySelector('.xrb-scrollbar-y[aria-controls="'+doc.scrollingElement.id+'"]'),box=frame.getBoundingClientRect();return {edge:innerWidth-(box.left+bar.getBoundingClientRect().right),gutter:frame.contentWindow.innerWidth-doc.documentElement.clientWidth,padding:getComputedStyle(document.querySelector('.design-stage')).paddingRight};})()`);
      assert.equal(design.edge, apps.edge, `${width}/${theme}`); assert.equal(apps.gutter, 0); assert.equal(design.gutter, 0); assert.equal(design.padding, '0px');
      await evaluate(`const frame=document.querySelector('#preview');frame.contentDocument.querySelector('.xrb-scrollbar-y').dispatchEvent(new frame.contentWindow.WheelEvent('wheel',{deltaY:100,cancelable:true}))`);
      assert.ok(await evaluate(`document.querySelector('#preview').contentDocument.scrollingElement.scrollTop`)>0);
    }
    await evaluate(`document.querySelector('[data-state="status"]').click()`);
    await until(`(${ready}) && document.querySelector('#preview').contentWindow.location.search.includes('state=status')`);
    await evaluate(`document.querySelector('#preview').contentDocument.querySelectorAll('[data-component-section]:not(#status)').forEach(section=>section.remove())`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 2000, deviceScaleFactor: 1, mobile: false });
    await until(`!document.querySelector('#preview').contentDocument.querySelector('.xrb-scrollbar-y[aria-controls="'+document.querySelector('#preview').contentDocument.scrollingElement.id+'"]')`);
    await evaluate(`const picker=document.querySelector('#case');picker.value='install-dependencies';picker.dispatchEvent(new Event('change'))`);
    await until(`(${ready}) && document.querySelector('#preview').contentWindow.location.pathname.endsWith('install-dependencies.html')`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.design-stage')).paddingRight`), '12px', 'isolated workflows keep intentional framing');
  });
});

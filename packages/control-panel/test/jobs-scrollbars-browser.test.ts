import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Jobs overlays target only usable visible overflow across output, tabs, updates and page switches', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/jobs-scroll-')), core = path.join(root, 'core');
  await fs.mkdir(core); await fs.mkdir(path.join(root, 'projects/unsorted/sample'), { recursive: true });
  await fs.writeFile(path.join(root, 'projects/unsorted/sample/xrb-project.json'), JSON.stringify({ name: 'Sample', kind: 'app' }));
  const port = await freePort(), panel = createServer({ repo: core, workspace: root, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(root, { recursive: true, force: true }); });
  for (let i = 0; i < 9; i++) { const job = panel.panel.jobs.start('web-build', null, `Fixture ${i}`, async ctx => { for (let j = 0; j < 150; j++) ctx.line(`line ${j}`); }); await panel.panel.jobs.wait(job); }
  await withBrowser(async ({ evaluate, navigate, send }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(40); } assert.fail(expr); };
    await navigate(panel.url, `!!document.querySelector('#jobs .item')`);
    await evaluate(`document.querySelector('#activity-jobs-tab').click();document.querySelector('#jobs').scrollIntoView();`);
    await until(`!!document.querySelector('.xrb-scrollbar-y[aria-controls=jobs]')`);
    assert.equal(await evaluate(`document.querySelectorAll('.xrb-scrollbar').length === document.querySelectorAll('.xrb-scrollbar:not([hidden])').length`), true);
    assert.equal(await evaluate(`document.querySelector('#jobs details:not([open]) .xrb-scrollbar')!==null`), false);
    assert.equal(await evaluate(`[...document.querySelectorAll('.xrb-scrollbar')].some(b=>document.getElementById(b.getAttribute('aria-controls'))?.matches('#jobs details:not([open]) *'))`), false, 'closed output must not have phantom bars');
    await evaluate(`const list=document.querySelector('#jobs');list.scrollTop=0;`); await sleep(80);
    await evaluate(`document.querySelector('.xrb-scrollbar-y[aria-controls=jobs]').dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}))`);
    assert.ok(await evaluate(`document.querySelector('#jobs').scrollTop`)>0);
    await evaluate(`document.querySelector('.xrb-scrollbar-y[aria-controls=jobs]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
    await until(`document.querySelector('#jobs').scrollTop===0`);
    await evaluate(`document.querySelector('#jobs details').open=true`);
    await until(`[...document.querySelectorAll('.xrb-scrollbar-y')].some(b=>document.getElementById(b.getAttribute('aria-controls'))?.matches('#jobs details[open] pre'))`);
    await evaluate(`document.querySelector('#jobs details').open=false`);
    await until(`![...document.querySelectorAll('.xrb-scrollbar')].some(b=>document.getElementById(b.getAttribute('aria-controls'))?.matches('#jobs details:not([open]) *'))`);
    await evaluate(`document.querySelector('#activity-log-tab').click()`);
    await until(`!document.querySelector('.xrb-scrollbar[aria-controls=jobs]')`);
    await evaluate(`document.querySelector('#activity-jobs-tab').click()`);
    await until(`!!document.querySelector('.xrb-scrollbar[aria-controls=jobs]')`);
    await evaluate(`document.body.classList.add('workspace-pending');document.body.setAttribute('data-xrb-scrollbar','none')`);
    await until(`!document.querySelector('.xrb-scrollbar')`);
    await evaluate(`document.body.classList.remove('workspace-pending');document.body.removeAttribute('data-xrb-scrollbar')`);
    await until(`!!document.querySelector('.xrb-scrollbar[aria-controls=jobs]')`);
    const next = panel.panel.jobs.start('web-build', null, 'Live replacement', async ctx => ctx.line('fresh output'));
    await panel.panel.jobs.wait(next); await sleep(120);
    assert.equal(await evaluate(`[...document.querySelectorAll('.xrb-scrollbar')].every(b=>document.getElementById(b.getAttribute('aria-controls'))?.isConnected)`), true);
    for (const page of ['plugins/', 'settings/', '']) {
      await navigate(panel.url + page, `!!document.body && !document.body.classList.contains('workspace-pending') && !!document.querySelector('.xrb-app-bar')`);
      await sleep(100);
      if (page) assert.equal(await evaluate(`!!document.querySelector('.xrb-scrollbar[aria-controls=jobs]')`), false);
    }
    await evaluate(`document.querySelector('#activity-jobs-tab').click();document.querySelector('#jobs-clear').click()`);
    await until(`document.querySelector('#jobs .empty-note')!==null`);
    await until(`!document.querySelector('.xrb-scrollbar[aria-controls=jobs]')`);
  });
});

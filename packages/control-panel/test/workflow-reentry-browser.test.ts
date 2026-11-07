import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('System is the unset cursor and Apps indicators enter/resize selected without suppressing tab-click animation', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const workspace = await fs.mkdtemp(path.join(REPO, '.artifacts/workflow-reentry-'));
  const project = path.join(workspace, 'projects/unsorted/sample'); await fs.mkdir(path.join(project, 'dist'), { recursive: true });
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify({ name: 'Reentry sample', kind: 'app', entry: 'dist' }));
  await fs.writeFile(path.join(project, 'dist/index.html'), '<html><head></head><body>fixture</body></html>');
  const server = createServer({ repo: REPO, workspace, port: await freePort() });
  await server.panel.loadInitialServices();
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  t.after(async () => { await server.close(); await fs.rm(workspace, { recursive: true, force: true }); });
  await withBrowser(async ({ send, navigate, evaluate }) => {
    const until = async (expr: string) => { for (let i=0;i<100;i++) { if (await evaluate(expr)) return; await sleep(50); } assert.fail(expr); };
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.entryFrames=[];const tick=()=>{const list=document.querySelector('.project-workflow-tabs'),tab=list?.querySelector('[aria-selected="true"]'),line=list?.querySelector('.xrb-tab-indicator');if(tab&&line&&!document.body.classList.contains('workspace-pending')&&list.clientWidth&&entryFrames.length<30){const a=tab.getBoundingClientRect(),b=line.getBoundingClientRect();entryFrames.push({left:Math.abs(a.left-b.left),width:Math.abs(a.width-b.width)});}if(entryFrames.length<30)requestAnimationFrame(tick);};requestAnimationFrame(tick);` });
    const ready = `!document.body.classList.contains('workspace-pending') && !!document.querySelector('.project-workflow-tabs .xrb-tab-indicator')`;
    for (const section of ['settings', 'plugins', 'settings']) {
      await navigate(server.url + section + '/', `!document.body.classList.contains('workspace-pending')`);
      if (section === 'settings') assert.equal(await evaluate(`document.querySelector('#app-preferences [name="cursor"]').value`), 'system');
      await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('[data-navigation="projects"]').click()`);
      await until(ready);
      await until('entryFrames.length >= 20');
      const frames = await evaluate('entryFrames');
      assert.ok(frames.every((frame: any) => frame.left < 1 && frame.width < 1), JSON.stringify(frames));
    }
    await assert.rejects(fs.access(path.join(workspace, '.xrb/app-settings.json')), 'reading defaults never creates preferences');
    const geometry = `(() => {const list=document.querySelector('.project-workflow-tabs'),tab=list.querySelector('[aria-selected="true"]'),line=list.querySelector('.xrb-tab-indicator'),a=tab.getBoundingClientRect(),b=line.getBoundingClientRect();return {left:Math.abs(a.left-b.left),width:Math.abs(a.width-b.width),animations:line.getAnimations().filter(a=>a.playState==='running').length};})()`;
    // Exercise hidden layout and same-selection geometry changes, not just a static settled screenshot.
    await evaluate(`document.querySelector('#dashboard').hidden=true;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    await evaluate(`document.querySelector('#dashboard').hidden=false;document.querySelector('.project-workflow-tabs').style.paddingLeft='35px';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const shown = await evaluate(geometry); assert.ok(shown.left < 1 && shown.width < 1 && shown.animations === 0, JSON.stringify(shown));
    await evaluate(`document.querySelector('.project-workflow-tabs').style.paddingLeft='55px';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const resized = await evaluate(geometry); assert.ok(resized.left < 1 && resized.width < 1 && resized.animations === 0, JSON.stringify(resized));
    assert.equal(await evaluate(`document.querySelector('[data-surface="build"]').disabled`), false);
    const animated = await evaluate(`(async()=>{document.querySelector('[data-surface="build"]').click();for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);const line=document.querySelector('.project-workflow-tabs .xrb-tab-indicator');if(line?.getAnimations().some(a=>a.playState==='running'))return true;}return false;})()`);
    assert.equal(animated, true, 'deliberate visible workflow selection still animates');
  });
});

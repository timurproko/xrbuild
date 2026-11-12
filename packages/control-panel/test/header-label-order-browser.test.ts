import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { serveStatic } from '../src/http.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

async function until(evaluate: (expression: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return;await sleep(40); }
  assert.fail(expression);
}
const states = [[true,true], [true,false], [false,true], [false,false]] as const;
const visibleOrder = (restart: boolean, rebuild: boolean) => [restart ? 'restart' : null, rebuild ? 'rebuild' : null].filter(Boolean);

test('panel and Hands labels retain menu order, visible placement and node identity through state/menu refreshes', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const ui = path.join(REPO, 'packages/control-panel/ui');
  const headers = await Promise.all(['packages/control-panel/ui/index.html', 'embedded/plugins/input-hands/samples/hand-tracking/index.html'].map(async file => {
    const html = await fs.readFile(path.join(REPO,file),'utf8');return html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
  }));
  const server = http.createServer((req,res) => {
    const index = ['/panel','/hands'].indexOf(req.url!);
    if (index < 0) {try {return serveStatic(res,ui,req.url!);} catch {res.writeHead(404);res.end();return;} }
    res.setHeader('content-type','text/html');res.end(`<!doctype html><link rel="stylesheet" href="/design-system.css">${headers[index]}<div id="panel-menu" class="menu" hidden></div><script type="module">
      import {renderNavigationMenu} from '/navigation.js';import {updateRestartChip,updateRebuildChip} from '/design-system.js';
      window.originalLabels=[...document.querySelectorAll('[data-maintenance]')];window.actions=0;document.querySelector('#panel-menu').addEventListener('click',()=>actions++);
      window.refreshLabels=(restart,rebuild)=>{const a=updateRestartChip(document.querySelector('#panel-chip'),restart),b=updateRebuildChip(document.querySelector('#host-chip'),{exists:true,outdated:rebuild});renderNavigationMenu(document.querySelector('#panel-menu'),{origin:location.origin,indicators:true});document.querySelector('#panel-restart-dot').hidden=!a;document.querySelector('#host-rebuild-dot').hidden=!b;};refreshLabels(true,true);
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve())); });
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  await withBrowser(async ({navigate,evaluate}) => {
    for (const page of ['/panel','/hands']) {
      await navigate(base+page, `typeof refreshLabels==='function'`);
      for (const [restart,rebuild] of states) {
        await evaluate(`refreshLabels(${restart},${rebuild})`);
        const result = await evaluate(`(()=>{const h=document.querySelector('.xrb-app-bar'),nodes=[...h.querySelectorAll('[data-maintenance]')],shown=nodes.filter(n=>!n.hidden),brand=h.querySelector('.xrb-brand').getBoundingClientRect();return {order:nodes.map(n=>n.dataset.maintenance),shown:shown.map(n=>n.dataset.maintenance),left:shown.map(n=>n.getBoundingClientRect().left),gap:shown.length?shown[0].getBoundingClientRect().left-brand.right:null,expected:parseFloat(getComputedStyle(h).columnGap),identity:nodes.every((n,i)=>n===originalLabels[i]),menu:[...document.querySelectorAll('#panel-menu [data-navigation]')].filter(n=>['restart','rebuild'].includes(n.dataset.navigation)).map(n=>n.dataset.navigation),dots:[!document.querySelector('#panel-restart-dot').hidden,!document.querySelector('#host-rebuild-dot').hidden],captions:shown.map(n=>n.textContent),classes:shown.map(n=>n.className)};})()`);
        assert.deepEqual(result.order,result.menu);assert.deepEqual(result.shown,visibleOrder(restart,rebuild));assert.equal(result.identity,true);
        assert.deepEqual(result.dots,[restart,rebuild]);
        if (result.left.length===2) assert.ok(result.left[0]<result.left[1]);
        if (result.gap!==null) assert.ok(Math.abs(result.gap-result.expected)<1,'single/both labels reserve no empty slot');
        assert.deepEqual(result.captions,[restart?'restart available':null,rebuild?'rebuild available':null].filter(Boolean));
        assert.deepEqual(result.classes,[restart?'chip warn':null,rebuild?'chip rebuild':null].filter(Boolean));
      }
      await evaluate(`refreshLabels(true,true);document.querySelector('#host-chip').before(document.querySelector('#panel-chip'));refreshLabels(true,true);document.querySelector('#panel-chip').click();document.querySelector('#host-chip').click()`);
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('.xrb-app-bar [data-maintenance]')].map(n=>n.dataset.maintenance)`),['restart','rebuild']);
      assert.equal(await evaluate('actions'),0,'ordering/status labels never invoke maintenance');
    }
  });
});

test('actual Apps/Plugins/Settings headers keep order through asynchronous polling and navigation', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO,'.artifacts'),{recursive:true});
  const root=await fs.mkdtemp(path.join(REPO,'.artifacts/header-refresh-')),core=path.join(root,'core');await fs.mkdir(core);
  const project=path.join(root,'projects/unsorted/demo');await fs.mkdir(project,{recursive:true});await fs.writeFile(path.join(project,'xrb-project.json'),JSON.stringify({name:'Demo',kind:'test',entry:'.'}));
  const port=await freePort(),panel=createServer({repo:core,workspace:root,port});await new Promise<void>(r=>panel.server.listen(port,'127.0.0.1',r));
  t.after(async()=>{await panel.close();await fs.rm(root,{recursive:true,force:true});});
  await withBrowser(async({navigate,evaluate,send})=>{
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.headerStatus={restart:true,rebuild:true};window.headerPolls=[];window.maintenanceCalls=[];const realFetch=window.fetch,realInterval=window.setInterval;
      window.setInterval=(callback,ms,...args)=>{if(ms===30000)headerPolls.push(callback);return realInterval(callback,ms,...args);};
      window.fetch=(input,options={})=>{const route=new URL(input,location.href).pathname;if(options.method==='POST'&&['/api/restart','/api/host/rebuild'].includes(route)){maintenanceCalls.push(route);return Promise.resolve(Response.json({error:'Not authorized by this fixture'},{status:409}));}if(route==='/api/panel')return Promise.resolve(Response.json({outdated:headerStatus.restart,newestSource:'fixture.ts'}));if(route==='/api/host')return Promise.resolve(Response.json({exists:true,outdated:headerStatus.rebuild,exe:'fixture-runtime',exeMs:1}));return realFetch(input,options);};`});
    for(const page of ['','plugins/','settings/']){
      await navigate(panel.url+page,`document.querySelector('#panel-chip')&&!document.body?.classList.contains('workspace-pending')`);
      await until(evaluate,`headerPolls.length>0`);
      for(const[restart,rebuild]of states){
        await evaluate(`headerStatus={restart:${restart},rebuild:${rebuild}};headerPolls.forEach(callback=>callback())`);
        await until(evaluate,`document.querySelector('#panel-chip').hidden===${!restart}&&document.querySelector('#host-chip').hidden===${!rebuild}`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('.xrb-app-bar [data-maintenance]')].filter(n=>!n.hidden).map(n=>n.dataset.maintenance)`),visibleOrder(restart,rebuild));
        assert.deepEqual(await evaluate(`[!document.querySelector('#panel-restart-dot').hidden,!document.querySelector('#host-rebuild-dot').hidden]`),[restart,rebuild]);
      }
      assert.deepEqual(await evaluate('maintenanceCalls'),[]);
    }
    assert.equal(panel.panel.jobs.list().length,0);assert.equal(panel.panel.runner.busy,false);
  });
});

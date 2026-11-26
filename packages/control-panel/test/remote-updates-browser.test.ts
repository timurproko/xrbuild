import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('all module headers share update indication and badge/menu invoke the same Update', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async()=>{
  const root=path.resolve(import.meta.dirname,'../../..'),parent=process.env.XRB_TEST_ROOT??path.join(root,'.artifacts');await fs.mkdir(parent,{recursive:true});
  const workspace=await fs.mkdtemp(path.join(parent,'remote-ui-')),port=await freePort(),panel=createServer({repo:root,workspace,port,developerMode:true});
  panel.panel.remoteUpdates.git=async()=>({code:1,output:''});
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  try {await withBrowser(async({send,navigate,evaluate})=>{
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.updateCalls=[];window.noticeRole='core';const realFetch=fetch;window.fetch=(input,options={})=>{const route=new URL(input,location.href).pathname;
      if(route==='/api/update/available')return Promise.resolve(Response.json({available:true,[noticeRole]:{available:true,branch:'main',checkedMs:Date.now()}}));
      if(route==='/api/host/setup')return Promise.resolve(Response.json({canBuild:true}));
      if(route==='/api/update'&&options.method==='POST'){updateCalls.push(route);return Promise.resolve(Response.json({error:'Fixture: update not executed'},{status:409}));}
      return realFetch(input,options);};`});
    for(const route of ['','plugins/','settings/','hands/','calibration/','design']){
      await navigate(panel.url+route,`!!document.querySelector('[data-maintenance="update"]:not([hidden])')`);
      const actual=await evaluate(`(()=>{const c=document.querySelector('[data-maintenance="update"]');return {text:c.textContent,style:c.className,role:c.getAttribute('role'),dot:!document.querySelector('#panel-update-dot')?.hidden};})()`);
      assert.deepEqual(actual,{text:'update available',style:'chip rebuild',role:'button',dot:true});
      await evaluate(`document.querySelector('[data-maintenance="update"]').click()`);
      for(let n=0;n<50&&await evaluate('updateCalls.length')!==1;n++)await sleep(30);
      assert.deepEqual(await evaluate('updateCalls'),['/api/update']);
      await evaluate(`document.querySelector('[data-xrb-rebuild-dialog]')?.close();document.querySelector('#panel-update').click()`);
      for(let n=0;n<50&&await evaluate('updateCalls.length')!==2;n++)await sleep(30);
      assert.deepEqual(await evaluate('updateCalls'),['/api/update','/api/update']);
      await evaluate(`document.querySelector('[data-xrb-rebuild-dialog]')?.close()`);
      // Exercise the other repository without any dirty-workspace eligibility dependency.
      await evaluate(`import('/navigation.js').then(({renderRemoteUpdate})=>renderRemoteUpdate(document.querySelector('#panel-menu')||document.querySelector('[role=menu]'),{available:true,workspace:{available:true,branch:'release',checkedMs:Date.now()}},()=>{}))`);
      assert.match(await evaluate(`document.querySelector('[data-maintenance="update"]').getAttribute('title')||document.querySelector('[data-maintenance="update"]').getAttribute('data-xrb-tooltip-title')`),/workspace/);
    }
    assert.equal(panel.panel.jobs.list().length,0,'browser fixtures never run Update');
  });}finally{await panel.close();await fs.rm(workspace,{recursive:true,force:true});}
});

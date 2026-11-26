import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('View job links wait for the job list without holding up the destination shell', {skip:!process.env.XRB_TEST_BROWSER,timeout:30000},async()=>{
  const root=path.resolve(import.meta.dirname,'../../..'),scratch=process.env.XRB_TEST_ROOT??path.join(root,'.artifacts');
  await fs.mkdir(scratch,{recursive:true});
  const workspace=await fs.mkdtemp(path.join(scratch,'view-job-')),port=await freePort();
  const panel=createServer({repo:root,workspace,port});
  panel.panel.remoteUpdates.git=async()=>({code:1,output:''});
  const job=panel.panel.jobs.start('web-build',null,'Retained job',async ctx=>{ctx.line('Retained output');});
  await panel.panel.jobs.wait(job);
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  try {await withBrowser(async({send,navigate,evaluate})=>{
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.setItem('panel.activityTab','log');localStorage.setItem('panel.jobShow',JSON.stringify({done:false}));
      window.jobsWaiting=false;window.jobsReleased=false;const originalFetch=fetch;
      window.fetch=async(input,options)=>{if(new URL(input,location.href).pathname==='/api/jobs'){
        jobsWaiting=true;await new Promise(resolve=>window.releaseJobs=()=>{jobsReleased=true;resolve();});
      }return originalFetch(input,options);};`});
    for(const route of ['','plugins/']){
      await navigate(`${panel.url}${route}?job=${job.id}`,`window.jobsWaiting && !!document.querySelector('.xrb-app-bar')`);
      assert.equal(await evaluate('jobsReleased'),false,'job data is still withheld after shell readiness');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.xrb-app-bar')).visibility`),'visible');
      assert.equal(await evaluate(`document.querySelector('#activity-log-tab').getAttribute('aria-selected')`),'true');
      await evaluate('releaseJobs()');
      let opened=false;
      for(let n=0;n<100;n++){
        opened=await evaluate(`document.querySelector('#activity-jobs-tab').getAttribute('aria-selected')==='true' && document.querySelector('details[data-job="${job.id}"]')?.open===true`);
        if(opened)break;await sleep(50);
      }
      assert.ok(opened,`${route||'Apps'} job navigation is resumed when the delayed job list arrives`);
      assert.equal(await evaluate('location.pathname'),'/','standalone View job returns to Apps');
      assert.equal(await evaluate(`new URLSearchParams(location.search).has('job')`),false);
      assert.match(await evaluate(`document.querySelector('details[data-job="${job.id}"]').textContent`),/Retained output/);
    }
    const image=await send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(scratch,'view-job-after.png'),Buffer.from(image.data,'base64'));
  });}finally{await panel.close();await fs.rm(workspace,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

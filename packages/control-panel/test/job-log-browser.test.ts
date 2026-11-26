import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('all progress states copy full retained job logs at the same top-right position as Jobs', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async()=>{
  const root=path.resolve(import.meta.dirname,'../../..'),parent=process.env.XRB_TEST_ROOT??path.join(root,'.artifacts');await fs.mkdir(parent,{recursive:true});
  const workspace=await fs.mkdtemp(path.join(parent,'job-copy-')),port=await freePort(),panel=createServer({repo:root,workspace,port,developerMode:true});
  panel.panel.remoteUpdates.git=async()=>({code:1,output:''});
  const lines=Array.from({length:500},(_,i)=>`build line ${i}`);
  const job=panel.panel.jobs.start('web-build',null,'Copy fixture',async ctx=>{for(const line of lines)ctx.line(line);});
  await new Promise<void>(resolve=>setImmediate(resolve));
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  try {
    const list=await (await fetch(panel.url+'api/jobs')).json() as any;
    assert.equal(list.jobs[0].lines.length,200);
    const full=await (await fetch(panel.url+`api/jobs/${job.id}`)).json() as any;
    assert.deepEqual(full.lines,lines);
    assert.equal((await fetch(panel.url+'api/jobs/9999')).status,404);
    await withBrowser(async({navigate,evaluate,send})=>{
      await navigate(panel.url,`!!document.querySelector('#jobs')`);
      await evaluate(`(async()=>{
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.denyCopy)throw new Error('denied');window.copiedLog=text;}}});
        const {rebuildProgressDialog}=await import('/rebuild-dialog.js'),{readJobLog}=await import('/job-log.js');
        window.copyProgress=rebuildProgressDialog();copyProgress.setLogReader((job,fallback)=>readJobLog(location.origin,job,fallback));
      })()`);
      for(const kind of ['host-rebuild','update','desktop-setup','run','preview-run'])for(const state of ['running','done','failed']){
        await evaluate(`copiedLog=null;copyProgress.show({id:${job.id},kind:'${kind}',state:'${state}',error:'Compile failed.',lines:${JSON.stringify(lines.slice(-200))}})`);
        const geometry=await evaluate(`(()=>{const button=document.querySelector('[data-xrb-rebuild-copy]').getBoundingClientRect(),box=document.querySelector('[data-xrb-rebuild-output]').getBoundingClientRect();return {top:button.top-box.top,right:box.right-button.right,shown:!document.querySelector('[data-xrb-rebuild-copy]').hidden};})()`);
        assert.deepEqual(geometry,{top:4,right:6,shown:true});
        await evaluate(`document.querySelector('[data-xrb-rebuild-copy]').click()`);
        for(let n=0;n<100&&await evaluate('copiedLog')===null;n++)await sleep(20);
        assert.equal(await evaluate('copiedLog'),lines.join('\n'),`${kind}/${state}: full log, not 20/200-line tail`);
      }
      await evaluate(`copyProgress.show(null,'The job could not start: network unavailable.');document.querySelector('[data-xrb-rebuild-copy]').click()`);
      for(let n=0;n<50&&!String(await evaluate('copiedLog')).includes('could not start');n++)await sleep(20);
      assert.match(await evaluate('copiedLog'),/could not start/);
      await evaluate(`denyCopy=true;document.querySelector('[data-xrb-rebuild-copy]').click()`);await sleep(50);
      assert.equal(await evaluate(`copyProgress.element.open`),true);
      assert.match(await evaluate(`document.querySelector('[data-xrb-rebuild-copy]').dataset.tooltip`),/Could not copy/);
      await evaluate(`denyCopy=false;copyProgress.close();document.querySelector('#job-progress-output').textContent='Package diagnostic';document.querySelector('#job-progress').showModal();document.querySelector('#job-progress-copy').click()`);
      for(let n=0;n<50&&await evaluate('copiedLog')!=='Package diagnostic';n++)await sleep(20);
      assert.equal(await evaluate('copiedLog'),'Package diagnostic');
      await evaluate(`document.querySelector('#job-progress').close();document.querySelector('#activity-jobs-tab').click();document.querySelector('details[data-job="${job.id}"]').open=true;document.querySelector('details[data-job="${job.id}"] .job-copy').click()`);
      for(let n=0;n<100&&await evaluate('copiedLog')!==lines.join('\n');n++)await sleep(20);
      assert.equal(await evaluate('copiedLog'),lines.join('\n'),'Jobs shares the same complete-log source');
    });
  }finally{await panel.close();await fs.rm(workspace,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

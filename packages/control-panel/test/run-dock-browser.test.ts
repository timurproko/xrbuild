import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../src/server.ts';
import {freePort} from '../src/host-runner.ts';
import {withBrowser,sleep} from './browser-fixture.ts';

test('header Start stays in the app bar on every tab without flashing, scroll or a duplicate in content', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const artifacts=path.resolve(import.meta.dirname,'../../../.artifacts');await fs.mkdir(artifacts,{recursive:true});
  const root=await fs.mkdtemp(path.join(artifacts,'run-dock-')),repo=path.join(root,'core'),workspace=path.join(root,'workspace'),project=path.join(workspace,'projects/unsorted/sample');
  await fs.mkdir(repo);await fs.mkdir(project,{recursive:true});
  await fs.writeFile(path.join(project,'xrb-project.json'),JSON.stringify({name:'Sample',kind:'app',entry:'dist',target:'host',publication:{enabled:true,publisher:'fixture',slug:'sample',id:'55555555-5555-4555-8555-555555555555'}}));
  const port=await freePort(),panel=createServer({repo,workspace,port});
  panel.panel.awaitPublicationStatus=true;
  panel.panel.publishers={found:[{dir:workspace,publisher:{name:'fixture',origin:'https://example.test',routePrefix:'apps',validate:()=>[],status:async()=>({state:'unpublished',selectedUrl:'https://example.test/apps/sample/'}),publish:async()=>{throw Error('No publish permitted');},unpublish:async()=>{throw Error('No unpublish permitted');}}}],problems:[]};
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await panel.close();await fs.rm(root,{recursive:true,force:true});});
  await withBrowser(async({navigate,evaluate,send})=>{
    await navigate(panel.url,`!!document.querySelector('[data-surface=publish]')&&!document.querySelector('#run-dock').hidden`);
    assert.deepEqual(await evaluate(`[document.querySelector('#run-dock .xrb-run-button').getAttribute('aria-label'),!!document.querySelector('#run-dock img,#run-dock .name'),!!document.querySelector('#act-run')]`),['Start',false,false],'the header holds only the Start icon; content has no Run');
    for(const width of [1280,900])for(const reduced of [false,true]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:520,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
      for(const surface of ['publish','display','build']){
        const samples=await evaluate(`new Promise(resolve=>{const samples=[],start=performance.now();document.querySelector('[data-surface=${surface}]').click();function frame(){const dock=document.querySelector('#run-dock'),button=dock.querySelector('.xrb-run-button'),bar=document.querySelector('.top').getBoundingClientRect(),r=button.getBoundingClientRect();samples.push({hidden:dock.hidden,label:button.getAttribute('aria-label'),inside:r.top>=bar.top&&r.bottom<=bar.bottom});if(performance.now()-start<300)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);})`);
        assert.ok(samples.length>3);
        assert.ok(samples.every((sample:{hidden:boolean;label:string;inside:boolean})=>!sample.hidden&&sample.label==='Start'&&sample.inside),`Start stays in the bar on ${surface} ${width}/${reduced}: ${JSON.stringify(samples.filter((sample:{hidden:boolean;inside:boolean})=>sample.hidden||!sample.inside))}`);
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`const filler=document.createElement('div');filler.style.height='2000px';document.body.append(filler);window.scrollTo(0,1200)`);await sleep(100);
    assert.equal(await evaluate(`document.querySelector('#run-dock').hidden`),false,'scrolling never hides or moves Start');
  });
  assert.equal(panel.panel.jobs.list().length,0);
});

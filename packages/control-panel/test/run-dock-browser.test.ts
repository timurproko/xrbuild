import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../src/server.ts';
import {freePort} from '../src/host-runner.ts';
import {withBrowser,sleep} from './browser-fixture.ts';

test('Run dock never flashes during Publish/Develop transitions and only appears above the app bar', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
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
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__dockObservers=[];const Original=window.IntersectionObserver;window.IntersectionObserver=class extends Original{constructor(callback,options){super(callback,options);this.deliver=callback;}observe(target){if(['act-run','act-stop'].includes(target.id)){this.target=target;window.__dockObservers.push(this);}super.observe(target);}};`});
    const until=async(expression:string)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}assert.fail(expression);};
    await navigate(panel.url,`!!document.querySelector('[data-surface=publish]')&&!!document.querySelector('#act-run')`);
    for(const width of [1280,390])for(const reduced of [false,true]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:520,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
      await evaluate(`window.scrollTo(0,0);document.querySelector('[data-surface=publish]').click()`);await sleep(300);
      assert.equal(await evaluate(`document.querySelector('#run-dock').hidden`),true);
      const samples=await evaluate(`new Promise(resolve=>{const samples=[],start=performance.now();document.querySelector('[data-surface=display]').click();function frame(){const source=document.querySelector('#act-run'),bar=document.querySelector('.top');samples.push({hidden:document.querySelector('#run-dock').hidden,scroll:scrollY,bottom:source?.getBoundingClientRect().bottom,bar:bar.getBoundingClientRect().bottom});if(performance.now()-start<500)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);})`);
      assert.ok(samples.length>3);
      assert.ok(samples.every((sample:{hidden:boolean;bottom:number;bar:number})=>sample.hidden||sample.bottom<=sample.bar),`no below-bar dock flash ${width}/${reduced}: ${JSON.stringify(samples.filter((sample:{hidden:boolean})=>!sample.hidden))}`);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`window.scrollTo(0,0);const filler=document.createElement('div');filler.id='dock-scroll-space';filler.style.height='2000px';document.body.append(filler)`);await sleep(80);
    await evaluate(`window.scrollTo(0,document.querySelector('#act-run').getBoundingClientRect().bottom+scrollY+10)`);
    await until(`!document.querySelector('#run-dock').hidden`);
    assert.equal(await evaluate(`document.querySelector('#run-dock .name').textContent`),'Sample');
    await evaluate(`window.scrollTo(0,0)`);await until(`document.querySelector('#run-dock').hidden`);
    // Height animation/clipping is not scrolling; keep this below-bar control out of the header.
    await evaluate(`{const content=document.querySelector('#project-content');content.style.height='80px';content.style.overflow='hidden';}`);await sleep(100);
    assert.equal(await evaluate(`document.querySelector('#run-dock').hidden`),true,'clipped below-bar action is not scrolled away');
    await evaluate(`{const content=document.querySelector('#project-content');content.style.removeProperty('height');content.style.removeProperty('overflow');document.querySelector('[data-surface=publish]').click();}`);await sleep(300);
    await evaluate(`const old=window.__dockObservers.at(-1);old.deliver([{target:old.target,isIntersecting:false,boundingClientRect:{top:-70,bottom:-40,width:96,height:30},rootBounds:{top:56}}]);`);
    assert.equal(await evaluate(`document.querySelector('#run-dock').hidden`),true,'queued observations cannot resurrect a removed action');
  });
  assert.equal(panel.panel.jobs.list().length,0);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../src/server.ts';
import {freePort} from '../src/host-runner.ts';
import {withBrowser,sleep} from './browser-fixture.ts';

test('publication read-only, dropdown and editable fields share typography in empty and retained-release states', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const artifacts=path.resolve(import.meta.dirname,'../../../.artifacts');await fs.mkdir(artifacts,{recursive:true});
  const root=await fs.mkdtemp(path.join(artifacts,'publication-fonts-')),repo=path.join(root,'core'),workspace=path.join(root,'workspace'),project=path.join(workspace,'projects/unsorted/sample');
  await fs.mkdir(repo);await fs.mkdir(project,{recursive:true});
  const manifest={name:'Sample',kind:'app',entry:'dist',target:'webxr',publication:{enabled:true,publisher:'fixture',slug:'sample',id:'55555555-5555-4555-8555-555555555555'}};
  const file=path.join(project,'xrb-project.json');await fs.writeFile(file,JSON.stringify(manifest));
  const port=await freePort(),panel=createServer({repo,workspace,port});let retained=false;
  const writes:string[]=[];panel.server.on('request',req=>{if(req.method!=='GET')writes.push(`${req.method} ${req.url}`);});
  panel.panel.awaitPublicationStatus=true;panel.panel.publicationStatusMaxAgeMs=0;
  panel.panel.publishers={found:[{dir:workspace,publisher:{name:'fixture',origin:'https://example.test',routePrefix:'apps',validate:()=>[],status:async()=>({state:'unpublished',selectedUrl:'https://example.test/apps/sample/'}),publish:async()=>{throw Error('No publishing permitted');},unpublish:async()=>{throw Error('No unpublishing permitted');},releases:{catalog:async()=>({revision:'fixture',releases:retained?[{releaseId:'old',version:'1.0.0',digest:'a'.repeat(64),createdMs:1,url:'https://example.test/archive/old/'}]:[],liveReleaseId:null,requestedReleaseId:null,legacyLive:false}),publish:async()=>{throw Error('No publishing permitted');},activate:async()=>{throw Error('No activation permitted');},delete:async()=>{throw Error('No deletion permitted');}}}}],problems:[]};
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await panel.close();await fs.rm(root,{recursive:true,force:true});});
  await withBrowser(async({navigate,evaluate,send})=>{
    const until=async(expression:string)=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await sleep(50);}assert.fail(expression);};
    const check=async()=>{
      const styles=await evaluate(`(()=>{const font=element=>{const style=getComputedStyle(element);return ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].map(key=>style[key]);};const slug=document.querySelector('[name="publication.slug"]'),controls=[...document.querySelectorAll('.publication-version input:not([type=hidden]),#build-settings .dropdown-btn,.dropdown-list .xrb-option-label')];return {expected:font(slug),values:controls.map(font)};})()`);
      assert.ok(styles.values.length>=3);
      for(const actual of styles.values)assert.deepEqual(actual,styles.expected);
    };
    for(const history of [false,true]){
      retained=history;
      await navigate(panel.url,`!!document.querySelector('[data-surface=publish]')`);
      await evaluate(`document.querySelector('[data-surface=publish]').click()`);
      await until(`!!document.querySelector('[name="publication.version"]')`);
      assert.equal(await evaluate(`document.querySelector('.publication-live')?.value??document.querySelector('[name="publication.live"]').closest('.dropdown').querySelector('.xrb-option-label').textContent`),'Not live');
      for(const theme of ['light','dark'])for(const width of [1280,390]){
        await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await check();
      }
      if(!history){
        assert.equal(await evaluate(`document.querySelector('.publication-live').getAttribute('aria-disabled')`),'true');
        assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.publication-live')).color`),await evaluate(`getComputedStyle(document.querySelector('[name="publication.slug"]')).color`),'disabled color remains distinct');
      }else{
        // Let responsive layout and focus-reveal scrolling settle before opening the floating list.
        await send('Page.bringToFront');
        await evaluate(`document.querySelector('[name="publication.live"]').closest('.dropdown').scrollIntoView({block:'center'})`);await sleep(300);
        await evaluate(`document.querySelector('[name="publication.live"]').closest('.dropdown').querySelector('button').click()`);
        await until(`!!document.querySelector('.dropdown-list [role=option]')`);await check();
      }
    }
  });
  assert.deepEqual(writes,[]);assert.equal(panel.panel.jobs.list().length,0);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),manifest);
});

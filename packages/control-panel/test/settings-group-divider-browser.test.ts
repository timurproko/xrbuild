import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {createServer} from '../src/server.ts';
import {freePort} from '../src/host-runner.ts';
import {REPO} from '../src/env.ts';
import {withBrowser,sleep} from './browser-fixture.ts';

test('Theme and Cursor share normal field spacing without a divider; real groups and independent saves remain', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000}, async t=>{
  await fs.mkdir(path.join(REPO,'.artifacts'),{recursive:true});
  const root=await fs.mkdtemp(path.join(REPO,'.artifacts/settings-divider-')),core=path.join(root,'core'),plugin=path.join(root,'plugins/mock-input');
  await fs.mkdir(core);await fs.mkdir(plugin,{recursive:true});
  await fs.writeFile(path.join(plugin,'xrb-plugin.json'),JSON.stringify({title:'Mock settings',type:'input',version:'1.0.0',settings:[
    {key:'enabled',label:'Enabled',section:'First group',type:'boolean',default:true},
    {key:'amount',label:'Amount',section:'Second group',type:'number',default:2,min:0,max:10},
  ]}));
  const port=await freePort(),panel=createServer({repo:core,workspace:root,port});await new Promise<void>(r=>panel.server.listen(port,'127.0.0.1',r));
  t.after(async()=>{await panel.close();await fs.rm(root,{recursive:true,force:true});});
  const file=path.join(root,'.xrb/app-settings.json');
  await withBrowser(async({navigate,evaluate})=>{
    const until=async(expr:string)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(40);}assert.fail(expr);};
    await navigate(panel.url+'settings/',`!!document.querySelector('#app-preferences') && !!document.querySelector('[data-plugin-settings]')`);
    const geometry=()=>evaluate(`(()=>{const theme=document.querySelector('#panel-appearance'),cursor=document.querySelector('#app-preferences'),card=theme.closest('.card'),a=theme.getBoundingClientRect(),b=cursor.getBoundingClientRect(),s=getComputedStyle(cursor),group=document.querySelector('[data-plugin-settings] .settings-section.xrb-section-divider');return {same:card===cursor.closest('.card'),divider:cursor.classList.contains('xrb-section-divider'),border:s.borderTopWidth,padding:s.paddingTop,gap:b.top-a.bottom,expected:parseFloat(getComputedStyle(card).rowGap),groupBorder:getComputedStyle(group).borderTopWidth,group:group.textContent};})()`);
    let g=await geometry();assert.equal(g.same,true);assert.equal(g.divider,false);assert.equal(g.border,'0px');assert.equal(g.padding,'0px');assert.ok(Math.abs(g.gap-g.expected)<0.2);assert.equal(g.groupBorder,'1px');assert.equal(g.group,'Second group');
    await fs.access(file).then(()=>assert.fail('browsing must not save cursor preferences'),()=>{});
    await evaluate(`const theme=document.querySelector('#panel-appearance [name=theme]');theme.value='dark';theme.dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`localStorage.getItem('panel.theme')`),'dark');
    await fs.access(file).then(()=>assert.fail('Theme must stay browser-local'),()=>{});
    await evaluate(`const cursor=document.querySelector('#app-preferences [name=cursor]');cursor.value='ring';cursor.dispatchEvent(new Event('change',{bubbles:true}))`);
    await until(`document.querySelector('#app-preferences [name=cursor]')?.value==='ring' && !document.querySelector('#app-preferences .dropdown-btn')?.disabled`);
    assert.equal(JSON.parse(await fs.readFile(file,'utf8')).cursor,'ring');
    await navigate(panel.url+'settings/',`document.querySelector('#app-preferences [name=cursor]')?.value==='ring'`);
    assert.equal(await evaluate(`document.querySelector('#panel-appearance [name=theme]').value`),'dark');
    g=await geometry();assert.equal(g.border,'0px');assert.equal(g.groupBorder,'1px');assert.ok(Math.abs(g.gap-g.expected)<0.2);
  });
});

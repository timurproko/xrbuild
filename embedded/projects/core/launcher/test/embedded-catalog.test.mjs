import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
const core=process.env.XRB_CORE;
if(!core)throw Error('Public catalog checks require explicit XRB_CORE');
const {validateManifest}=await import(pathToFileURL(path.join(core,'packages/control-panel/src/projects.ts')).href);
const groups=['core/launcher','core/ui-kit','unsorted/test','archive/eyes-check','archive/hands-check','archive/hello-cube','archive/rig-check','archive/touch-check'];
test('all eight product projects retain sections/archives and portable inactive defaults',async()=>{
 for(const group of groups){const m=JSON.parse(await fs.readFile(path.join(core,'embedded/projects',group,'xrb-project.json'),'utf8'));
  assert.equal(m.display,'desktop',group);assert.deepEqual(m.inputs,[],group);assert.deepEqual(validateManifest(m,path.join(core,'embedded/projects',group)),[],group);assert.equal(m.fullscreen,false,group);
  for(const key of ['publication','plugins','platform','platformSettings','monitor','hostArgs','input','uuid'])assert.equal(m[key],undefined,group+': '+key);
 }
 const root=path.join(core,'embedded/projects'),found=[];for(const section of await fs.readdir(root,{withFileTypes:true})){if(!section.isDirectory())continue;for(const folder of await fs.readdir(path.join(root,section.name),{withFileTypes:true})){if(!folder.isDirectory())continue;try{await fs.access(path.join(root,section.name,folder.name,'xrb-project.json'));found.push(section.name+'/'+folder.name);}catch{}}}
 assert.deepEqual(found.sort(),[...groups].sort());
});
test('starter source is generated from canonical template and retains the upstream font notice',async()=>{
 for(const relative of ['src/main.js','src/icon.js','src/icon-theme.js','public/font-LICENSE.txt']){const template=(await fs.readFile(path.join(core,'templates/app',relative),'utf8')).replaceAll('__NAME__','Test').replaceAll('\r\n','\n');const actual=(await fs.readFile(path.join(core,'embedded/projects/unsorted/test',relative),'utf8')).replaceAll('\r\n','\n');assert.equal(actual,template,relative);}
});
test('archived diagnostics parse and render without a host, device, capture or inference',async()=>{
 for(const group of groups.filter(g=>g.startsWith('archive/')&&g!=='archive/hello-cube')){
  const html=await fs.readFile(path.join(core,'embedded/projects',group,'index.html'),'utf8');assert.match(html,/compatible host\/provider must be selected explicitly/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],frames=[];let sockets=0;
  const ctx=new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)}),canvas={getContext:()=>ctx,addEventListener(){}};
  vm.runInNewContext(script,{window:{},document:{getElementById:()=>canvas},console:{log(){}},innerWidth:800,innerHeight:600,performance:{now:()=>100},requestAnimationFrame:f=>frames.push(f),addEventListener(){},setTimeout(){},setInterval(){},WebSocket:class{constructor(){sockets++;}},TextDecoder,DataView,ArrayBuffer,Uint8Array});
  for(let i=0;i<3;i++)frames.shift()?.();assert.equal(sockets,0,group);
 }
});

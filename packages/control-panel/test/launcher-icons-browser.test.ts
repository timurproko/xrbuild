import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { withBrowser } from './browser-fixture.ts';

// Exercise the actual public React card, not an extracted obsolete imperative class with stub controls.
test('Launcher default geometry renders on its first component mount without destination navigation', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const core=path.resolve(import.meta.dirname,'../../..'),app=path.join(core,'embedded/projects/core/launcher');
  const previousCore=process.env.XRB_CORE;process.env.XRB_CORE=core;
  t.after(()=>{if(previousCore===undefined)delete process.env.XRB_CORE;else process.env.XRB_CORE=previousCore;});
  const require=createRequire(path.join(app,'package.json'));
  const {build}=await import(pathToFileURL(require.resolve('vite')).href);
  const {default:configFactory}=await import(pathToFileURL(path.join(app,'vite.config.js')).href);
  const previous=process.cwd();process.chdir(app);
  let config;
  try{config=configFactory();}finally{process.chdir(previous);}
  const scratch=process.env.XRB_TEST_ROOT??path.join(core,'.artifacts');await fs.mkdir(scratch,{recursive:true});
  const root=await fs.mkdtemp(path.join(scratch,'launcher-component-browser-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const entry=path.join(root,'main.tsx'),out=path.join(root,'dist');
  await fs.writeFile(entry,`import React from 'react';
import * as THREE from 'three';
import {mountXrbApp} from '@xr-build/react';
import {LauncherCard} from '@fixture/launcher';
const mount=mountXrbApp(document.body,<><hemisphereLight args={[0xffffff,0x444444,3]}/><LauncherCard entry={{title:'Never launched',description:'',launchUrl:'http://127.0.0.1/destination/',defaultIcon3d:true,defaultSphere:true,iconColor:'amber'}} index={0} x={0} launching={null} onLaunch={()=>{}}/></>,{autoStart:false,camera:{position:[0,0,0.67]},xrb:{pointer:false,mapping:{mode:'world',center:new THREE.Vector3(),scale:1}}});
await mount.ready;
let sphere;mount.app.scene.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.parent?.name==='xrb-icon')sphere=o;});
window.beforeDraw=!!sphere;
let frames=0;const off=mount.app.onComponentFrame(()=>{if(++frames<3)return;window.result={icon:!!sphere,mesh:sphere?.isMesh,color:sphere?.material.color.getHexString(),calls:mount.app.renderer.info.render.calls};off();});
window.addEventListener('pagehide',()=>void mount.dispose(),{once:true});mount.app.start();`);
  await build({configFile:false,root:app,plugins:config.plugins,resolve:{...config.resolve,alias:{...config.resolve.alias,'@fixture/launcher':path.join(app,'src/index.ts')}},define:{...config.define,'process.env.NODE_ENV':'"production"'},logLevel:'silent',build:{target:'es2022',outDir:out,lib:{entry,formats:['es'],fileName:()=> 'main.js'}}});
  const server=http.createServer(async(req,res)=>{
    try{if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<script type="module" src="/main.js"></script>');return;}
      const name=path.basename(new URL(req.url!,'http://127.0.0.1').pathname);res.setHeader('content-type',name.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(path.join(out,name)));
    }catch{res.statusCode=404;res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  await withBrowser(async({navigate,evaluate})=>{
    await navigate(`http://127.0.0.1:${(server.address() as {port:number}).port}/`,'!!window.result');
    assert.equal(await evaluate('beforeDraw'),true);const result=await evaluate('result');
    assert.equal(result.icon,true);assert.equal(result.mesh,true);assert.equal(result.color,'d58a20');assert.ok(result.calls>0);
  });
});

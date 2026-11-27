import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
const core=process.env.XRB_CORE,scratch=process.env.XRB_TEST_ROOT??path.join(core,'.artifacts');
const {componentApp}=await import(pathToFileURL(path.join(core,'packages/react/test/component-app.fixture.mjs')));
const {createProject}=await import(pathToFileURL(path.join(core,'packages/control-panel/src/workspace.ts')));
test('a separate consumer mounts exported app scenes under one runtime and releases removed subtrees',async t=>{
 await fs.mkdir(scratch,{recursive:true});const workspace=await fs.mkdtemp(path.join(scratch,'cross-app-consumer-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await createProject(core,workspace,'library','Library','combined');const root=path.join(workspace,'consumer');await fs.mkdir(path.join(root,'src'),{recursive:true});
 await fs.writeFile(path.join(root,'src/main.tsx'),`import React from 'react';
import {mountXrbApp} from '@xr-build/react';
import {UiKitScene} from '@xr-build/ui-kit-app';
import {LauncherScene} from '@scene/launcher';
import {AppScene} from '@scene/library';
export const mount=mountXrbApp(document.body,<><UiKitScene/><LauncherScene/><AppScene title="Nested"/></>,{xrb:{pointer:false}});
export function removeShowcase(){mount.update(<><LauncherScene/><AppScene title="Nested"/></>);}
export function dispose(){return mount.dispose();}
await mount.ready;`);
 const state=await componentApp(root,{aliases:{'@scene/launcher':path.join(core,'embedded/projects/core/launcher/src/index.ts'),'@scene/library':path.join(workspace,'projects/unsorted/library/src/index.ts')}});
 try{
  assert.equal(state.exports.mount.app,state.app);assert.equal(state.calls.filter(c=>c==='loop.start').length,1);assert.ok(state.app.scene.getObjectByName('app-title'));
  const targets=state.app.xrb.interaction.targets.size;assert.ok(targets>19);state.tick(1000);
  state.exports.removeShowcase();await new Promise(r=>setTimeout(r,40));assert.ok(state.app.xrb.interaction.targets.size<targets);assert.equal(state.calls.filter(c=>c==='loop.start').length,1);state.tick(1016);
  await state.exports.dispose();assert.equal(state.app.xrb.interaction.targets.size,0);assert.equal(state.pending.size,0);
 }finally{await state.dispose();}
});

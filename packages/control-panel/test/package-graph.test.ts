import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {Panel,packageGraphReady} from '../src/panel.ts';

const hub={send(){}} as ConstructorParameters<typeof Panel>[2];

test('workspace package readiness detects stale locks and package manifests',async(t)=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-package-graph-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  assert.equal(await packageGraphReady(root),false);
  await fs.writeFile(path.join(root,'package.json'),'{}\n');
  await fs.mkdir(path.join(root,'node_modules'),{recursive:true});
  assert.equal(await packageGraphReady(root),false,'an installed directory without a graph stamp is stale');
  const panel=new Panel('core',root,hub,root,true);
  await panel.ensureInstalled({line(){},async run(){}});
  assert.equal(await packageGraphReady(root),true,'a successful setup records the package manifests it installed');
  await fs.writeFile(path.join(root,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\r\nvalue: current\r\n");
  assert.equal(await packageGraphReady(root),false,'a pinned graph needs the virtual-store lock');
  await fs.mkdir(path.join(root,'node_modules','.pnpm'),{recursive:true});
  await fs.writeFile(path.join(root,'node_modules','.pnpm','lock.yaml'),"lockfileVersion: '9.0'\nvalue: current\n");
  assert.equal(await packageGraphReady(root),true,'line endings do not make an installed graph stale');
  await fs.writeFile(path.join(root,'package.json'),'{"private":true}\n');
  assert.equal(await packageGraphReady(root),false,'a changed package manifest requires setup even when the lock copies still match');
  await panel.ensureInstalled({line(){},async run(){}});
  assert.equal(await packageGraphReady(root),true);
  await fs.writeFile(path.join(root,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\r\nvalue: updated\r\n");
  assert.equal(await packageGraphReady(root),false,'a pulled lockfile change requires setup before import');
});

test('user and repository workspaces refresh mutable graphs while explicit workspaces stay frozen',async(t)=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-package-install-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'package.json'),'{}\n');
  const commands:string[]=[];
  const projectModules=path.join(root,'projects','Unsorted','new-app','node_modules');
  const context={line(){},async run(_command:string,args:string[]){
    commands.push(args.at(-1)??'');
    if(await fs.access(path.join(root,'projects','Unsorted','new-app','package.json')).then(()=>true,()=>false)) await fs.mkdir(projectModules,{recursive:true});
  }};
  const userPanel=new Panel('core',root,hub,root,true);
  await userPanel.ensureInstalled(context);
  assert.deepEqual(commands,['corepack pnpm install --no-frozen-lockfile']);
  commands.length=0;
  await fs.mkdir(path.join(root,'projects','Unsorted','new-app'),{recursive:true});
  await fs.writeFile(path.join(root,'projects','Unsorted','new-app','package.json'),'{"dependencies":{"vite":"1.0.0"}}\n');
  await userPanel.ensureInstalled(context);
  assert.deepEqual(commands,['corepack pnpm install --no-frozen-lockfile'],'a new user project refreshes the generated lock and links');
  assert.equal(await packageGraphReady(root),true);
  commands.length=0;
  await fs.rm(projectModules,{recursive:true,force:true});
  assert.equal(await packageGraphReady(root),false,'recreating the same project cannot reuse a stamp when its local dependency links are gone');
  await userPanel.ensureInstalled(context);
  assert.deepEqual(commands,['corepack pnpm install --no-frozen-lockfile'],'missing project links are restored before its dev script runs');
  commands.length=0;
  await fs.writeFile(path.join(root,'projects','Unsorted','new-app','package.json'),'{"dependencies":{"vite":"2.0.0"}}\n');
  const repositoryPanel=new Panel('core',root,hub,root,true);
  await repositoryPanel.ensureInstalled(context);
  assert.deepEqual(commands,['corepack pnpm install --no-frozen-lockfile'],'repository development workspaces repair their lock after pulled package changes');
  commands.length=0;
  await fs.writeFile(path.join(root,'projects','Unsorted','new-app','package.json'),'{"dependencies":{"vite":"3.0.0"}}\n');
  const explicitPanel=new Panel('core',root,hub);
  await explicitPanel.ensureInstalled(context);
  assert.deepEqual(commands,['corepack pnpm install --frozen-lockfile'],'arbitrary explicit workspaces still require a committed current lockfile');
});

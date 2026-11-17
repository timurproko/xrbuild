import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requestCompletion } from './worktree.mjs';
import { loadCleanupRuntime } from './a1-cleanup-runtime.mjs';
import { exactRemovalDeclaration, invokeRepositoryAdapter, runRuntimeAdapter } from './runtime-removal-adapter.mjs';

test('repository CLI only queues distinct A1 operations, never local deletion or synchronous settlement',async()=>{
  const calls=[];
  for(const local of [false,true]) assert.match(await requestCompletion({local,root:process.cwd(),loadRuntime:async()=>({}),execute:(...args)=>calls.push(args)}),/not settled.*Exit this tool batch/);
  assert.deepEqual(calls.map(call=>call.slice(0,2)),[['a1',['worktree','complete']],['a1',['worktree','remove-local']]]);
});
test('deployed declaration is the exact paired completion and distinct local-removal contract',()=>{
  const declaration=exactRemovalDeclaration();
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../../.a1/worktree.json',import.meta.url))),declaration);
  for(const parts of [declaration.cleanupPreflight,declaration.cleanup,declaration.localRemoval.preflight,declaration.localRemoval.execute]){
    assert.ok(parts.includes('{primary}'));assert.ok(parts.includes('{worktree}'));assert.ok(parts.includes('{snapshot}'));
    assert.equal(parts.includes('sweep'),false);assert.equal(parts.includes('--discard'),false);
  }
  assert.notDeepEqual(declaration.cleanup,declaration.localRemoval.execute);
});
test('malformed transport and unexpanded legacy snapshot refuse before any adapter work',async()=>{
  const declaration=exactRemovalDeclaration(),base=declaration.cleanup.slice(1).map(part=>part==='{primary}'?process.cwd():part);
  await assert.rejects(()=>invokeRepositoryAdapter('node',base,process.cwd()),/Invalid approved snapshot/);
  await assert.rejects(()=>invokeRepositoryAdapter('node',[...base,'--force'],process.cwd()),/Unexpected exact adapter/);
});
test('package version text cannot substitute for supported public APIs',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xr-unsupported-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'node_modules/@timurproko/a1');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'@timurproko/a1',version:'999.0.0'}));
  let calls=0;
  await assert.rejects(()=>requestCompletion({root,execute:()=>calls++}),error=>error.code==='XRB_RUNTIME_UNAVAILABLE');
  assert.equal(calls,0);
});
test('missing public package blocks the repository completion command before any A1 request',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xr-no-command-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let calls=0;
  await assert.rejects(()=>requestCompletion({root,execute:()=>calls++}),error=>error.code==='XRB_RUNTIME_UNAVAILABLE');
  assert.equal(calls,0);
});
test('missing public package refuses with bounded structured preflight explanation, never runtime discovery',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xr-no-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(()=>loadCleanupRuntime(root),error=>error.code==='XRB_RUNTIME_UNAVAILABLE'&&/No detach/.test(error.message));
  await assert.rejects(()=>runRuntimeAdapter(['preflight-complete','--repo',root,'--path',path.join(root,'task'),'--approved-snapshot','legacy'],{cwd:root}),error=>{
    const report=JSON.parse(error.stdout);assert.equal(report.operation,'preservation-preflight');assert.equal(report.preflight,true);
    assert.equal(report.results[0].reason,'xrb-runtime-unavailable');assert.match(report.results[0].detail,/verified released/);return true;
  });
});

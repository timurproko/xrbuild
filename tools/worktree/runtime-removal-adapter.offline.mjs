// Explicit isolated integration lane. Preparation is separate; no live runtime adoption or automatic fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyOfflineRuntimeSequence, runOfflineRuntimeScenario } from './offline-runtime-verification.mjs';
import { PROPOSED_A1, readPinnedFixture } from './proposed-a1-fixture.mjs';
import { preparePinnedRuntimeFixture } from './prepare-proposed-a1-fixture.mjs';
import { offlineExactRemovalDeclaration } from './runtime-removal-adapter.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url))).cases.find(row=>row.id==='C39');
const report = result => JSON.parse(result.settled.detail);
const preserved = result => { assert.equal(result.targetPreserved,true);assert.equal(result.unrelatedCheckoutPreserved,true);assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);assert.equal(result.bulkSweepCalls,0);assert.equal(result.deletionCalls,0);assert.equal(result.sessionUsableOutsideTarget,true);assert.equal(result.replay,null); };

test('C39: actual current A1 APIs in separate processes reject the new owner after detach and issuing-process exit',async()=>{
  const result=await verifyOfflineRuntimeSequence();assert.deepEqual(result.observation,fixture.expect);
  assert.equal(result.evidence.revision,PROPOSED_A1.revision);assert.equal(result.evidence.settlement,'cleanup-skipped');
  assert.equal(result.evidence.liveAdoption,'disabled');assert.equal(result.evidence.releasedCompatibility,'unverified');
  assert.ok(!result.evidence.mockedDependencies.some(name=>name.includes('proper-lockfile')));
});

test('both exact adapters really remove one isolated checkout and retain local/remote refs and unrelated worktrees',async()=>{
  for(const scenario of ['success','merged-success']) {
    const result=await runOfflineRuntimeScenario(scenario);
    assert.equal(result.preflightPassed,true);assert.equal(result.preflightWhileOwned,true);assert.equal(result.detached,true);assert.equal(result.shellExitedBeforeSettlement,true);
    assert.equal(result.settled.kind,'cleanup-finished',`${scenario}: ${JSON.stringify(result.settled)}`);assert.equal(report(result).results[0].disposition,'removed');assert.equal(report(result).results[0].branchPreserved,true);
    assert.equal(result.targetRemoved,true);assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);assert.equal(result.unrelatedCheckoutPreserved,true);
    assert.equal(result.deletionCalls,1);assert.equal(result.bulkSweepCalls,0);assert.equal(result.sessionUsableOutsideTarget,true);assert.equal(result.replay,null);
    assert.equal(result.expiredScopeRejected,true);assert.equal(result.misboundScopeRejected,true);
    if(scenario==='merged-success'){assert.notEqual(result.localHead,result.mergeHead,'Squash-aware evidence is not a hidden source-head ancestry requirement');assert.equal(report(result).operation,'complete');}
  }
});

test('a real second process cannot acquire while XR holds A1 exclusion; JSON generations are unnecessary',async()=>{
  const result=await runOfflineRuntimeScenario('scope-contender');
  assert.equal(result.contenderCode,'worktree-claim-busy');assert.equal(result.targetRemoved,true,JSON.stringify(result.settled));assert.equal(result.deletionCalls,1);
  assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);assert.equal(result.unrelatedCheckoutPreserved,true);
});

test('owner acquiring after A1 settlement precheck is caught by XR under the shared gate',async()=>{
  const result=await runOfflineRuntimeScenario('new-owner-before-execute');
  assert.equal(result.lateAcquired,true);assert.equal(result.settled.kind,'cleanup-failed');assert.match(report(result).results[0].reason,/Live or unverifiable owner/);preserved(result);
});

test('ignored content, an unmerged PR and missing execution facilities block preflight without detaching',async()=>{
  for(const scenario of ['dirty-preflight','unmerged-complete','missing-facility']){
    const result=await runOfflineRuntimeScenario(scenario);assert.match(result.requestError.code,/preflight/);
    assert.equal(result.stillAttached,true);assert.equal(result.targetPreserved,true);assert.equal(result.deletionCalls,0);
  }
});

test('pre-detach journals reject new content, reowned/published heads and recreated identities; changed declarations cannot substitute operations',async()=>{
  for(const scenario of ['late-content','changed-declaration','reowned-head-change','recreated-target']){
    const result=await runOfflineRuntimeScenario(scenario);assert.ok(['cleanup-failed','cleanup-unavailable'].includes(result.settled.kind));preserved(result);
    if(scenario==='reowned-head-change')assert.notEqual(result.retainedHead,result.localHead);
  }
});

test('a replaced filesystem gate invalidates actual scoped authority before removal',async()=>{
  const result=await runOfflineRuntimeScenario('scope-replaced');assert.equal(result.settled.kind,'cleanup-failed');
  assert.equal(result.expiredScopeRejected,true);preserved(result);
});

test('native stale-lease probe: another process can acquire during a suspended callback, so live loss fencing is NOT certified',async()=>{
  const result=await runOfflineRuntimeScenario('lease-loss');
  assert.equal(result.leaseLossObserved,true,'Actual current A1/lock package demonstrates the remaining upstream lifetime gap');
  assert.equal(result.settled.kind,'cleanup-failed');assert.equal(result.expiredScopeRejected,true);preserved(result);
});

test('explicit preparation reconstructs the current verified source cache without installing A1',t=>{
  const files=readPinnedFixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-prepare-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const calls=[];
  const result=preparePinnedRuntimeFixture({root,request:endpoint=>{
    calls.push(endpoint);if(endpoint===`repos/${PROPOSED_A1.repository}`)return{full_name:PROPOSED_A1.repository,private:false};
    const prefix=`repos/${PROPOSED_A1.repository}/contents/`,suffix=`?ref=${PROPOSED_A1.revision}`;assert.ok(endpoint.startsWith(prefix)&&endpoint.endsWith(suffix));
    const file=endpoint.slice(prefix.length,-suffix.length),bytes=files.get(file);assert.ok(bytes);return{encoding:'base64',sha:PROPOSED_A1.files[file].gitBlob,content:bytes.toString('base64')};
  }});
  assert.equal(calls.length,files.size+1);for(const[file,bytes]of readPinnedFixture(root))assert.deepEqual(bytes,files.get(file));assert.equal(result.runtimeInstalled,false);assert.equal(result.liveAdoption,'disabled');
});

test('live CLI/declaration remain disabled/unchanged; prepared declarations have exact separate operations and no sweep',()=>{
  const before=fs.readFileSync(new URL('../../.a1/worktree.json',import.meta.url));
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./runtime-removal-adapter.mjs',import.meta.url)),'execute'],{encoding:'utf8'});
  assert.equal(child.status,1);assert.match(child.stderr,/Compatible released.*unavailable/);assert.deepEqual(fs.readFileSync(new URL('../../.a1/worktree.json',import.meta.url)),before);
  const declaration=offlineExactRemovalDeclaration();assert.ok(declaration.cleanup.includes('{worktree}'));assert.ok(declaration.cleanupPreflight.includes('{worktree}'));
  assert.ok(declaration.localRemoval.execute.includes('{worktree}'));assert.ok(!JSON.stringify(declaration).includes('sweep'));
});

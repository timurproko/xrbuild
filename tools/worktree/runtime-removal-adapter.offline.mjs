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
import { runLifetimeScenario } from './runtime-lifetime-verification.mjs';
import { loadPinnedRuntime } from './proposed-a1-fixture.mjs';
import { offlineExactRemovalDeclaration } from './runtime-removal-adapter.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url))).cases.find(row=>row.id==='C39');
const report = result => JSON.parse(result.settled.detail);
const preserved = result => { assert.equal(result.targetPreserved,true);assert.equal(result.unrelatedCheckoutPreserved,true);assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);assert.equal(result.bulkSweepCalls,0);assert.equal(result.deletionCalls,0);assert.equal(result.sessionUsableOutsideTarget,true);assert.equal(result.replay,null); };

test('C39: actual current A1 APIs in separate processes reject the new owner after detach and issuing-process exit',async()=>{
  const result=await verifyOfflineRuntimeSequence();assert.deepEqual(result.observation,fixture.expect);
  assert.equal(result.evidence.revision,PROPOSED_A1.revision);assert.equal(result.evidence.settlement,'cleanup-skipped');
  assert.equal(result.evidence.liveAdoption,'disabled');assert.equal(result.evidence.releasedCompatibility,'unverified');
  assert.deepEqual(result.evidence.mockedDependencies,[]);assert.equal(result.evidence.packageSha256,PROPOSED_A1.package.sha256);
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

test('acquisition attempted after settlement precheck is prevented by the actual packaged boundary',async()=>{
  const result=await runOfflineRuntimeScenario('new-owner-before-execute');
  assert.equal(result.lateAcquired,false);assert.equal(result.contenderCode,'worktree-claim-busy');assert.equal(result.settled.kind,'cleanup-finished',JSON.stringify(result.settled));
  assert.equal(result.targetRemoved,true);assert.equal(result.deletionCalls,1);assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);
});

test('ignored content, unmerged PRs, missing facilities and legacy declarations block before detach',async()=>{
  for(const scenario of ['dirty-preflight','unmerged-complete','missing-facility','legacy-declaration']){
    const result=await runOfflineRuntimeScenario(scenario);assert.match(result.requestError.code,/preflight|unavailable/);
    assert.equal(result.stillAttached,true);assert.equal(result.targetPreserved,true);assert.equal(result.deletionCalls,0);
  }
});

test('pre-detach journals reject new content, reowned/published heads and recreated identities; changed declarations cannot substitute operations',async()=>{
  for(const scenario of ['late-content','changed-declaration','reowned-head-change','recreated-target']){
    const result=await runOfflineRuntimeScenario(scenario);assert.ok(['cleanup-failed','cleanup-unavailable'].includes(result.settled.kind));preserved(result);
    if(scenario==='reowned-head-change')assert.notEqual(result.retainedHead,result.localHead);
  }
});

test('actual interrupted cleanup retains public failure code/journal and refuses every destructive retry',async()=>{
  const result=await runOfflineRuntimeScenario('retry-interrupted');
  const row=result.result.results[0];
  assert.equal(row.disposition,'blocked');assert.equal(row.code,'worktree-cleanup-interrupted');
  assert.equal(row.retry,'unsupported');assert.equal(row.journalPhase,'partial');assert.match(row.reason,/recovery/);
  assert.equal(result.failedJournal.phase,'partial');assert.equal(result.failedJournal.failure.code,'worktree-cleanup-interrupted');
  assert.equal(result.failedJournal.failure.stage,'destructive-command');
  assert.equal(result.capturedChildClosed,true);assert.equal(result.commands,1);assert.equal(result.afterFirstCommands,1);
  assert.equal(result.retry.results[0].retry,'unsupported');
  for(const name of ['targetPreserved','unrelatedPreserved','localRefsPreserved','remoteRefsPreserved','journalUnchanged'])assert.equal(result[name],true,name);
  for(const attempt of [result.retry,result.preflightRetry,result.changedHead,result.freshApprovalRetry,...result.attempts])assert.equal(attempt.results[0].disposition,'blocked');
  assert.match(result.changedHead.results[0].reason,/snapshot changed/);
  assert.equal(JSON.stringify(result).includes('synthetic-private-output'),false,'Untrusted child output must not leak via journal/report');
});

test('lost successful removal response never retries or grants authority to a recreated checkout',async()=>{
  const result=await runOfflineRuntimeScenario('retry-lost-result');
  assert.equal(result.result.results[0].code,'XRB_TEST_RESPONSE_LOST');
  assert.equal(result.failedJournal.phase,'partial');assert.equal(result.commands,1);assert.equal(result.journalUnchanged,true);
  for(const attempt of [result.retry,result.recreated,result.freshApprovalRetry,...result.attempts]){
    assert.equal(attempt.results[0].disposition,'blocked');assert.equal(attempt.results[0].retry,'unsupported');
  }
  assert.match(result.recreated.results[0].reason,/snapshot changed/);
  for(const name of ['targetPreserved','unrelatedPreserved','localRefsPreserved','remoteRefsPreserved'])assert.equal(result[name],true,name);
});

test('prepared retries recheck actual publication, late data and real editing claims before one exact removal',async()=>{
  for(const scenario of ['retry-prepared','retry-merged-prepared']) {
    const result=await runOfflineRuntimeScenario(scenario);
    assert.equal(result.preflight.results[0].disposition,'eligible');assert.equal(result.preparedUnchanged,true);
    for(const attempt of result.attempts)assert.equal(attempt.results[0].disposition,'blocked');
    assert.match(result.attempts[0].results[0].reason,/publication|merged evidence/i);
    assert.match(result.attempts[1].results[0].reason,/content|uninspected/i);
    assert.match(result.attempts[2].results[0].reason,/live session owns/);
    assert.equal(result.result.results[0].disposition,'removed',JSON.stringify(result.result));assert.equal(result.commands,1);assert.equal(result.journalPhase,'removed');
    for(const name of ['targetRemoved','unrelatedPreserved','localRefsPreserved','remoteRefsPreserved'])assert.equal(result[name],true,name);
  }
});

test('supported snapshot contract refuses incomplete, altered and legacy approvals without minted generations',async()=>{
  const runtime=await loadPinnedRuntime();
  for(const expected of [{},{version:0},{version:1,path:'untrusted'}])assert.throws(()=>runtime.snapshot.assertWorktreeCleanupSnapshot(expected,{}),/snapshot changed/);
});

test('holder suspension beyond the old lease prevents takeover and still completes exact cleanup',async()=>{
  const result=await runOfflineRuntimeScenario('suspension');
  assert.equal(result.leaseLossObserved,false);assert.equal(result.contenderCode,'worktree-claim-busy');
  assert.equal(result.settled.kind,'cleanup-finished',JSON.stringify(result.settled));assert.equal(result.targetRemoved,true);
  assert.equal(result.localRefsPreserved,true);assert.equal(result.remoteRefsPreserved,true);assert.equal(result.unrelatedCheckoutPreserved,true);
});

for(const scenario of ['holder-suspension','holder-death','tracked-descendant'])test(`actual packaged child-lifetime exclusion: ${scenario}`,async()=>{
  const result=await runLifetimeScenario(scenario);
  for(const name of ['stoppedHolder','targetPreserved','unrelatedPreserved','localRefsPreserved','remoteRefsPreserved','takeoverPrevented','destructiveChildActuallyRan'])assert.equal(result[name],true,name);
  assert.equal(result.packageSha256,PROPOSED_A1.package.sha256);assert.equal(result.liveAdoption,'disabled');assert.equal(result.releasedCompatibility,'unverified');
  if(scenario==='holder-death') {
    assert.equal(result.journalPhase,'removing');assert.equal(result.journalPreserved,true);assert.equal(result.retryCommands,0);
    assert.equal(result.crashRetry.results[0].code,'worktree-claim-busy');assert.equal(result.retryAfterChild.results[0].disposition,'blocked');
  }
});

test('verified package imports unchanged code/declarations and type-checks an external supported consumer',async t=>{
  const files=readPinnedFixture(),runtime=await loadPinnedRuntime();
  assert.equal(files.size,19);assert.deepEqual(runtime.mockedDependencies,[]);assert.equal(runtime.packageSha256,PROPOSED_A1.package.sha256);
  for(const name of ['worktree-cleanup-snapshot','worktree-claim-boundary'])assert.ok(files.has(`dist/foundation/lifecycle/${name}.d.mts`));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xr-package-types-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=fileURLToPath(new URL('../../',import.meta.url)),file=path.join(directory,'consumer.mts');
  fs.writeFileSync(file,`import {captureWorktreeCleanupSnapshot,type WorktreeCleanupSnapshot} from ${JSON.stringify(fileURLToPath(runtime.snapshotModuleUrl).replaceAll(path.sep,'/'))};
import {executeUnclaimedWorktreeCleanup,executeCleanupCommand,withUnclaimedWorktree,type CleanupExecutionOptions} from ${JSON.stringify(fileURLToPath(runtime.boundaryModuleUrl).replaceAll(path.sep,'/'))};
const expected:WorktreeCleanupSnapshot=await captureWorktreeCleanupSnapshot('typecheck-only');const version:1=expected.version;
const options:CleanupExecutionOptions={dataDir:'typecheck-only'};
const result:Promise<string>=executeUnclaimedWorktreeCleanup(expected,'git',[],options);
const child:Promise<string>=withUnclaimedWorktree(expected,options,()=>executeCleanupCommand('git',[],{...options,protectTarget:true}));void version;void result;void child;\n`);
  const checked=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/lib/tsc.js'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2024',
    '--typeRoots',path.join(root,'node_modules/@types'),'--types','node',file],{encoding:'utf8',timeout:25_000});
  assert.equal(checked.status,0,checked.stdout+checked.stderr);
});

test('committed declaration enables exact separate operations; unavailable packages refuse without fallback',()=>{
  const before=fs.readFileSync(new URL('../../.a1/worktree.json',import.meta.url));
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./runtime-removal-adapter.mjs',import.meta.url)),'execute'],{encoding:'utf8'});
  assert.equal(child.status,1);assert.match(child.stdout,/XRB_RUNTIME_UNAVAILABLE/);assert.deepEqual(fs.readFileSync(new URL('../../.a1/worktree.json',import.meta.url)),before);
  const declaration=offlineExactRemovalDeclaration();assert.deepEqual(JSON.parse(before),declaration);assert.ok(declaration.cleanup.includes('{worktree}'));assert.ok(declaration.cleanupPreflight.includes('{worktree}'));
  assert.ok(declaration.localRemoval.execute.includes('{worktree}'));assert.ok(!JSON.stringify(declaration).includes('sweep'));assert.ok(declaration.cleanup.includes('{snapshot}'));assert.ok(declaration.localRemoval.execute.includes('{snapshot}'));
});

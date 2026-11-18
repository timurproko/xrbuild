// Real packaged request/settlement and real XR CLI subprocesses; GitHub transport alone is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOfflineRuntimeScenario } from './offline-runtime-verification.mjs';
const retainedRefs = result => {
  for (const field of ['localRefsPreserved','remoteRefsPreserved','unrelatedPreserved']) assert.equal(result[field],true,`${field}: ${JSON.stringify(result)}`);
};
for (const scenario of ['cli-success','cli-local']) test(`committed declaration -> A1 request -> issuing exit -> primary -> exact removal: ${scenario}`,async()=>{
  const result=await runOfflineRuntimeScenario(scenario);
  assert.equal(result.requestError,undefined,JSON.stringify(result));
  for (const field of ['preflightOwned','notRemovedBeforeIssuingExit','detached','shellExited','primaryUsable','targetRemoved']) assert.equal(result[field],true,field);
  assert.equal(result.settled.kind,'cleanup-finished',JSON.stringify(result.settled));
  const report=JSON.parse(result.settled.detail);
  assert.equal(report.operation,scenario==='cli-local'?'remove-local':'complete');
  assert.equal(report.results.length,1);assert.equal(report.results[0].disposition,'removed');assert.equal(report.results[0].branchPreserved,true);
  assert.equal(result.journalPhase,'removed');assert.equal(result.replay,null);retainedRefs(result);
  assert.equal(result.remoteTaskRefPresent,true,'An existing source-branch ref must survive both completion operations');
});
for (const scenario of ['cli-private','cli-dirty','cli-unpublished','cli-unmerged','cli-ambiguous','cli-missing-package','cli-legacy']) test(`actual completion refuses before detach: ${scenario}`,async()=>{
  const result=await runOfflineRuntimeScenario(scenario);
  assert.ok(result.requestError,JSON.stringify(result));
  assert.equal(result.stillAttached,true);assert.equal(result.targetPreserved,true);retainedRefs(result);
  if(scenario==='cli-missing-package')assert.match(result.requestError.message,/xrb-runtime-unavailable/);
});
for (const scenario of ['cli-owner','cli-head-change','cli-recreated','cli-journal','cli-changed-declaration','cli-intent-change']) test(`post-detach completion preserves original approval and never replays: ${scenario}`,async()=>{
  const result=await runOfflineRuntimeScenario(scenario);
  assert.equal(result.requestError,undefined,JSON.stringify(result));
  assert.equal(result.detached,true);assert.equal(result.notRemovedBeforeIssuingExit,true);assert.equal(result.primaryUsable,true);
  assert.ok(['cleanup-skipped','cleanup-failed','cleanup-unavailable'].includes(result.settled.kind),JSON.stringify(result.settled));
  assert.equal(result.targetPreserved,true);assert.equal(result.replay,null);retainedRefs(result);
  assert.equal(result.journalPhase,scenario==='cli-journal'?'removing':'prepared');
  if(scenario==='cli-owner')assert.match(result.settled.detail,/live session/);
  if(scenario==='cli-head-change'||scenario==='cli-recreated')assert.match(result.settled.detail,/snapshot changed/);
  if(scenario==='cli-journal')assert.match(result.settled.detail,/recovery/);
  if(scenario==='cli-intent-change')assert.match(result.settled.detail,/pre-detach reservation/);
});

// Explicit integration lane: prepare the pinned dependency first; no automatic network or skipped passing cases.
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
import { MISSING_CLAIM_API, offlineLocalRemovalDeclaration } from './runtime-removal-adapter.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../../docs/delivery-cases.json', import.meta.url))).cases.find(row => row.id === 'C39');

test('C39: actual XR preflight and pinned A1 claim/detach/settlement preserve both checkouts after another live owner acquires', async () => {
  const result = await verifyOfflineRuntimeSequence();
  assert.deepEqual(result.observation, fixture.expect);
  assert.equal(result.evidence.revision, PROPOSED_A1.revision);
  assert.equal(result.evidence.preflightPassed, true); assert.equal(result.evidence.detached, true);
  assert.equal(result.evidence.secondOwnerAcquired, true); assert.equal(result.evidence.shellExitedBeforeSettlement, true);
  assert.equal(result.evidence.settlement, 'cleanup-skipped');
  assert.equal(result.evidence.liveAdoption, 'disabled'); assert.equal(result.evidence.releasedCompatibility, 'unverified');
});

test('absent claim is not an invented available generation: execution refuses the missing supported API', async () => {
  const result = await runOfflineRuntimeScenario('missing-generation');
  assert.equal(result.preflightPassed, true); assert.equal(result.preflightWhileOwned, true); assert.equal(result.detached, true);
  assert.equal(result.ownerState, 'absent'); assert.equal(result.settled.kind, 'cleanup-failed');
  const report = JSON.parse(result.settled.detail); assert.equal(report.results[0].reason, MISSING_CLAIM_API);
  assert.equal(result.events.length, 2); assert.equal(result.events[1].phase, 'execute'); assert.equal(result.events[1].shellAlive, false);
  assert.equal(result.deletionCalls, 0); assert.equal(result.bulkSweepCalls, 0); assert.equal(result.targetPreserved, true);
  assert.equal(result.sessionUsableOutsideTarget, true); assert.equal(result.replay, null);
});

test('actual XR preservation preflight blocks ignored content before detach, retaining the real attachment', async () => {
  const result = await runOfflineRuntimeScenario('dirty-preflight');
  assert.equal(result.requestError.code, 'worktree-local-removal-preflight');
  assert.equal(result.stillAttached, true); assert.equal(result.targetPreserved, true); assert.equal(result.deletionCalls, 0);
});

test('changed declaration and content appearing after detach block without fallback or replay', async () => {
  const changed = await runOfflineRuntimeScenario('changed-declaration');
  assert.equal(changed.settled.kind, 'cleanup-unavailable'); assert.equal(changed.events.length, 1);
  const content = await runOfflineRuntimeScenario('late-content');
  assert.equal(content.settled.kind, 'cleanup-failed');
  assert.equal(JSON.parse(content.settled.detail).results[0].reason, 'preservation-publication-or-identity-blocker');
  for (const result of [changed, content]) { assert.equal(result.deletionCalls, 0); assert.equal(result.bulkSweepCalls, 0); assert.equal(result.targetPreserved, true); assert.equal(result.sessionUsableOutsideTarget, true); assert.equal(result.replay, null); }
});

test('explicit preparation reconstructs a fresh verified cache from mocked public responses, without installing A1', t => {
  const files = readPinnedFixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-prepare-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const result = preparePinnedRuntimeFixture({ root, request: endpoint => {
    calls.push(endpoint);
    if (endpoint === `repos/${PROPOSED_A1.repository}`) return { full_name: PROPOSED_A1.repository, private: false };
    const prefix = `repos/${PROPOSED_A1.repository}/contents/`, suffix = `?ref=${PROPOSED_A1.revision}`;
    assert.ok(endpoint.startsWith(prefix) && endpoint.endsWith(suffix));
    const file = endpoint.slice(prefix.length, -suffix.length), bytes = files.get(file); assert.ok(bytes);
    return { encoding: 'base64', sha: PROPOSED_A1.files[file].gitBlob, content: bytes.toString('base64') };
  } });
  assert.equal(calls.length, files.size + 1);
  for (const [file, bytes] of readPinnedFixture(root)) assert.deepEqual(bytes, files.get(file));
  assert.equal(result.runtimeInstalled, false); assert.equal(result.liveAdoption, 'disabled');
});

test('live CLI remains disabled and the deployed declaration is not replaced by the offline fixture', () => {
  const before = fs.readFileSync(new URL('../../.a1/worktree.json', import.meta.url));
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./runtime-removal-adapter.mjs', import.meta.url)), 'execute'], { encoding: 'utf8' });
  assert.equal(child.status, 1); assert.match(child.stderr, /Compatible released.*unavailable/);
  assert.deepEqual(fs.readFileSync(new URL('../../.a1/worktree.json', import.meta.url)), before);
  assert.ok(JSON.parse(before).cleanup.includes('sweep'), 'Legacy declaration is preserved, not used by the offline fixture');
  assert.ok(!JSON.stringify(offlineLocalRemovalDeclaration()).includes('sweep'));
});

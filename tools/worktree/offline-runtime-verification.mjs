// Offline source-fixture verification, separate from release compatibility and live adapter adoption.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { contextEnvironment } from './git-environment.mjs';
import { PROPOSED_A1, readPinnedFixture, sourceRoot } from './proposed-a1-fixture.mjs';
const execute = promisify(execFile);

export async function runOfflineRuntimeScenario(scenario = 'new-owner', root = sourceRoot) {
  readPinnedFixture(root); // Missing/drifted cache is explicit; never fetch or import an installed runtime.
  const env = Object.fromEntries(Object.entries(contextEnvironment()).filter(([key]) => !/^(?:A1_|PI_|GH_|GITHUB_)/i.test(key)));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  const { stdout } = await execute(process.execPath, [fileURLToPath(new URL('./proposed-runtime-worker.mjs', import.meta.url)), scenario, root], {
    env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);
  if (result.revision !== PROPOSED_A1.revision || result.scenario !== scenario) throw Error('Offline runtime evidence does not match pinned scenario');
  return result;
}

export async function verifyOfflineRuntimeSequence({ root = sourceRoot } = {}) {
  const result = await runOfflineRuntimeScenario('new-owner', root);
  if (!result.preflightPassed || !result.preflightWhileOwned || !result.detached || result.afterDetachState !== 'absent'
    || !result.secondOwnerAcquired || result.ownerState !== 'live' || result.shellExit !== 0 || !result.shellExitedBeforeSettlement
    || result.settled?.kind !== 'cleanup-skipped' || !/live session/.test(result.settled.detail) || result.replay !== null
    || result.deletionCalls !== 0 || result.events.length !== 1 || !/Live or unverifiable owner/.test(result.directExecution?.results[0]?.reason ?? '')) throw Error('Actual offline runtime sequencing did not establish C39');
  return { observation: { targetPreserved: result.targetPreserved, unrelatedCheckoutPreserved: result.unrelatedCheckoutPreserved,
    bulkSweepCalls: result.bulkSweepCalls, sessionUsableOutsideTarget: result.sessionUsableOutsideTarget },
    evidence: { revision: result.revision, preflightPassed: result.preflightPassed, detached: result.detached, secondOwnerAcquired: result.secondOwnerAcquired,
      shellExitedBeforeSettlement: result.shellExitedBeforeSettlement, settlement: result.settled.kind,
      mockedDependencies: result.mockedDependencies, liveAdoption: result.liveAdoption, releasedCompatibility: result.releasedCompatibility } };
}

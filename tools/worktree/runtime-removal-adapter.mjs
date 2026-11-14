// Offline preparation of the proposed exact local-removal adapter. NOT a live runtime entrypoint.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRemovalTarget, runtimeCleanupUnavailable } from './published-removal.mjs';
import { identifyRepository, publicationEvidence, executeGit } from './portable-context.mjs';
import { verifyContractInstallation } from './delivery-contract.mjs';
const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
export const MISSING_CLAIM_API = 'a1-target-bound-claim-generation-api-unavailable';

/** Fixture declaration only. This function never writes .a1/worktree.json or enables an installed runtime. */
export function offlineLocalRemovalDeclaration() {
  const command = phase => ['node', 'tools/worktree/runtime-removal-adapter.mjs', phase, '--repo', '{primary}', '--path', '{worktree}'];
  return { localRemoval: { preflight: command('preflight'), execute: command('execute') } };
}

export async function inspectRuntimeLocalRemoval({ phase, root, target, expectedHead, execute = executeGit, identify = identifyRepository, readClaimState }) {
  const report = { version: 1, operation: 'remove-local', preflight: phase === 'preflight', results: [], liveAdoption: 'disabled' };
  const row = { path: path.resolve(target), disposition: 'blocked' }; report.results.push(row);
  try {
    if (!['preflight', 'execute'].includes(phase)) throw Error('Unsupported exact adapter phase');
    // Preflight runs from startup while A1 itself verifies the still-owned attachment before/after this command.
    // Do not misrepresent that owner as an available deletion claim. This inspection grants no removal authority.
    const options = { root, target, expectedHead, execute, cwd: root };
    const before = inspectRemovalTarget(options);
    if (identify(before.root) !== adapter.repository) throw Error('Foreign repository');
    const evidence = publicationEvidence(before.root, before.branch, before.head, { identify, execute });
    if (!evidence.publicationVerified) throw Error(`Publication blocker: ${evidence.reason}`);
    const fresh = inspectRemovalTarget(options);
    if (JSON.stringify(before) !== JSON.stringify(fresh)) throw Error('Preservation snapshot changed');
    row.path = fresh.target; row.head = fresh.head;
    if (phase === 'preflight') {
      row.disposition = 'eligible'; row.scope = 'preservation-and-publication-only'; return report;
    }
    if (typeof readClaimState !== 'function') { row.reason = 'a1-supported-claim-reader-unavailable'; return report; }
    const state = await readClaimState(fresh);
    if (state === 'live') { row.reason = 'live-owner'; return report; }
    if (state !== 'absent') { row.reason = 'unverifiable-owner'; return report; }
    // The pinned API returns absence, not a target-bound generation/lease. Never invent one from PID/time/metadata.
    // There is deliberately no deletion call until a supported bridge can satisfy the engine's readClaims contract.
    row.reason = MISSING_CLAIM_API;
  } catch { row.reason = 'preservation-publication-or-identity-blocker'; }
  return report;
}

/** Injectable process transport for offline tests: parse actual argv and run the actual repository adapter. */
export async function invokeOfflineRepositoryAdapter(command, args, cwd, dependencies = {}) {
  if (command !== 'node' || args.length !== 6 || args[0] !== 'tools/worktree/runtime-removal-adapter.mjs'
    || !['preflight', 'execute'].includes(args[1]) || args[2] !== '--repo' || args[4] !== '--path'
    || path.resolve(args[3]) !== path.resolve(cwd)) throw Error('Unexpected exact adapter command; no fallback');
  const report = await inspectRuntimeLocalRemoval({ ...dependencies, phase: args[1], root: args[3], target: args[5] });
  const stdout = JSON.stringify(report);
  if (report.results[0].disposition === 'blocked') throw Object.assign(Error(report.results[0].reason), { stdout });
  return stdout;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { runtimeCleanupUnavailable(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

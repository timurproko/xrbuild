// Inactive exact-target adapters. No installed-runtime discovery, adoption flag, sweep or branch deletion.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectRemovalTarget, prepareRemovalCheckout, removePublishedCheckoutInScope, runtimeCleanupUnavailable } from './published-removal.mjs';
import { withA1OwnershipExclusion, requireOwnershipFacilities } from './ownership-exclusion.mjs';
import { identifyRepository, publicationEvidence, executeGit } from './portable-context.mjs';
import { verifyContractInstallation } from './delivery-contract.mjs';
import { parseLink } from '../pr-automation/pr-body.mjs';
const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
const SHA = /^[a-f0-9]{40}$/;

/** Inactive declaration preparation only; never writes the deployed file. */
export function offlineExactRemovalDeclaration() {
  const command = (phase, complete = false) => ['node', 'tools/worktree/runtime-removal-adapter.mjs', phase, '--repo', '{primary}', '--path', '{worktree}',
    ...(complete ? ['--change', '{change}', '--pr', '{pr}'] : [])];
  return { cleanupPreflight: command('preflight-complete', true), cleanup: command('execute-complete', true),
    localRemoval: { preflight: command('preflight'), execute: command('execute') } };
}
export const offlineLocalRemovalDeclaration = offlineExactRemovalDeclaration;
const getPull = number => JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', `repos/${adapter.repository}/pulls/${number}`], {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}));

/** Squash-aware merged evidence: exact accepted PR head plus its merge commit contained in live main. */
export function mergedCompletionPublication(snapshot, intent, { readPull = getPull, execute = executeGit } = {}) {
  try {
    const pr = readPull(intent.pr), link = parseLink(pr.body);
    if (pr.number !== intent.pr || pr.state !== 'closed' || pr.merged !== true || typeof pr.merged_at !== 'string' || !Number.isFinite(Date.parse(pr.merged_at)) || !SHA.test(pr.merge_commit_sha ?? '')
      || pr.head?.sha !== snapshot.head || pr.head?.ref !== snapshot.branch || pr.head?.repo?.full_name !== adapter.repository
      || pr.base?.ref !== adapter.baseBranch || pr.base?.repo?.full_name !== adapter.repository || link.error || link.link?.change !== intent.change) throw Error('Merged association mismatch');
    const observe = () => {
      const lines = execute(snapshot.root, ['ls-remote', '--heads', 'origin', `refs/heads/${adapter.baseBranch}`]).split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) throw Error('Main evidence is ambiguous');
      const [head, ref] = lines[0].split(/\s+/); if (!SHA.test(head) || ref !== `refs/heads/${adapter.baseBranch}`) throw Error('Main identity unavailable'); return head;
    };
    const main = observe();
    execute(snapshot.root, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', main]);
    execute(snapshot.root, ['merge-base', '--is-ancestor', pr.merge_commit_sha, main]);
    if (observe() !== main) throw Error('Main changed during verification');
    return { publicationVerified: true, remoteHead: main, localHead: snapshot.head };
  } catch { return { publicationVerified: false, reason: 'exact-merged-pr-and-live-main-unverified' }; }
}

export async function inspectRuntimeLocalRemoval({ phase, root, target, change, pr, expectedHead, execute = executeGit,
  identify = identifyRepository, runtime, runtimeOptions, readPull, remove, onScopeHeld }) {
  const complete = phase?.endsWith('-complete'), preflight = phase?.startsWith('preflight');
  const report = { version: 1, operation: complete && preflight ? 'preservation-preflight' : complete ? 'complete' : 'remove-local', preflight, results: [], liveAdoption: 'disabled' };
  const row = { path: path.resolve(target), disposition: 'blocked' }; report.results.push(row);
  try {
    if (!['preflight', 'execute', 'preflight-complete', 'execute-complete'].includes(phase)) throw Error('Unsupported exact adapter phase');
    if (complete && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change ?? '') || !Number.isSafeInteger(pr) || pr < 1)) throw Error('Exact merged selectors required');
    requireOwnershipFacilities(runtime, runtimeOptions); // Missing execution support must block before detachment, too.
    const intent = complete ? { kind: 'complete', change, pr } : { kind: 'local' };
    const options = { root, target, expectedHead, execute, identify, cwd: root };
    if (identify(root) !== adapter.repository) throw Error('Foreign repository');
    const readPublication = snapshot => complete ? mergedCompletionPublication(snapshot, intent, { readPull, execute })
      : publicationEvidence(snapshot.root, snapshot.branch, snapshot.head, { identify, execute });
    if (preflight) {
      const snapshot = await prepareRemovalCheckout(options, { intent, readPublication });
      row.path = snapshot.target; row.head = snapshot.head; row.disposition = 'eligible'; row.scope = 'snapshot-reservation-only'; return report;
    }
    const snapshot = inspectRemovalTarget(options);
    const result = await withA1OwnershipExclusion({ runtime, options: runtimeOptions, context: snapshot }, async scope => {
      if (onScopeHeld) await onScopeHeld(scope, snapshot);
      return await removePublishedCheckoutInScope({ ...options, scope, intent, readPublication, ...(remove ? { remove } : {}) });
    });
    Object.assign(row, result, { disposition: 'removed' });
  } catch (error) { row.reason = error.message; }
  return report;
}

/** Offline process transport; never fabricates preflight reports or ownership evidence. */
export async function invokeOfflineRepositoryAdapter(command, args, cwd, dependencies = {}) {
  const complete = args[1]?.endsWith('-complete');
  if (command !== 'node' || args.length !== (complete ? 10 : 6) || args[0] !== 'tools/worktree/runtime-removal-adapter.mjs'
    || !['preflight', 'execute', 'preflight-complete', 'execute-complete'].includes(args[1]) || args[2] !== '--repo' || args[4] !== '--path'
    || path.resolve(args[3]) !== path.resolve(cwd) || complete && (args[6] !== '--change' || args[8] !== '--pr')) throw Error('Unexpected exact adapter command; no fallback');
  const report = await inspectRuntimeLocalRemoval({ ...dependencies, phase: args[1], root: args[3], target: args[5],
    ...(complete ? { change: args[7], pr: Number(args[9]) } : {}) });
  const stdout = JSON.stringify(report);
  if (report.results[0].disposition === 'blocked') throw Object.assign(Error(report.results[0].reason), { stdout });
  return stdout;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { runtimeCleanupUnavailable(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

// Exact-target A1 repository adapter. Public package dependency only; no sweep, ref deletion or implicit installation.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectRemovalTarget, prepareRemovalCheckout, removePublishedCheckoutInScope } from './published-removal.mjs';
import { withA1OwnershipExclusion, requireOwnershipFacilities } from './ownership-exclusion.mjs';
import { identifyRepository, publicationEvidence, executeGit } from './portable-context.mjs';
import { verifyContractInstallation } from './delivery-contract.mjs';
import { parseLink } from '../pr-automation/pr-body.mjs';
import { loadCleanupRuntime } from './a1-cleanup-runtime.mjs';
const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
const SHA = /^[a-f0-9]{40}$/;

/** Committed declaration shape; bare completion discovers one exact merged PR/change, never another operation. */
export function exactRemovalDeclaration() {
  const command = phase => ['node', 'tools/worktree/runtime-removal-adapter.mjs', phase, '--repo', '{primary}', '--path', '{worktree}', '--approved-snapshot', '{snapshot}'];
  return { cleanupPreflight: command('preflight-complete'), cleanup: command('execute-complete'),
    localRemoval: { preflight: command('preflight'), execute: command('execute') } };
}
export const offlineExactRemovalDeclaration = exactRemovalDeclaration;
export const offlineLocalRemovalDeclaration = exactRemovalDeclaration;
const getPull = number => JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', `repos/${adapter.repository}/pulls/${number}`], {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}));

const getMergedCandidates = head => JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', `repos/${adapter.repository}/commits/${head}/pulls?per_page=100`], {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}));
function completionIntent(snapshot, { change, pr, readMergedCandidates = getMergedCandidates }) {
  if (change !== undefined || pr !== undefined) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change ?? '') || !Number.isSafeInteger(pr) || pr < 1) throw Error('Exact merged selectors required together');
    return { kind: 'complete', change, pr };
  }
  const candidates = readMergedCandidates(snapshot.head);
  if (!Array.isArray(candidates) || candidates.length >= 100) throw Error('Merged PR discovery unavailable or truncated; retain checkout');
  const exact = candidates.filter(pull => pull.head?.sha === snapshot.head && pull.head?.ref === snapshot.branch
    && pull.head?.repo?.full_name === adapter.repository && pull.base?.repo?.full_name === adapter.repository && pull.base?.ref === adapter.baseBranch);
  if (exact.length !== 1 || !Number.isSafeInteger(exact[0].number) || exact[0].number < 1) throw Error('Bare completion needs one unambiguous exact-head PR; retain checkout');
  const parsed = parseLink(exact[0].body);
  if (parsed.error || !parsed.linked) throw Error('Exact merged PR must provide its change association; retain checkout');
  return { kind: 'complete', pr: exact[0].number, change: parsed.link.change };
}

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

export async function inspectRuntimeLocalRemoval({ phase, root, target, change, pr, expectedHead, approvedSnapshot, execute = executeGit,
  identify = identifyRepository, runtime, runtimeOptions = {}, readPull, readMergedCandidates, remove, onScopeHeld }) {
  const complete = phase?.endsWith('-complete'), preflight = phase?.startsWith('preflight');
  const report = { version: 1, operation: complete && preflight ? 'preservation-preflight' : complete ? 'complete' : 'remove-local', preflight, results: [], integration: 'exact-target-package-boundary' };
  const row = { path: path.resolve(target), disposition: 'blocked' }; report.results.push(row);
  try {
    if (!['preflight', 'execute', 'preflight-complete', 'execute-complete'].includes(phase)) throw Error('Unsupported exact adapter phase');
    requireOwnershipFacilities(runtime, runtimeOptions); // Missing execution support must block before detachment, too.
    runtime.snapshot.assertWorktreeCleanupSnapshot(approvedSnapshot, await runtime.snapshot.captureWorktreeCleanupSnapshot(target));
    const options = { root, target, expectedHead, execute, identify, cwd: root };
    if (identify(root) !== adapter.repository) throw Error('Foreign repository');
    const intent = complete ? completionIntent({ head: approvedSnapshot.head, branch: execute(target, ['branch', '--show-current']) }, { change, pr, readMergedCandidates }) : { kind: 'local' };
    const readPublication = snapshot => complete ? mergedCompletionPublication(snapshot, intent, { readPull, execute })
      : publicationEvidence(snapshot.root, snapshot.branch, snapshot.head, { identify, execute });
    if (preflight) {
      const snapshot = await prepareRemovalCheckout(options, { intent, readPublication });
      row.path = snapshot.target; row.head = snapshot.head; row.disposition = 'eligible'; row.scope = 'snapshot-reservation-only'; return report;
    }
    const snapshot = inspectRemovalTarget(options);
    const result = await withA1OwnershipExclusion({ runtime, options: runtimeOptions, context: snapshot, approved: approvedSnapshot }, async scope => {
      if (onScopeHeld) await onScopeHeld(scope, snapshot);
      return await removePublishedCheckoutInScope({ ...options, scope, intent, readPublication, ...(remove ? { remove } : {}) });
    });
    Object.assign(row, result, { disposition: 'removed' });
  } catch (error) {
    row.reason = error.message;
    const code = error.cleanupCode ?? error.code;
    row.code = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(code ?? '') ? code : 'XRB_CLEANUP_BLOCKED';
    row.retry = error.retry ?? (['ENOENT', 'worktree-cleanup-snapshot-changed', 'worktree-claim-busy', 'worktree-cleanup-child-unverifiable', 'attached-session-unverifiable', 'worktree-cleanup-exclusion'].includes(row.code)
      ? 'unsupported' : 'fresh-evaluation-only');
    for (const field of ['journal', 'operation', 'journalPhase']) if (error[field]) row[field] = error[field];
    row.preserved = 'Remaining checkout data, journals, refs and unrelated worktrees are retained; an interrupted command may have partially removed its target.';
    row.nextAction = row.retry === 'unsupported'
      ? 'No destructive retry or automatic recovery is supported for this result. Preserve the journal and original approval; uncertain child lifetime needs separately verified recovery, which is outside this repository adapter; follow only the compatible runtime’s documented, platform-specific inspection/recovery contract. Gate recovery does not reset XR journals or approve deletion. Do not remove locks, change the claim namespace, force cleanup or use sweep/discard.'
      : 'Only a fresh explicit evaluation of the same original approval and prepared journal is supported after resolving the blocker; publication, preservation and ownership are rechecked. This does not authorize recovery of uncertain work or lock removal.';
  }
  return report;
}

/** Strict process transport; never fabricates preflight reports or ownership evidence. */
export async function invokeRepositoryAdapter(command, args, cwd, dependencies = {}) {
  const complete = args[1]?.endsWith('-complete');
  if (command !== 'node' || ![8, ...(complete ? [12] : [])].includes(args.length) || args[0] !== 'tools/worktree/runtime-removal-adapter.mjs'
    || !['preflight', 'execute', 'preflight-complete', 'execute-complete'].includes(args[1]) || args[2] !== '--repo' || args[4] !== '--path'
    || args[6] !== '--approved-snapshot' || typeof args[7] !== 'string' || args[7].length > 24_000
    || path.resolve(args[3]) !== path.resolve(cwd) || args.length === 12 && (args[8] !== '--change' || args[10] !== '--pr')) throw Error('Unexpected exact adapter command; no fallback');
  let approvedSnapshot;
  try { approvedSnapshot = JSON.parse(Buffer.from(args[7], 'base64url').toString('utf8')); } catch { throw Error('Invalid approved snapshot; no authority synthesized'); }
  const report = await inspectRuntimeLocalRemoval({ ...dependencies, phase: args[1], root: args[3], target: args[5], approvedSnapshot,
    ...(args.length === 12 ? { change: args[9], pr: Number(args[11]) } : {}) });
  const stdout = JSON.stringify(report);
  if (report.results[0].disposition === 'blocked') throw Object.assign(Error(report.results[0].reason), { stdout });
  return stdout;
}
/** Same strict argument path for A1 children and repository CLI; capabilities checked before any detach/preflight. */
export async function runRuntimeAdapter(args, { cwd = process.cwd(), loadRuntime = loadCleanupRuntime } = {}) {
  try {
    const runtime = await loadRuntime(cwd);
    return await invokeRepositoryAdapter('node', ['tools/worktree/runtime-removal-adapter.mjs', ...args], cwd, { runtime });
  } catch (error) {
    if (!error.stdout && error.code === 'XRB_RUNTIME_UNAVAILABLE') {
      const complete = args[0]?.endsWith('-complete'), preflight = args[0]?.startsWith('preflight');
      error.stdout = JSON.stringify({ version: 1, operation: complete && preflight ? 'preservation-preflight' : complete ? 'complete' : 'remove-local', preflight,
        results: [{ path: args[4], disposition: 'blocked', code: error.code, reason: error.message, retry: 'unsupported' }] });
    }
    // A1's bounded preflight reader exposes only slug-shaped reasons. Retain the useful public detail in JSON too.
    if (error.stdout) {
      const report = JSON.parse(error.stdout), row = report.results[0];
      row.detail = row.reason;
      row.reason = row.code === 'XRB_CLEANUP_BLOCKED'
        ? row.reason.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'xrb-cleanup-blocked'
        : row.code.toLowerCase().replaceAll('_', '-');
      error.stdout = JSON.stringify(report);
    }
    throw error;
  }
}
export const invokeOfflineRepositoryAdapter = invokeRepositoryAdapter;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runRuntimeAdapter(process.argv.slice(2)).then(stdout => console.log(stdout), error => {
    if (error.stdout) console.log(error.stdout); else console.error(error.message);
    process.exitCode = 1;
  });
}

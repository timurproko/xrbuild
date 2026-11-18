#!/usr/bin/env node
// Optional human-requested protected integration. No workflow calls this entrypoint; never arms auto-merge.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acceptanceOf, inspectBodyProgress, parseLink } from './pr-body.mjs';
import { taskReference } from './promote.mjs';
import { held, samePullSnapshot } from './snapshot.mjs';
import { APPROVED_HASHES, verifyContractInstallation } from '../worktree/delivery-contract.mjs';

const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
const SHA = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const blocked = reason => ({ status: 'blocked', reason, futureAuthority: false });

export function candidateBinding(pr) {
  const parsed = parseLink(pr?.body);
  return { repository: pr?.base?.repo?.full_name, number: pr?.number, head: pr?.head?.sha, base: pr?.base?.sha,
    bodyHash: hash(pr?.body ?? ''), acceptanceHash: hash(acceptanceOf(pr?.body)),
    archive: parsed.link?.archive ?? null, finalizedHead: parsed.link?.finalizedHead ?? null };
}

export function matchesBinding(expected, pr) {
  const actual = candidateBinding(pr);
  return expected && Object.keys(actual).every(key => expected[key] === actual[key]);
}

export function evaluateIntegration(pr, evidence, expected) {
  if (!pr || pr.number !== expected?.number || !matchesBinding(expected, pr)) return blocked('Exact repository/PR/head/base/body/acceptance candidate changed; fresh decision required');
  if (expected.repository !== adapter.repository || pr.head?.repo?.full_name !== adapter.repository || pr.base?.ref !== adapter.baseBranch
    || !SHA.test(pr.head?.sha ?? '') || !SHA.test(pr.base?.sha ?? '') || !pr.node_id) return blocked('Candidate repository/branch identity is unverifiable');
  if (pr.state !== 'open' || pr.draft || held(pr)) return blocked('Draft, closed, held or unverifiable candidate');
  if (!pr.mergeable || !['clean', 'behind', 'has_hooks'].includes(pr.mergeable_state)) return blocked('Positive mergeability is required; do not wait or retry');
  if (!evidence?.trustedPolicy || !evidence.protectionVerified || !evidence.threadsResolved) return blocked('Trusted integrated policy/protection/review-thread evidence is unavailable; no bootstrap bypass');
  const parsed = parseLink(pr.body);
  if (!parsed.linked || parsed.error) return blocked(parsed.error ?? 'Finalized version-1 change association required');
  try { taskReference(parsed.link); } catch (error) { return blocked(error.message); }
  if (!parsed.link.archive || !parsed.link.finalizedHead || !evidence.archiveVerified) return blocked('Current finalized archive/history evidence required');
  const body = inspectBodyProgress(pr.body, evidence.tasks);
  if (body.status !== 'complete') return blocked(body.reason);
  const checks = (evidence.checks ?? []).filter(check => check.name === adapter.requiredCheck && check.app?.id === 15368);
  if (checks.length !== 1 || checks[0].head_sha !== pr.head.sha || checks[0].status !== 'completed' || checks[0].conclusion !== 'success') return blocked('Required exact-head check is pending, failed, ambiguous or unverified');
  // The xrbuild adapter deliberately does NOT add a strict up-to-date/ancestor gate.
  if (adapter.baseCurrency !== 'existing-non-strict-protection-no-added-up-to-date-gate') return blocked('Unsupported base-currency adapter');
  return { status: 'eligible', binding: candidateBinding(pr), strictBaseGateApplied: false };
}

export function authorizedHuman(actor) {
  return actor?.type === 'User' && actor.workflow !== true && typeof actor.login === 'string' && !actor.login.endsWith('[bot]')
    && ['admin', 'maintain', 'write'].includes(actor.permission);
}

/** A request is consumed even when checks fail. No future callback, queue, polling or auto-merge arm exists. */
export async function attemptOneShot({ request, readCandidate, readEvidence, readActor, consumeDecision, merge }) {
  try { request = structuredClone(request); } catch { return blocked('Decision input is not immutable request data'); }
  const expectedKeys = 'acceptanceHash,archive,base,bodyHash,finalizedHead,head,number,repository';
  if (!request || request.version !== 1 || Object.keys(request).some(key => !['version', 'operation', 'confirmation', 'decisionId', 'actor', 'expected'].includes(key))
    || request.operation !== 'merge-once' || request.confirmation !== 'merge this exact candidate once'
    || !UUID.test(request.decisionId ?? '') || !/^[a-z0-9][a-z0-9-]{0,38}$/i.test(request.actor ?? '') || request.expected?.repository !== adapter.repository
    || Object.keys(request.expected).sort().join(',') !== expectedKeys || !Number.isSafeInteger(request.expected.number) || request.expected.number < 1
    || !SHA.test(request.expected.head ?? '') || !SHA.test(request.expected.base ?? '') || !SHA.test(request.expected.finalizedHead ?? '')
    || !/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(request.expected.archive ?? '')
    || !/^[a-f0-9]{64}$/.test(request.expected.bodyHash ?? '') || !/^[a-f0-9]{64}$/.test(request.expected.acceptanceHash ?? '')) return blocked('Fresh explicit exact-candidate maintainer request required');
  try { if (typeof consumeDecision !== 'function' || !await consumeDecision(request)) return blocked('Decision is already consumed or durable one-shot evidence is unavailable'); }
  catch { return blocked('Durable one-shot decision evidence is unavailable'); }
  try {
    const actor = await readActor();
    if (!authorizedHuman(actor) || actor.login !== request.actor) return blocked('Authorized human credential does not match the fresh request');
    const before = await readCandidate();
    const initial = evaluateIntegration(before, await readEvidence(before), request.expected);
    if (initial.status !== 'eligible') return initial;
    const current = await readCandidate();
    if (!samePullSnapshot(before, current, { draft: false })) return blocked('Candidate changed before merge; fresh decision required');
    const final = evaluateIntegration(current, await readEvidence(current), request.expected);
    const credential = await readActor();
    if (final.status !== 'eligible') return final;
    if (!authorizedHuman(credential) || credential.login !== actor.login) return blocked('Human credential changed before merge');
    const last = await readCandidate();
    if (!samePullSnapshot(current, last, { draft: false }) || !matchesBinding(request.expected, last)) return blocked('Candidate changed immediately before merge');
    const result = await merge({ repository: adapter.repository, number: last.number, sha: last.head.sha, merge_method: 'squash' });
    return result?.merged === true ? { status: 'merged', head: last.head.sha, futureAuthority: false } : blocked('Protected merge was not accepted; no retry or retained authority');
  } catch { return blocked('Integration evidence or protected merge unavailable; no retry, bypass or retained authority'); }
}

/** Read-only classification. Native UI arming alone is never acceptance and is never blindly cancelled. */
export async function verifyPersonalArm({ number, approvalComment, readCandidate, readComment, readPermission, readArchiveEvidence = () => null }) {
  try {
    const before = await readCandidate(), comment = await readComment(approvalComment);
    const owner = before?.auto_merge?.enabled_by;
    let decision;
    try { decision = JSON.parse(comment?.body); } catch { return inspectPersonalArm(before, null); }
    const permission = owner?.login ? await readPermission(owner.login) : null;
    const archive = await readArchiveEvidence(before);
    const current = await readCandidate(), freshComment = await readComment(approvalComment);
    const verified = before?.number === number && samePullSnapshot(before, current, { draft: false })
      && comment.id === approvalComment && freshComment.id === comment.id && freshComment.issue_url === comment.issue_url
      && freshComment.body === comment.body && freshComment.user?.login === comment.user?.login && freshComment.user?.type === 'User'
      && comment.user?.type === 'User' && comment.user.login === owner?.login
      && comment.issue_url === `https://api.github.com/repos/${adapter.repository}/issues/${number}`;
    return inspectPersonalArm(current, { ...decision, verified, archiveVerified: archive?.archiveVerified === true && inspectBodyProgress(current.body, archive.tasks).status === 'complete',
      actor: { login: comment.user?.login, type: comment.user?.type, permission: permission?.permission } });
  } catch {
    return { status: 'blocked', reason: 'Human arm evidence unavailable; no cancellation or safe continuation promised',
      acceptanceInferred: false, unrelatedHumanArmCancelled: false, continuationPromised: false };
  }
}

export function inspectPersonalArm(pr, evidence) {
  if (!pr || !['open', 'closed'].includes(pr.state) || !Object.hasOwn(pr, 'auto_merge')) return { ...blocked('Native arm state unavailable'), acceptanceInferred: false, unrelatedHumanArmCancelled: false, continuationPromised: false };
  if (!pr.auto_merge) return { status: 'none', acceptanceInferred: false, continuationPromised: false };
  const owner = pr.auto_merge.enabled_by;
  const parsed = parseLink(pr.body); let finalized = false;
  try { finalized = Boolean(!parsed.error && parsed.link?.archive && SHA.test(parsed.link.finalizedHead ?? '') && taskReference(parsed.link)); } catch { /* Unknown association remains unverified. */ }
  if (pr.state !== 'open' || pr.draft || pr.base?.repo?.full_name !== adapter.repository || pr.head?.repo?.full_name !== adapter.repository
    || pr.base?.ref !== adapter.baseBranch || !SHA.test(pr.head?.sha ?? '') || !SHA.test(pr.base?.sha ?? '') || !finalized || evidence?.version !== 1 || evidence.archiveVerified !== true || !authorizedHuman(evidence?.actor) || owner?.login !== evidence.actor.login || owner?.type !== 'User'
    || !evidence.verified || evidence.operation !== 'personal-auto-merge' || !matchesBinding(evidence.binding, pr)
    || evidence.enabledAt !== pr.auto_merge.enabled_at || held(pr)) {
    return { status: 'blocked', reason: 'Human arm ownership/binding unresolved or stale; obtain a fresh exact decision',
      acceptanceInferred: false, unrelatedHumanArmCancelled: false, continuationPromised: false, freshDecisionRequired: true };
  }
  return { status: 'bound', acceptanceInferred: false, continuationPromised: false, binding: candidateBinding(pr) };
}

function plain(file) {
  const absolute = path.resolve(file); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isFile() && !stat.isDirectory()) throw new Error('Decision ledger paths must be plain and owned');
  }
  return absolute;
}

function ledgerPath(directory) {
  if (path.resolve(directory).split(path.sep).some(part => /^\.artifacts[. ]*$/i.test(part))) throw new Error('Decision receipts require durable tool state, not agent scratch');
  return path.resolve(directory);
}

export function initializeDecisionLedger(directory) {
  directory = ledgerPath(directory); plain(path.dirname(directory)); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'ledger.json'), '{"version":1,"purpose":"consumed-human-integration-decisions"}\n', { flag: 'wx' });
  return directory;
}

export function consumeDecision(directory, request) {
  directory = plain(ledgerPath(directory));
  const marker = plain(path.join(directory, 'ledger.json'));
  if (fs.statSync(marker).size > 1024 || fs.readFileSync(marker, 'utf8') !== '{"version":1,"purpose":"consumed-human-integration-decisions"}\n' || !UUID.test(request.decisionId ?? '')) return false;
  let handle;
  try { handle = fs.openSync(path.join(directory, `${request.decisionId}.json`), 'wx'); }
  catch { return false; }
  try { fs.writeFileSync(handle, JSON.stringify({ version: 1, actor: request.actor, operation: request.operation, expected: request.expected }) + '\n'); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  return true;
}

export function ghRequest(endpoint, { method = 'GET', body } = {}) {
  try {
    return JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', '--method', method, endpoint, ...(body === undefined ? [] : ['--input', '-'])], {
      input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    const status = /HTTP (\d{3})/.exec(String(error.stderr))?.[1];
    throw Object.assign(new Error('Bounded integration request failed'), status ? { status: Number(status) } : {});
  }
}

/** The remote is explicit, protected and read as data. No target checkout, A1 runtime or candidate execution. */
export function githubIntegrationBackend({ number, request = ghRequest }) {
  const prefix = `repos/${adapter.repository}`;
  const readFile = async (file, ref) => {
    const data = await request(`${prefix}/contents/${file}?ref=${ref}`);
    if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('Missing immutable file evidence');
    return Buffer.from(data.content, 'base64').toString('utf8');
  };
  const readCandidate = async () => {
    const pr = await request(`${prefix}/pulls/${number}`);
    const base = await request(`${prefix}/git/ref/heads/main`);
    if (base.object?.sha !== pr.base?.sha) throw new Error('Base changed while reading');
    return pr;
  };
  const readActor = async () => {
    const user = await request('user');
    const permission = await request(`${prefix}/collaborators/${encodeURIComponent(user.login)}/permission`);
    return { login: user.login, type: user.type, permission: permission.permission, workflow: process.env.GITHUB_ACTIONS === 'true' };
  };
  const readEvidence = async pr => {
    const parsed = parseLink(pr.body); if (!parsed.linked) return {};
    const file = taskReference(parsed.link);
    const tasks = await readFile(file, pr.head.sha);
    const historicalTasks = parsed.link.finalizedHead ? await readFile(file, parsed.link.finalizedHead) : null;
    const comparison = parsed.link.finalizedHead ? await request(`${prefix}/compare/${parsed.link.finalizedHead}...${pr.head.sha}`) : null;
    let active = true;
    try { await readFile(`openspec/changes/${parsed.link.change}/tasks.md`, pr.head.sha); }
    catch (error) { if (error.status !== 404) throw error; active = false; } // Only an authoritative missing path proves absence.
    const runs = await request(`${prefix}/commits/${pr.head.sha}/check-runs?filter=latest&per_page=100`);
    if (!Number.isSafeInteger(runs.total_count) || runs.total_count > 100 || !Array.isArray(runs.check_runs) || runs.check_runs.length !== runs.total_count) throw new Error('Check evidence is incomplete');
    const policy = await readFile('docs/delivery-rules.md', pr.base.sha);
    const adapters = await readFile('docs/delivery-adapters.json', pr.base.sha);
    const deployedTool = await readFile('tools/pr-automation/integrate.mjs', pr.base.sha);
    const rulesets = await request(`${prefix}/rulesets?includes_parents=true&per_page=100`);
    if (!Array.isArray(rulesets) || rulesets.length >= 100) throw new Error('Protection evidence is incomplete');
    const protect = rulesets.filter(rule => rule.name === 'protect-main' && rule.enforcement === 'active');
    const rule = protect.length === 1 ? await request(`${prefix}/rulesets/${protect[0].id}`) : null;
    const required = rule?.rules?.find(item => item.type === 'required_status_checks')?.parameters;
    const pullRule = rule?.rules?.find(item => item.type === 'pull_request')?.parameters;
    let classicAbsent = false;
    try { await request(`${prefix}/branches/main/protection`); } catch (error) { if (error.status !== 404) throw error; classicAbsent = true; }
    const [owner, name] = adapter.repository.split('/');
    const threadResponse = await request('graphql', { method: 'POST', body: {
      query: 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{isResolved}}}}}',
      variables: { owner, name, number },
    } });
    const threadPull = threadResponse.data?.repository?.pullRequest, threads = threadPull?.reviewThreads;
    const threadsResolved = !threadResponse.errors?.length && threadPull?.id === pr.node_id && Number.isSafeInteger(threads?.totalCount)
      && threads.totalCount <= 100 && threads.pageInfo?.hasNextPage === false && Array.isArray(threads.nodes)
      && threads.nodes.length === threads.totalCount && threads.nodes.every(thread => thread.isResolved === true);
    const effective = await request(`${prefix}/rules/branches/main`);
    const expectedTypes = ['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks'];
    const effectiveVerified = Array.isArray(effective) && effective.length > 0 && effective.length <= 100
      && expectedTypes.every(type => effective.some(item => item.type === type)) && effective.every(item => expectedTypes.includes(item.type)
        && (item.type !== 'required_status_checks' || item.parameters?.strict_required_status_checks_policy === false
          && item.parameters.required_status_checks?.length === 1 && item.parameters.required_status_checks[0].context === adapter.requiredCheck
          && item.parameters.required_status_checks[0].integration_id === 15368)
        && (item.type !== 'pull_request' || item.parameters?.required_approving_review_count === 0
          && item.parameters.dismiss_stale_reviews_on_push === false && item.parameters.require_code_owner_review === false
          && item.parameters.require_last_push_approval === false && item.parameters.required_review_thread_resolution === true
          && item.parameters.allowed_merge_methods?.length === 1 && item.parameters.allowed_merge_methods[0] === 'squash'));
    const protectionVerified = classicAbsent && effectiveVerified && rule?.target === 'branch' && rule.enforcement === 'active' && Array.isArray(rule.bypass_actors) && rule.bypass_actors.length === 0
      && rule.conditions?.ref_name?.include?.includes('~DEFAULT_BRANCH') && !rule.conditions.ref_name.exclude?.length
      && required?.strict_required_status_checks_policy === false && required.required_status_checks?.length === 1 && required.required_status_checks.some(check => check.context === adapter.requiredCheck && check.integration_id === 15368)
      && pullRule?.allowed_merge_methods?.length === 1 && pullRule.allowed_merge_methods[0] === 'squash';
    return { tasks, checks: runs.check_runs, protectionVerified, threadsResolved,
      trustedPolicy: hash(policy) === APPROVED_HASHES['delivery-rules.md'] && hash(adapters) === APPROVED_HASHES['delivery-adapters.json']
        && hash(deployedTool.replaceAll('\r\n', '\n')) === hash(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r\n', '\n')),
      archiveVerified: !active && ['ahead', 'identical'].includes(comparison?.status) && inspectBodyProgress(pr.body, historicalTasks).status === 'complete' };
  };
  return { readCandidate, readEvidence, readActor, merge: payload => request(`${prefix}/pulls/${number}/merge`, { method: 'PUT', body: { sha: payload.sha, merge_method: 'squash' } }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    if (process.env.GITHUB_ACTIONS === 'true') throw new Error('One-shot integration CLI refuses workflow execution');
    const args = process.argv.slice(2);
    if (args[0] === '--init-ledger' && args.length === 2) { console.log(initializeDecisionLedger(args[1])); return; }
    if (args[0] !== '--ledger-dir' || args.length !== 2) throw new Error('Explicit --ledger-dir required; request JSON is read once from stdin');
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const backend = githubIntegrationBackend({ number: input.expected?.number });
    const result = await attemptOneShot({ request: input, ...backend, consumeDecision: decision => consumeDecision(args[1], decision) });
    console.log(JSON.stringify(result)); if (result.status !== 'merged') process.exitCode = 1;
  })().catch(() => { console.error('One-shot integration blocked; no retry, auto-merge, bypass or retained authority'); process.exitCode = 1; });
}

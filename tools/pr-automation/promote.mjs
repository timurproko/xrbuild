#!/usr/bin/env node
// Trusted repository policy only; candidate source is inspected as data, never installed or executed.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { inspectBodyProgress, parseLink } from './pr-body.mjs';
import { held, samePullSnapshot } from './snapshot.mjs';

const SHA = /^[a-f0-9]{40}$/;
export const inspectProgress = inspectBodyProgress;

export function taskReference(link) {
  if (!link.archive && !link.finalizedHead) return `openspec/changes/${link.change}/tasks.md`;
  if (link.archive !== `openspec/changes/archive/${link.archive?.split('/').at(-1)}`
    || !new RegExp(`^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${link.change}$`).test(link.archive ?? '')
    || !SHA.test(link.finalizedHead ?? '')) throw new Error('Finalized version-1 archive/head association is invalid');
  return `${link.archive}/tasks.md`;
}

export function candidate(pr, { repository, head, tasks, archiveVerified = false }) {
  if (pr?.state !== 'open' || !pr.draft) return { status: 'skipped', reason: 'not an open draft' };
  if (held(pr)) return { status: 'held', reason: 'delivery-hold pauses promotion' };
  if (pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository || pr.base?.ref !== 'main'
    || !SHA.test(pr.head?.sha ?? '') || pr.head.sha !== head || !SHA.test(pr.base?.sha ?? '') || !pr.node_id) return { status: 'skipped', reason: 'PR identity or head changed' };
  const parsed = parseLink(pr.body);
  if (parsed.error) return { status: 'blocked', reason: parsed.error };
  if (!parsed.linked) return { status: 'skipped', reason: 'no implementation link' };
  try { taskReference(parsed.link); } catch (error) { return { status: 'blocked', reason: error.message }; }
  if ((parsed.link.archive || parsed.link.finalizedHead) && !archiveVerified) return { status: 'blocked', reason: 'Archived draft requires current archive/history verification' };
  if (!/^\s*[-*] \[[ xX]\] /m.test((pr.body ?? '').split('## Implementation')[1]?.split('## Automation')[0] ?? '')) return { status: 'skipped', reason: 'no implementation checklist' };
  if (tasks === null) return { status: 'blocked', reason: `missing tasks.md for ${parsed.link.change}` };
  return inspectProgress(pr.body, tasks);
}

export const sameSnapshot = (before, after) => samePullSnapshot(before, after, { draft: true });
const gh = args => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function reconcile({ number, repository, repo, inspectOnly = false, get = n => gh([`repos/${repository}/pulls/${n}`]),
  read = ref => { try { return git(repo, ['show', `HEAD:${ref}`]); } catch { return null; } },
  head = () => git(repo, ['rev-parse', 'HEAD']),
  ancestor = ref => { try { git(repo, ['merge-base', '--is-ancestor', ref, 'HEAD']); return true; } catch { return false; } },
  ready = id => gh(['graphql', '-f', 'query=mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}', '-f', `id=${id}`]),
} = {}) {
  const before = await get(number);
  if (before?.number !== number) return { status: 'blocked', reason: 'PR number changed during inspection' };
  const parsed = parseLink(before.body);
  let reference = null;
  try { if (parsed.linked) reference = taskReference(parsed.link); } catch { /* candidate reports the actual invalid binding. */ }
  const tasks = reference ? read(reference) : null;
  const archived = Boolean(parsed.link?.archive);
  const verifiedArchive = () => archived && read(`openspec/changes/${parsed.link.change}/tasks.md`) === null
    && read(reference) !== null && ancestor(parsed.link.finalizedHead);
  const verdict = candidate(before, { repository, head: head(), tasks, archiveVerified: verifiedArchive() });
  if (verdict.status !== 'complete' || inspectOnly) return verdict;
  const after = await get(number);
  if (!sameSnapshot(before, after)) return { status: 'skipped', reason: 'PR changed or held before promotion' };
  if (head() !== after.head.sha || read(reference) !== tasks || archived && !verifiedArchive()) return { status: 'skipped', reason: 'checkout/archive changed before promotion' };
  await ready(after.node_id);
  return { status: 'promoted', reason: `PR #${number} is ready for finalization` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), repo = args[args.indexOf('--repo') + 1], number = Number(args[args.indexOf('--pr') + 1]);
  if (!repo || !Number.isSafeInteger(number) || number < 1 || !['pull_request_target', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME) || !process.env.GITHUB_REPOSITORY) throw new Error('trusted workflow and --repo <checkout> --pr <number> required');
  reconcile({ number, repository: process.env.GITHUB_REPOSITORY, repo, inspectOnly: args.includes('--inspect') }).then(result => {
    console.log(`${result.status}: ${result.reason ?? ''}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
    if (result.status === 'blocked') { console.error(`::error title=Draft readiness blocked::${String(result.reason).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`); process.exitCode = 1; }
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

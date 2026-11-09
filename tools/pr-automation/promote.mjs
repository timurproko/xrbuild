#!/usr/bin/env node
// Trusted draft promotion. Run only main's copy of this script on a PR-head checkout treated as data.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { parseLink } from './pr-body.mjs';
import { openTasks } from './finalize.mjs';

const SHA = /^[a-f0-9]{40}$/;
const CHANGE = /^[a-z0-9][a-z0-9-]*$/;

/** Validate the human-readable completion contract; plain-bullet legacy drafts are not opted in. */
export function inspectProgress(body, tasks) {
  const sections = [...(body ?? '').matchAll(/^## (Proposal|Implementation|Acceptance|Automation)[ \t]*$/gm)];
  if (sections.map((s) => s[1]).join(',') !== 'Proposal,Implementation,Acceptance,Automation') {
    const checked = (body ?? '').match(/^\s*[-*] \[[ x]\] /gm) ?? [];
    return { status: checked.length && checked.every((item) => item.includes('[x]')) ? 'blocked' : 'incomplete',
      reason: 'Proposal, Implementation, Acceptance and Automation must be in order' };
  }
  const implementation = body.slice(sections[1].index + sections[1][0].length, sections[2].index);
  const acceptance = body.slice(sections[2].index + sections[2][0].length, sections[3].index);
  const items = implementation.split(/\r?\n/).filter((l) => /^\s*[-*] /.test(l));
  if (items.length < 2 || items.some((l) => !/^\s*[-*] \[[ x]\] \S/.test(l))) {
    return { status: 'blocked', reason: 'Implementation needs at least 2 outcome checkboxes' };
  }
  if (items.some((l) => /^\s*[-*] \[ \]/.test(l))) return { status: 'incomplete', reason: 'Implementation has open items' };
  const outcomes = acceptance.split(/\r?\n/).filter((l) => /^\s*[-*] /.test(l));
  if (outcomes.length < 1 || outcomes.length > 10 || outcomes.some((l) => !/^\s*[-*] (?!\[[ x]\])\S/.test(l))) {
    return { status: 'blocked', reason: 'Acceptance needs 1-10 plain outcome bullets' };
  }
  const taskItems = tasks.split(/\r?\n/).filter((l) => /^\s*[-*] \[[ xX]\] /.test(l));
  if (!taskItems.length) return { status: 'blocked', reason: 'tasks.md has no checkable tasks' };
  const open = openTasks(tasks);
  return open.length ? { status: 'blocked', reason: `pre-ready-tasks-open: ${open.length} open task(s) in tasks.md despite checked Implementation outcomes` } : { status: 'complete' };
}

/** Return a verdict without mutating GitHub. Every identity and input is rechecked before the mutation. */
export function candidate(pr, { repository, head, tasks }) {
  if (pr?.state !== 'open' || !pr.draft) return { status: 'skipped', reason: 'not an open draft' };
  if (pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository || pr.base?.ref !== 'main'
    || !SHA.test(pr.head?.sha ?? '') || pr.head.sha !== head || !SHA.test(pr.base?.sha ?? '') || !pr.node_id) {
    return { status: 'skipped', reason: 'PR identity or head changed' };
  }
  const parsed = parseLink(pr.body);
  if (parsed.error) return { status: 'blocked', reason: parsed.error };
  if (!parsed.linked) return { status: 'skipped', reason: 'no implementation link' };
  if (!CHANGE.test(parsed.link.change) || parsed.link.archive || parsed.link.finalizedHead) {
    return { status: 'blocked', reason: 'draft must link one active change' };
  }
  // A plain-bullet body is the old contract. Do not promote it automatically.
  if (!/^\s*[-*] \[[ x]\] /m.test((pr.body ?? '').split('## Implementation')[1]?.split('## Automation')[0] ?? '')) {
    return { status: 'skipped', reason: 'no implementation checklist' };
  }
  if (tasks === null) return { status: 'blocked', reason: `missing tasks.md for ${parsed.link.change}` };
  return inspectProgress(pr.body, tasks);
}

export function sameSnapshot(before, after) {
  return before?.node_id === after?.node_id && before?.number === after?.number && after?.state === 'open'
    && after?.draft === true && before?.body === after?.body && before?.base?.sha === after?.base?.sha
    && before?.base?.ref === after?.base?.ref && before?.base?.repo?.full_name === after?.base?.repo?.full_name && before?.head?.sha === after?.head?.sha
    && before?.head?.ref === after?.head?.ref && before?.head?.repo?.full_name === after?.head?.repo?.full_name;
}

const gh = (args) => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function reconcile({ number, repository, repo, inspectOnly = false, get = (n) => gh([`repos/${repository}/pulls/${n}`]),
  read = (ref) => { try { return git(repo, ['show', `HEAD:${ref}`]); } catch { return null; } },
  head = () => git(repo, ['rev-parse', 'HEAD']),
  ready = (id) => gh(['graphql', '-f', 'query=mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}', '-f', `id=${id}`]),
} = {}) {
  const before = get(number);
  const parsed = parseLink(before.body);
  const tasks = parsed.linked ? read(`openspec/changes/${parsed.link.change}/tasks.md`) : null;
  const verdict = candidate(before, { repository, head: head(), tasks });
  if (verdict.status !== 'complete' || inspectOnly) return verdict;
  const after = get(number);
  if (!sameSnapshot(before, after)) return { status: 'skipped', reason: 'PR changed before promotion' };
  if (head() !== after.head.sha || read(`openspec/changes/${parsed.link.change}/tasks.md`) !== tasks) {
    return { status: 'skipped', reason: 'checkout changed before promotion' };
  }
  await ready(after.node_id);
  return { status: 'promoted', reason: `PR #${number} is ready for finalization` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const repo = args[args.indexOf('--repo') + 1];
  const number = Number(args[args.indexOf('--pr') + 1]);
  if (!repo || !Number.isSafeInteger(number) || number < 1 || !['pull_request_target', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)
      || !process.env.GITHUB_REPOSITORY) throw new Error('trusted workflow and --repo <checkout> --pr <number> required');
  reconcile({ number, repository: process.env.GITHUB_REPOSITORY, repo, inspectOnly: args.includes('--inspect') }).then((result) => {
    console.log(`${result.status}: ${result.reason ?? ''}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
    if (result.status === 'blocked') {
      console.error(`::error title=Draft readiness blocked::${String(result.reason).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
      process.exitCode = 1;
    }
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}

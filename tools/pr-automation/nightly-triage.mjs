#!/usr/bin/env node
// Nightly triage: after the scheduled CI run on main, a failure opens one draft PR `fix/nightly-<date>` (label
// `nightly-failure`) holding an OpenSpec change scaffold with the failure summary, linked to it; while that PR is
// open, later failures and the next green run become comments on it. Never merges, marks ready or arms auto-merge.
//
//   node tools/pr-automation/nightly-triage.mjs --repo <checkout> --run <run-id> --author "<name> <email>"
//        (GH_TOKEN as the repo's GitHub App, GH_WORKFLOW_TOKEN with Actions read and Issues write, GITHUB_REPOSITORY)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NIGHTLY_LABEL = 'nightly-failure';
// The job that only collects the others' results: its failure says nothing of its own.
export const REQUIRED_JOB = 'CI required';
const TAIL_LINES = 20;
const MAX_FAILURES = 10;

export const TRIAGE_IMPLEMENTATION_ITEMS = Object.freeze([
  'Reproduce the failure from the recorded jobs, steps and logs, and identify the introducing change or environmental cause.',
  'Fix the cause without weakening assertions, budgets, timeouts or coverage.',
]);

/** What to do: 'open' (new draft PR), 'comment-failure', 'comment-green' or 'none'. */
export function planTriage({ conclusion, openPr }) {
  if (conclusion === 'success') return openPr ? 'comment-green' : 'none';
  if (conclusion !== 'failure') return 'none';
  return openPr ? 'comment-failure' : 'open';
}

/**
 * The last lines of a job log up to its last error, without timestamps or terminal escapes. Failing-test lines
 * (`✖`, `not ok`) from earlier in the log come first, so a failure that other packages' output scrolled away is named.
 */
export function logTail(log, lines = TAIL_LINES) {
  const clean = log.split(/\r?\n/).map((l) => l.replace(/^﻿?\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
  let end = clean.length;
  for (let i = clean.length - 1; i >= 0; i--) if (clean[i].includes('##[error]')) { end = i + 1; break; }
  const body = clean.slice(0, end).filter((l) => l.trim());
  const tail = body.slice(-lines);
  const failures = [...new Set(body.filter((l) => /✖|\bnot ok\b/.test(l) && !tail.includes(l)))].slice(0, MAX_FAILURES);
  return [...failures, ...(failures.length ? ['...'] : []), ...tail].join('\n');
}

/** Markdown summary of a failed run: [{ name, steps: [names], tail }]. */
export function failureSummary({ runUrl, sha, jobs }) {
  const parts = [`Nightly CI on \`main\` failed at ${sha.slice(0, 7)}: ${runUrl}`, ''];
  for (const job of jobs) {
    parts.push(`### ${job.name}`, '', `Failed step${job.steps.length === 1 ? '' : 's'}: ${job.steps.join(', ') || 'unknown'}`, '', '```text', job.tail, '```', '');
  }
  return parts.join('\n').trimEnd();
}

function jobList(jobs) {
  const names = jobs.map((job) => `\`${job.name.replaceAll('`', "'")}\``);
  if (!names.length) return 'the CI aggregate';
  return `${names.slice(0, 6).join(', ')}${names.length > 6 ? ', ...' : ''}`;
}

export function failureComment({ summary, repeated = false }) {
  const intro = repeated
    ? 'Nightly triage recorded another failure while this repair is open.'
    : 'Nightly triage opened this repair from the failure evidence below.';
  return `${intro}\n\n${summary}`;
}

/** The OpenSpec change scaffold for a fix: { relativePath: text }. Its open tasks keep it from being finalized. */
export function scaffold({ change, date, runUrl, sha, jobs, summary }) {
  const dir = `openspec/changes/${change}`;
  return {
    [`${dir}/.openspec.yaml`]: `schema: spec-driven\ncreated: ${date}\n# A fix that changes behaviour adds spec deltas and drops this line.\nskip_specs: true\n`,
    [`${dir}/proposal.md`]: [
      '## Why', '',
      `Nightly CI failed on \`main\` at \`${sha.slice(0, 7)}\` (${runUrl}). Failed: ${jobList(jobs)}. This change starts from the recorded evidence instead of the failure email.`, '',
      '## What Changes', '',
      '- Reproduce the failure from the recorded jobs, steps and logs, and identify the introducing change or environmental cause.',
      '- Fix the cause without weakening assertions, budgets, timeouts or coverage.', '',
    ].join('\n'),
    [`${dir}/design.md`]: [
      '# Design', '', '## Context', '',
      'Opened by nightly triage from the completed run. The workflow reran nothing and did not edit `main`.', '',
      '## Decisions', '', '- To be written once the cause is known: what failed, why, and the smallest safe fix.', '',
      '## Evidence', '', summary, '',
    ].join('\n'),
    [`${dir}/tasks.md`]: [
      '# Tasks', '', '## 1. Reproduce', '',
      '- [ ] 1.1 Reproduce the failure from the recorded jobs, steps and logs; verify the exact failing test or command is recorded in `design.md`.',
      '- [ ] 1.2 Identify the introducing change or record that the cause is environmental; verify the conclusion and evidence are recorded in `design.md`.', '',
      '## 2. Fix', '',
      '- [ ] 2.1 Fix the cause without weakening assertions, budgets, timeouts or coverage; verify the focused failing command passes on the fix head.', '',
      '## 3. Prove', '',
      '- [ ] 3.1 Run the affected validation and record the result in `design.md`; verify every failed nightly job is covered or an explicit gap is documented.', '',
    ].join('\n'),
  };
}

export function prBody({ change, date, runUrl, sha, jobs }) {
  return [
    '## Proposal', '',
    `Fix the ${date} nightly CI failure on \`main\` at [\`${sha.slice(0, 7)}\`](${runUrl}), where ${jobList(jobs)} failed; the detailed evidence is in the triage comment and change design.`, '',
    '## Implementation', '', ...TRIAGE_IMPLEMENTATION_ITEMS.map((item) => `- [ ] ${item}`), '',
    '## Acceptance', '',
    `- The ${date} nightly CI failure on \`main\` is repaired, and its failed jobs pass on the fix head without weakened assertions, budgets, timeouts or coverage.`, '',
    '## Automation', '', '<details>', '<summary>Used by CI to link this PR to its OpenSpec change</summary>', '',
    '```openspec-implementation', JSON.stringify({ version: 1, change }), '```', '', '</details>',
  ].join('\n');
}

/** Separate API clients keep Actions reads off the repository App credential. */
export function apiClients({ repositoryToken, workflowToken, execute = execFileSync }) {
  if (!repositoryToken || !workflowToken) throw new Error('GH_TOKEN and GH_WORKFLOW_TOKEN are required');
  const request = (scope, token, p, method = 'GET', body) => {
    try {
      return JSON.parse(execute('gh', ['api', '-X', method, p, ...(body ? ['--input', '-'] : [])], {
        encoding: 'utf8', input: body && JSON.stringify(body), maxBuffer: 64 << 20,
        stdio: [body ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: { ...process.env, GH_TOKEN: token },
      }) || 'null');
    } catch (error) {
      throw new Error(`${scope} API ${method} ${p}: ${String(error.stderr || error.message || error).trim()}`);
    }
  };
  return {
    repository: (p, method, body) => request('repository App', repositoryToken, p, method, body),
    workflow: (p, method, body) => request('workflow token', workflowToken, p, method, body),
    actions: (p, method, body) => request('Actions reader', workflowToken, p, method, body),
  };
}

// A job's log, read with fetch: `gh api` refuses to print a response with terminal escape sequences, and CI logs have them.
export async function jobLog(repoName, id, token, request = fetch) {
  const res = await request(`https://api.github.com/repos/${repoName}/actions/jobs/${id}/logs`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`job ${id} log: HTTP ${res.status}`);
  return res.text();
}

async function main(a) {
  const repoName = process.env.GITHUB_REPOSITORY;
  for (const k of ['repo', 'run', 'author']) if (!a[k]) throw new Error(`missing --${k}`);
  const { repository: api, workflow: workflowApi, actions: actionsApi } = apiClients({
    repositoryToken: process.env.GH_TOKEN,
    workflowToken: process.env.GH_WORKFLOW_TOKEN,
  });
  const git = (...g) => execFileSync('git', ['-C', a.repo, ...g], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const run = actionsApi(`repos/${repoName}/actions/runs/${a.run}`);
  const open = workflowApi(`repos/${repoName}/issues?state=open&labels=${NIGHTLY_LABEL}&per_page=10`).filter((i) => i.pull_request);
  const openPr = open[0] ?? null;
  const plan = planTriage({ conclusion: run.conclusion, openPr });
  console.log(`run ${run.id} (${run.event}, ${run.conclusion}) at ${run.head_sha.slice(0, 7)}: ${plan}`);
  if (plan === 'none') return;
  if (plan === 'comment-green') {
    workflowApi(`repos/${repoName}/issues/${openPr.number}/comments`, 'POST', { body: `Nightly CI on \`main\` is green again at ${run.head_sha.slice(0, 7)}: ${run.html_url}` });
    return;
  }

  const jobs = actionsApi(`repos/${repoName}/actions/runs/${run.id}/jobs?per_page=100`).jobs.filter((j) => j.conclusion === 'failure' && j.name !== REQUIRED_JOB);
  const summary = failureSummary({
    runUrl: run.html_url,
    sha: run.head_sha,
    jobs: await Promise.all(jobs.map(async (j) => ({
      name: j.name,
      steps: j.steps.filter((s) => s.conclusion === 'failure').map((s) => s.name),
      tail: logTail(await jobLog(repoName, j.id, process.env.GH_WORKFLOW_TOKEN)),
    }))),
  });
  if (plan === 'comment-failure') {
    workflowApi(`repos/${repoName}/issues/${openPr.number}/comments`, 'POST', { body: failureComment({ summary, repeated: true }) });
    return;
  }

  const date = (run.created_at ?? new Date().toISOString()).slice(0, 10);
  const change = `fix-nightly-${date}`;
  const branch = `fix/nightly-${date}`;
  git('checkout', '--quiet', '-B', branch, run.head_sha);
  for (const [file, text] of Object.entries(scaffold({ change, date, runUrl: run.html_url, sha: run.head_sha, jobs, summary }))) {
    fs.mkdirSync(path.dirname(path.join(a.repo, file)), { recursive: true });
    fs.writeFileSync(path.join(a.repo, file), text);
  }
  const m = /^(.+?)\s*<([^>]+)>$/.exec(a.author);
  if (!m) throw new Error('author must be "Name <email>"');
  git('add', '-A', '--', `openspec/changes/${change}`);
  git('-c', `user.name=${m[1]}`, '-c', `user.email=${m[2]}`, 'commit', '--quiet', '--no-verify', '-m', `docs(openspec): scaffold ${change}`);
  git('push', '--quiet', '--force-with-lease', 'origin', `HEAD:refs/heads/${branch}`);
  const pr = api(`repos/${repoName}/pulls`, 'POST', {
    title: `fix(ci): nightly failure ${date}`, head: branch, base: 'main', draft: true,
    body: prBody({ change, date, runUrl: run.html_url, sha: run.head_sha, jobs }),
  });
  workflowApi(`repos/${repoName}/issues/${pr.number}/labels`, 'POST', { labels: [NIGHTLY_LABEL] });
  workflowApi(`repos/${repoName}/issues/${pr.number}/comments`, 'POST', { body: failureComment({ summary }) });
  console.log(`opened draft #${pr.number}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  try {
    await main(a);
  } catch (e) {
    console.error(String(e.stderr || e.message || e));
    process.exit(1);
  }
}

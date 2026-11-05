#!/usr/bin/env node
// Unarchived change report: lists every change still active on main that a merged PR links (merged without being
// finalized), in one open issue labelled `openspec-reconcile`, updated in place and closed when the list is empty.
// Active changes no merged PR links are planned work and are not reported.
//
//   node tools/pr-automation/reconcile.mjs --repo <main-checkout>     (GH_TOKEN, GITHUB_REPOSITORY)

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { changesInTree } from './delivery.mjs';
import { parseLink } from './pr-body.mjs';

export const RECONCILE_LABEL = 'openspec-reconcile';
const TITLE = 'OpenSpec changes merged without being archived';

/** Changes active on main that merged PRs link: [{ change, prs: [number] }], sorted by change. */
export function findUnarchived({ active, mergedPrs }) {
  const byChange = new Map();
  for (const pr of mergedPrs) {
    const parsed = parseLink(pr.body);
    if (!parsed.linked || !active.has(parsed.link.change)) continue;
    const list = byChange.get(parsed.link.change) ?? [];
    list.push(pr.number);
    byChange.set(parsed.link.change, list);
  }
  return [...byChange].sort(([a], [b]) => a.localeCompare(b)).map(([change, prs]) => ({ change, prs: prs.sort((x, y) => x - y) }));
}

export function issueBody(list) {
  const rows = list.map(({ change, prs }) => `- \`openspec/changes/${change}/\`, merged in ${prs.map((n) => `#${n}`).join(', ')}`);
  return [
    'These changes are still active on `main` although a merged PR delivered them. Archive each in a PR',
    '(`openspec archive <change> --yes`), or explain here why it stays open.',
    '',
    ...rows,
    '',
    '<sub>Updated by the OpenSpec reconcile workflow; closed when the list is empty.</sub>',
  ].join('\n');
}

/** What to do with the report issue: { action: 'create' | 'update' | 'close' | 'none', body? }. */
export function planIssue({ list, issue }) {
  if (list.length === 0) return { action: issue ? 'close' : 'none' };
  const body = issueBody(list);
  if (!issue) return { action: 'create', body };
  return issue.body === body ? { action: 'none' } : { action: 'update', body };
}

function main(a) {
  const repoName = process.env.GITHUB_REPOSITORY;
  if (!a.repo || !repoName) throw new Error('usage: reconcile.mjs --repo <main-checkout> (GITHUB_REPOSITORY set)');
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  const paths = execFileSync('git', ['-C', a.repo, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'openspec/changes'], { encoding: 'utf8' }).split('\n');
  const { active } = changesInTree(paths);
  const pulls = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repoName}/pulls?state=closed&base=main&per_page=100`])).flat();
  const mergedPrs = pulls.filter((p) => p.merged_at).map((p) => ({ number: p.number, body: p.body ?? '' }));
  const list = findUnarchived({ active, mergedPrs });
  const issues = JSON.parse(gh(['api', `repos/${repoName}/issues?state=open&labels=${RECONCILE_LABEL}&per_page=10`])).filter((i) => !i.pull_request);
  const issue = issues[0] ?? null;
  const plan = planIssue({ list, issue });
  console.log(`active: ${[...active].join(', ') || 'none'}; unarchived merged: ${list.map((l) => l.change).join(', ') || 'none'}; issue: ${plan.action}`);
  if (plan.action === 'create') gh(['api', '-X', 'POST', `repos/${repoName}/issues`, '--input', '-'], JSON.stringify({ title: TITLE, body: plan.body, labels: [RECONCILE_LABEL] }));
  if (plan.action === 'update') gh(['api', '-X', 'PATCH', `repos/${repoName}/issues/${issue.number}`, '--input', '-'], JSON.stringify({ body: plan.body }));
  if (plan.action === 'close') {
    gh(['api', '-X', 'POST', `repos/${repoName}/issues/${issue.number}/comments`, '--input', '-'], JSON.stringify({ body: 'Every merged change is archived now.' }));
    gh(['api', '-X', 'PATCH', `repos/${repoName}/issues/${issue.number}`, '--input', '-'], JSON.stringify({ state: 'closed' }));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  try {
    main(a);
  } catch (e) {
    console.error(String(e.stderr || e.message || e));
    process.exit(1);
  }
}

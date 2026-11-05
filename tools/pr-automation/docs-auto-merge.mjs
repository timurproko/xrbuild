#!/usr/bin/env node
// Docs-only auto-merge: a ready PR to main that changes only documentation gets GitHub's auto-merge (squash),
// so it merges by itself once "CI required" passes; the workflow arms it as the repo's GitHub App, so the merge starts
// CI on main. A PR that links an OpenSpec change or edits an active change folder is never taken (the maintainer
// merges those). A PR that stops qualifying, turns draft or gets the `no-auto-merge` label loses the auto-merge this
// tool armed; auto-merge a person armed is left alone.
//
//   node tools/pr-automation/docs-auto-merge.mjs <pr-number>     (GH_TOKEN, GITHUB_REPOSITORY, BOT_LOGIN)
//
// Runs from main's copy (the workflow's pull_request_target checkout), never from the PR's.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLink } from './pr-body.mjs';

export const OPT_OUT_LABEL = 'no-auto-merge';
/** Who may have armed auto-merge on this tool's behalf: the App (BOT_LOGIN) and, before it, the workflow token. */
const botLogins = () => new Set(['github-actions[bot]', 'github-actions', process.env.BOT_LOGIN].filter(Boolean));

/** Documentation: docs/, openspec/, and Markdown anywhere except agent and CI configuration. */
export function isDocsPath(file) {
  if (file.startsWith('.claude/') || file.startsWith('.github/')) return false;
  return file.startsWith('docs/') || file.startsWith('openspec/') || file.toLowerCase().endsWith('.md');
}

/**
 * What to do with a PR: 'arm' (enable auto-merge), 'disarm' (remove the auto-merge this tool armed) or 'none'.
 * `files` are the changed paths, both names of a rename included; `linksChange` is true when the body links (or tries
 * to link) an OpenSpec change, `touchesChange` when the PR adds or edits a file in an active change folder.
 */
export function planAutoMerge({ files, draft, labels, sameRepo, baseRef, autoMergeBy, linksChange = false, touchesChange = false }) {
  const eligible = sameRepo && baseRef === 'main' && !draft && !labels.includes(OPT_OUT_LABEL)
    && !linksChange && !touchesChange && files.length > 0 && files.every(isDocsPath);
  if (eligible) return autoMergeBy ? 'none' : 'arm';
  return autoMergeBy && botLogins().has(autoMergeBy) ? 'disarm' : 'none';
}

/** A path inside an active change folder (openspec/changes/<name>/..., not archive/). */
export function touchesChangeFolder(file) {
  const parts = file.split('/');
  return parts[0] === 'openspec' && parts[1] === 'changes' && parts.length >= 4 && parts[2] !== 'archive';
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main(prNumber) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^\d+$/.test(prNumber ?? '')) throw new Error('usage: docs-auto-merge.mjs <pr-number> (GITHUB_REPOSITORY set)');
  const pr = JSON.parse(gh(['api', `repos/${repo}/pulls/${prNumber}`]));
  if (pr.state !== 'open') return console.log(`#${prNumber} is ${pr.state}: nothing to do`);
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${prNumber}/files`]));
  const entries = pages.flat();
  const files = entries.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
  const link = parseLink(pr.body);
  const plan = planAutoMerge({
    files,
    draft: pr.draft,
    labels: pr.labels.map((l) => l.name),
    sameRepo: pr.head.repo?.full_name === repo,
    baseRef: pr.base.ref,
    autoMergeBy: pr.auto_merge?.enabled_by?.login ?? null,
    linksChange: link.linked || Boolean(link.error),
    touchesChange: entries.some((f) => f.status !== 'removed' && touchesChangeFolder(f.filename)),
  });
  console.log(`#${prNumber}: ${files.length} file(s), plan: ${plan}`);
  if (plan === 'disarm') gh(['pr', 'merge', prNumber, '--repo', repo, '--disable-auto']);
  if (plan !== 'arm') return;
  try {
    gh(['pr', 'merge', prNumber, '--repo', repo, '--auto', '--squash', '--match-head-commit', pr.head.sha]);
  } catch (e) {
    // Checks already passed ("clean status"): GitHub will not arm auto-merge, so merge now.
    if (!/clean status/i.test(String(e.stderr))) throw e;
    gh(['pr', 'merge', prNumber, '--repo', repo, '--squash', '--match-head-commit', pr.head.sha]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv[2]);
  } catch (e) {
    console.error(String(e.stderr || e.message || e));
    process.exit(1);
  }
}

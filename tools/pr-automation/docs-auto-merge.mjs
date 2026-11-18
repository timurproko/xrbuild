#!/usr/bin/env node
// Dormant documentation controller. Frozen xrbuild policy disables integration; source presence never enables it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseLink } from './pr-body.mjs';
import { held, samePullSnapshot, HOLD_LABEL } from './snapshot.mjs';
import { verifyContractInstallation } from '../worktree/delivery-contract.mjs';

const { adapter } = verifyContractInstallation({ root: path.resolve(import.meta.dirname, '../..') });
export const OPT_OUT_LABEL = 'no-auto-merge';
const privileged = /(?:^|\/)(?:agents|claude)\.md$|(?:^|\/)\.(?:agents|claude|a1|github)\/|^openspec\/|(?:^|[\/.-])(?:delivery|governance|worktree|cleanup|removal|preservation|planning|integration|scratch|policy|security|privilege|automation|baseline|reconciliation|checkpoint|instruction|skill|workspace-split|desktop-setup|public-history|embedded-extensions)(?:[\/.-]|$)/i;
const authorityText = /\b(?:agents?|permissions?|authorit\w*|merg\w*|bypass\w*|cleanup|worktrees?|workflows?|credentials?|secrets?|tokens?|governance|privileg\w*|exports?|signing|elevat\w*|delivery-hold|no-auto-merge)\b/i;

export function isDocsPath(file) {
  if (typeof file !== 'string' || file.includes('\\') || file.split('/').some(part => !part || part === '..' || part === '.') || privileged.test(file)) return false;
  return /(?:^|\/)readme\.md$/i.test(file) || /^docs\/.+\.(?:md|txt|png|jpg|jpeg|webp|gif)$/i.test(file);
}

export function classifyDocumentationDiff(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 3000) return { routine: false, reason: 'Complete bounded diff required', paths: [] };
  const paths = [];
  for (const entry of entries) {
    if (!entry || !['added', 'removed', 'modified', 'renamed', 'copied', 'changed'].includes(entry.status)
      || ['renamed', 'copied'].includes(entry.status) && (typeof entry.previous_filename !== 'string' || !entry.previous_filename)) return { routine: false, reason: 'Incomplete file status/rename source evidence', paths };
    paths.push(entry.filename, ...(entry.previous_filename ? [entry.previous_filename] : []));
    if (paths.some(file => !isDocsPath(file))) return { routine: false, reason: 'Authority-changing or non-routine path, including rename source', paths };
    if (/\.(?:md|txt)$/i.test(entry.filename) && (typeof entry.patch !== 'string' || authorityText.test(entry.patch))) return { routine: false, reason: 'Missing or privileged-policy textual diff requires review', paths };
  }
  return { routine: true, paths };
}

export function planAutoMerge({ files, draft, labels, sameRepo, baseRef, autoMergeBy, linksChange = false, touchesChange = false, ownedArmVerified = false, liveState }) {
  const eligible = adapter.documentationAutoMerge === 'active' && liveState === 'active'
    && sameRepo && baseRef === adapter.baseBranch && !draft && !labels.some(label => [OPT_OUT_LABEL, HOLD_LABEL].includes(label.toLowerCase()))
    && !linksChange && !touchesChange && files.length > 0 && files.every(isDocsPath);
  if (eligible) return autoMergeBy ? 'none' : 'arm';
  const bot = typeof autoMergeBy === 'string' && (autoMergeBy.endsWith('[bot]') || autoMergeBy === 'github-actions');
  return bot && ownedArmVerified ? 'disarm' : 'none';
}

export function touchesChangeFolder(file) {
  const parts = file.split('/');
  return parts[0] === 'openspec' && parts[1] === 'changes' && parts.length >= 4 && parts[2] !== 'archive';
}

export async function reconcileDocumentation({ number, repository, get, readFiles, getWorkflow = () => ({ state: 'unverified' }), verifyOwnedArm = () => false, mutate }) {
  const before = await get(number);
  if (before?.number !== number || before.base?.repo?.full_name !== repository) return { status: 'blocked', reason: 'documentation PR identity mismatch' };
  if (before.state !== 'open') return { status: 'skipped' };
  const entries = await readFiles(number), classification = classifyDocumentationDiff(entries);
  if (!Array.isArray(entries) || !Number.isSafeInteger(before.changed_files) || before.changed_files !== entries.length) return { status: 'blocked', reason: 'Complete diff/rename evidence unavailable' };
  const workflow = await getWorkflow();
  const plan = pull => {
    const link = parseLink(pull.body);
    return planAutoMerge({ files: classification.paths, draft: pull.draft,
      labels: (pull.labels ?? []).map(label => typeof label === 'string' ? label : label.name),
      sameRepo: classification.routine && pull.head?.repo?.full_name === repository,
      baseRef: pull.base?.ref, autoMergeBy: pull.auto_merge?.enabled_by?.login ?? null,
      linksChange: link.linked || Boolean(link.error), touchesChange: classification.paths.some(touchesChangeFolder),
      ownedArmVerified: pull.auto_merge?.enabled_by?.type === 'Bot' && verifyOwnedArm(pull) === true, liveState: workflow.state });
  };
  const action = plan(before);
  if (action === 'none') return before.auto_merge
    ? { status: 'blocked', reason: 'Unresolved arm ownership/binding; no cancellation or safe pause/continuation promised' }
    : { status: 'none', reason: adapter.documentationAutoMerge !== 'active' ? 'Documentation controller is disabled by reviewed adapter; no activation side effect' : classification.reason };
  const freshEntries = await readFiles(number), live = await getWorkflow();
  // Arm ownership is read last: file/workflow requests must not open an avoidable human-substitution window.
  const current = await get(number);
  const snapshot = action === 'disarm'
    ? samePullSnapshot({ ...before, labels: [] }, { ...current, labels: [] }, { draft: current.draft })
    : samePullSnapshot(before, current, { draft: false });
  if (!snapshot || plan(current) !== action || live.state !== workflow.state || current.changed_files !== before.changed_files
    || current.auto_merge?.enabled_by?.login !== before.auto_merge?.enabled_by?.login || current.auto_merge?.enabled_at !== before.auto_merge?.enabled_at
    || JSON.stringify(freshEntries) !== JSON.stringify(entries) || action === 'arm' && held(current)) return { status: 'deferred', reason: 'documentation candidate/hold/arm/activation changed' };
  await mutate(action, current);
  return { status: action };
}

const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
async function main(prNumber) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== adapter.repository || !/^[1-9]\d*$/.test(prNumber ?? '')) throw new Error('Explicit governed repository and PR number required');
  const verifiedLogin = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_WORKFLOW === 'Docs auto-merge'
    && /\[bot\]$/.test(process.env.BOT_LOGIN ?? '') ? process.env.BOT_LOGIN : null;
  const result = await reconcileDocumentation({ number: Number(prNumber), repository,
    get: n => JSON.parse(gh(['api', `repos/${repository}/pulls/${n}`])),
    readFiles: n => JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/pulls/${n}/files`])).flat(),
    getWorkflow: () => JSON.parse(gh(['api', `repos/${repository}/actions/workflows/docs-auto-merge.yml`])),
    verifyOwnedArm: pr => Boolean(verifiedLogin && pr.auto_merge?.enabled_by?.login === verifiedLogin && pr.auto_merge.enabled_by.type === 'Bot'),
    mutate: (action, pr) => {
      if (action !== 'disarm') throw new Error('Reviewed xrbuild adapter grants no documentation integration authority');
      return gh(['pr', 'merge', String(pr.number), '--repo', repository, '--disable-auto']);
    },
  });
  console.log(`#${prNumber}: ${result.status}: ${result.reason ?? ''}`);
  if (result.status === 'blocked') process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv[2]).catch(() => { console.error('Documentation controller blocked; inspect ownership/profile without enabling workflows'); process.exitCode = 1; });

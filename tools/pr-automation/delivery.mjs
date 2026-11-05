#!/usr/bin/env node
// Delivery check: a ready PR that implements an OpenSpec change merges only with that change finalized (archived in
// the PR, specs synced), and no ready PR edits an active change folder without delivering it. CI runs this file from
// the PR's base commit, never from its head.
//
//   node tools/pr-automation/delivery.mjs --repo <dir> --base <sha> --head <sha> --event <event.json>
//
// "Finalized" is read from the head's tree: no active openspec/changes/<change>/, one archive/<date>-<change>/.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLink } from './pr-body.mjs';

export const IN_PROGRESS_LABEL = 'openspec-in-progress';
const ARCHIVED = /^\d{4}-\d{2}-\d{2}-(.+)$/;

/** Active and archived change names from the paths of a tree (`openspec/changes/...`). */
export function changesInTree(paths) {
  const active = new Set();
  const archived = new Set();
  for (const p of paths) {
    const parts = p.split('/');
    if (parts[0] !== 'openspec' || parts[1] !== 'changes' || parts.length < 4) continue;
    if (parts[2] !== 'archive') active.add(parts[2]);
    else if (parts.length >= 5) {
      const m = ARCHIVED.exec(parts[3]);
      if (m) archived.add(m[1]);
    }
  }
  return { active, archived };
}

/**
 * The verdict for a ready PR: `{ ok, problems, notes }`. `changed` are the paths the PR changes (base...head),
 * `headPaths` every path at the head.
 */
export function checkDelivery({ body, labels, changed, headPaths }) {
  const problems = [];
  const notes = [];
  const { active, archived } = changesInTree(headPaths);
  const parsed = parseLink(body);
  if (parsed.error) problems.push(`${parsed.error}. Fix the block in the PR body's Automation section.`);
  const linked = parsed.linked ? parsed.link.change : null;

  if (linked) {
    if (active.has(linked)) {
      problems.push(`awaiting finalization: openspec/changes/${linked}/ is still active. The OpenSpec finalization workflow archives it once every task in its tasks.md is done; see that workflow's run for open tasks.`);
    } else if (!archived.has(linked)) {
      problems.push(`the PR links change "${linked}", which is neither active nor archived at the head. Check the change id in the Automation block.`);
    } else {
      notes.push(`change "${linked}" is finalized`);
    }
  }

  const touched = new Set();
  for (const p of changed) {
    const parts = p.split('/');
    if (parts[0] === 'openspec' && parts[1] === 'changes' && parts.length >= 4 && parts[2] !== 'archive' && active.has(parts[2])) touched.add(parts[2]);
  }
  touched.delete(linked);
  for (const name of [...touched].sort()) {
    if (labels.includes(IN_PROGRESS_LABEL)) {
      notes.push(`openspec/changes/${name}/ changes without being delivered (allowed by the ${IN_PROGRESS_LABEL} label)`);
    } else {
      problems.push(`the PR changes openspec/changes/${name}/ without delivering it. Link the change in the Automation block (it is then finalized here), keep the PR in draft, or add the ${IN_PROGRESS_LABEL} label for a change delivered over several PRs.`);
    }
  }
  return { ok: problems.length === 0, problems, notes };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

function main() {
  const a = args(process.argv.slice(2));
  for (const k of ['repo', 'base', 'head', 'event']) if (!a[k]) throw new Error(`missing --${k}`);
  const git = (...g) => execFileSync('git', ['-C', a.repo, ...g], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
  const pr = JSON.parse(readFileSync(a.event, 'utf8')).pull_request;
  const verdict = checkDelivery({
    body: pr.body ?? '',
    labels: (pr.labels ?? []).map((l) => l.name),
    changed: git('diff', '--name-only', '--no-renames', `${a.base}...${a.head}`),
    headPaths: git('ls-tree', '-r', '--name-only', a.head, '--', 'openspec/changes'),
  });
  for (const n of verdict.notes) console.log(`ok: ${n}`);
  for (const p of verdict.problems) console.log(`::error title=Delivery::${p}`);
  if (verdict.ok) console.log('delivery: ok');
  process.exitCode = verdict.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

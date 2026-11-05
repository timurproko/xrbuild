#!/usr/bin/env node
// OpenSpec finalization: archives the change a ready PR links, in the PR's own branch, so its squash merge brings
// code, synced specs and the archived change to main together. The workflow (openspec-finalization.yml) runs main's
// copy of this file as the repo's GitHub App, on a checkout of the PR head; nothing from the PR's tree is run.
//
//   node tools/pr-automation/finalize.mjs --repo <pr-head-checkout> --pr <n> --author "<name> <email>"
//        (GH_TOKEN, GITHUB_REPOSITORY; pushes to the PR branch and records the archive in the PR body)
//
// Already finalized -> records the archive in the body if missing, no commit. Open tasks -> no commit, lists them.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changesInTree } from './delivery.mjs';
import { parseLink, writeLink } from './pr-body.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The pinned OpenSpec CLI (this package's devDependency), run with the current Node. */
export const OPENSPEC_BIN = path.join(HERE, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');

/** Unchecked task lines (`- [ ] ...`) of a tasks.md. */
export function openTasks(tasksMd) {
  return tasksMd.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\[ \]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+\[ \]\s+/, '').trim());
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function archiveOf(repo, change) {
  const dir = path.join(repo, 'openspec', 'changes', 'archive');
  const hit = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => d.endsWith(`-${change}`) && /^\d{4}-\d{2}-\d{2}-/.test(d)).sort() : [];
  return hit.length ? `openspec/changes/archive/${hit[hit.length - 1]}` : null;
}

/**
 * Finalizes `change` in the checkout `repo` and commits as `author` ("Name <email>").
 * Returns { status: 'finalized', archive, commit } | { status: 'already', archive } | { status: 'open-tasks', tasks }.
 */
export function finalizeChange({ repo, change, author, openspec = OPENSPEC_BIN }) {
  const { active, archived } = changesInTree(git(repo, ['ls-files', '--', 'openspec/changes']).split('\n'));
  if (!active.has(change)) {
    if (archived.has(change)) return { status: 'already', archive: archiveOf(repo, change) };
    throw new Error(`change "${change}" is neither active nor archived in the PR`);
  }
  const tasksFile = path.join(repo, 'openspec', 'changes', change, 'tasks.md');
  const open = fs.existsSync(tasksFile) ? openTasks(fs.readFileSync(tasksFile, 'utf8')) : [];
  if (open.length) return { status: 'open-tasks', tasks: open };

  const cli = (args) => execFileSync(process.execPath, [openspec, ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  cli(['archive', change, '--yes']);
  cli(['validate', '--all', '--strict', '--no-interactive']);
  const archive = archiveOf(repo, change);
  if (!archive || fs.existsSync(path.join(repo, 'openspec', 'changes', change))) throw new Error(`openspec archive did not move openspec/changes/${change}/`);

  const m = /^(.+?)\s*<([^>]+)>$/.exec(author ?? '');
  if (!m) throw new Error('author must be "Name <email>"');
  git(repo, ['add', '-A', '--', 'openspec']);
  execFileSync('git', ['-C', repo, '-c', `user.name=${m[1]}`, '-c', `user.email=${m[2]}`, 'commit', '--quiet', '--no-verify', '-m', `docs(openspec): finalize ${change}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: 'finalized', archive, commit: git(repo, ['rev-parse', 'HEAD']) };
}

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function main(a) {
  const repoName = process.env.GITHUB_REPOSITORY;
  for (const k of ['repo', 'pr', 'author']) if (!a[k]) throw new Error(`missing --${k}`);
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  const pr = JSON.parse(gh(['api', `repos/${repoName}/pulls/${a.pr}`]));
  const parsed = parseLink(pr.body);
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.linked) return summary(`#${a.pr} links no OpenSpec change: nothing to finalize`);
  if (pr.state !== 'open' || pr.draft) return summary(`#${a.pr} is ${pr.draft ? 'a draft' : pr.state}: not finalized`);
  const head = git(a.repo, ['rev-parse', 'HEAD']);
  if (head !== pr.head.sha) return summary(`#${a.pr} moved on (${pr.head.sha.slice(0, 7)}); the run for the new head finalizes it`);

  const { change } = parsed.link;
  const result = finalizeChange({ repo: a.repo, change, author: a.author });
  if (result.status === 'open-tasks') {
    summary(`### ${change}: not finalized, ${result.tasks.length} open task(s) in tasks.md\n\n${result.tasks.map((t) => `- ${t}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  let link = { ...parsed.link, archive: result.archive };
  if (result.status === 'finalized') {
    git(a.repo, ['push', '--quiet', 'origin', `HEAD:refs/heads/${pr.head.ref}`]);
    link = { ...link, finalizedHead: result.commit };
    summary(`### ${change}: finalized\n\nArchived to \`${result.archive}\` in ${result.commit.slice(0, 7)}; CI runs on the new head.`);
  } else {
    summary(`### ${change}: already finalized (\`${result.archive}\`)`);
  }
  if (JSON.stringify(link) !== JSON.stringify(parsed.link)) {
    gh(['api', '-X', 'PATCH', `repos/${repoName}/pulls/${a.pr}`, '--input', '-'], JSON.stringify({ body: writeLink(pr.body, link) }));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  try {
    main(a);
  } catch (e) {
    console.error(`::error title=Finalization::${String(e.stderr || e.message || e).trim()}`);
    process.exit(1);
  }
}

#!/usr/bin/env node
// Repository settings as code: config/github-repository-governance.json declares the merge settings, the Actions
// default workflow permissions, the rulesets and the labels the workflows use.
//
//   pnpm governance check                                       exit 1 with the differences on drift
//   pnpm governance apply                                       print what would change, write nothing
//   pnpm governance apply --confirm apply-xr-build-governance   write it with your own gh credentials, then check
//
// Only declared keys are compared and written; rulesets and labels the file does not declare are never deleted.
// The repository is GITHUB_REPOSITORY, else the origin remote's (gh's default).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runActivation } from './activation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.resolve(HERE, '../../config/github-repository-governance.json');
export const CONFIRM = 'apply-xr-build-governance';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const show = (v) => JSON.stringify(sortKeys(v));

/**
 * Differences between `declared` and `live` on the declared keys only: [{ path, declared, live }].
 * Objects compare key by key; arrays of `{ type }` items (ruleset rules) match items by type; other arrays compare whole.
 */
export function diffDeclared(declared, live, at = '') {
  if (isObject(declared)) {
    if (!isObject(live)) return [{ path: at || '.', declared, live }];
    return Object.keys(declared).filter((k) => k !== '$comment').flatMap((k) => diffDeclared(declared[k], live[k], at ? `${at}.${k}` : k));
  }
  if (Array.isArray(declared) && declared.length && declared.every((d) => isObject(d) && typeof d.type === 'string')) {
    if (!Array.isArray(live)) return [{ path: at, declared, live }];
    const out = declared.flatMap((d) => {
      const l = live.find((x) => x?.type === d.type);
      return l ? diffDeclared(d, l, `${at}[${d.type}]`) : [{ path: `${at}[${d.type}]`, declared: d, live: undefined }];
    });
    for (const l of live) if (!declared.some((d) => d.type === l?.type)) out.push({ path: `${at}[${l.type}]`, declared: undefined, live: l });
    return out;
  }
  if (Array.isArray(declared)) {
    const norm = (a) => (Array.isArray(a) ? a.map(show).sort() : a);
    return show(norm(declared)) === show(norm(live)) ? [] : [{ path: at, declared, live }];
  }
  return declared === live ? [] : [{ path: at, declared, live }];
}

/** The live state the config talks about, read through `api(method, path)`. */
export function readLive(api, repo) {
  const rulesets = api('GET', `repos/${repo}/rulesets`).map((r) => api('GET', `repos/${repo}/rulesets/${r.id}`));
  return {
    repository: api('GET', `repos/${repo}`),
    actions: api('GET', `repos/${repo}/actions/permissions/workflow`),
    rulesets,
    labels: api('GET', `repos/${repo}/labels?per_page=100`),
  };
}

/** Every difference between the config and the live state, with readable paths. */
export function check(config, live) {
  const out = [...diffDeclared(config.repository, live.repository, 'repository'), ...diffDeclared(config.actions, live.actions, 'actions')];
  for (const rs of config.rulesets) {
    const l = live.rulesets.find((x) => x.name === rs.name);
    out.push(...(l ? diffDeclared(rs, l, `rulesets[${rs.name}]`) : [{ path: `rulesets[${rs.name}]`, declared: 'present', live: 'missing' }]));
  }
  for (const lb of config.labels) {
    const l = live.labels.find((x) => x.name === lb.name);
    if (!l) out.push({ path: `labels[${lb.name}]`, declared: 'present', live: 'missing' });
    else out.push(...diffDeclared({ ...lb, color: lb.color.toLowerCase() }, { ...l, color: String(l.color).toLowerCase() }, `labels[${lb.name}]`));
  }
  return out;
}

/** The writes that bring the live state to the config: [{ method, path, body, why }]. Never a delete. */
export function planApply(config, live, repo) {
  const writes = [];
  if (diffDeclared(config.repository, live.repository).length) writes.push({ method: 'PATCH', path: `repos/${repo}`, body: config.repository, why: 'repository settings' });
  if (diffDeclared(config.actions, live.actions).length) writes.push({ method: 'PUT', path: `repos/${repo}/actions/permissions/workflow`, body: config.actions, why: 'Actions workflow permissions' });
  for (const rs of config.rulesets) {
    const l = live.rulesets.find((x) => x.name === rs.name);
    if (!l) writes.push({ method: 'POST', path: `repos/${repo}/rulesets`, body: rs, why: `create ruleset ${rs.name}` });
    else if (diffDeclared(rs, l).length) writes.push({ method: 'PUT', path: `repos/${repo}/rulesets/${l.id}`, body: rs, why: `update ruleset ${rs.name}` });
  }
  for (const lb of config.labels) {
    const l = live.labels.find((x) => x.name === lb.name);
    if (!l) writes.push({ method: 'POST', path: `repos/${repo}/labels`, body: lb, why: `create label ${lb.name}` });
    else if (lb.color.toLowerCase() !== String(l.color).toLowerCase() || lb.description !== l.description) {
      writes.push({ method: 'PATCH', path: `repos/${repo}/labels/${encodeURIComponent(lb.name)}`, body: { color: lb.color, description: lb.description }, why: `update label ${lb.name}` });
    }
  }
  return writes;
}

export function formatDiff(diffs) {
  return diffs.map((d) => `- ${d.path}: declared ${JSON.stringify(d.declared)}, live ${JSON.stringify(d.live)}`).join('\n');
}

function ghApi(method, p, body) {
  const out = execFileSync('gh', ['api', '-X', method, p, ...(body ? ['--input', '-'] : [])], { encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, stdio: [body ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  return out.trim() ? JSON.parse(out) : null;
}

// The checkout this script lives in decides the repository, never the caller's working folder: run from another
// repository's folder, `gh repo view` once named that one and apply rewrote its settings.
export const REPO_NAME = 'xrbuild';

function repoName() {
  const canonical = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { encoding: 'utf8', cwd: path.resolve(HERE, '../..') }).trim();
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== canonical) throw new Error('Repository environment does not match this checkout');
  return canonical;
}

/** Runs a command; returns the exit code. `api` and `out` are injectable for tests. */
export function run(argv, { api = ghApi, repo = repoName(), config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')), out = console.log } = {}) {
  const [cmd, flag, value] = argv;
  if (repo.split('/').pop() !== REPO_NAME) {
    out(`refusing: the repository is ${repo}, not ${REPO_NAME}; this file declares ${REPO_NAME}'s settings only`);
    return 2;
  }
  if (['preflight', 'protect', 'activate-ci', 'activate'].includes(cmd)) {
    return runActivation(cmd, { api, repo, config, out, confirmed: flag === '--confirm' && value === CONFIRM,
      planSettings: planApply, readSettings: readLive, checkSettings: check });
  }
  if (cmd === 'apply' && config.rulesets.some(rule => rule.bypass_actors?.length !== 0)) {
    out('refusing: administrator and bot bypass actors are forbidden'); return 2;
  }
  if (cmd === 'check') {
    const diffs = check(config, readLive(api, repo));
    out(diffs.length ? `${repo} drifted from config/github-repository-governance.json:\n${formatDiff(diffs)}` : `${repo} matches config/github-repository-governance.json`);
    return diffs.length ? 1 : 0;
  }
  if (cmd === 'apply') {
    const writes = planApply(config, readLive(api, repo), repo);
    if (!writes.length) {
      out('nothing to apply');
      return 0;
    }
    out(writes.map((w) => `${w.method} ${w.path}  (${w.why})`).join('\n'));
    if (flag !== '--confirm' || value !== CONFIRM) {
      out(`dry run: nothing written. Add --confirm ${CONFIRM} to apply.`);
      return 0;
    }
    for (const w of writes) api(w.method, w.path, w.body);
    return run(['check'], { api, repo, config, out });
  }
  out(`usage: governance check | preflight | protect | activate-ci | activate | apply [--confirm ${CONFIRM}]`);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.stderr || e.message || e));
    process.exitCode = 1;
  }
}

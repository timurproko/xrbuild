#!/usr/bin/env node
// Optional no-checkout publisher. Reads an explicitly reviewed public plan from stdin; never reads
// caller paths, installs packages, attaches a runtime, force-updates refs or deletes remote resources.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile } from '../name-guard/name-guard.mjs';
import { parseLink } from '../pr-automation/pr-body.mjs';

const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const MAX_BYTES = 1024 * 1024;
const fail = message => { throw new Error(message); };

function ref(value) {
  return typeof value === 'string' && value.length < 200 && !value.includes('..')
    && value.split('/').every(part => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) && !part.endsWith('.lock') && !part.endsWith('.'));
}

export function planPath(change, file) {
  const prefix = `openspec/changes/${change}/`;
  if (typeof file !== 'string' || !file.startsWith(prefix)) return false;
  return /^(?:proposal\.md|design\.md|tasks\.md|\.openspec\.yaml|specs\/[a-z0-9][a-z0-9-]*\/spec\.md)$/.test(file.slice(prefix.length));
}

/** Structural publication checks, not OpenSpec validation or implementation readiness. */
export function validatePlan(plan, banned) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('A planning payload is required');
  const allowed = new Set(['repository', 'base', 'head', 'change', 'title', 'body', 'files', 'expectedHead', 'expectedBase', 'publicReviewed']);
  if (Object.keys(plan).some(key => !allowed.has(key))) fail('Unknown planning payload field');
  if (!/^[\w-]+\/[\w.-]+$/.test(plan.repository ?? '') || !ref(plan.base) || !ref(plan.head) || plan.base === plan.head
      || !ID.test(plan.change ?? '')) fail('Explicit repository, distinct base/head and change identity required');
  if (plan.publicReviewed !== true) fail('Explicit publicReviewed approval of the entire payload is required; filtering cannot prove confidentiality');
  if (!(banned instanceof Set) || !banned.size) fail('A nonempty reviewed name-guard hash set is required');
  if (plan.expectedHead !== undefined && !SHA.test(plan.expectedHead)) fail('expectedHead must be a commit SHA');
  if (plan.expectedBase !== undefined && !SHA.test(plan.expectedBase)) fail('expectedBase must be a commit SHA');
  if (typeof plan.title !== 'string' || !plan.title.trim() || typeof plan.body !== 'string') fail('Title and draft body required');
  const parsed = parseLink(plan.body);
  if (!parsed.linked || parsed.link.change !== plan.change || parsed.link.archive || parsed.link.finalizedHead) fail('Draft body must link only the selected active change');
  const sections = [...plan.body.matchAll(/^## (Proposal|Implementation|Acceptance|Automation)[ \t]*\r?$/gm)];
  if (sections.map(s => s[1]).join(',') !== 'Proposal,Implementation,Automation') fail('Planning body needs Proposal, Implementation and final Automation, without Acceptance');
  const proposal = plan.body.slice(sections[0].index + sections[0][0].length, sections[1].index);
  const implementation = plan.body.slice(sections[1].index + sections[1][0].length, sections[2].index);
  const items = implementation.split(/\r?\n/).filter(line => /^\s*[-*] /.test(line));
  if (!proposal.trim() || !items.length || items.some(line => !/^\s*[-*] \[ \] \S/.test(line))) fail('Planning draft needs a real proposal and meaningful unchecked outcomes');
  if (!Array.isArray(plan.files) || !plan.files.length || plan.files.length > 100) fail('Selected planning files required (at most 100)');
  const paths = new Set();
  for (const file of plan.files) {
    if (!file || Object.keys(file).sort().join(',') !== 'content,path' || !planPath(plan.change, file.path)
        || typeof file.content !== 'string' || !file.content.trim() || file.content.includes('\0') || paths.has(file.path)) fail('Only unique text artifacts of the selected change may be published');
    paths.add(file.path);
  }
  for (const name of ['proposal.md', 'design.md', 'tasks.md']) {
    if (!paths.has(`openspec/changes/${plan.change}/${name}`)) fail(`Missing planning artifact: ${name}`);
  }
  const tasks = plan.files.find(file => file.path.endsWith('/tasks.md')).content;
  if (!/^\s*[-*] \[ \] \S/m.test(tasks) || /^\s*[-*] \[[xX]\]/m.test(tasks)) fail('Planning tasks must remain unchecked');
  const payload = JSON.stringify(plan);
  if (Buffer.byteLength(payload) > MAX_BYTES) fail('Planning payload exceeds 1 MiB');
  // Guard obvious mistakes without claiming this is a secret scanner or an export audit.
  const texts = [plan.repository, plan.base, plan.head, plan.title, plan.body, ...plan.files.map(file => `${file.path}\n${file.content}`)];
  for (const text of texts) {
    if (/https?:\/\/[^\s/]+:[^\s/]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})/.test(text)) fail('Credential-like input refused');
    if (checkFile('planning-payload.md', Buffer.from(text), banned).length) fail('Planning payload violates the public name boundary');
  }
  return plan;
}

/** All requests use explicit repository identity. Errors intentionally omit input and response bodies. */
export function ghRequest(endpoint, { method = 'GET', body } = {}) {
  try {
    return JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', '--method', method, endpoint,
      ...(body === undefined ? [] : ['--input', '-'])], {
      input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 4 * MAX_BYTES,
    }));
  } catch (error) {
    const failure = new Error('GitHub planning request failed; inspect repository/ref access and retry without deleting refs');
    if (/\(HTTP 404\)/.test(String(error.stderr))) failure.status = 404;
    throw failure;
  }
}

export async function publishPlan(input, { request = ghRequest, banned } = {}) {
  const plan = validatePlan(input, banned);
  const api = `repos/${plan.repository}`;
  const branchRef = branch => `${api}/git/ref/heads/${encodeURIComponent(branch)}`;
  const optional = async endpoint => { try { return await request(endpoint); } catch (error) { if (error.status === 404) return null; throw error; } };
  const repository = await request(api);
  if (repository.full_name !== plan.repository || repository.private !== false) fail('The explicitly selected public repository could not be verified');
  const base = await request(branchRef(plan.base));
  if (!SHA.test(base.object?.sha ?? '') || (plan.expectedBase && plan.expectedBase !== base.object.sha)) fail('Base candidate changed or could not be verified');
  const existing = await optional(branchRef(plan.head));
  if (existing && (!plan.expectedHead || plan.expectedHead !== existing.object?.sha)) fail('Branch exists or changed; inspect its head and retry with expectedHead to preserve the same task');
  if (!existing && plan.expectedHead) fail('Expected branch is missing; no replacement created');
  const parent = existing?.object?.sha ?? base.object.sha;
  if (existing) {
    const comparison = await request(`${api}/compare/${base.object.sha}...${parent}`);
    if (!['ahead', 'identical'].includes(comparison.status) || !Array.isArray(comparison.files) || comparison.files.length >= 300
        || comparison.files.some(file => !planPath(plan.change, file.filename) || (file.previous_filename && !planPath(plan.change, file.previous_filename)))) {
      fail('Existing branch is divergent or contains changes outside the selected plan; continue it in an implementation checkout');
    }
  }
  const commit = await request(`${api}/git/commits/${parent}`);
  if (!SHA.test(commit.tree?.sha ?? '')) fail('Invalid parent tree');
  const tree = await request(`${api}/git/trees`, { method: 'POST', body: {
    base_tree: commit.tree.sha, tree: plan.files.map(file => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
  } });
  if (!SHA.test(tree.sha ?? '')) fail('Invalid planning tree');
  let head = parent;
  if (!existing || tree.sha !== commit.tree.sha) {
    const created = await request(`${api}/git/commits`, { method: 'POST', body: {
      message: `docs(openspec): propose ${plan.change}`, tree: tree.sha, parents: [parent],
    } });
    if (!SHA.test(created.sha ?? '')) fail('Invalid planning commit');
    // Recheck both selected refs immediately before publication. GitHub's non-force update also
    // rejects a concurrent divergent descendant: every new commit has exactly the expected parent.
    const freshBase = await request(branchRef(plan.base));
    const freshHead = await optional(branchRef(plan.head));
    if (freshBase.object?.sha !== base.object.sha || freshHead?.object?.sha !== existing?.object?.sha) fail('Refs changed before publication; no branch update attempted');
    if (existing) await request(`${api}/git/refs/heads/${encodeURIComponent(plan.head)}`, { method: 'PATCH', body: { sha: created.sha, force: false } });
    else await request(`${api}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${plan.head}`, sha: created.sha } });
    head = created.sha;
  }
  // Ref publication is durable. Any later failure is recoverable by selecting this exact head;
  // do not undo it, replace a concurrent PR body, or silently abandon a remote task.
  try {
    const current = await request(branchRef(plan.head));
    if (current.object?.sha !== head) fail('Branch advanced after publication');
    const pulls = await request(`${api}/pulls?state=all&head=${encodeURIComponent(`${plan.repository.split('/')[0]}:${plan.head}`)}&per_page=100`);
    if (!Array.isArray(pulls) || pulls.length >= 100) fail('Ambiguous pull-request discovery');
    const matching = pulls.filter(pr => pr.head?.repo?.full_name === plan.repository && pr.head?.ref === plan.head);
    if (matching.length) {
      if (matching.length !== 1 || matching[0].state !== 'open' || !matching[0].draft || matching[0].base?.ref !== plan.base
          || matching[0].head?.sha !== head || matching[0].body !== plan.body || matching[0].title !== plan.title) fail('Existing PR differs; reconcile its identity and metadata explicitly');
      return { repository: plan.repository, branch: plan.head, change: plan.change, head, pr: matching[0].number, publication: 'verified', reused: true };
    }
    const pr = await request(`${api}/pulls`, { method: 'POST', body: { title: plan.title, body: plan.body, head: plan.head, base: plan.base, draft: true } });
    if (!Number.isSafeInteger(pr.number) || pr.number < 1) fail('Invalid created PR identity');
    const observed = await request(`${api}/pulls/${pr.number}`);
    const published = await request(branchRef(plan.head));
    if (published.object?.sha !== head || observed.state !== 'open' || !observed.draft || observed.head?.sha !== head
        || observed.head?.repo?.full_name !== plan.repository || observed.head?.ref !== plan.head || observed.base?.ref !== plan.base
        || observed.body !== plan.body || observed.title !== plan.title) fail('Created candidate changed before readback');
    return { repository: plan.repository, branch: plan.head, change: plan.change, head, pr: pr.number, publication: 'verified', reused: false };
  } catch {
    fail(`Plan branch retained at ${head}; inspect the existing PR and retry with expectedHead=${head}. No remote ref or PR was deleted`);
  }
}

export async function runPlanning(stdin = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BYTES) fail('Planning payload exceeds 1 MiB');
    chunks.push(Buffer.from(chunk));
  }
  let plan;
  try { plan = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('Expected one JSON planning payload on stdin'); }
  const hashes = await fs.readFile(new URL('../name-guard/banned.sha256', import.meta.url), 'utf8');
  const banned = new Set(hashes.split(/\r?\n/).filter(line => /^[a-f0-9]{64}$/.test(line)));
  return publishPlan(plan, { banned });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPlanning().then(result => console.log(JSON.stringify(result)), error => { console.error(error.message); process.exitCode = 1; });
}

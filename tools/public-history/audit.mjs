#!/usr/bin/env node
// Read-only, fail-closed publication gate. This never filters, uploads or changes repository visibility.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNames, HASH_FILE } from '../name-guard/name-guard.mjs';

const MAX_OUTPUT = 256 * 1024 * 1024;
const MAX_OBJECT = 16 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const lines = (text) => text.trim().split(/\r?\n/).filter(Boolean);
const git = (repo, args, input, encoding = 'utf8') => {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding, input, maxBuffer: MAX_OUTPUT, timeout: 120_000,
      env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Git errors can contain private paths or contents. Do not echo them into public logs.
    throw new Error('Cannot read required Git data; audit incomplete');
  }
};
function policyHashes() {
  const entries = lines(fs.readFileSync(HASH_FILE, 'utf8'));
  if (!entries.length || entries.some((entry) => !/^[0-9a-f]{64}$/.test(entry))) {
    throw new Error('Name policy is missing or malformed; audit incomplete');
  }
  return new Set(entries);
}

/** Audit the immutable object closure of explicitly named branch/tag refs; findings contain IDs, not private text. */
export function audit(repo, refs, { banned = policyHashes(), maxObjectBytes = MAX_OBJECT } = {}) {
  if (!(banned instanceof Set) || !banned.size) throw new Error('Name policy is empty; audit incomplete');
  if (!refs.length || refs.some((ref) => !/^refs\/(heads|tags)\//.test(ref))) {
    throw new Error('Supply explicit refs/heads/... or refs/tags/... publication refs');
  }
  if (git(repo, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('Shallow history cannot be audited');
  if (git(repo, ['for-each-ref', '--format=%(refname)', 'refs/replace']).trim()) throw new Error('Replacement refs are not supported');
  const grafts = git(repo, ['rev-parse', '--path-format=absolute', '--git-path', 'info/grafts']).trim();
  if (fs.existsSync(grafts)) throw new Error('Grafted history is not supported');
  const config = git(repo, ['config', '--list']);
  if (/^remote\..*\.promisor=(true|yes|on|1)$/mi.test(config)) throw new Error('Partial clones cannot be audited');
  const resolved = refs.map((ref) => {
    git(repo, ['check-ref-format', ref]);
    const object = git(repo, ['rev-parse', '--verify', ref]).trim();
    const commit = git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
    if (!/^[0-9a-f]{40,64}$/.test(object) || !/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('Invalid ref resolution');
    return { ref, object, commit };
  });
  const objects = [...new Set(lines(git(repo, ['rev-list', '--objects', '--no-object-names', '--stdin'], resolved.map((r) => r.object).join('\n') + '\n')))];
  if (!objects.length) throw new Error('Empty object closure; audit incomplete');
  const metadata = lines(git(repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], objects.join('\n') + '\n'));
  if (metadata.length !== objects.length) throw new Error('Incomplete object inventory');
  const contents = [];
  let totalBytes = 0;
  for (const line of metadata) {
    const [oid, type, rawSize] = line.split(' ');
    const size = Number(rawSize);
    if (!['commit', 'tree', 'blob', 'tag'].includes(type) || !Number.isSafeInteger(size) || size < 0) throw new Error('Missing or invalid reachable object');
    if (size > maxObjectBytes) throw new Error(`Object exceeds audit bound: ${oid}`);
    if (type !== 'tree') {
      contents.push(oid);
      totalBytes += size + 128;
    }
  }
  if (totalBytes > MAX_OUTPUT) throw new Error('History exceeds audit memory bound; audit incomplete');
  const data = git(repo, ['cat-file', '--batch'], Buffer.from(contents.join('\n') + '\n'), null);
  const trees = new Set();
  const counts = { commits: 0, blobs: 0, tags: 0, rootTrees: 0, findings: 0 };
  const findings = [];
  const found = (kind, object) => {
    counts.findings++;
    if (findings.length < 100) findings.push({ kind, object });
  };
  let cursor = 0, processed = 0;
  while (cursor < data.length) {
    const end = data.indexOf(10, cursor);
    if (end < 0) throw new Error('Incomplete batch header');
    const [oid, type, rawSize] = data.subarray(cursor, end).toString('ascii').split(' ');
    const size = Number(rawSize);
    if (!Number.isSafeInteger(size) || size < 0 || size > maxObjectBytes || oid !== contents[processed]) throw new Error('Invalid batch object');
    const bytes = data.subarray(end + 1, end + 1 + size);
    if (bytes.length !== size || data[end + 1 + size] !== 10) throw new Error('Incomplete batch object');
    cursor = end + size + 2;
    processed++;
    // Scan ASCII/UTF-8 and wide strings in binary objects; do not silently exempt binary contents.
    const text = bytes.toString('utf8');
    const texts = [text];
    if (bytes.includes(0)) {
      for (const offset of [0, 1]) {
        const even = bytes.subarray(offset, offset + Math.floor((bytes.length - offset) / 2) * 2);
        texts.push(even.toString('utf16le'), Buffer.from(even).swap16().toString('utf16le'));
      }
    }
    if (texts.some((value) => findNames(value, banned).length)) found('prohibited-name', oid);
    if (/^version https:\/\/git-lfs.github.com\/spec\/v1\r?$/m.test(text) && /\boid sha256:[0-9a-f]{64}\b/.test(text)) found('lfs-pointer', oid);
    if (type === 'commit') {
      const tree = /^tree ([0-9a-f]{40,64})\n/.exec(text)?.[1];
      if (!tree) throw new Error('Malformed commit tree');
      trees.add(tree);
      counts.commits++;
    } else if (type === 'blob') counts.blobs++;
    else if (type === 'tag') counts.tags++;
    else throw new Error('Unexpected batch type');
  }
  if (processed !== contents.length) throw new Error('Incomplete reachable contents');
  for (const tree of trees) {
    const entries = git(repo, ['ls-tree', '-r', '-t', '-z', '--full-tree', tree], undefined, null);
    for (const entry of entries.toString('binary').split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t');
      if (tab < 0) throw new Error('Invalid tree entry');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      let name;
      try { name = decoder.decode(Buffer.from(entry.slice(tab + 1), 'binary')); }
      catch { throw new Error('Unsupported path encoding; audit incomplete'); }
      if (/(^|\/)\.xrbuild(?:\/|$)/i.test(name)) found('private-workspace-path', tree);
      if (findNames(name, banned).length) found('prohibited-path', tree);
      if (mode === '160000' || type === 'commit') found('unverifiable-gitlink', tree);
      else if (!['blob', 'tree'].includes(type) || !/^[0-9a-f]{40,64}$/.test(oid)) throw new Error('Unsupported tree entry');
    }
  }
  counts.rootTrees = trees.size;
  for (const selected of resolved) {
    if (git(repo, ['rev-parse', '--verify', selected.ref]).trim() !== selected.object) throw new Error('Publication refs changed during audit');
    if (findNames(selected.ref, banned).length) found('prohibited-ref', selected.object);
  }
  const reportedRefs = resolved.map((selected) => ({ ...selected,
    ref: findNames(selected.ref, banned).length ? '(redacted)' : selected.ref,
  }));
  return { clean: counts.findings === 0, refs: reportedRefs, counts, findings, truncated: counts.findings > findings.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [repo, ...refs] = process.argv.slice(2);
    if (!repo) throw new Error('usage: audit.mjs <repository-path> refs/heads/<branch> [refs/tags/<tag> ...]');
    const result = audit(path.resolve(repo), refs);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.clean ? 0 : 1;
  } catch (error) {
    console.error(`Public history audit failed: ${error.message}`);
    process.exitCode = 2;
  }
}

#!/usr/bin/env node
// Name guard: core paths and contents outside the private .xrbuild/ workspace must stay neutral
// (the rule: .claude/CLAUDE.md, openspec/config.yaml). The entire private workspace is excluded. The banned names exist
// only as hashes (banned.sha256); no plain
// list is kept anywhere. Text and paths are split into words (on non-alphanumerics and camel-case
// boundaries); every word, run of 2-3 words, and their concatenation is hashed and looked up. A word inside
// a longer word is not a match.
//
//   node tools/name-guard/name-guard.mjs check             every tracked file: contents, paths, package names
//   node tools/name-guard/name-guard.mjs check --staged    the staged files (the pre-commit hook)
//   node tools/name-guard/name-guard.mjs hook              Claude Code PreToolUse hook (JSON on stdin)
//   node tools/name-guard/name-guard.mjs add <name> [--exact] [--force]   adds the name's hashes only
//   (--exact: that exact case only, for a name whose lower-case form is an ordinary word in code)
//
// Hashes keep a name from being published by accident. They are not secrecy: a short name can be found
// by hashing a dictionary. Never write a name that must stay secret into the core in any form.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const HASH_FILE = path.join(HERE, 'banned.sha256');
const PREFIX = 'xrb-name-guard:';
const MAX_WORDS = 3;

/** Words that are too common to ban alone: `add` refuses them without --force. */
const COMMON = new Set(('a an and app apps as at be by core data dev display do for from hand hands host in input is it '
  + 'name new not of on or out panel platform plugin plugins run test the to tool use user view web with xr').split(' '));

export const hashOf = (key) => createHash('sha256').update(PREFIX + key).digest('hex');

/** Words of a text: alphanumeric runs, split again at camel-case and letter/digit boundaries. */
export function words(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Za-z0-9]+/g)) {
    const parts = m[0].match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g) ?? [m[0]];
    // The whole run counts as a word too ("AcmeCorp" is "acmecorp" as well as "acme", "corp").
    if (parts.length > 1) out.push({ word: m[0], index: m.index, whole: true });
    let at = m.index;
    for (const p of parts) {
      const i = m[0].indexOf(p, at - m.index) + m.index;
      out.push({ word: p, index: i });
      at = i + p.length;
    }
  }
  return out;
}

/**
 * Lookup keys of a name as stored: lower-case words joined by spaces, and joined without spaces
 * ("Widget Pro" -> "widget pro", "widgetpro"); `exact`: "=" + the name's own spelling.
 */
export function nameKeys(name, exact = false) {
  const ws = words(name).filter((w) => !w.whole).map((w) => w.word);
  if (!ws.length) throw new Error(`"${name}" has no letters or digits`);
  if (ws.length > MAX_WORDS) throw new Error(`"${name}" has more than ${MAX_WORDS} words`);
  if (exact) return [`=${ws.join(' ')}`];
  const lower = ws.map((w) => w.toLowerCase());
  return [...new Set([lower.join(' '), lower.join('')])];
}

/** Keys of every word and run of words in a text, with where they start. */
function textKeys(text) {
  const ws = words(text);
  const seq = ws.filter((w) => !w.whole);
  const keys = [];
  for (const w of ws) keys.push({ key: w.word.toLowerCase(), exact: `=${w.word}`, index: w.index, shown: w.word });
  for (let n = 2; n <= MAX_WORDS; n++) {
    for (let i = 0; i + n <= seq.length; i++) {
      const run = seq.slice(i, i + n);
      // Only words next to each other: at most one separator character between them.
      if (run.some((w, k) => k > 0 && w.index - (run[k - 1].index + run[k - 1].word.length) > 1)) continue;
      const shown = text.slice(run[0].index, run[n - 1].index + run[n - 1].word.length);
      const lower = run.map((w) => w.word.toLowerCase());
      keys.push({ key: lower.join(' '), alt: lower.join(''), exact: `=${run.map((w) => w.word).join(' ')}`, index: run[0].index, shown });
    }
  }
  return keys;
}

/** Banned names in a text: [{ line, word }]. `banned` is a Set of hashes. */
export function findNames(text, banned) {
  const hits = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (index) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const seen = new Set();
  for (const k of textKeys(text)) {
    const hit = [k.key, k.alt, k.exact].some((x) => x && banned.has(hashOf(x)));
    if (!hit) continue;
    const line = lineOf(k.index);
    const id = `${line}:${k.shown.toLowerCase()}`;
    if (!seen.has(id)) hits.push({ line, word: k.shown });
    seen.add(id);
  }
  return hits.sort((a, b) => a.line - b.line);
}

export async function readHashes(file = HASH_FILE) {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[0-9a-f]{64}$/.test(l)));
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });

/** Private workspace content is exempt; every other tracked file remains checked. */
export function checksContents(rel) {
  return !rel.split(path.sep).join('/').startsWith('.xrbuild/');
}

/** Checks one file: paths and contents outside the private workspace. */
export function checkFile(rel, content, banned) {
  if (!checksContents(rel)) return [];
  const out = findNames(rel, banned).map((h) => ({ file: rel, line: 0, word: h.word }));
  if (content && checksContents(rel) && !isBinary(content)) out.push(...findNames(content.toString('utf8'), banned).map((h) => ({ file: rel, ...h })));
  return out;
}

/** Every tracked file (or the staged ones) of a repo. The hash list itself is skipped. */
export async function checkRepo(repo, banned, { staged = false } = {}) {
  const list = staged
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], repo)
    : git(['ls-files', '-z'], repo);
  const files = list.toString('utf8').split('\0').filter(Boolean);
  const hits = [];
  for (const rel of files) {
    if (path.resolve(repo, rel) === HASH_FILE || !checksContents(rel)) continue;
    let content = null;
    try {
      content = staged ? git(['show', `:${rel}`], repo) : await fs.readFile(path.join(repo, rel));
    } catch { /* deleted in the work tree: its path is still checked */ }
    hits.push(...checkFile(rel, content, banned));
  }
  return hits;
}

const report = (hits) => hits.map((h) => `${h.file}${h.line ? `:${h.line}` : ' (path)'}: ${h.word}`).join('\n');

/** A path in its canonical long form (8.3 short names expanded), also for a file that does not exist yet. */
export function canonical(p) {
  const abs = path.resolve(p);
  try {
    return realpathSync.native(abs);
  } catch {
    const parent = path.dirname(abs);
    return parent === abs ? abs : path.join(canonical(parent), path.basename(abs));
  }
}

/**
 * Claude Code PreToolUse hook: refuses a Write/Edit/MultiEdit of a file inside the repository whose new text
 * or path holds a banned name (exit 2, the reason on stderr). Files outside the repository pass.
 */
export function hookDecision(input, repo, banned) {
  const ti = input?.tool_input ?? {};
  const file = ti.file_path ? canonical(ti.file_path) : null;
  if (!file) return null;
  const rel = path.relative(canonical(repo), file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (file === canonical(HASH_FILE)) return null;
  const texts = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)].filter((t) => typeof t === 'string');
  const hits = checkFile(rel.split(path.sep).join('/'), Buffer.from(texts.join('\n')), banned);
  if (!hits.length) return null;
  return `name guard: this edit puts a banned name in the core (${[...new Set(hits.map((h) => h.word))].join(', ')} in ${rel}). `
    + 'Keep core paths and contents neutral; private workspace files belong under .xrbuild/.';
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const banned = await readHashes();
  if (cmd === 'check') {
    const hits = await checkRepo(REPO, banned, { staged: rest.includes('--staged') });
    if (!banned.size) console.warn('name guard: banned.sha256 is empty; add names with `pnpm names add <name>`');
    if (hits.length) {
      console.error(`name guard: ${hits.length} banned name(s) in the repository:\n${report(hits)}`);
      return 1;
    }
    console.log(`name guard: no banned names (${banned.size} hashes)`);
    return 0;
  }
  if (cmd === 'hook') {
    let input;
    try {
      input = JSON.parse((await readStdin()).replace(/^﻿/, ''));
    } catch {
      return 0;  // not a hook call we understand: never block on our own error
    }
    const reason = hookDecision(input, REPO, banned);
    if (!reason) return 0;
    console.error(reason);
    return 2;
  }
  if (cmd === 'add') {
    const exact = rest.includes('--exact'), force = rest.includes('--force');
    const name = rest.filter((a) => !a.startsWith('--')).join(' ').trim();
    if (!name) throw new Error('usage: add <name> [--exact] [--force]');
    const keys = nameKeys(name, exact);
    const single = words(name).filter((w) => !w.whole);
    if (!force && single.length === 1 && COMMON.has(single[0].word.toLowerCase()))
      throw new Error(`"${name}" is a common word: banned alone it would flag ordinary text. Ban it with another word, use --exact, or --force`);
    await writeHashes(new Set([...banned, ...keys.map(hashOf)]));
    console.log(`name guard: added ${keys.length} hash(es) to ${path.relative(REPO, HASH_FILE)}; commit it`);
    return 0;
  }
  console.error('usage: name-guard check [--staged] | hook | add <name> [--exact] [--force]');
  return 1;
}

async function writeHashes(set) {
  await fs.writeFile(HASH_FILE, [...set].sort().join('\n') + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error(`name guard: ${e.message}`);
    process.exitCode = 1;
  });
}

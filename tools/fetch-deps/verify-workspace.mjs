#!/usr/bin/env node
// Verify pinned dependencies in an explicitly selected independent workspace.
// Usage: node tools/fetch-deps/verify-workspace.mjs --workspace=<absolute-or-relative-path>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginDeps, sha256File } from './fetch-deps.mjs';

export async function verifyWorkspace(workspace) {
  let count = 0;
  for (const group of await pluginDeps(workspace)) {
    const lock = JSON.parse(await fs.readFile(group.lockPath, 'utf8'));
    for (const [key, expected] of Object.entries(lock)) {
      const file = path.resolve(group.root, key);
      if (!file.startsWith(path.resolve(group.root) + path.sep) || !/^[0-9a-f]{64}$/.test(expected)) {
        throw new Error(`invalid dependency lock entry: ${key}`);
      }
      const actual = await sha256File(file);
      if (actual !== expected) throw new Error(`${group.name}/${key}: SHA-256 mismatch (missing Git LFS checkout or wrong binary)`);
      count++;
    }
  }
  if (!count) throw new Error('no pinned workspace dependencies found');
  return count;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0].startsWith('--workspace=') || !args[0].slice('--workspace='.length)) {
      throw new Error('usage: verify-workspace.mjs --workspace=<path>');
    }
    console.log(`${await verifyWorkspace(path.resolve(args[0].slice('--workspace='.length)))} pinned workspace dependencies verified`);
  } catch (error) {
    console.error(`workspace dependency verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

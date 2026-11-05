#!/usr/bin/env node
// Claude Code WorktreeCreate hook: name "<type>--<short-desc>" binds a task branch of "<type>/<short-desc>".
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enter, primaryRoot, worktreeName } from './worktree.mjs';

export function taskBranch(name) {
  const match = /^([a-z]+)--([a-z0-9][a-z0-9-]*)$/.exec(name ?? '');
  if (!match) throw new Error('worktree name must be <type>--<short-desc>');
  const branch = `${match[1]}/${match[2]}`;
  worktreeName(branch);
  return branch;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { name, cwd } = JSON.parse(fs.readFileSync(0, 'utf8'));
    // Hook stdout must end with the absolute worktree path; diagnostics go to stderr.
    const dir = enter(taskBranch(name), { root: primaryRoot(cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()), log: (text) => console.error(text) });
    console.log(dir);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

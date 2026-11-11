import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const shared = 'In an active A1 session, use `a1 worktree enter <branch>` or `a1 worktree attach <absolute-path>`. Work in the returned directory; successful completion is the attachment confirmation. Use `a1 worktree detach` when handing off or finishing; it preserves files and branches. A1 owns coordination, retries, and recovery; `a1 worktree list` is informational. Outside A1, use ordinary Git worktrees.';

test('one shared worktree usage block replaces repository-owned coordination gates', async () => {
  const read = file => fs.readFile(path.join(root, file), 'utf8');
  const [agents, delivery, instructions] = await Promise.all([
    'AGENTS.md', '.claude/skills/change-delivery/SKILL.md', '.claude/CLAUDE.md',
  ].map(read));
  assert.ok(agents.includes(shared));
  for (const text of [agents, delivery, instructions]) {
    assert.doesNotMatch(text, /a1 session (?:link-worktree|worktrees)|require.*inventory.*current|Re-link and confirm/);
  }
  assert.match(delivery, /shared Worktrees guidance in `AGENTS.md`/);
  assert.match(delivery, /Dependency setup is separate from attachment/);
  assert.match(delivery, /Private workspaces|private clones/i);
  assert.match(delivery, /\.xrbuild\/.*\.artifacts\/KEEP/s);
  assert.match(delivery, /Never merge, arm auto-merge or push to `main`/);
  assert.match(agents, /Never clean up a worktree containing private workspace data/);
});

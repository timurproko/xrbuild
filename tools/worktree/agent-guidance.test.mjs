import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const shared = 'In an active A1 session, use `a1 worktree enter <branch>` or `a1 worktree attach <absolute-path>`. Work in the returned directory; success is the attachment confirmation. Keep the task attached after implementation completion and review handoff so follow-up fixes retain its checkout and PR. After a verified merge, run `a1 worktree complete`: it returns the session to primary before repository cleanup runs, so never clean the attached checkout directly. Use `a1 worktree detach` only when explicitly requested or switching tasks; it preserves files and branches. Runtime shutdown releases claims automatically. A1 owns coordination, retries, and recovery; `a1 worktree list` is informational. Outside A1, use ordinary Git worktrees.';

test('shared guidance retains task attachment through implementation and review without coordination gates', async () => {
  const read = file => fs.readFile(path.join(root, file), 'utf8');
  const [agents, delivery, instructions] = await Promise.all([
    'AGENTS.md', '.claude/skills/change-delivery/SKILL.md', '.claude/CLAUDE.md',
  ].map(read));
  assert.ok(agents.includes(shared));
  for (const text of [agents, delivery, instructions]) {
    assert.doesNotMatch(text, /a1 session (?:link-worktree|worktrees)|require.*inventory.*current|Re-link and confirm/);
    assert.doesNotMatch(text, /detach` when handing off or finishing/);
  }
  assert.match(delivery, /shared Worktrees guidance in `AGENTS.md`/);
  assert.match(delivery, /Dependency setup is separate from attachment/);
  assert.match(delivery, /Private workspaces|private clones/i);
  assert.match(delivery, /\.xrbuild\/.*\.artifacts\/KEEP/s);
  assert.match(delivery, /Never merge, arm auto-merge or push to `main`/);
  assert.match(delivery, /`a1 worktree complete` instead and never cleans its own\s+attached checkout/);
  assert.match(delivery, /declared in the committed `\.a1\/worktree\.json`/);
  assert.doesNotMatch(delivery, /git config --local a1\.worktreeCleanup/);
  assert.deepEqual(JSON.parse(await read('.a1/worktree.json')), { cleanup: ['node', 'tools/worktree/worktree.mjs', 'sweep', '--apply'] });
  assert.match(agents, /Never clean up a worktree containing private workspace data/);
});

const progress = 'Plan `tasks.md` as one task group per PR `## Implementation` outcome, in the same order. Then work one outcome at a time: write its code and tests, tick its `tasks.md` tasks, commit and push, and tick that outcome in the PR body (`[ ]` to `[x]`, nothing else) before starting the next one. A tick means the code and tests are written: CI, broad test runs, and manual validation never delay it, and a later defect is fixed in a new commit. Never save ticks for handoff.';

test('every agent runtime reads one shared rule for ticking outcomes while implementing', async () => {
  const read = async file => (await fs.readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n');
  const [agents, instructions] = await Promise.all(['AGENTS.md', '.claude/CLAUDE.md'].map(read));
  assert.ok(agents.includes(`## Implementation progress\n\n${progress}\n`));
  assert.match(instructions, /^@\.\.\/AGENTS\.md$/m);
  assert.ok(!instructions.includes(progress));
  assert.match(instructions, /`Implementation progress` paragraph of `AGENTS\.md`/);
});

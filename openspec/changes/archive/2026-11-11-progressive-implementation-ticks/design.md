## Cause

Ticks arrive together because the work does. A task is ticked "only when its verify clause holds", outcomes wait
for their related tasks, and the agent runs the focused checks once, after writing everything. Task groups cut
across PR outcomes, so no point marks "this outcome is done", and plans end with a task to complete PR outcomes.

## Rule

One paragraph owned by `AGENTS.md`:

- Plan: `tasks.md` has one task group per `## Implementation` outcome, in the same order.
- Implement: one outcome at a time: write its code and tests, tick its tasks, commit and push, then tick that
  outcome in the PR body before starting the next.
- Meaning: a tick means written code and tests. CI, broad test runs and manual validation never delay it; a later
  defect is fixed in a new commit.

Verify clauses stay. The focused checks an agent already runs before a push now run per outcome, so a clause holds
when that outcome is pushed. What only CI, a device or the maintainer can observe is reported as a gap and does not
hold a tick. Plans no longer contain a task for ticking PR outcomes or handing off.

## One owner

`.claude/CLAUDE.md` imports `../AGENTS.md`, which the agent runtime already loads directly. The Git bullet, the
skill's implementation and readiness sections and the PR template refer to the paragraph instead of restating it.
Promotion rules, minimum outcome count, Acceptance and finalization are unchanged.

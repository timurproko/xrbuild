# Design

## Native binding workflow

Keep repository worktree creation separate from session ownership. From the primary checkout, the agent first runs the sweep and uses `pnpm worktree enter <type>/<short-desc>` to create or cleanly re-enter the registered task checkout. The helper's final absolute path is then passed unchanged to `a1 session link-worktree <absolute-path>`. `a1 session worktrees` is the confirmation checkpoint: the intended canonical path and branch must be the single entry shown as `current` before any planning or implementation edit.

On resume, a task switch or a session whose displayed context is uncertain, explicitly link the intended registered worktree again and repeat the inventory check. A native link failure is a blocker. The agent must not fall back to editing the primary checkout, infer ownership from the tool process cwd alone or claim that an unconfirmed path is active. File and Git operations continue to use the task worktree's absolute path so repository safety does not depend on whether a particular tool immediately follows the session presentation context.

## Remove duplicate project session machinery

Delete `.pi/extensions/task-worktree.ts`. Its custom tool, command, persisted `xrb-task-worktree` entry, PR lookup, status renderer and cooperative tool-call path checks duplicate responsibilities now owned by A1 and require trusted project extension loading before they can protect anything. Delete `tools/worktree/session-context.mjs` and its tests with that extension.

Delete `tools/worktree/agent-task.mjs` and its launcher test as well. It starts a plain Pi process in a worktree but does not establish A1's live runtime identity or native claim, so retaining it as a fallback would document a second, weaker association path. The generic `worktree enter` command remains the repository-owned creation/re-entry boundary, and the Claude Code create hook remains available for that runtime.

## Native ownership and visibility

A1's native command accepts an absolute Git worktree root, verifies that it belongs to the session's repository, records the exact worktree identity and branch, and refuses a worktree actively claimed by another session. XR Build relies on that host behavior rather than persisting parallel identity in its session transcript. The repository confirmation is the native worktree inventory (`current`, path and branch), not a project-specific status line.

The native inventory does not discover or display the task's pull request. PR identity remains established by the pushed branch, draft PR and handoff record. Removing the old “refresh to show PR number” instruction avoids requiring repository code merely for presentation.

## Failure and compatibility

If `a1` is unavailable, the command is not running inside an active A1 shell-tool session, the path is not an exact worktree root, the worktree belongs to another repository or another live session owns it, delivery edits stop. Existing worktrees are not removed or adopted. Sweep and explicit maintainer-authorized cleanup remain the only lifecycle paths.

The change removes only repository-owned A1/Pi integration. Worktree creation, dependency linking, branch validation, dirty-check behavior, sweep classification, handoff records and PR automation remain unchanged. Archived OpenSpec history is retained as the record of the superseded project-extension design.

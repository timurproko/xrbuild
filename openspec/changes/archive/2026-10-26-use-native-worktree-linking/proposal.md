# Proposal

## Why

XR Build currently carries a trusted Pi extension and repository-specific session metadata to associate an agent with a task worktree. A1 now provides this behavior natively, including exact Git worktree validation, persistent session context and cooperative ownership, so keeping a second project implementation adds reload requirements, duplicate state and runtime-specific guards that can disagree with the session host.

## What Changes

- Make task setup two explicit steps: create or re-enter the registered checkout with the existing worktree helper, then bind its absolute root with `a1 session link-worktree <absolute-path>`. Before planning or implementation edits, confirm `a1 session worktrees` displays that same path and branch as `current`.
- Use the native link again when resuming or switching tasks. If A1 cannot establish or display the exact association, stop without editing the primary checkout or another task worktree.
- Remove the project `.pi` worktree extension and its duplicate session-link state, PR-status lookup, tool-call guards, launcher and focused tests. Keep the generic worktree create/enter, sweep, handoff and Claude Code hook behavior.
- Update the delivery instructions and canonical change-delivery requirement around the native command. A draft PR number remains GitHub and handoff metadata; the repository no longer maintains a custom session status solely to display it.

## Capabilities

### Modified Capabilities
- `change-delivery`: A1 task sessions use the host's native worktree association and ownership instead of a repository extension.

## Impact

Agent guidance (`AGENTS.md` and the change-delivery skill), the project `.pi` extension, worktree session helpers and tests, and the `change-delivery` specification. No change to application runtime, worktree lifecycle, PR finalization, merge authority or the WebXR task worktree.

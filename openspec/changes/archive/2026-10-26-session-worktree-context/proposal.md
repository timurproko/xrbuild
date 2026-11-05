# Proposal

## Why

The worktree command currently creates a correct checkout, but an already-running agent session still presents the primary checkout and has no durable association with the task. An agent can use absolute paths yet the maintainer cannot see which branch and draft PR that session owns. The session launcher starts a different session rather than connecting the current one.

## What Changes

- Add an agent-session worktree binding: starting or resuming a delivery creates or re-enters its exact task worktree, verifies branch and repository identity, and links that path to the active session before planning or implementation edits. Fail closed on a missing, unrelated or contested worktree instead of silently editing `main`.
- Expose the bound branch and, once it exists, the draft PR number in the interactive session's visible status. Restore and revalidate the association on session resume; switching tasks must explicitly link the new worktree. The binding is session metadata, not a Git branch switch, cleanup claim or merge authority.
- Wire the project agent integration and delivery instructions so worktree entry plus binding is the normal first action when asked to do a task, not an optional launcher command. Keep the existing one-draft-PR and trusted task-completion workflow; agents still use worktree-scoped paths because a live agent's tool cwd cannot be changed safely by a status link.
- Add tests for create-and-link, re-entry, stale/foreign worktrees, resume, task switching and visible status before and after draft PR creation.

## Capabilities

### Modified Capabilities
- `change-delivery`: session-to-worktree binding as an explicit pre-edit checkpoint, visible branch/PR context and safe resume.

## Impact

Project agent integration (`.pi/`), worktree/session helper and tests, `AGENTS.md`, delivery skill and worktree documentation. No changes to panel runtime, private workspace, Pages publishing or merge authority.

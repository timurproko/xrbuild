# Design

## Bound session context

An agent-session integration loaded from the trusted project's `.pi/extensions/` exposes a create-or-link tool and an explicit re-link command. The operation uses the existing worktree helper to create a task branch from fresh `origin/main` or re-enter only the requested registered checkout. Before publishing a link, canonicalize and compare the Git common directory, worktree Git directory, branch and absolute path; reject a collision, foreign repository, detached checkout or unexpectedly dirty unrelated task. A failed link retains the previous valid context and returns a blocker, never a misleading success.

Store the canonical worktree identity and branch in a versioned session entry (not the tracked repo, scratch worktree or global machine state). On session start or resume, read only the active session branch's latest binding, verify it still points to the same registered worktree, and restore it when valid; otherwise display an unbound warning and require a new link. Task switching is an explicit atomic replacement. On a clean first task there may be no PR; once the draft exists, an idempotent re-link or status refresh looks up the exact branch's open same-repository PR and displays its number. No PR is invented on a lookup failure.

Use the agent runtime's status API to show `branch · PR #number` when interactive, and include the same absolute path and branch in the tool result for non-interactive callers. The displayed association does not mutate process cwd, tool cwd, session storage location, Git branches, worktree cleanup rights or merge permissions. Commands and file tools continue to address the bound absolute path explicitly. Before delivery edits, the agent must receive a successful exact-path link; a missing extension or link failure is reported instead of silently continuing from the primary checkout.

## Agent entry points

A repository context file and delivery skill instruct the agent to create and bind a task worktree before writing even planning artifacts, and to re-link the same worktree on implementation or after resuming. The project extension must be available from the primary checkout at session startup (project trust required); the existing launcher may still start a distinct session already rooted in a worktree. Runtime lifecycle tests cover project loading, link and status refresh in both interactive and non-interactive modes. Changes to the native worktree-create hook retain its automatic session entry; no second worktree is created when resuming the exact branch.

## Scope and safety

A visible link is cooperative session context, not an exclusive lock against external editors. Refuse known conflicting or dirty unrelated worktrees rather than taking them over. Keep existing `sweep` and handoff provenance as the only deletion path. Avoid parsing natural-language task names as Git paths: the agent chooses a validated `<type>/<short-desc>` identifier and the tool validates it. Do not execute code from a PR, change GitHub readiness/finalization, or claim the current session's cwd changed.

## Rollout

First land the integration and instructions through one draft planning and implementation PR. Verify the exact loaded extension and visible bound branch from a primary-checkout agent session, then create the draft PR and verify its number appears; confirm a second session cannot silently take over unrelated work. Existing sessions without the newly loaded integration continue with explicit absolute paths until restarted or reloaded, and must not be described as already linked.

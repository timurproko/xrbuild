# Verification

The root Worktrees block keeps the task attached after implementation completion and review handoff. It permits explicit detach for a request or task switch and retains automatic runtime shutdown claim release. The block matches the corrected shared guidance; no runtime implementation changes are needed.

Local checks passed:

- Focused instruction regression test: one test passed, including absence of the old detach-on-finish instruction and existing setup, private/KEEP preservation, and merge-authority assertions.
- Name guard: no banned names (27 hashes).
- Strict `preserve-task-worktree` validation: passed.
- `git diff --check`: passed.

No product, private workspace, cleanup implementation, runtime installation, or canonical specifications changed. No remaining implementation gaps. Existing sessions must load or be given the corrected guidance. The maintainer authorized committing and publishing this patch. Remote CI and maintainer integration are not claimed by these local checks; trusted automation owns readiness and finalization, and only the maintainer chooses integration.

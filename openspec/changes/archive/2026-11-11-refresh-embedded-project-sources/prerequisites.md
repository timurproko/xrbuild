# Prerequisites and owner routing

This is core-only control-panel work against the accepted public embedded-project workflow. No private clone, source export, native setup, runtime service activation or historical migration completion is required or authorized.

The relevant historical contract order remains `user-workspace-public-core` -> `split-private-workspace` -> `bundled-extensions`. Their unrelated unfinished tasks are unchanged. The approved public-baseline checkpoint is bot-finalized in `openspec/changes/archive/2026-11-10-reconcile-public-spec-baseline/` and maintainer-merged via PR #5 at `8027ebd01444f5bb366cff055c0857ddf9ec8725`. The workflow successor is bot-finalized in `openspec/changes/archive/2026-11-10-restore-embedded-project-workflows/` and maintainer-merged via PR #4 at `b8bb0d079b110a5128e7b15a009bc073d97696b7`. Both are ancestors of the task's starting commit `a34bb5f`.

The canonical `bundled-extensions` requirement currently requires explicit reconciliation after incompatible installed source updates. This change deliberately revises that normal update flow while preserving its no-data-loss, containment, identity and active-consumer guarantees. It does not rewrite predecessor deltas/tasks or claim their historical work complete.

Plan review remains required before implementation. Normal repository automation owns spec synchronization/archive and exact-snapshot promotion; the maintainer owns implementation-PR merge. Attachment grants no cleanup authority, and this task does not touch any other worktree or the primary workspace.

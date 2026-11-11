# Shared worktree usage guidance

The approved migration uses the same short root instruction block as the runtime repository. Successful entry/attachment is the confirmation; informational inventory is not a second approval gate. The runtime owns canonical identity, editing claims, retries, and ordinary recovery.

Before integration, install a runtime release whose help exposes `worktree enter`, `attach`, `detach`, and `list`. Old runtime versions may silently ignore unknown command namespaces. This documentation PR does not install or publish that capability. It is prepared separately and must not integrate before its runtime prerequisite is satisfied.

Use ordinary Git for external agents and for this explicitly approved cross-repository instruction migration, whose owning session stays attached to the runtime repository. The new documentation worktree was freshly created for this migration; the primary checkout and existing task worktrees are preserved. Do not fabricate a second runtime identity to bypass same-repository attachment.

The repository helper remains available for dependency preparation and existing cleanup/handoff tooling. After runtime entry, its existing enter operation can prepare shared public dependencies and install the task's packages; this is setup, not attachment authority. Private clones remain independent and opt-in. Detach deletes nothing; private workspace and KEEP preservation, task ownership, PR delivery, and maintainer-only merge authority are unchanged.

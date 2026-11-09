# Spec prerequisite and owner-routing ledger

## Synchronization order

`user-workspace-public-core` → `split-private-workspace` → `bundled-extensions`.

The independent workspace baseline is accepted in implementation, but its predecessor deltas/canonical synchronization
are still active. This change builds on that baseline; it does not resurrect tracked private workspace contents.
Never overwrite a predecessor delta to make this change look finalized. Normal repository bot finalization must archive
and synchronize accepted changes in dependency order; agents do not manually archive, synthesize finalization commits
or change predecessor task completion. Strict validation of all active/canonical documents remains a local gate, not
proof that predecessor bot finalization or a maintainer merge has occurred.

## Compatible candidate contract

- Generic engine: core `native/`, `packages/`, `tools/`, templates and abstract integration contracts.
- Reviewed product modules: core-tracked `embedded/`, with an independent pnpm workspace/lockfile but no nested Git.
- User workspace: `XRB_HOME`, otherwise `~/.xrbuild`; ordinary users need no private repository or Git.
- Authorized repository development: ignored independent `.xrbuild/` clone inside the linked task worktree, with its own
  Git/object/LFS storage and instructions. Never a junction, submodule, shared object store or public export directory.
- Core package globs/CI never enroll private packages. Writable setup/build/config/cache state never rewrites installed
  embedded defaults. Lowercase `projects/unsorted/` is the current path; no migration compatibility logic is introduced.
- Public promotion is a separately approved audited snapshot, never private ancestry or blanket clone copying.

These contracts refine ownership without reversing predecessor separation. The pending product-module delta supersedes
the old blanket prohibition on concrete core integrations only for reviewed `embedded/` modules; neutral engine
boundaries and naming/confidentiality rules remain mandatory. A final canonical candidate must satisfy these same
boundaries after the bot applies predecessor deltas. The bot/maintainer delivery prerequisite remains explicit and open
until its real acceptance evidence exists.

## Instruction fixture matrix

| Task | Implementation owner | Private clone needed | Delivery |
| --- | --- | --- | --- |
| Core-only | linked core task worktree | No | core PR |
| Embedded-only | linked core task worktree | No | core PR; export review if promoting private material |
| Private-only | independently provisioned task clone | Yes | private PR only, no empty public PR |
| Paired | both owners, never shared staging | Yes | separate PRs and local/private tested-revision handoff |

`tools/worktree/repository-task.test.mjs` checks owner routing and isolated repository fixtures, including primary-root,
missing-access, mismatched-remote, existing/dirty-destination, shared-storage and stale-tested-state refusal. The CLI uses
ignored local records for private paths/remotes/revisions; its public summary exposes only roles/state. It creates no PR,
never pushes a ref, never merges and never bypasses worktree private/KEEP cleanup protection.

Private root/plugin instructions must be read after explicit provisioning and before private edits. Provisioning does not
approve exports, LFS downloads, hosting changes, bot permissions, cleanup or merges. Local tested records are explicit
attestations, not signed CI evidence; a private delivery dependency must be verified in observed `origin/main`, and the
maintainer still verifies remote acceptance before delivery.

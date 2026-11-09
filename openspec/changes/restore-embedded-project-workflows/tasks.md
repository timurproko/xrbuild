## 1. Plan approval

- [ ] 1.1 Review and approve the successor contract and draft PR before implementation; verify maintainer approval is recorded and predecessor bot synchronization is explicitly tracked.

## 2. Effective embedded project state

- [ ] 2.1 Separate origin/source immutability from normal project capabilities and deletion permission; verify direct-method and HTTP tests reject embedded deletion but allow ordinary same-name deletion without product writes.
- [ ] 2.2 Implement durable contained effective manifests and working sources with stable scoped identity, revision checks and locked atomic updates; verify restart, concurrent save, read-only installation, alias/link, malformed-state and separate-project-repository fixtures.
- [ ] 2.3 Preserve existing personal settings and define update/conflict handling for installed source and local edits; verify deterministic override precedence, no lost edits/identity, failed initialization recovery and cleanup exclusion without deleting prior state.

## 3. Normal action pipelines

- [ ] 3.1 Resolve dev/native/browser runs, web builds and icon actions through effective projects without a required independent copy; verify public dependency-graph preparation, user-owned writes, explicit action-only installation, dev behavior and matching finalized icons/output.
- [ ] 3.2 Enable packaging, package setup, publishing and release actions through the existing neutral adapters and normal settings UI; verify fixture packagers/publishers consume checked output and scoped identity, including required-configuration failures without embedded-origin bans.
- [ ] 3.3 Retain checked generation receipts, active-use exclusions and non-destructive failure behavior across the new pipelines; verify stale/failed builds never auto-fallback, overlapping processes cannot overwrite state, and existing consumers keep their reserved output.

## 4. Organization and user interface

- [ ] 4.1 Add durable logical embedded section/order/archive state and coherent mixed-origin layout handling; verify move, reorder, rename/delete section, default archive, archive/unarchive, counts, last-item section pruning, restart and same-name origin isolation without embedded folder moves.
- [ ] 4.2 Restore one compact normal project view, tabs, settings, menus and drag/drop for both origins, suppressing only embedded Delete; verify browser interaction tests exercise Develop / Publish / Build where supported, action jobs, mixed sections and archive, and measure layout against ordinary-project geometry.

## 5. Acceptance and handoff

- [ ] 5.1 Update current docs/instructions for normal embedded workflows and user-state ownership without rewriting predecessors; verify documentation no longer requires Copy to workspace for normal actions and the ordered prerequisite ledger remains accurate.
- [ ] 5.2 Run focused changed-code/API/browser tests, type checking, name guard and strict OpenSpec validation; verify recorded results are truthful, product fixtures remain unchanged, and any manual native/device/signing gaps have an explicit follow-up owner rather than a passing claim.
- [ ] 5.3 Record implementation outcomes and exact tested revision in the authorized PR/worktree handoff; verify no private content is included, no unfinished outcome is checked and bot finalization/CI/maintainer merge remain pending until actually observed.

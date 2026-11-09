## 1. Plan approval

- [x] 1.1 Review and approve the successor contract and draft PR before implementation; verify maintainer approval is recorded and predecessor bot synchronization is explicitly tracked. Maintainer approved implementation after draft PR #4; ordered bot synchronization remains tracked in prerequisites.md.

## 2. Effective embedded project state

- [x] 2.1 Separate origin/source immutability from normal project capabilities and deletion permission; verify direct-method and HTTP tests reject embedded deletion but allow ordinary same-name deletion without product writes.
- [x] 2.2 Implement durable contained effective manifests and working sources with stable scoped identity, revision checks and locked atomic updates; verify restart, concurrent save, read-only installation, alias/link, malformed-state and separate-project-repository fixtures.
- [x] 2.3 Preserve existing personal settings and define update/conflict handling for installed source and local edits; verify deterministic override precedence, no lost edits/identity, failed initialization recovery and cleanup exclusion without deleting prior state.

## 3. Normal action pipelines

- [x] 3.1 Resolve dev/native/browser runs, web builds and icon actions through effective projects without a required independent copy; verify public dependency-graph preparation, user-owned writes, explicit action-only installation, dev behavior and matching finalized icons/output.
- [x] 3.2 Enable packaging, package setup, publishing and release actions through the existing neutral adapters and normal settings UI; verify fixture packagers/publishers consume checked output and scoped identity, including required-configuration failures without embedded-origin bans.
- [x] 3.3 Retain checked generation receipts, active-use exclusions and non-destructive failure behavior across the new pipelines; verify stale/failed builds never auto-fallback, overlapping processes cannot overwrite state, and existing consumers keep their reserved output.

## 4. Organization and user interface

- [x] 4.1 Add durable logical embedded section/order/archive state and coherent mixed-origin layout handling; verify move, reorder, rename/delete section, default archive, archive/unarchive, counts, last-item section pruning, restart and same-name origin isolation without embedded folder moves.
- [x] 4.2 Restore one compact normal project view, tabs, settings, menus and drag/drop for both origins, suppressing only embedded Delete; verify browser interaction tests exercise Develop / Publish / Build where supported, action jobs, mixed sections and archive, and measure layout against ordinary-project geometry.

- [x] 4.3 Derive default publication slugs from the unqualified project folder, not catalog origin/archive prefixes; verify ordinary and qualified live/archive IDs suggest the same slug, normal browser publisher selection saves it, and explicit/deployed slugs remain unchanged. The 21-check browser/publication regression selection passed; the isolated manual instance displayed and saved launcher without field errors, with publication available.

## 5. Acceptance and handoff

- [x] 5.1 Update current docs/instructions for normal embedded workflows and user-state ownership without rewriting predecessors; verify documentation no longer requires Copy to workspace for normal actions and the ordered prerequisite ledger remains accurate.
- [x] 5.2 Run focused changed-code/API/browser tests, type checking, name guard and strict OpenSpec validation; verify recorded results are truthful, product fixtures remain unchanged, and any manual native/device/signing gaps have an explicit follow-up owner rather than a passing claim.
- [x] 5.3 Record implementation outcomes and exact tested revision in the authorized PR/worktree handoff; verify no private content is included, no unfinished outcome is checked and bot finalization/CI/maintainer merge remain pending until actually observed. Implementation commit 95eb3d6 was pushed to PR #4 after the maintainer requested the push; the local handoff preserves targeted test evidence and the tested source-state record. Exact-final-head CI, ordered bot finalization and maintainer merge remain separate pending gates.

## 6. Spec repair

- [x] 6.1 Preserve predecessor scenario identities and their applicable safety/compatibility coverage in the successor's modified requirement blocks; verify strict change validation and a read-only merge preview against the pending embedded contract both pass, without modifying canonical specs or predecessor artifacts. This preview does not clear the missing-canonical-baseline delivery prerequisite.

## Local verification evidence

- New embedded workflow suite: 12 passing checks, including real headless browser platform/publication saves, compact tabs, mixed sections/archive, same-timestamp stale saves, normal same-name deletion on Windows, package setup/publication/packaging fixture adapters, source-update reconciliation, independent-process locks, native-run leases and non-destructive cache handling.
- Focused UI/state/layout/cache regression selection: 75 passed with browser checks enabled; subsequent final state/layout selection: 22 passed. The latest expanded embedded workflow suite passed all 12 checks.
- Normal project/host/publication/package regression selection: 90 passed, one existing file-symlink case skipped because the local symlink privilege is unavailable (directory-junction and hard-link guards ran). Additional UI/publication/server/catalog/CI-policy selection: 78 passed. This is targeted evidence, not a claim that every repository suite was rerun.
- Explicit real public launcher fixture: passed using frozen public dependencies and checked immutable finalized output; installed embedded inventory unchanged. Added to the existing Windows public-boundary lane.
- Explicit synthetic native compiler/provider/browser fixture: passed. No physical integration was activated.
- Strict production type check, browser module syntax check, all 23 strict OpenSpec validations, name guard and whitespace check: passed.

- Spec repair: the trusted pinned spec merger previously rejected the successor for dropping predecessor scenarios, starting with `Customize a bundled project`. The successor now retains all predecessor scenario identities across its three modified requirements, with updated normal-workflow assertions. An ignored fixture-only baseline/merge preview passed; strict change validation, name guard and whitespace checks passed. Canonical specs and predecessor plans/tasks remain unchanged.

## Remaining acceptance and delivery prerequisites

- CI/maintainer owns rerunning the skipped file-symlink negative case in a privileged test environment.
- Maintainer owns physical display/input validation, actual signing/package installation and any live-destination publication acceptance after provisioning those resources. Synthetic adapters/compiler checks do not certify those environments or authorize deployment.
- Trusted automation owns exact-final-head CI and ordered predecessor/successor spec finalization. The active prerequisite chain remains in prerequisites.md; no predecessor artifact or task completion was rewritten.
- Only the maintainer may merge. No worktree/private data cleanup is part of this task.

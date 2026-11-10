# Accepted public specification baseline

## Approval and scope

The maintainer approved draft PR #5's contract-only checkpoint and requested implementation in the task conversation
(`yes implement it`). This approval covers reconciliation of accepted public contracts, not completion of historical
migration, device, export, hosting or companion-delivery tasks. It grants no private-source export or cleanup authority.

The accepted implementation is public commit `d7f9c04493f1731cdfbefc451d33b3900edb7c66`, tree
`8108cee46da3aad675458c59ae315e7f1a8a8bbd`. Runtime and privileged automation code are unchanged by this checkpoint.
The only new process contract is the explicitly approved checkpoint procedure, implemented by these instructions and
their regression checks. Everything else describes the already-accepted public implementation, before PR #4's normal
embedded-project workflow restoration.

## Ordered contract reconciliation

Review the relevant contracts in this order:

1. `user-workspace-public-core`: retain user/core separation, source-based SDK supply and neutral naming. Current
   canonical ordinary resolution (`XRB_HOME`, otherwise `~/.xrbuild`) and independently selected project roots remain
   authoritative. Do not revive the historical default spelling or the blanket exclusion of reviewed embedded modules.
   Its missing unrelated SDK/name-guard/user-workspace capabilities are not silently finalized by this checkpoint.
2. `split-private-workspace`: reconcile independent ignored private workspaces, isolated task clones, public-only CI,
   read-only export auditing and removal of the obsolete workspace direct-main exception.
3. `bundled-extensions`: establish the accepted embedded discovery, state, build and promotion contract and its
   neutral-core plugin boundary. The unfinished external-companion automation capability is outside this checkpoint.
4. `restore-embedded-project-workflows` (PR #4): this remains a successor, not part of the accepted implementation.
   Preview its actual modified requirements against the candidate baseline without importing its runtime code here.

Do not edit or archive historical plans, change their task completion, or apply their old deltas blindly to a newer
canonical baseline. Preserve all unrelated canonical requirements and applicable scenario identities. A contradictory
or unverified requirement blocks the checkpoint; a successful syntax check alone is not contract acceptance.

## Evidence by requirement

Paths below are public core paths. For panel rows, `src/` and `test/` are relative to `packages/control-panel/`.
The corresponding tests exercise disposable public/synthetic fixtures; they do not certify real devices, hosting,
private integrations, redistribution rights or actual historical migration. Process-only contracts are identified as
such rather than claiming that an operational action was performed.

| Capability | Requirement | Accepted public implementation or process | Focused evidence |
| --- | --- | --- | --- |
| workspace-location | Workspace roots | `src/env.ts`, `src/extension-catalog.ts`, `docs/workspace-split.md` | `test/env.test.ts`, `test/extension-catalog.test.ts`; ordinary and explicit roots, public-only discovery |
| workspace-location | Embedded workspace versioning | `.gitignore`, `pnpm-workspace.yaml`, `docs/workspace-split.md` | `tools/public-history/boundary.test.mjs`, `tools/worktree/worktree.test.mjs`; no core-tracked private workspace or linked private store |
| workspace-location | Independent task workspace ownership | `tools/worktree/worktree.mjs`, `tools/worktree/repository-task.mjs` | Their test files; independent fixture clones, wrong/shared roots, protected cleanup |
| change-delivery | Embedded workspace in task worktrees | `tools/worktree/worktree.mjs`, `.claude/skills/change-delivery/SKILL.md` | `tools/worktree/worktree.test.mjs`, `tools/worktree/repository-task.test.mjs`; core-only sharing and private/KEEP protection |
| change-delivery | Accepted public contract checkpoint | This approved procedure, `.claude/CLAUDE.md`, delivery skill, `openspec/config.yaml` | New instruction regressions in `tools/worktree/repository-task.test.mjs`; normal finalizer tests remain unchanged |
| ci-validation | Jobs by changed paths | `.github/workflows/ci.yml`, `tools/pr-automation/required.mjs` | `tools/pr-automation/ci-policy.test.mjs`; public embedded lane selection, no private graph, fail-closed selected gates |
| repository-governance | Workspace direct push | REMOVED obsolete contract; no workspace-push command/workflow, ordinary core PR protection | `tools/public-history/boundary.test.mjs`, `tools/pr-automation/ci-policy.test.mjs`; no agent main-push exception is introduced |
| repository-governance | Governance target identity | `tools/repo-governance/governance.mjs` | `tools/repo-governance/governance.test.mjs`; correct target, wrong repository and explicit apply confirmation |
| public-history-export | Isolated public history export | Process-only contract: `docs/workspace-split.md`; read-only `tools/public-history/audit.mjs` | `tools/public-history/audit.test.mjs`; clean/deleted/merge-only/ref/LFS fixture histories. No real export is performed |
| public-history-export | Complete reachable-history verification | `tools/public-history/audit.mjs` | Its tests; commits/trees/blobs/tags, missing objects and bounded/incomplete histories fail closed |
| public-history-export | Staged owner-controlled migration | Process-only contract: `docs/workspace-split.md`, delivery instructions | Audit tests verify non-mutation and disposable rehearsal; worktree tests verify preservation. Remote migration/visibility remains owner acceptance |
| plugin-host | Core runs without plugins | `native/host/`, `native/plugin-sdk/`, `src/host-build.ts` | `test/native-origins.test.ts`; core-only selection skips optional/private plugins; no generic engine implementation change |
| plugin-host | Managed tool navigation recovery | `src/managed-tools.ts`, panel/server recovery routes and managed-tool recovery UI | `test/tool-recovery.test.ts`; identity-bound, idle-only bounded recovery, unchanged tools and shutdown draining |
| bundled-extensions | Equivalent embedded and user workspace structure | `src/extension-catalog.ts`, embedded manifests, `src/env.ts` | `test/extension-catalog.test.ts`, `test/env.test.ts`; equivalent schemas and separate public/user/project ownership |
| bundled-extensions | Unified origin-aware discovery | `src/extension-catalog.ts`, `src/service-artifacts.ts`, panel discovery | `test/extension-catalog.test.ts`, `test/plugin-sources.test.ts`, `test/service-artifacts.test.ts`; containment, declared components and coherent refresh |
| bundled-extensions | Explicit conflict resolution | Catalog and locked preferences/source selection in panel/plugin preference modules | `test/extension-catalog.test.ts`, `test/plugin-sources.test.ts`, `test/native-origins.test.ts`; conflicts never combine sources |
| bundled-extensions | Embedded projects and writable user projects | `src/embedded-projects.ts`, `src/project-access.ts`, project/layout routes | `test/embedded-projects.test.ts`; qualified IDs, copy sanitization, read-only preview/run, alias/mutation guards and separate project repository |
| bundled-extensions | Personal bundled run settings | `src/project-run-settings.ts`, `src/project-provider-settings.ts` | `test/embedded-projects.test.ts`, `test/project-provider-settings.test.ts`; explicit Save/Restore, revisions, races, ownership/schema, invalid state and active-use refusal |
| bundled-extensions | Explicit cached bundled project rebuilds | `src/project-build.ts`, `src/embedded-workspace.ts`, build/receipt helpers | `test/embedded-projects.test.ts`, `test/embedded-workspace.test.ts`; real frozen public install, prerequisite order, receipts, immutable consumers and independent locks |
| bundled-extensions | Explicit installed public service activation | `src/service-artifacts.ts` and explicit embedded setup | `test/service-artifacts.test.ts`; no discovery installs/product writes, failed-source fallback refusal and declared component containment |
| bundled-extensions | Explicit reviewed working-cache cleanup | `src/cache-maintenance.ts` | `test/cache-maintenance.test.ts`; current/unknown/reserved/published/Git/private/KEEP/config preservation, stale review and locks |
| bundled-extensions | Isolated dependency and build ownership | `src/embedded-workspace.ts`, `src/host-build.ts`, host/plugin artifacts, package staging and desktop package inventory | `test/embedded-workspace.test.ts`, `test/native-origins.test.ts`, `test/package-staging.test.ts`, `test/packages.test.ts`; frozen graph, isolated outputs and selected portable contents |
| bundled-extensions | User-owned plugin configuration defaults | `src/plugin-config.ts`, catalog validation | `test/extension-catalog.test.ts`; independent-process first-run races, invalid/linked config and preservation of unknown/user fields |
| bundled-extensions | One publisher plugin with multiple destinations | Public publisher manifest, selected catalog/service factories and configuration | `test/extension-catalog.test.ts`, `test/plugin-sources.test.ts`; stable service selection, source conflicts and preserved user preferences; no live publication acceptance |
| bundled-extensions | Lowercase default project section | `src/workspace.ts`, `src/projects.ts`, templates | `test/projects.test.ts`, `test/layout.test.ts`; lowercase `projects/unsorted/`, no new migration or legacy-capitalization logic |
| bundled-extensions | Audited source promotion | Process-only contract: `docs/embedded-extensions.md`, naming/ownership instructions | `tools/public-history/boundary.test.mjs`, naming check and portable-copy/package tests; no private source is inspected/promoted and no rights audit is newly certified |

The fixture-only merge check applies all seven checkpoint deltas and then the two actual successor deltas from public
commit `370afa02da7b1cc65049a4955b880749cb079ced`. It preserves the predecessor scenario identities that the pinned
merger requires. The successor retains MODIFIED embedded requirements; it is not converted to ADDED to avoid a
missing target. All preview files stay in ignored task-local `.artifacts/`, never tracked `openspec/specs/`.

## Verification boundaries

Detailed local results travel with this checkpoint's `verification.md` in its normal bot archive. One Windows
preference-writer fixture failed with `EPERM` on rename and passed on an isolated repeat; this checkpoint neither
hides that initial failure nor claims a runtime fix. Public core maintainers own follow-up if it recurs. The existing
real-package test lacked a completed package, and two optional embedded native checks lacked prepared binaries;
these skips are not passes. Public graph tests, real browser checks and a synthetic native compiler fixture ran.
Normal final exact-head CI and any actual device/signing/hosting acceptance remain separate requirements.

## Historical acceptance ledger

These entries remain unchanged and open; even a locally verifiable sub-step is not marked complete on behalf of its
historical owner. The identifiers document scope, not certification of work in another repository.

| Historical plan | Unchanged open task IDs | Disposition |
| --- | --- | --- |
| user-workspace-public-core | 6.4, 7.1, 7.6, 8.1, 8.2, 8.3 | Original migration, full snapshot/hosting/archive acceptance and associated verification remain with the maintainer in separately reviewed historical-plan reconciliation. Current code/name checks do not retroactively complete these tasks |
| split-private-workspace | 5.1, 5.2 | Fresh-bootstrap preparation/audit and original preservation/automation conditions remain historical owner acceptance, not completion claims of this checkpoint |
| bundled-extensions | 1.1, 5.3, 6.3 | This checkpoint resolves only the specified canonical-contract gap after actual delivery; it does not check off historical synchronization, external-companion policy or complete original multi-owner delivery |

Existing historical deltas may no longer apply directly once canonical specs advance. Their eventual full-plan
retirement requires a separately reviewed reconciliation, not silent reapplication over newer behavior. The normal
merger's duplicate, missing-target and missing-scenario errors remain hard failures.

## Normal delivery and successor handoff

1. Complete this checkpoint's own evidence/documentation tasks and truthful PR outcomes. Do not manually edit
   canonical specs, synthesize a finalization commit, mark the draft ready or change labels to bypass finalization.
2. Only the normal trusted repository bot synchronizes and archives the completed checkpoint on its PR branch.
   Trusted-base execution, read-only candidate inspection, exact-head checks and all ordinary required gates remain.
3. Only the maintainer chooses whether/when to merge the finalized, verified checkpoint. A preview, checked task list
   or proposed baseline commit is not a merged canonical prerequisite.
4. After that actual merge, incorporate main into PR #4 and update only the successor's own prerequisite ledger with
   the observed canonical baseline commit and this approved disposition. Preserve any bot commits and retain its
   normal modified-requirement finalization and exact-head CI. Do not claim the historical plans were archived.

Until steps 2 and 3 are observed, PR #4 remains blocked. No private workflow activation, hardware operation, signing,
live publication, public-source export, worktree cleanup, direct main push or merge is part of this reconciliation.

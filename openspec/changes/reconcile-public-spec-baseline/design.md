## Context

The implementation predecessor order is `user-workspace-public-core` -> `split-private-workspace` -> `bundled-extensions` -> `restore-embedded-project-workflows`. Earlier implementation reached the accepted public tree, but its plans retain genuinely unfinished migration/operational tasks. The earliest plan includes owner/device/export acceptance; the split plan includes bootstrap audits; the embedded plan includes separate companion-policy acceptance. Their completion must not be fabricated.

The current finalizer correctly rejects PR #4's MODIFIED embedded requirements because their canonical target does not exist. A fixture-only merge preview also found that the successor omitted predecessor scenario identities. PR #4 repair commit `370afa0` preserves these identities and the applicable safety/compatibility assertions; its embedded merge preview now passes against the pending baseline. This does not create canonical specs or clear the baseline gate.

## Decision requiring plan approval

Use an explicitly reviewed **accepted-contract checkpoint**, not a claim that the historical plans are fully delivered. This is a proposed disposition of the stale canonical baseline and must be approved before implementation. Approval must explicitly distinguish contract synchronization from unfinished historical acceptance. Until that decision and normal delivery occur, the original predecessor gate remains unresolved.

The checkpoint is an ordinary linked OpenSpec change with its own truthful implementation tasks. The existing trusted bot archives only this fully completed change and produces canonical files. No new finalizer mode, open-task bypass, manual archive, main push, ready mutation or automatic merge is needed.

## Scope and provenance

Use the existing accepted public main tree at `d7f9c04493f1731cdfbefc451d33b3900edb7c66` as implementation evidence, not an unmerged private or unrelated task checkout. Review the relevant predecessor contracts in their recorded order:

1. Preserve the accepted user/core separation, current canonical home resolution, explicit workspace selection and SDK/name boundaries. Do not blindly revive the earliest plan's obsolete default directory or blanket prohibition on reviewed public modules. Unneeded missing historical capabilities remain outside this bounded checkpoint.
2. Reconcile independent workspace versioning, task isolation, public-only CI, read-only history audit and removal of workspace direct-push policy from the accepted split implementation.
3. Reconcile neutral core/embedded ownership and the existing pre-workflow-restoration embedded contract. Do not promote the separate unfinished companion-automation capability or represent private acceptance as passed.
4. Preview the actual PR #4 delta on the composed candidate, including preservation of all predecessor scenarios. The baseline must not prematurely include PR #4's unmerged mutable-project behavior.

Draft deltas are proposal artifacts, not proof of implementation acceptance. After approval, bind each requirement to current public source/tests; correct any draft that would regress an already-accepted public contract. Preserve unrelated canonical requirements/scenarios.

## Historical plan preservation

Do not edit, check off, archive, rename or delete the historical plans. Record which accepted contracts are checkpointed and which operational/companion/device/export tasks remain outside scope. Full retirement of each historical plan requires its own reviewed future reconciliation; do not run its old delta blindly over evolved canonical specs. The ordinary merger must remain fail-closed on duplicate/stale operations.

After this checkpoint is bot-finalized and maintainer-merged, update only PR #4's own prerequisite ledger to cite the actual baseline commit and the explicitly approved contract-checkpoint disposition. Do not claim the historical changes were archived. Incorporate actual main history into PR #4, preserve bot commits, and let its normal finalizer and exact-head CI run.

## Validation

Run the pinned merger against disposable copies of canonical files inside ignored `.artifacts/`, applying this checkpoint and then the actual successor. No preview writes tracked canonical files. Strictly validate all changed deltas and the composed candidate; check neutral names and whitespace. Verify evidence using focused existing public tests, not private checkout contents. Verify historical plan bytes are unchanged. CI/finalization and merge acceptance remain separate observed outcomes, not checked promises.

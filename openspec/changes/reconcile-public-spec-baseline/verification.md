# Public contract verification

## Identity and approval

The maintainer approved draft PR #5's contract-only checkpoint and requested implementation (`yes implement it`).
Accepted public runtime source: `d7f9c04493f1731cdfbefc451d33b3900edb7c66`, tree
`8108cee46da3aad675458c59ae315e7f1a8a8bbd`. This checkpoint changes instructions, evidence, tests and its own change
artifacts, not runtime code, workflows or privileged finalization policy. The new documented checkpoint procedure is
explicitly approved; it is not misrepresented as an existing behavior of the older runtime tree.

The 26-requirement evidence map and historical acceptance ledger are in `docs/spec-baseline-reconciliation.md`.
All three historical change folders and tracked canonical specs match the accepted public source. The fixture check
also compared the working bytes of all 24 historical files before and after preview; none changed. Ordinary user
resolution and unrelated canonical requirements/scenarios remain intact.

## Checks run

- Instruction/evidence regressions (`node --test tools/worktree/repository-task.test.mjs`): 10 passed, 0 skipped.
  New checks cover explicit approval, historical preservation, normal bot/merge gates, all 26 requirement evidence
  rows and panel source/test path existence. Evidence lookup supports normal bot archival of this checkpoint.
- Focused worktree, read-only history audit/boundary, governance target, CI-selection and finalization/snapshot
  suites: 45 passed, 0 skipped. No hosting mutation or real migration was performed.
- Focused panel public-contract selection with real browser checks enabled: 135 tests, 133 passed, 1 failed,
  1 skipped. The failure was Windows `EPERM` replacing plugin preferences in the independent-writer fixture;
  an isolated repeat of that exact test passed (1 passed, 0 skipped). Do not describe the original run as green.
- Public frozen embedded graph (`pnpm test:embedded --workspace=.artifacts/public-contract-validation`):
  7 packages, 5 builds, 5 test scripts; 343 tests, 341 passed, 2 skipped. No private clone, device, real destination,
  signing state or optional native payload was required. Compilation emitted an existing mixed static/dynamic
  import warning; the build completed successfully.
- Actual synthetic native compiler fixture (`node --test packages/control-panel/test/native-build.fixture.ts`):
  1 passed, 0 skipped; cached synthetic host and both plugin origins compiled against selected public headers and
  dependencies without product writes. This is not full CEF host/device acceptance.
- Production strict no-emit types (`pnpm check:types`): passed.
- Pinned spec merger (`@fission-ai/openspec@1.11.0`): all 7 checkpoint deltas and both actual successor deltas from
  public commit `370afa02da7b1cc65049a4955b880749cb079ced` applied with no warnings in ignored fixtures. The successor
  remains MODIFIED against a real candidate target. Separate negative fixtures confirmed missing canonical targets
  and dropped predecessor scenarios still fail; neither guard was weakened.
- Strict canonical validation: 18 baseline specs passed; 18 baseline-plus-successor specs passed.
- Post-sync validation including all unchanged active plans and a disposable archive-layout fixture: 24 items passed
  for the baseline, and 24 items passed for baseline-plus-successor. The source historical files remained unchanged.
- Strict repository validation (`validate --all --strict --no-interactive`): 23 items passed.
- Neutral-name check (`pnpm check:names`) and whitespace checks: passed.

The preview starts from the immutable public base's canonical files and extracts only the named public successor
spec deltas into task-local ignored fixtures. It does not read another task's working files or run an archive against
tracked files. It generates separate baseline/successor candidates and records candidate content hashes locally.

## Finalization compatibility repair

The bot promoted the completed draft normally. Its first finalization attempt on `f6464eb` then rejected the
unchanged `split-private-workspace` delta: the checkpoint's new `Public embedded contract change` scenario made
that older MODIFIED block omit a now-current scenario. Canonical-only validation had not exercised this interaction.

The repair removes only that new scenario heading from this checkpoint and retains its public-boundary selection
and fail-closed aggregate rules in the existing requirement and scenario set. No historical delta/task is edited.
The evidence regression now checks scenario compatibility with the unchanged predecessor while asserting those
public-boundary rules remain present. Both the 24-item post-sync baseline and successor fixtures pass strict
validation of all active plans and canonical specs. Only ignored copies simulate archival; the real archive and
canonical synchronization remain the bot's job. The two instruction/evidence regressions passed after the repair.

## Limitations and owners

- Public core maintainers own separate investigation of the observed Windows preference-rename failure if it recurs.
  This checkpoint changes no runtime behavior, adds no retries/skips to hide the failure and claims no runtime fix.
  Isolated success does not prove the failure cannot recur. Final exact-head CI remains required independently.
- The existing real-package ZIP test was skipped because the fixture machine has no completed package under
  `builds/`. Portable package-staging tests ran; actual package installation/signing remains maintainer acceptance.
- Two optional embedded native checks were skipped: native SDK camera-vector comparison and built-provider binary
  discovery. Their native/device provisioning and physical acceptance remain separate maintainer follow-up, not
  passing results. The synthetic native compiler fixture ran separately.
- Historical migration, export/hosting/archive acceptance, hardware and external-companion delivery stay with the
  original owners and their separately reviewed reconciliation. Their task checkboxes remain unchanged.
- At implementation handoff, bot finalization, final-head integration checks and maintainer merge are subsequent
  observed gates. PR #4 stays blocked until the canonical checkpoint is actually bot-finalized and maintainer-merged;
  only then may its own ledger cite the observed baseline. No ready mutation, direct main push, merge or cleanup is
  performed by this checkpoint implementation.

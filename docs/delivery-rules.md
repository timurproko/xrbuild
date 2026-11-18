# Shared delivery rules

Contract: `portable-delivery-v1`. This file is identical in both repositories. MUST and MUST NOT are requirements; MAY identifies the only optional behavior described here. Repository-specific values come only from the matching entry in `delivery-adapters.json`. Different code and test runners are allowed; different policy is not.

## R01 - Scope and unchanged OpenSpec

Simplify repository-owned delivery tooling and guidance only. MUST NOT edit, regenerate, replace, shadow or override OpenSpec skills (including `openspec-*`), generated OpenSpec/`opsx` commands, framework implementation, schemas, templates or lifecycle semantics. Project-specific proposals, designs, tasks and specification deltas remain editable. Use supported integration points. If an outcome requires a framework change, stop that outcome, preserve work and report a separately scoped blocker; do not implement an exception here.

## R02 - Authority

A planning-only request permits planning, not implementation. An edit-only request permits local edits, not publication. An explicit request to deliver approved work through a PR permits scoped commits, pushes and routine PR metadata updates, not merge, remote abandonment, private export, hosting changes or unrelated deletion. One clear instruction may approve an already presented scope and request implementation; do not demand another approval phrase. An unresolved material decision MUST be clarified before affected implementation. A new feature or changed behavior requires approval and coherent planning updates; wording-only clarification does not. Nothing here bypasses unchanged OpenSpec requirements.

## R03 - Portable planning

Analysis, remote administration and planning-only publication MUST work with explicit repository, base and head identities without a checkout, runtime attachment, dependency installation or cleanup sweep. Publish real planning artifacts only under the selected change folder; do not fabricate a code diff. Start one draft PR with unchecked implementation outcomes and preserve that branch, history, change identity and PR for implementation. Planning does not require a separate merge. Ordinary GitHub CLI/API operations remain supported; a helper is optional. New refs are create-only. Existing-branch publication MUST use expected-head concurrency protection, detect duplicate requests and report partial success without force updates or automatic remote deletion.

## R04 - Isolated implementation and resume

Before implementation edits, acquire an owned isolated checkout of the selected task while primary stays on the adapter's base branch. Verify repository, branch and observed head; fetch before adopting a remote proposal or unoccupied local branch. Preserve its ancestry, local commits and owned dirty edits. Divergence, path collisions, foreign repositories, locks and live or unverifiable ownership MUST block unsafe adoption without reset, takeover, deletion or primary-checkout fallback. Dependency setup is separate and runs only when needed or requested. External agents use ordinary Git and need no A1 installation. In A1, successful enter/attach is the attachment confirmation; do not demand a second inventory ritual or pretend a failed attachment succeeded.

## R05 - Progress and publication

Use one or more meaningful implementation outcomes with no arbitrary maximum. Detailed tasks map to outcomes without mandatory one-to-one grouping. Record local completion promptly. Publish coherent checkpoints that may contain several outcomes; synchronize PR checkboxes only to published completed work, and before handoff. Do not require a commit/push between every outcome. Unfinished work stays unchecked. Distinguish code/tests written, checks actually observed, required CI pending and optional human/device observation. CI completion alone is not implementation progress. Small or test-only changes do not need invented outcomes or spec deltas when contracts are unchanged; preserve supported no-spec metadata.

## R06 - Validation and readiness structure

Choose focused checks proportional to changed behavior. Broader local checks MAY be run for impact, diagnosis or an explicit request, but are not repeated mandatory pre-push rituals. A known failing targeted check MUST be repaired and rerun before publishing the affected implementation; do not conceal failures or weaken assertions, coverage, timeouts or required gates. PR validation MUST require unambiguous Proposal/Implementation/Acceptance/Automation structure, valid machine linkage, required completion and exact applicable acceptance binding. Sentence, byte or item counts and ordinary testing, coverage, link or notation vocabulary alone MUST NOT reject meaningful prose. Local inspection and trusted promotion use the same repository body validator. This relaxes repository checks only, not OpenSpec validation.

## R07 - Trusted finalization

Agents MUST NOT mark an implementation PR ready. Trusted repository automation may promote only an exact complete unheld snapshot with checked outcomes, completed required tasks, plain implementation-specific acceptance scenarios and all existing pre-finalization inputs satisfied. Immediately before mutation, re-read and match repository/PR identity, base, head, body, open/draft state and hold. Incomplete drafts remain draft; completed but invalid candidates report the actual blocker. Trusted finalization owns spec synchronization/archive through the unchanged framework. Resume a finalized draft from its archive/history without manually recreating active artifacts or claiming acceptance. New finalized heads require their own applicable CI. Preserve historical metadata/readers; never manufacture historical completion.

## R08 - Hold and opt-out

The `delivery-hold` label pauses trusted promotion, finalization, automatic branch refresh and automation-owned integration/auto-merge. Re-read it immediately before each mutation. Releasing it triggers fresh bounded evaluation of current state, not reuse of an old authorization. `no-auto-merge` prevents automation-owned documentation integration. Neither label grants merge or deletion authority. Do not treat an ordinary completed draft toggle as a persistent pause. Do not blindly cancel a human-owned auto-merge arm; follow verified ownership and the exact-candidate safeguards in R10, and report an unresolved human arm rather than promise it is paused.

## R09 - One-shot protected integration

Implementation approval, green CI and an earlier or standing preference MUST NOT authorize merge. Only a fresh explicit maintainer request identifying one exact repository/PR/head/base candidate permits an agent's one-shot protected squash merge. Re-read identity, body/acceptance binding, hold, finalization, required exact-head checks, adapter base-currency policy, positive mergeability and authorized human credential immediately before merging; enforce expected head. Draft, stale, pending, failed, conflicted, ambiguous, held or unverifiable state blocks that attempt. Do not wait, retry later, arm auto-merge, use a merge queue or bot/workflow identity, bypass protection or push primary. A changed head, base snapshot or acceptance list requires a fresh decision. Optional manual testing is not a merge prerequisite. Existing deployed policy remains authoritative until this change is integrated.

## R10 - Maintainer-owned auto-merge

Agents and repository controllers MUST NOT arm implementation auto-merge. A maintainer's personal arm may be recognized only with verified authorized ownership and evidence binding it to the exact finalized candidate and acceptance list. The native toggle alone is not acceptance evidence. A relevant head/base/body/acceptance change invalidates that authority; do not carry it forward merely because new checks pass. Do not advertise unattended continuation without enforcing that binding. Never cancel an unrelated human arm. If exact binding or ownership cannot be established, report the blocker; do not infer permission or fall back to bot integration.

## R11 - Documentation integration and activation

Within the ordinary documentation auto-merge controller, only an independently eligible routine documentation PR may use automation-owned integration, and only when the adapter says that controller is enabled and live state confirms it. Inspect the complete diff, including rename sources and destinations. Active/linked implementation plans, agent instructions/skills, governance, cleanup authority and privileged-policy documentation are ineligible even under Markdown/docs paths. Hold and opt-out block integration. Withdraw automation-owned arms when eligibility disappears; preserve unrelated human ownership. Source presence or repository allow-auto-merge does not prove activation. Do not enable dormant workflows, alter required checks, change protection strictness or apply hosting settings as part of this delivery. Declare needed labels through reviewed repository configuration; live apply needs separate permission.

Existing release-specific automation, including release-reopening PRs, remains unchanged and governed by its existing eligibility and authorization rules. This clarification grants no new automation authority and does not expand release eligibility, authorize implementation-PR auto-merge or permit enabling dormant workflows. Do not disable that existing release-specific route or convert it to manual integration as part of this change.

## R12 - Portable handoff

Report repository, branch, change/PR, observed local and remote heads, verified publication status, unfinished work, observed checks and optional local path. A clean status, detach, release or disappeared process does not prove push. Remote-only planning needs no local registration. An ordinary review handoff may retain task attachment; explicit task switch or cross-machine transfer may detach while preserving files. Editing attachment, cleanup ownership, publication and integration remain independent. Automatic cleanup enrollment is separately explicit; existing handoff commands describe their actual local effect and do not imply remote availability or acceptance.

## R13 - Explicit published local removal

A request to remove local work authorizes only the named owned non-primary checkout. Require fresh read-only remote evidence that its local HEAD equals or is an ancestor of the named live remote branch. A safe remote descendant is sufficient; clean but unpublished/divergent work or unavailable remote evidence blocks removal. An open/draft PR, pending CI, unfinished implementation or absent acceptance/archive does not block this local-only route. Preserve remote branch/PR and local branch refs by default. Do not interpret local removal as acceptance, remote abandonment or permission to delete refs/private data. Automatic sweeps gain no open-PR removal authority.

## R14 - Preservation and deletion mechanics

Dirty staged/unstaged/untracked files, unknown ignored content, private data, KEEP markers, actual nested repositories/gitlinks/submodules, unsafe links, locks and live/unverifiable owners MUST block removal. A tracked regular `.gitmodules` file alone is not proof of a nested repository. Only explicitly enumerated repository-generated disposables may be removed after their path/type/link boundaries pass; ignore rules alone never grant disposal authority. Use bounded inspection, scoped locks, fresh identity/content/claim rechecks and journaled non-force Git removal. Never use force/recursive fallback, follow links outside the admitted boundary, terminate processes, automatically export private data or delete primary/current working directories. Preserve recoverable partial state; retries must not remove recreated resources or unrelated worktrees.

## R15 - Runtime and cleanup boundaries

Runtime completion and local-removal adapters target exactly one checkout, never a bulk sweep. Perform ownership and preservation preflight before detaching; exit its shell/cwd before trusted repository cleanup runs and rechecks publication/content/claims. Runtime code itself does not delete files or remote refs. If another owner or new content appears, retain the checkout and keep the session usable outside it. Missing trusted adapter/runtime support is an explicit blocker, not permission to use complete/discard/sweep as a substitute. Release compatible A1 support before downstream adoption; safe standalone repository operations remain available. Merged completion, published local removal and confirmed unmerged discard are distinct operations with separate authority. Sweep/queue execution remains explicitly scoped and is never a planning or session-start prerequisite.

## R16 - Scratch and private boundaries

Agent-selected implementation scratch stays ignored, secret-free and non-authoritative under the owning checkout's `.artifacts/`. No-checkout planning/administration may use stdin, memory or isolated secret-free session scratch. Required source/evidence is never scratch-only. Internal tool temporary storage remains tool-owned. Do not persist credentials, publish private names/source/history or share private dependencies/output across task checkouts. Private workspaces remain independent; private export and device validation retain separate authority. Do not claim unobserved checks, live activation or device acceptance.

## R17 - Exact guidance installation

During implementation, copy this file byte-for-byte to `docs/delivery-rules.md`, `delivery-adapters.json` to `docs/delivery-adapters.json`, `delivery-cases.json` to `docs/delivery-cases.json`, and `delivery-contract.json` to `docs/delivery-contract.json`. Use UTF-8 without BOM, LF and one final newline; do not substitute repository names into shared bytes. The four deployed files must match the approved planning snapshots and each other across repositories. `AGENTS.md` MUST contain exactly this routing paragraph once:

Read and follow [Shared delivery rules](docs/delivery-rules.md). Use only this repository's entry in [Delivery adapters](docs/delivery-adapters.json). Do not paraphrase these rules, invent exceptions, or modify OpenSpec skills/framework; report conflicts before proceeding.

Replace duplicated workflow/progress policy in repository-owned entry points with that route or a relative link to it. Keep unrelated product, privacy and security instructions. Repository-owned delivery skills and runbooks may retain command syntax and operational detail consistent with the contract, but MUST NOT create alternative authority, progress, readiness or deletion rules. OpenSpec-generated instructions remain untouched. Do not install these planned rules into live guidance as part of a planning-only request.

## R18 - Frozen contract and ambiguity

`delivery-contract.json` records SHA-256 hashes of the other three files. Both planning copies and deployed copies MUST match that same version and hashes; self-updating a digest is not approval. Implementers MUST NOT reword the rules, relax expected cases, add policy exceptions or modify adapter policy values on their own. Only a separately explicit maintainer-approved contract refinement may update both plans together. An unknown adapter value, contradictory requirement or unspecified authority blocks the affected action pending clarification; it never authorizes guessing. Other planning prose supplies technical detail, not permission to contradict this contract. This contract does not override current deployed safeguards or OpenSpec.

## R19 - Common verification

Both implementations MUST consume every case in the identical `delivery-cases.json`; do not rewrite expected results in local tests. Bind symbolic inputs to local implementations and normalize observations to the specified assertions. Every assertion must inspect actual behavior or mutation attempts, not merely return the fixture's expected value. Use isolated Git fixtures and mocked remote operations; never destructive tests on user worktrees. Report case IDs and failures. Tests MUST reject modified contract bytes, dropped cases, adapter drift and attempted OpenSpec changes/indirect overrides. Unsupported functionality remains an explicit incomplete outcome, not a skipped passing case. Live CI, human acceptance and device validation remain separate evidence.

## R20 - Reconcile work already started

Before further affected implementation, fetch this plan and stop at a safe checkpoint to compare already-written code and guidance with R01-R19 and the shared cases. Preserve all existing work; do not reset or discard another agent's changes. Record the inspected head, rule/case IDs, compliant behavior, corrections and blockers in `contract-reconciliation.md` inside this change. Reopen only tasks whose expanded requirements are not yet satisfied; prior unrelated completed tasks remain truthful. Then continue within existing implementation authorization, or seek missing authorization. Do not silently grandfather an earlier interpretation. Publishing this planning refinement is not authorization to merge, delete, activate workflows or expand implementation scope.

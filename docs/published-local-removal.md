# Published local removal implementation

Policy: [Shared delivery rules](delivery-rules.md), especially R12-R16, using only the `xrbuild` entry in
[Delivery adapters](delivery-adapters.json). This page supplies repository command/API and compatibility details.

## Entry points and release prerequisite

`pnpm worktree remove <name> [--expected-head <sha>]` uses `tools/worktree/published-removal.mjs`; branch refs and
remote resources are retained. PR readiness, CI and acceptance are not local-only eligibility gates. The standalone
programmatic `removePublishedCheckout` API retains its trusted `readClaims(context)` observation strategy. Its fixture
registry is not a deployed runtime provider; the default standalone CLI still fails closed without such a provider.
There is no caller `--owned`, force, recursive fallback or remote-abandonment flag. Legacy `--discard` remains blocked.

After verifying a task PR merged, an attached A1 agent uses **`a1 worktree complete`**. The committed
`.a1/worktree.json` now declares paired `cleanupPreflight` / `cleanup` commands targeting only `{worktree}` and
carrying the original `{snapshot}`. It no longer declares sweep. A1 runs XR preservation/merged-evidence preflight
while still attached, returns the session to its startup checkout (normally primary), then settles cleanup from the
selected repository's verified primary **after the issuing tool batch/shell exits**. A blocked preflight retains the
attachment; a post-detach blocker retains the checkout and leaves the session usable outside it. A1 itself deletes no
checkout data. A remote merge event alone never starts filesystem cleanup.

`pnpm worktree complete` only queues that same A1 command and reports requested, not settled; yield the batch and
await the runtime's final transition/cleanup report. **`a1 worktree remove-local`** (or `pnpm worktree runtime-remove`)
is the distinct explicit published-local operation, using `localRemoval.preflight` / `localRemoval.execute`. It needs
live source-branch containment, not a merge, acceptance or finished CI. It cannot substitute for merged completion.
Neither operation deletes local/remote refs, commits, PRs or unrelated checkouts.

The repository bridge resolves only an explicitly provisioned `@timurproko/a1` dependency from the primary checkout,
using its supported public snapshot/execution modules. It does not import daily/global runtime internals, discover a
test cache, install packages or implement parallel ownership coordination. With a compatible paired runtime, missing
package/APIs, legacy snapshot expansion or an unsupported declaration refuse before detach/destruction, without
complete/discard/sweep fallback. The repository helper checks public package availability before queuing A1 as well.
The published legacy host does not support this ordering; it must not be used, as the compatibility record explains.
Use the **same verified compatible released package and claim namespace** for participating attachment and cleanup
writers; separately stop incompatible writers before rollout. This task performs no live installation or cleanup.

No compatible published package has yet been verified. See [runtime compatibility](worktree-runtime-compatibility.md)
for exact registry artifacts inspected, candidate tested, required capabilities and the genuine external prerequisite.
[Issue #20](https://github.com/timurproko/xrbuild/issues/20) records released-package verification/participating-writer
rollout, **not deferred repository wiring**. Do not infer a minimum release from `0.2.7-dev` or install the candidate
into a daily runtime.

## Preservation and journals

Inspection uses plain canonical paths, registered linked-worktree identities, index/HEAD agreement and bounded source
reads. Cached attributes supply text normalization; binary/unpublished bytes are not hidden by stat caches or
`assume-unchanged`. Source files/directories are accounted for without following links. Physical IDs use BigInt-derived
strings and nanosecond birth times so Windows 64-bit inode values are not rounded through Number.

No ignored/cache payload is admitted: `node_modules/`, public dependency junctions, build output, handoff records and
scratch remain blockers even if generated. Private workspaces and KEEP markers block before contents are inspected.
Nested repositories/gitlinks/configured submodules, links/hardlinks, locks and unfinished/unknown Git state remain
protected. A tracked regular `.gitmodules` alone is not treated as an actual nested repository.

The linked `.git` pointer and these Git-generated administrative paths are admitted: `HEAD`, `index`, `commondir`,
`gitdir`, `logs/HEAD`, `ORIG_HEAD`, `FETCH_HEAD`, plus empty `refs/`. Recovery refs/reflogs must be ancestors of current
HEAD. `COMMIT_EDITMSG` must exactly match its commit message. Personal config, drafts, rebase state, nested storage and
unknown metadata block. Entry/depth/byte/file/history limits fail closed; callers may tighten, not increase them.

Tool-owned `.git/xrb-removal/` records scoped locks and create-only journals, not acceptance or automatic enrollment.
Preflight binds original checkout/admin identity, branch/HEAD, content fingerprint and operation/selectors before
runtime detach. Execution repeats repository/publication/content/ownership checks and uses one non-force Git removal.
There is no process search/termination, private export or branch deletion. Prepared journals can be reevaluated only
against the same resource. Uncertain `removing`/`partial` state requires explicit recovery; completed/replayed requests
never delete recreated paths. Linked/unknown/incomplete journals or locks are retained, not cleared to make retries pass.

Explicit `sweep --apply` retains merged-only selection and rechecks eligibility through the same standalone engine.
It gains no runtime/open-PR authority and cannot bypass an unavailable trusted ownership provider.

## Interruption and retry/refusal

The adapter reports the failed stage/public code, preserved resources, and whether only a fresh evaluation or no retry
is supported. A failed destructive command leaves a `partial` journal with bounded `failure.stage`/`failure.code`
diagnostics. No raw child output, delegated authority, environment or credentials are persisted. Older journals without
failure metadata remain readable. An unknown public error code is reported as unclassified, not an invented exit status.

- **Prepared, no destructive attempt:** after resolving an ordinary publication/content/live-owner blocker, a fresh
  explicit evaluation may use only the same original approval and prepared journal. Both local and merged routes
  recheck live applicable publication, all bounded preservation checks and actual ownership. A prepared journal is
  not cached eligibility. Runtime settlement is single-use; replay is not a request queue or retry authorization.
- **Interrupted/uncertain result:** `removing`, `partial`, changed locks/journals, missing resources or lost responses
  do not authorize another destructive command. Preserve the journal and remaining checkout data. Even if Git actually
  finished before its response was lost, do not infer completion or recapture approval for a replacement checkout.
  Refinalized HEADs and physical replacements require distinct review, never reuse of the original journal/approval.
- **Surviving child/unverifiable ownership:** the actual packaged boundary refuses acquisition/retry and retains
  exclusion across holder death or suspension. Waiting, observing a dead parent or seeing a child finish is not a
  supported orphan-recovery mechanism. XR never opens or changes runtime gate files, deletes locks, changes namespaces,
  evicts gates or falls back to sweep/discard/force.

There is **no automatic uncertain-journal retry** and no XR recovery CLI. The current candidate A1 documents a
supported generation-bound inspection/recovery operation for newly witnessed Windows x64/local NTFS v2 gates;
other platforms and historical unwitnessed gates retain conservative refusal. Use only a compatible runtime's
documented platform-specific recovery contract after positive lifetime proof, never a private-file recipe. Recovering
an A1 gate does not clear XR journals, approve deletion or reapprove changed HEADs/recreated checkouts. Preserve the
recorded operation and original approval for separately reviewed recovery; do not perform production recovery based
on these tests. Released-artifact/rollout verification remains in issue #20. No result authorizes ref deletion or
unrelated cleanup.

## Exact runtime adapter

Only these packaged external modules are used by the XR bridge:

- `@timurproko/a1/dist/foundation/lifecycle/worktree-cleanup-snapshot.mjs`: capture/assert the original opaque snapshot.
- `@timurproko/a1/dist/foundation/lifecycle/worktree-claim-boundary.mjs`: `withUnclaimedWorktree`,
  `executeUnclaimedWorktreeCleanup` and `executeCleanupCommand`.

Committed `localRemoval.preflight/execute` and `cleanupPreflight/cleanup` arrays target one `{worktree}` and carry the
runtime's `{snapshot}`. XR validates that original approval; it never captures a new approval to replace a changed
published HEAD or recreated checkout. Local completion still needs live remote containment. Merged completion checks
exact PR/change/head plus the squash merge commit contained in freshly observed main, including a deleted source branch.
Bare completion discovers exactly one PR associated with the approved HEAD/branch and same repository/base via
read-only GitHub transport; absent, ambiguous or truncated discovery blocks. Its PR/change selectors are bound in
XR's pre-detach journal and must match execution discovery. Fresh merged-PR/live-main evidence is checked again;
local-only publication cannot stand in for it. The declaration deliberately needs no optional runtime selectors;
XR derives them from that exact HEAD, not handoff scratch or a replacement checkout.
Neither route deletes/recreates refs or unrelated worktrees.

The full repository controller remains inside A1's non-expiring unclaimed-target boundary. Every destructive Git child
is launched and awaited through `executeCleanupCommand(..., { protectTarget: true })`; hooks, fsmonitor, auto-GC and
maintenance are disabled in the argument vector. No untracked destructive `execFile` fallback exists. A local stack
handle only prevents expired/misbound XR callbacks; it supplies no independent ownership or generation authority.
Actual editing claims, sealed namespace/delegation and descendant intent belong to the supported A1 package.

XR does not inspect private coordination filenames, infer ownership from lease age/PID/inventory, serialize a claim
nonce, manufacture a generation, poll for exclusion or extend a lease. Do not print or persist A1's private delegated
reservation as evidence. A dead/suspended parent is not permission to evict its gate: surviving or uncertain tracked
children keep attachment blocked until separately verified recovery. Runtime code delegates repository work rather
than deleting checkout data itself.

## Reproducible candidate package (offline, not adoption)

`tools/worktree/proposed-a1-interface.json` pins:

- Source revision `691b381c29fe5c5d558491ff519b300bf426a730`, Git tree `2c1518b90e86a85d5702ef48f258df62f5038585`.
- Candidate `@timurproko/a1@0.2.7-dev`; this is not a verified released version.
- Archive SHA-256 `bb76eb2ae0d152acacd5def472398da7115b5411043968b80c3cf6a65a7b80d0` and SHA-512 integrity.
- Frozen dependency-lock identity, source blob/digests and the actual built nineteen-file import/declaration/license closure.

`pnpm prepare:delivery-runtime` explicitly verifies the public source, creates or checks an isolated dependency clone
under this checkout's ignored `.artifacts/a1-candidate/<revision>/`, installs frozen dependencies with lifecycle scripts
disabled, runs the unchanged official build, and packs with npm 11.13.0 and pack scripts disabled. Two rebuilds/packs
must match the pinned artifact; Node v24.21.0 produced the recorded identity. No global/daily installation or publication
occurs. Existing changed source/cache is rejected, not reset or silently replaced. Required preparation code and identity
are versioned; dependency caches/receipts are ignored, reconstructible and non-authoritative.

`pnpm test:delivery-runtime` imports the actual unpacked package and checks the complete integration matrix.
`pnpm verify:delivery` evaluates all 50 frozen shared cases; ordinary tests never fetch/build implicitly. Missing candidate
means explicit C39 incomplete/nonzero; drift fails. Archive and imported-module bytes are verified before loading. No
TypeScript transpilation shim, fake path module, copied private coordination code or mocked lock dependency remains.
The test host uses packaged session lifecycle code only to create actual isolated registered participants with real PIDs.
Repository transport/GitHub evidence may be mocked; ownership results and destructive runner behavior are not.

## Observed verification and prior 9/10 diagnosis

The obsolete bridge observed a private ten-second lease and used an eight-second freshness guard around synchronous
inspection. It sometimes rejected healthy success paths as `Native coordination exclusion changed, expired or was lost`;
prior logs did not distinguish age/identity/abort, so that narrower cause remains unknown. It was not fixed by increasing
deadlines or retrying until lucky. The compatibility correction removes that entire unsupported observation path and
uses the corrected packaged non-expiring/child-lifetime boundary. All required success assertions remain unchanged.

The existing 16-case runtime suite verifies real command interruption,
lost removal responses/recreated targets, prepared local/merged retries with fresh publication/content/owner blockers,
and XR crash journals during actual holder death. Required existing coverage remains: real exact local/squash-merged removal; retained refs/unrelated checkouts;
preflight while owned, actual detach/issuing-shell close; actual competing SDK acquisition; changed HEAD/content and
recreated identity; missing/legacy declarations; expired/misbound approval; suspension beyond the obsolete lease;
holder death with a living destructive child; and a surviving tracked destructive descendant. The latter probes use
actual packaged runners/processes, mutate a controlled fixture file, and prove another editing claim stays blocked.
Abandoned intent remains blocked even after the child stops, rather than being silently evicted. No user checkout,
runtime or private workspace is detached/removed by these probes.

The additional 15-case CLI orchestration suite uses the committed declaration, actual packaged A1 completion
request/settlement APIs and real XR CLI children (only external GitHub transport is replaced). It proves successful
merged and distinct published-local removal, pre-detach private/dirty/unpublished/unmerged/ambiguous/missing-package/
legacy refusal, and post-detach live-owner/HEAD/recreation/uncertain-journal/declaration/PR-change-association preservation. It
observes a prepared journal with the issuing shell still alive, exits that shell before settlement, checks primary
usability, retained refs/unrelated checkouts and single-use settlement.

All observations are candidate/offline evidence. The declaration/CLI integration is implemented here; released
compatibility, actual rollout, finalization and exact-head required CI, live protection/activation and device/human
acceptance remain separate. Candidate compatibility
does not authorize readiness, merge, package release or migration of incompatible older attachment writers.

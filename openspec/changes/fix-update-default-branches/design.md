# Design

## Context

See proposal.md for motivation. Inspection of the current implementation establishes:

- `runUpdate` in `src/update.ts` only calls `fastForward` for the workspace. `coreUpdateStatus` sets `readOnly: true`; no core fetch occurs. `coreNote` uses cached upstream counts, so a stale origin reference can suppress even the warning. The job runner correctly marks a resolved promise done: the missing core operation, not a swallowed core exception, explains the misleading success.
- Workspace `fastForward` runs unqualified `git fetch`, then reads `@{u}`. This follows Git's configured remote/refspec and upstream, not fresh remote-default discovery. It accepts ahead-only branches as up to date and permits non-conflicting dirty files. Stale deleted upstream refs can survive without pruning; a missing upstream can instead fail preflight before fetching.
- POST Update refuses on workspace availability alone; this would block an otherwise valid core update. The shared dialog's successful titles also refer only to the workspace.
- The existing action downloads workspace LFS objects and invokes `rebuildHost`: CMake config/build of native plugins, plus host only when stale or missing. It does not install public or private JS dependencies and does not restart the panel. Explicit panel Restart already exists separately.
- Existing tests use one bare remote with real Git and stubbed LFS/builds; some deliberately assert that core never moves. Those expectations must change, not merely be supplemented.
- The current spec allows non-conflicting local edits and LFS deletions. The requested all-dirty refusal deliberately supersedes those cases in this change's delta.

## Goals / Non-Goals

**Goals:** independently safe, freshly checked repository updates; deterministic fetched targets; an overall failure that retains both repository outcomes; retryable setup/build; visible activation instructions.

**Non-Goals:** branch migration without consent, reconciling local history, global/native-tool installation, private JS package setup, automatic server restart, or touching real user checkouts during reproduction.

## Decisions

### 1. Discover origin's default; never infer freshness from cached refs

Use explicit `origin` for each independent checkout. Query its advertised HEAD symref and heads, validate a real default branch and fetch that branch explicitly even when the clone has a narrow/stale refspec. Do not trust `origin/HEAD`, `@{u}` or FETCH_HEAD timestamps as fresh evidence. Missing origin, ambiguous/missing remote HEAD, failed discovery or failed fetch produces an actionable failure, never an up-to-date result. Retain credential redaction and non-interactive Git.

Capture the fetched target once and compare HEAD against it using successful Git commands with validated output; do not turn failed revision/count commands into zero counts. Use the exact target for counts, LFS fetch and `merge --ff-only --no-edit`; check HEAD afterwards equals that target. Do not use `pull` (second fetch), forced ref updates, reset or stash. A remote that advances after fetching is handled on the next Update.

Alternative rejected: continue fetching the configured upstream. It cannot establish the required default-branch target and repeats the removed-upstream failure.

### 2. Conservative branch and worktree policy

Require an independent checkout root, attached default branch tracking origin's advertised default, no tracked/staged/untracked changes, and no commits absent from the fetched target. Ignore ignored build files normally. Recheck HEAD/branch/dirty state immediately before checkout to avoid overwriting work changed during the network/LFS steps.

For a deleted upstream, non-default branch, missing tracking configuration, detached HEAD, local-only commits or divergence, leave HEAD, files and branch configuration alone. Give one sentence naming the repository and the recovery action; for old branches name the freshly advertised default branch. Example: "Core tracks a removed branch; preserve any local work, switch to origin's default branch main, then run Update again."

The removed-upstream case intentionally refuses rather than automatically switching. This is allowed by the brief and avoids guessing whether another local branch, worktree lock or unpublished history makes switching safe. No command silently stashes or migrates branches. Remote-tracking metadata may be fetched while local work remains untouched.

### 3. Independent repository outcomes and honest job failure

Refactor `runUpdate` to collect an outcome per canonical repository path: role, path, remote/default branch, before/after commits, fresh-fetch flag, state, step, recovery reason and pending setup/build information. Resolve real paths and case equivalence to deduplicate workspace-equals-core. Process distinct repositories even when an earlier one refuses or fails.

GET status remains read-only, separately timestamps each repository and labels cached information as such. POST starts the guarded job instead of rejecting solely on workspace status; eligibility is evaluated inside the job per repository. Existing host/setup/job exclusion guards remain.

Always print a compact final summary for both roles, then reject with an aggregate error if any repository or post-pull step failed. Preserve structured outcomes through the job error/result boundary so HTTP clients and the dialog cannot turn partial success into all-green completion. CLI exits nonzero for the same aggregate failure. Successful already-up-to-date outcomes require an exact HEAD match after a fresh successful fetch. A refused repository with readable HEAD reports its unchanged before/after commit, not just a generic failure.

### 4. Finish post-pull work without claiming the running process changed

Keep a pending marker per affected repository until required setup/build succeeds, including the original before commit and remaining work. A retry freshly fetches again but completes pending steps even if no commits moved. Do not erase markers on aggregate failure before their own work succeeds.

When changed public core dependency inputs require setup, reuse `tools/panel-bootstrap/runtime.mjs` pinned manager/frozen-lockfile installer: lifecycle hooks and pnpmfile disabled, sanitized environment and existing workspace graph/config safety checks. Stream output and fail honestly on missing manager, network or graph errors. Do not enroll private workspace dependencies or invent a private install contract.

After eligible pulls, rebuild native plugins and the host if missing/outdated, preserving existing tool discovery and owned-output paths. Use a fresh invocation of the existing rebuild entry point where necessary to load the fetched build recipe rather than relying on old server imports. No native prerequisite consent is bypassed. If any repository was refused for local work, avoid building through that unsafe source and report deferred build work while retaining successful repository advancement; safety takes precedence over completing a partial build.

Final output states the exact setup/build steps run, their failures or deferral, and whether restarting is required. Conservatively require an explicit panel Restart after core advances or loaded workspace module sources change, including partial failures. State "Update did not restart the panel". Existing Update has no auto-restart contract, so do not add one. Browser assets may reload separately; that alone does not reload Node modules.

### 5. Reproduce using local bare remotes only

Extend fixtures to two separate bare remotes, publisher clones and a core clone containing an ignored independent `.xrbuild` clone. Capture each checkout's HEAD, branch, index and file content before refused operations. Stubs remain limited to LFS, installer and native rebuild boundaries; actual remote discovery, fetch and fast-forward use Git.

The regression first recreates cached core ref equals HEAD while remote advances, demonstrating the current workspace-only success, then expects both clones to advance with the fix. Add the removed develop upstream/default main case (including stale cached refs), narrow refspec, non-origin upstream, remote default rename, default names other than main, both already current, all dirty forms, ahead-only, divergence, detached HEAD, fetch/discovery failure, partial success in both directions, deduplication, remote advance after fetch, LFS failure/exclusions, post-pull installer/build failure and retry. HTTP/job/dialog/CLI tests assert aggregate failure and final restart/setup messages, not just individual Git outcomes.

## Risks / Trade-offs

- Updating files beneath a live Node process can leave old imports loaded → finish with explicit restart instructions and use fresh build execution; do not advertise activation before restart.
- Core and workspace cannot update atomically → preserve independent results and clearly report partial success, never attempt rollback/reset.
- Another process may edit between checks → recheck before fast-forward and retain Git's own refusal; never force past it.
- Rejecting all dirty paths is stricter than prior behavior → document the change and provide concise recovery messages.
- Repository setup can fail after HEAD moved → retain pending markers and accurately report disk state; retry without discarding work.
- Real native/private integration is unavailable in disposable fixtures → test invocation boundaries and actual Git behavior, and explicitly distinguish that from a real native build.

## Migration Plan

This requires an initial manual update of an older workspace-only panel version; that old code cannot self-update core. Document the bootstrap limitation without executing it against user checkouts. After this fix is installed, Update handles both checkouts under the policy above. Removed upstreams remain an explicit manual branch-switch step. No automatic rollback: a failure retains advanced commits and directs the person to retry setup/build or reconcile their branch safely.

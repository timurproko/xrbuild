## Context

`prepareEmbeddedProject` creates a durable snapshot of the public embedded workspace. `effectiveEmbeddedProject` compares a saved aggregate input fingerprint with the current installation and exposes `sourceUpdate`. The aggregate also covers shared SDK and build inputs, so the warning does not prove the selected app was edited or even changed upstream. `keepEmbeddedWorkingSources` only accepts the new aggregate fingerprint and invalidates output; it does not update working files. Existing records store an initial manifest hash, not a recoverable per-file source baseline.

The desired normal flow is pull/update, launch the shortcut, and Run/Build using current sources with the user's display/input choices intact. Merely hiding the warning or accepting the fingerprint is not a fix.

## Decisions

### 1. Refresh at explicit action boundaries, not discovery

Catalog reads remain read-only. They can identify outdated inputs internally but do not install, copy or rewrite working state. All entry points consuming effective sources must resolve the same refresh path before selecting inputs, including development, builds, native/browser runs, icons, packaging and publication. Valid unmaterialized packaged previews retain their existing read-only path. Source changes invalidate old finalized output rather than silently launching it; rebuild requirements use normal project behavior.

Static entry content is compared separately from the shared package-build digest, which deliberately omits dist/. A current installed static entry can be finalized and receipted without requiring a nonexistent compilation script; edited unbuilt static content retains the existing explicit-build rule. After a build refreshes the working generation, run/preview handlers rediscover the effective project instead of reusing a stale pre-build directory.

Refresh uses the existing project operation lock and respects active leases/jobs. A running development server keeps its selected working generation until stopped. No process is restarted and no foreign lock is removed to update code.

### 2. Baseline-aware generations

New working records capture a bounded content/membership baseline of source inputs and the installed manifest, separately from effective personal configuration. Refresh stages a fresh contained generation with current installed public inputs and validates the same frozen graph, package-manager restrictions and containment rules. Installed added/changed/deleted files become the candidate defaults.

For known baselines, compare installed-old, working-current and installed-new content. Upstream-only changes update; local-only edits survive; identical concurrent changes are accepted. Conflicting edits, removals or incompatible dependency/manifest changes stop the requested action without publishing the candidate. Do not add a general text-conflict-marker merge or silently keep a conflicting old source. Refreshing shared SDK/build inputs must not freeze their previous snapshot just because the app's personal manifest differs.

Static app finalization can stamp managed favicon/card metadata into its entry HTML. Record the exact before/after content hashes of only these managed files, bound to the generation's baseline, so a later refresh does not mistake unchanged panel-generated stamping for a user source edit. Any subsequent external change remains a real edit; do not strip arbitrary HTML or normalize other files.

### 3. Personal state is not old code

Carry supported user-owned settings as an explicit field-wise overlay rather than copying the entire old project manifest over new defaults. Preserve display/input/provider selections, fullscreen/projection/camera intent, user-authored name/icon overrides, publication/deployment/signing identity and recordings in their appropriate owned locations. Compare known installed defaults to distinguish overrides from inherited values. Source/build/dependency declarations are source inputs, not generic personal settings. Validate carried fields against current ownership/schema and report incompatibility instead of inventing new identities or applying invalid provider choices.

Keep stable logical project identity, user section/archive organization and separate project-repository scope, including installed default-section relocations. Root relocation requires an explicit mapping by logical identity, not reuse of a stale relative path.

### 4. Legacy state upgrade without pretending its baseline is known

Version-one records cannot prove which source files the user edited. Preserve the complete old generation and record its recovery location in durable task-local project metadata before switching anything. Build a new generation from current installed sources and carry validated personal state. Preserve unknown source edits in the old generation rather than infer them from current installed files. Do not delete or mutate the old generation, including unknown files, credentials, recordings or local edits. A source/manifest field that cannot be classified safely blocks with a concise action error and a recovery location; it is never silently dropped.

This transition is automatic for ordinary legacy states containing only normal UI settings. Repeat attempts/restarts must be idempotent. Unknown, malformed, linked, foreign or interrupted state remains a refusal, not an invitation to reset it.

### 5. Atomic publication and output binding

Revalidate installed inputs and the working/configuration revision before publishing a staged generation through atomic state replacement. Preserve the previous state and generation on failures or races. Only a successfully validated generation becomes effective. Keep the first effective output-storage key in versioned state across source generations, including upgrade from older state. Generation-pinned immutable receipts remain addressable after a refresh, but only current receipts must match the current source directory. Bind new builds to the new effective input fingerprint and ensure old successful output is not selected as current after refresh. Preserve old output already pinned by a consumer; no generation cleanup is part of this change.

### 6. Remove the misleading normal UI, not safety

Remove the `sourceUpdate` banner and `keep-working-sources` button/handler from the Apps card and retire the old mutation route so an old tab cannot acknowledge a baseline without refreshing files. No substitute routine review modal or long internal path is shown after a normal pull. Use normal job progress for refresh/build work and a short ordinary action error for exceptional conflicts, with recovery details available only when needed.

## Non-goals

- Running on another machine, forwarding devices or changing shortcuts' workspace selection.
- Automatically installing dependencies during browsing or rebuilding native host/plugins.
- Overwriting product sources, discarding source conflicts, deleting preserved generations or changing ordinary user projects.
- Claiming manual shortcut/device acceptance from fixtures, provisioning private workspace data or merging the PR.

## Verification

Use public disposable fixtures to exercise upstream additions/changes/deletions, shared SDK changes, saved settings without source edits, true compatible edits/conflicts, legacy upgrade, section relocation, separate roots, stale revisions, active leases, interrupted publication, unsafe links and repeat restart. Assert actual executed/selected source bytes and output receipts, not only disappearance of a warning. UI coverage must assert absence of the old banner/button and normal Develop/Build controls. Run focused workflow/output/UI suites, strict public type checking, name guard and strict OpenSpec validation. Real shortcut acceptance remains a maintainer check after an approved implementation.

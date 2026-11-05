## Current behavior

- `packages/control-panel/src/panel.ts` already builds current source and calls the selected publisher's `publish` operation for an owned identity; the HTTP endpoint can republish without removing that identity first.
- `publishers.ts` only models validate/status/publish/unpublish. `publication.ts` stores publisher, stable identity, slug and remembered routes, but no release version.
- `publicationFields()` switches a published app to Unpublish. Publication identity is locked while live; jobs and optimistic completion currently distinguish only publish/unpublish.
- The workspace production publisher already serializes route-scoped non-force commits, checks public output and attempts safe restoration after failure. It replaces current output and maintains a single active inventory record, not a selectable release catalog.
- The Launcher consumes the existing version-1 active publication inventory. Release archives must not become extra Launcher apps or break that format.

## Decisions

### 1. Visible workflow

For a release-capable publisher, the primary action is Publish when no route is deployed and Update when one exists; both read Publish to the developer and confirm the new version, destination and what it replaces before building. Unpublish remains an explicit secondary destructive action with the existing confirmation. Update does not run Unpublish or change publisher, slug, canonical URL, package identity or installed-package associations.

Show **Next version** separately from **Live version**, avoiding the impression that editing a draft version changes production. Use stable three-part semantic versions, starting at `0.1.0` when there is no versioned history. Reuse the shared version input/menu behavior for Patch/Minor/Major. Versions are scoped to publication identity plus publisher, independent of package versions. Remember each publisher's draft version in optional publication configuration; old manifests remain valid.

Suggest the next patch after the highest retained semantic version, not merely the live version (which may be rolled back). Bumps change only the draft. After successful publication, suggest the next patch; failed work does not advance it. A new version must exceed the highest retained semantic version. Existing version labels cannot be overwritten with different bytes.

Update is available with a valid next version even if source-change detection is inconclusive: the existing build contract rebuilds current source. This change does not pretend that output timestamps reliably describe all source/SDK changes.

### 2. Release history and activation

The Live version field is the shared dropdown over the selected publisher's retained releases, newest first: version or Legacy label with the creation time as detail text, the verified live release marked and selected, a merely requested one marked amber. Large histories scroll inside the list, but all retained entries remain reachable. Without history the field is a read-only label. Use the shared dropdown, status marks, confirmation dialog, focus and responsive layout rather than product-specific replacements.

Choosing a non-live retained release in Live version inspects it: the action row shows **Preview** (the publisher's public archive URL for that exact output, when provided) and **Activate**, which deploys that retained version. Confirmation identifies the app, destination, current release and requested release. Activation copies/promotes the stored artifact at the same canonical route; it never builds current source, changes the next-version draft or mutates package settings. Choosing the already verified live release is a no-op. Activation is also available after Unpublish to restore a retained release at the currently validated destination.

The slug stays locked while deployed; the publisher remains selectable because every destination keeps its own status, remembered slug, draft version and release history, so a developer can rehearse the whole workflow on a local destination before touching production. During queued/running release work, lock all conflicting actions and version fields while leaving navigation and Activity usable. Keep explicit operation names for publish, update, activation and unpublish, and retain the previous live version until the new one verifies. Extend completion/pinning logic rather than guessing the live version from local intent or a queued response.

### 3. Generic optional publisher capability

Extend the generic publisher contract with an optional complete release capability: read-only catalog/status, version-aware publish through the existing verified-build path, and activation of an owned retained release. Discovery validates the complete capability; legacy publishers retain their current Publish/Unpublish workflow and do not receive versioned requests or a fake history UI.

The catalog identifies immutable releases by publisher-issued release ID and includes semantic version where known, content digest, creation time, a revision/precondition token, and requested versus verified live identity. An opaque release ID is not a filesystem path or a public URL. Core endpoints validate app kind, publisher availability/capability, identity, manifest freshness, stable version syntax, ownership, confirmation and catalog preconditions. Provider validation repeats ownership and artifact integrity checks at execution.

Versioned publish/update carries the requested version and expected catalog/live revision; activation carries the selected release ID, confirmation and expected revision. Capture these with the publication identity before enqueueing, and recheck before mutation. Existing publication serialization remains the execution boundary. A changed decision for this identity yields an actionable conflict rather than an automatic overwrite; unrelated site changes can still use the provider's bounded non-force retry.

Keep local request/job state distinct from remote verification. Refresh history/status after completion, on reload and after reconnect. Late HTTP/SSE responses must not regress a terminal job or switch the selected provider/version. API clients cannot bypass validation by calling an older unversioned operation against an identity whose release catalog already exists.

### 4. Workspace production storage

Implement release support inside the existing workspace publisher, not in a concrete core branch. Retain verified generated output and a versioned catalog in a publisher-owned release namespace within the existing publication output subtree, keyed by publication identity and immutable release ID. The active route remains a materialized copy of one release. Keep the active inventory's version-1 shape compatible with Launcher; release metadata can live in a separate versioned document and optional active-record fields.

Snapshots contain only validated output, hashes and neutral release metadata: no project source, private workspace contents, credentials or signing material. Validate limits, paths, links and digests when creating and activating snapshots. Detect ownership/namespace collisions, including root-publication files; never silently adopt unrelated directories. Same version plus identical content may reuse its snapshot for a safe retry; different content requires a new version.

Release archives are retained in public publication storage and are not confidential. Unpublish removes the canonical live route and active associations according to existing rules, but is not a privacy erasure operation: it retains release history/output for later activation. No automatic pruning or history deletion ships in this change. Storage grows with retained releases; size-limit errors must occur before changing the active deployment.

### 5. Existing deployment migration

Status/history reads do not mutate remote state. Show an existing unversioned live deployment as **Legacy (unversioned)**, never as an invented `0.1.0`. On the first explicitly requested versioned update, validate and snapshot its current owned bytes as a legacy release before replacing the active route. Keep it available for Make live. Preserve identity, route, root-owned file lists and unrelated inventory entries.

Fail closed on corrupt catalogs, unknown schema versions or unverifiable legacy bytes. Do not silently reset history. Route-move compatibility must either preserve the identity's release catalog with all existing confirmation checks or refuse with an actionable explanation; it must never bypass release tracking.

### 6. Deployment and recovery

Do not change the configured hosting mode or its existing deployment adapter. Build/staging failure leaves the current deployment untouched. Publishing and activating use the same complete-site, serialized, non-force deployment/verification discipline. Committing a new desired version is not proof that it is live: compare public identity/version markers and route content against the requested artifact before reporting success.

Failure attempts a safe scoped restoration of the previous complete-site decision and verifies it. If the remote branch advanced, avoid unsafe revert/force-push and report the actual requested/verified/unknown state with recovery guidance. A failed or interrupted candidate can remain retained but must never be labeled Live without verification. Preserve unrelated releases, routes, root files and package associations throughout.

## Verification strategy

- Core contract/manifest/API fixtures: old providers/manifests, invalid and duplicate versions, destination-scoped drafts, ownership/path attacks, stale revisions, immutable queued inputs, confirmed activation, and no activation rebuild.
- Disposable publisher repositories plus simulated origin: initial publish, in-place update, list/restart, rollback to exact old bytes, legacy capture, unpublish/reactivate, root routes, unrelated routes/associations, duplicate-content retries, non-fast-forward races, deployment/verification failure and interrupted recovery.
- Real browser fixtures: Publish/Update/Unpublish, version bumps, history and Live marker, confirmation/cancel, pending/error/reconnect state, narrow/wide layouts, both themes and keyboard access.
- Existing control-panel, publisher and Launcher regression suites, name guard, strict OpenSpec validation and whitespace checks. Development never writes the live publication; a real release promotion is a separately authorized maintainer acceptance step.

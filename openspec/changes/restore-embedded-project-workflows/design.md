## Context

`ui/app.js` returns early for `p.readOnly`, replacing the original workflow with `bundledProjectDetails`. It also excludes these projects from normal sections, drag/drop and context menus. `server.ts`, `panel.ts` and `project-access.ts` independently block mutations, including publication, packaging, manifest changes and archiving. Removing only the browser branch would expose controls that still fail or write to the wrong owner.

Installed embedded source must remain immutable. Normal project operations nevertheless need writable manifests, source for development, generated icons, deployment settings and outputs. Those are user state, not permission to mutate the product installation.

## Decisions

### Separate provenance from operational capabilities

Keep origin-qualified catalog identity and immutable product ownership, but stop treating them as a blanket ban on project operations. Model deletion separately from development/build/publication capabilities. Both HTTP entry points and direct panel methods must resolve the same authorized effective project and enforce the same rules. A valid embedded project is non-deletable whether live or archived, even before user working state exists; deletion of an ordinary same-name project remains possible.

An app may still lack a compatible packager, configured publisher, signing material, native runtime or dev script. Tests of kind `test` retain their normal run-only behavior. These are ordinary capability checks, not additional embedded-origin restrictions.

### Durable effective project state, no required duplicate project

Keep the embedded catalog entry as the user's single project identity. Store mutable manifest/settings, publication identity, generated/custom icons and optional editable working sources outside product sources and outside disposable build caches. Scope state to the canonical core installation, selected user workspace, selected project repository and origin-qualified logical project. Archive location and display-name changes must not create a new deployment or settings identity.

Use a contained persistent working tree for actions needing editable inputs, initialized on explicit user action from validated public inputs and their local dependency graph. Open Folder/JSON must address the effective editable files when requested. Preparation must not create a separately listed project, require a folder-name choice or require Copy to workspace. Discovery must remain read-only and must not install dependencies or initialize working trees.

Preserve the public graph's pinned package-manager/frozen dependency installation and prerequisite ordering for bundled inputs. Do not enroll private packages, inherit ambient package-manager configuration or write installed sources. Customizing a dependency declaration must follow the ordinary explicit dependency-setup contract rather than bypass frozen/contained preparation.

Store a source-baseline receipt separately from editable content. Reuse working state across restarts and builds. On product updates, never refresh over local changes silently: validate the baseline and report conflicts with a non-destructive reconciliation path. Preserve the original working tree and settings while resolving conflicts. Build cleanup must treat durable sources and configuration as user data, not cache generations.

### One effective snapshot for every consumer

Route normal settings saves, preview/dev servers, native runs, web builds, icon jobs, packaging and publication through one effective project resolution boundary. Persist validated complete manifest changes with revision checks, cooperating-writer locks and atomic replacement. Acquire/recheck state around asynchronous preparation; stale edits and conflicting active work must fail without partial saves.

Retain existing generation-pinned immutable built output and checked build receipts. Bind receipts to effective source/settings, not only installed defaults. Failed/stale preparation cannot silently select an old or packaged build for a new action. Existing consumers keep their reserved generation. Packagers and publishers receive the same checked output/icon/identity snapshot as ordinary projects, without concrete plugin branches.

Keep signing material, credentials, deployed identity and publication history user-owned. First publication/configuration follows normal app rules; no embedded defaults supply a live production identity. Explicit independent Copy remains optional and retains its identity-reset behavior.

### Unified logical layout and archive

Read live and archived embedded entries through user organization metadata, falling back to product section/archive defaults only when no override exists. Merge both origins into the same normal section list. Persist explicit unsorted placement, section order, project order, archive state and archive origins under the selected project repository's layout state with checked ownership and serialized writes.

Do not run physical move/recycle code on embedded folders. Ordinary projects retain their physical folder convention; mixed-section operations update embedded metadata and ordinary folders coherently. Validate all planned destinations and identities before changes. Renaming/removing a section, moving its final item and unarchiving must follow the existing empty-section/Unsorted behavior, counting both origins.

Maintain a stable internal qualified logical identity independent of section/archive placement. Resolve existing qualified live/archive route forms compatibly with effective membership; do not let aliases bypass deletion protection, duplicate a catalog entry or redirect an unqualified ordinary-project request to a bundled project.

### Restore the original UI rather than a second embedded screen

Use the normal compact project hero, workflow tabs, platform/provider controls, run actions, release UI, icon menu, jobs and activity. Remove the embedded-only early-return screen and separate embedded sections. Keep only a small provenance indicator where useful. Present embedded deletion as unavailable with a clear reason; all other menu/drag/drop actions follow normal capabilities and busy-state rules.

Use shared design-system controls and geometry. Browser coverage must check actual tab visibility, compact card layout, mixed-origin organization and action results, not only HTML/source patterns.

### Preserve existing state

Read existing personal run choices and successful bundled build receipts without deleting or silently overwriting them. Define deterministic precedence between saved run overrides and new effective manifest edits, bind it in revisions, and test it. Existing malformed/linked/foreign state remains a diagnostic rather than being reset during initialization. Existing publication identity and ordinary workspace layout must survive upgrades. No automatic worktree, private repository or cache cleanup is part of this change.

## Risks and verification

- Broad access-check changes could expose product writes: test direct and HTTP operations with a byte-for-byte immutable product fixture and linked-path attacks.
- Archive/section aliases could reset identity or affect same-name projects: test both origins, default-archived embedded entries, restart and separate selected project repositories.
- Persistent working sources could be mistaken for disposable cache: test cleanup exclusions, failed initialization and source-update conflicts.
- Publication/package paths could diverge from run output: use neutral fixture adapters to assert matching checked source/output/icon/identity snapshots and state isolation.
- The current personal-settings and explicit rebuild contracts need successor changes, not disabling their validation. Preserve receipt/locking protections and test concurrent writers and existing consumers.

## Non-goals

No private source promotion, plugin migration, credential provisioning, implicit production publish, source-installation writes, deletion of embedded projects or repository cleanup. No claim that executing project scripts is sandboxed. Maintainer review and ordinary PR delivery remain required.

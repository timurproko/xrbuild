# Design

## Context

The core is public; the authorized development workspace is a separate ignored private clone. Ordinary users have a selected workspace that may contain no Git metadata. The engine ABI and service contracts already isolate plugins from core internals, but filesystem ownership is currently conflated with plugin behavior.

`plugin-manager.ts`, `host-build.ts`, `publishers.ts` and managed-tool containment assume `<workspace>/plugins`. Packagers additionally discover packages under core `packages/`. Project discovery assumes one editable project root; layout changes move project folders. Bundled apps must not be passed through these mutating paths as ordinary workspace projects.

Current root instructions and OpenSpec context prohibit all concrete integrations in the public repository. Implementing this proposal requires reviewed updates to that ownership rule, not a silent exception or an exemption from public naming/confidentiality checks. Some canonical specs still describe the pre-split tracked workspace; the accepted split change has not completed bot synchronization. Reconcile that prerequisite without resurrecting tracked private contents or manually finalizing the old change.

## Goals

- Start a task from the core checkout without repeatedly explaining the repositories.
- Ship audited product plugins and apps as public modules through core PRs.
- Support external/private extensions through the same contracts and selected workspace.
- Keep user edits, configuration, recordings, credentials and generated runtime state out of product source.
- Coordinate private changes from the same agent session, with minimal routine owner intervention after policy approval.
- Keep public build/test/review independent of private assets, access and automation credentials.

## Non-goals

No submodules, new SDK registry requirement, private-to-public history merge, device activation, production publication, license grant, core implementation auto-merge, automatic stable-checkout edits, or blanket deletion of private worktrees. Public visibility is not proof of redistribution rights. Normal user workspaces are not automatically initialized, committed or pushed by the panel.

## D1. Two origins, not two integration implementations

Proposed layout:

```
<core>/
  native/                  generic host and plugin ABI
  packages/                SDK, UI library, panel and other generic modules
  templates/               canonical editable app/workspace templates
  embedded/                tracked product workspace, part of core Git history
    docs/
    plugins/<id>/          audited bundled plugins
    projects/<section>/<id>/  bundled product/example/diagnostic/test projects
    third_party/           optional workspace layout entry; bundled fetches use core third_party
    package.json
    pnpm-workspace.yaml
    pnpm-lock.yaml
    xrb-panel.json         product defaults, not mutable user state
    xrb-plugins.json       product defaults, not mutable user state
  .xrbuild/                optional ignored independent development workspace
    docs/
    plugins/<id>/          private or developer-owned integrations
    projects/<section>/<id>/
    third_party/
    package.json
    pnpm-workspace.yaml
    pnpm-lock.yaml
    xrb-panel.json
    xrb-plugins.json
```

Both roots use the same workspace structure and manifest schemas; differences are origin, ownership, public eligibility and write permissions, not two incompatible formats. `embedded/` has no independent `.git`: it belongs to core history. Installed packages, generated editor configuration, builds and runtime output remain ignored in both layouts. Core libraries are not copied into either workspace.

The selected ordinary workspace retains this same structure at `XRB_HOME`, otherwise the existing home default. Repository commands explicitly select the current checkout's `.xrbuild`. Separately selected project repositories continue to own their editable app sources.

Bundled means distributed with the product; it does not make plugin-specific logic part of the engine. Native modules still use the C ABI; packagers, publishers and tools still declare neutral contracts. Missing optional integrations must not prevent a core-only host build or desktop run.

## D2. One resolved extension catalog

Introduce a shared resolver returning validated records with origin (`bundled` or `workspace`), logical ID, canonical source root, owning package/install root, manifest, build/binary roots and configuration scope. Consumers receive resolved records rather than reconstructing workspace-relative paths.

Cover plugin metadata/icons/preferences, provider enumeration and run arguments, packager and publisher discovery, sample import, managed-tool modules/routes, native freshness/build/dependency selection and packaging. Existing generic package-provided services remain supported without being registered twice.

Containment is checked against each resolved extension's authorized root, including real paths and link traversal. Supporting two roots must not widen managed tools to arbitrary files on disk. Cross-plugin service references must be resolved through explicit declared ownership/compatibility rather than uncontrolled `../` imports. Detect duplicate tool routes and service names before loading affected modules.

### Identity and conflicts

Catalog instances use origin-qualified keys, with stable logical/plugin/provider IDs retained for existing project manifests. Unique existing unqualified references continue to work. Built-in provider identities remain reserved.

The Plugins detail view exposes available origins and an explicit source-selection action, including when a conflict disables both instances. Selection requires a revision of user preferences plus catalog source identities/metadata. Preference mutations use exclusive cooperating-writer locks and atomic replacement, preserving unrelated/unknown saved fields. An origin change reserves panel plugin mutation, refuses active jobs/native/browser runs or launch/settings preparation, then stages publisher/packager discoveries and publishes the pair together. Concurrent launch/job starts are refused during this reservation. Stale revisions, unknown origins and malformed/linked preferences fail without overwriting state. Source-dependent provider/status/setup caches are invalidated after a successful update. Tool runtime source/route changes still invalidate that tool and require restart under the existing tool identity contract; this action does not pretend to hot-reload arbitrary executing tool code. Direct out-of-band source/preferences edits still require restart until automatic coherent discovery is separately implemented.

When bundled and external plugins claim the same identity, do not silently override or merge them. Report the conflict and disable the ambiguous integration until the selected workspace explicitly chooses an origin. That choice selects the whole plugin consistently across metadata, tools, provider binaries, packagers and publishers; it cannot select metadata from one copy and execute the other. Preferences and cached results include the resolved origin.

The standalone host's existing `<exe>/plugins` then `--plugin-dir` search and duplicate diagnostics stay intact for packaged apps/direct CLI use. The panel validates conflicts first and passes only the selected roots; it must not rely on incidental filesystem order. Test collisions by folder ID, service ID, runtime role/name and route, including distinct folder names advertising one provider.

## D3. Bundled apps are product sources, not user folders

The panel presents a Bundled catalog alongside editable workspace projects, with source/ownership visible. Use origin-qualified catalog keys so a bundled app and user app with the same folder name remain distinct. Legacy user project IDs remain readable.

Ordinary panel operations must not rename, archive, delete, rewrite manifests, change icons, or persist publication receipts in bundled sources. Provide an explicit copy/import action to create an independently editable workspace project. New user apps always start from `templates/app` in the selected writable project root. Agent changes to bundled source happen only in the linked core worktree through core delivery.

Keep product defaults in bundled manifests; store user overrides, layout preferences, publication identity/state, signing references and recordings in the selected writable workspace/project-state root. Keep application identity separate from catalog identity: publishing a copied template must obtain its own identity and cannot inherit a production deployment or signing identity.

Bundled apps have packaged/prebuilt output for normal use. Development builds use task-local output; any ordinary-user rebuild must use an explicitly writable output/cache root, not modify an installed core or require a private clone. Preserve preview, icon generation, launcher inventory and separate-project-root behavior for both catalog origins.

The first project UI/API slice exposes bundled IDs as `bundled:<id>` (including `bundled:archive/<id>`), while editable projects retain their existing IDs and additionally expose `workspace:<id>` catalog keys. Qualified workspace references are accepted as aliases; an unqualified ID continues to mean the editable workspace, never an implicit bundled fallback. Layout persistence only contains editable projects; bundled sections and archive membership come from product folders.

Packaged bundled preview/run reads existing contained output without installing dependencies, running scripts, finalizing favicons or writing build receipts into product sources. Development, publication, packaging, source-opening/editing, icon mutation and archive/delete operations require an editable copy; explicit cached rebuilds follow the contract below, while advanced override editing remains follow-up work within this change. Host launch state and requested recordings use an origin/core-scoped location in the selected user workspace. Raw bundled host arguments are refused because they may redirect output paths. Project assets and all writable paths reject link escapes; writable roots cannot be embedded sources even through an alias or a not-yet-created child path.

Copy-to-workspace places a new live project in `projects/unsorted/<new-id>` in the separately selected editable project repository. It copies regular source/assets, excluding installed/generated/state/credential files, and creates a manifest from a portable allowlist: no publication, platform identity, plugin/signing configuration, host arguments/recordings or machine selections survive. A package declaration receives the new ID. Existing destinations are never replaced; the manifest is published last so interrupted copies are not catalogued as complete. Unknown source contents still require the separate export audit; filtering known state filenames is not a confidentiality audit.

Personal bundled run settings use `config/projects/<canonical-core-and-project-key>/run.json` in the integration workspace, independently of the editable project repository and disposable build cache. The initial allowlist is inputs, display, monitor, fullscreen, orthographic view and camera view. No target/platform identity, publication, plugin configuration, source path, script or raw host argument can be overridden through this endpoint. Missing values inherit current bundled defaults; listing never creates a file. GET returns effective values, overrides, defaults and a revision bound to source defaults and saved bytes. Explicit Save/Restore defaults requires that revision, uses an exclusive cross-process lock and atomic replacement, and refuses stale writers, malformed/oversized/linked state or settings belonging to another source. Invalid saved state blocks Run rather than silently resetting it; the original bytes remain for manual recovery. Settings updates are refused while that project is running/working or any launch is preparing. Native and browser launches consume one settings snapshot; explicit per-run options may override it for that launch only. Copy to workspace still starts from portable product defaults, not personal overrides. Advanced override editing remains separate unfinished work; cached project builds use the contract below.

Explicit bundled Rebuild uses `<workspace>/build/projects/<core-and-project-key>/` with an exclusive writer lock and atomic building/complete/failed receipt. Each attempt copies the public embedded workspace into a new isolated working generation, installs with the product's pinned pnpm version and frozen lockfile (installation lifecycle scripts disabled), and builds declared transitive local package prerequisites followed by the project's build script with XRB_CORE pointing to the selected read-only core. The initial reproducible package contract requires root package.json with private: true, pinned pnpm, pnpm-lock.yaml and a packages-only pnpm-workspace.yaml using the canonical projects/plugins globs; custom package-manager configuration and external file/link dependencies require an editable copy. Nested package workspaces, inconsistent package-manager pins and custom pnpm metadata are unsupported. Inherited npm/pnpm/Git configuration is removed and Git directory discovery stops at the snapshot, so ordinary build commands cannot pick up the surrounding repository accidentally. No user/private workspace packages are installed. Generated/installed/Git/common credential state is excluded from the source snapshot; this filtering is not an export audit or a sandbox for trusted build scripts.

A fresh dedicated relative entry directory is required; static projects still use their packaged output. Whole embedded input plus SDK/UI/build-helper source and core/package-lock content/membership fingerprints bind successful builds. Output is checked for links and copied into a separate immutable runtime generation containing only built assets. New Run and unqualified preview reject stale, failed, incomplete, tampered or foreign state instead of falling back to packaged output; packaged output is used only before any local build state exists. Cached browser routes carry a generation so already-open pages keep their assets across later builds; native runs pin the same output directory. Retained generation URLs remain explicitly readable after a failed/newer build, but are never selected as automatic fallback. Source edits, development, publication and packaging still require an editable copy. Personal settings live outside caches. Old working/output generations and failed state remain for inspection; automatic reclamation/reset is not implemented. Rebuild is refused while the project runs or a launch/settings update is preparing; independent processes serialize through the per-project lock.

The existing UI library remains in `packages/ui-kit`; only its demonstration app is a candidate bundled app. A starter example and the default template must have a canonical generation or consistency check rather than drift as two hand-maintained copies.

## D3a. User configuration defaults and publisher consolidation

The maintainer selected one embedded publisher plugin, not three independently managed plugins. It owns local and production destination implementations behind one metadata/settings entry. Existing project publisher service IDs remain readable for compatibility, but their implementation modules and tests belong to the single plugin. Workspace-only legacy plugin settings require a deliberate migration that preserves user values and reports conflicting or invalid state; old folders are not silently executed alongside the embedded replacement.

Bundled plugins declare validated default configuration. Create missing config under the selected user workspace's `config/plugins/<plugin-id>/` using create-only writes; never overwrite existing settings, silently repair malformed config, or write user config into embedded source. Reject link/path escapes, handle concurrent first runs, and apply schema defaults in memory for newly introduced missing fields without rewriting an existing file. Public defaults contain no live deployment destinations, signing identity or secrets; production publication remains disabled until configured. Local certificates and headset signing material are user-owned state, never generated as a side effect of discovery. The headset packager uses the same config contract.

The initial configuration schema reuses the bounded setting-field descriptors as `xrb-plugin.json#config`. A declared schema initializes `config/plugins/<id>/config.json`; undeclared config does not create files. Known saved fields are validated strictly, unknown fields remain untouched on disk, and missing fields use schema defaults in memory. Publisher/packager modules with this schema expose `createPublisher(context)` / `createPackager(context)`, receiving the resolved plugin, selected user workspace, core and effective config explicitly instead of relying on process-global paths. Existing static service exports remain supported for plugins without a config declaration. Origin selection is stored as `xrb-plugins.json#origins` (lowercase logical ID to `bundled` or `workspace`); origin-qualified preference keys take precedence over legacy unqualified settings.

## D3b. Lowercase default project section

Use `projects/unsorted/` consistently in both workspace roots, templates, APIs, tests and current documentation, matching the lowercase naming of other section folders. Update in-scope folder names and references directly; no runtime migration, legacy aliases or capitalization-specific compatibility layer is required. Keep the human-facing section label independent of filesystem capitalization.

## D3c. Advanced overrides and conservative cache maintenance

Advanced bundled run overrides are a second explicit allowlist: provider setting values accepted only from selected providers' declared runtime-setting schemas, scoped to the exact origin/schema and effective run selection. Arbitrary scripts/paths/host arguments/platform/publication identity remain forbidden. Secrets and filesystem/recording/signing configuration remain external; a provider change or schema mismatch blocks Run rather than applying saved values to a different source. Persistent advanced state uses the same scoped revision-checked user settings record; copying still takes product defaults.

Cache maintenance is explicit, review-first and revision checked. The first supported reclamation scope is obsolete working generations, not published runtimes. It preserves current/referenced working generations, every published runtime (including generation-qualified browser URLs), configuration, recordings, incomplete/unknown/foreign state and any nested Git/private/KEEP markers. It shares operation/build locks with builders, refuses active panel consumers, quarantines exact reviewed candidates and revalidates before deletion; no arbitrary path or automatic sweeping. Tests delete disposable fixture caches only, never retained acceptance evidence or existing user data. Broader runtime reclamation requires leases and is deliberately not inferred from apparent age or a clean Git status.

## D4. Build, dependencies and package ownership

The embedded workspace has its own package/workspace manifests and lockfile, tracked by core Git; external workspaces retain the equivalent independent package/install structure. Core setup/build/test entry points orchestrate the embedded install explicitly rather than enrolling two nested pnpm workspaces under overlapping globs. `.xrbuild` remains excluded from public/core package discovery and CI. User extension installation is opt-in against the explicitly selected user workspace. Every task's private clone has independent Git/LFS storage; do not share workspace source or private generated outputs by junction.

Core `setup:embedded`, `build:embedded` and `test:embedded` entry points use an explicit writable workspace and a fresh core-scoped embedded snapshot for each operation. Setup installs only; Build installs then runs declared package builds in dependency order; Test installs, builds prerequisites, then runs available package tests in that order. The embedded root is an unpublished package with its own pinned manager, packages-only globs and frozen lockfile, never part of core pnpm globs. A missing root is skipped only with explicit `--if-present`; malformed or partially present roots fail. An empty scaffold reports zero packages, not module acceptance. Root lifecycle/build/test scripts are not implicitly executed. No private source is promoted by creating the empty scaffold.

Shared snapshot/install helpers serve both orchestration and per-project cached rebuilds. Registered package identities must be unique; local edges must explicitly use supported workspace protocols, resolve to registered packages, and form an acyclic graph. Missing/ambiguous edges, unsupported configuration and unsafe roots fail before commands. Bounded pnpm v9-format YAML locks use an exact core parser dependency; duplicate keys/aliases, nonmatching importers, escaped or mismatched local link targets and filesystem resolutions are refused. Installed links are checked again before scripts, and must remain inside the working generation. Project manifest build-script names take precedence over the standard package build script. Per-project rebuilds build only their transitive local prerequisites before the selected project; workspace Test builds the whole declared graph before package tests. User package-manager/Git state stays excluded. Working generations are retained with exclusive core/workspace operation locks and atomic running/complete/failed diagnostic receipts; this validation workspace is never activated as a runtime or presented as a distributable package. Source changes during operations fail completion. Public CI selects embedded changes and invokes the explicit build/test lane without private credentials or hardware; distribution allowlists and native/module acceptance remain separate work.

Native build orchestration accepts resolved bundled/workspace projects and passes correct SDK/core-dependency/plugin-dependency/output roots. Host freshness, provider discovery and packaging all refer to the same selected binaries. The public core-only build does not eagerly build optional device/toolchain-dependent modules. CI has explicit bundled-module jobs that cover approved modules and mocks without private hardware/software.

Native plugin builds use one selected-origin plan. Workspace plugins retain their existing build/bin layout; embedded plugin builds use `<workspace>/build/native/b-<core-and-source-key>/`, with short `b/` and `r/` build trees and `bin/`. The compact key prevents outputs from different core installations/checkouts from aliasing while avoiding deeply nested MSBuild paths. Workspace plugin receipts/locks live separately under `build/native/w-<source-key>/`, so resetting a CMake build tree cannot move its active lock. A build-state receipt binds rebuilt output to its core and source root; incomplete/failed or mismatched output is not used and cannot silently fall back to packaged binaries. Packaged embedded `bin/` is used only before a local rebuild exists. Build/output paths reject links and source escapes. Rebuild defaults to enabled, unambiguous plugins; explicit core-only and plugins-only modes allow optional modules to remain unavailable and an installed product's plugins to rebuild without writing product sources. Panel-managed native rebuilds exclude package/icon jobs and native launch preparation, preventing active consumers from observing partially replaced binaries. Managed host rebuilds also use a user-owned cache: `<workspace>/build/native/h-<canonical-core-key>/b` for CMake and exclusive `r-<generation>/` runtime snapshots published after success. The host receipt/lock lives above `b/`, so CMake resets cannot move an active lock. Source/default installations are never built or cleaned in place. Before a local rebuild exists, the installed `native/host/build/Release` may be read; once cache state exists, missing/building/failed/foreign receipts or changed/missing output block activation without packaged fallback. Receipts bind the selected core, host source, source/dependency-lock fingerprint and successful runtime-snapshot fingerprint. Previously published snapshots are not mutated or automatically deleted, so already-started consumers keep a stable runtime even across a separate CLI rebuild; cache reclamation remains explicit follow-up work. Source membership/stamp changes mark a successful host stale, including deletions; a source change during build fails completion. Provider queries, native runs, icon rendering, packaging and CLI unit tests resolve this same runtime. Existing product-side legacy plugins are left untouched; cached legacy plugin output is preserved outside the active Release tree. Cross-process build locks are exclusive and never automatically removed by another builder. These are cooperating build/consumer guards, not a sandbox for arbitrary CMake or plugin code. Standalone developer CMake commands and their legacy path helper remain explicit source-tree operations.

Provider discovery probes selected binary roots independently, then validates their combined claims before launch/package selection. Duplicate role/name claims, reserved built-in identities, rejected DLLs and out-of-owner paths invalidate the affected binary roots; no first-loaded native implementation wins. Since package mappings use provider names, equal names in distinct binary roots are also refused even across roles. Only validated binary roots reach panel-managed launch. Existing standalone host CLI ordering remains unchanged.

The maintainer selected embedded hand-tracking functionality with reviewed public dependencies fetched into `<core>/third_party`, not the user workspace's dependency store. That is a physical cache/build location: fetched binaries and generated files remain ignored unless an individual audited source asset is explicitly approved for tracking. Keep reproducible URLs/version/hash pins, applicable licenses/notices and public fetch/build instructions in reviewed tracked descriptors. Dependency availability, open-source status and redistribution rights must be verified from the actual upstream source and artifact provenance; a private prebuilt runtime is not automatically a reviewed public build.

Public dependency locks may contain only reviewed redistributable dependencies. Any unresolved or restricted runtime/model/calibration/device component remains private behind an optional contract, never copied into public `third_party` or downloaded with private credentials in public CI. Package artifacts contain only selected plugins and distributable runtime files, not entire source roots, Git metadata, credentials or workspace state.

The built-in desktop packager stages into a fresh exclusive generation and never recursively deletes an existing caller folder. Its host-runtime allowlist names the Windows host/CEF runtime files and locale packs; developer tests, maps/symbols, old packaged config and adjacent plugins are never copied wholesale. Selected plugin roots default to root DLLs plus license/notice text; non-DLL assets require an explicit bounded `xrb-runtime.json` file inventory (version 1, files array). Every inventory path must be portable/relative/contained, unique and a regular unlinked file; sensitive/generated/source-state names remain prohibited even if declared. A declaration is an operational content allowlist, not license/confidentiality export approval. Built app output is separately checked for links and forbidden source/credential/workspace state. Input inventories are verified before and after copying. Source/output aliasing, unsafe destinations and escaped plugin IDs fail before writes. Configuration is generated from the selected launch contract rather than copied from a runtime directory; raw host arguments, recording paths and unselected plugin configuration do not enter the desktop package. ZIP output is published exclusively after successful staging and validation, without overwriting existing packages. Failures leave diagnostic staging data for review; automatic deletion remains out of scope. External packager adoption of this staging contract and complete product installation distribution remain separately verified work.

All packager adapters receive isolated validated input snapshots from neutral core staging: built app assets, selected host runtime/plugin inventories and portable generated launch configuration, or app-only assets for WebXR. No adapter gets an unchecked entire host build tree by default. Adapter code remains trusted and this contract is not a sandbox.

Bundled Node service dependencies use a separately activated core/source-qualified installed snapshot. Explicit setup installs/builds the frozen public embedded graph and atomically publishes a receipt binding inputs and installed-tree membership/stamps. Discovery never installs. Source catalogs retain product identity while runtime module resolution uses the completed user-owned generation; incomplete/failed/foreign/changed snapshots are unavailable without falling back after local state exists. Setup outputs, dependency symlinks and later runtime resolution remain contained in the generation. Product sources and user/private package workspaces are never installed by this operation.

Declared cross-component references are explicit manifest entries naming an origin-qualified selected plugin and a contained exported relative module. Only declared exports may cross an owner boundary, never arbitrary sibling traversal. The same resolver backs service and managed-tool declarations. Coherent automatic discovery compares catalog/preferences/declarations and resolved runtime revisions; idle updates publish a complete service pair, while pending or unsafe changes block new consumers until idle recovery. Existing tool identity restrictions remain: no unreviewed live replacement of executing tools.

Test public-only, public plus an empty ordinary workspace, public plus an independent private fixture, a distinct project repository, and a read-only installed product. Both source layouts must behave without fixed machine paths.

## D5. Promotion is an audit, not a bulk move

Candidate roles include local/web publishing components, a generic headset packager and synthetic/browser hand diagnostics. The maintainer's project scope is all existing non-client projects, including archived examples and diagnostics, not only currently active apps. Client-facing projects, their assets, source/reference documents and deployment identities remain exclusively private. The maintainer has confirmed the client-project mapping privately. That entire project and related assets are excluded from the export inventory; a neutral folder name is not evidence of public eligibility. Any further uncertain client-owned material remains blocked until clarified. Preserve each project's section/archive placement rather than silently unarchiving it. This destination intent is not approval to expose current folders without the export audit.

Plugin triage: consolidate local/production publishing and their selector into one embedded publisher plugin with external deployment configuration and disabled-until-configured production behavior; embed the headset packager with neutral metadata and workspace-owned signing/publication configuration; embed hand-tracking components whose source and dependencies pass review, with public dependency fetches targeting core `third_party`. Audit the native sensor bridge, distributed runtimes and model assets rather than copying opaque private binaries or assuming their licenses. Restricted display, tracking and station integrations remain private. Plugin-owned sample projects follow the audited plugin/component boundary rather than being duplicated into the global project catalog.

Project promotion must replace private provider defaults with portable defaults or explicit optional capability selection, preserve optional external-provider support through user overrides, and remove machine monitor selections, deployment UUID/routes, prior packaging state, recordings and private fixtures from the export. Hardware-dependent diagnostics must clearly report unavailable capabilities or provide explicit synthetic/replay test modes; they must not require private software simply to load the embedded catalog.

Create a private per-module inventory of source, dependencies, binaries, model assets, tests, deployment identifiers, rights/notices and private coupling. Review current publisher configuration, application publication identity, native sensor bridges and runtime bundles particularly carefully. A generic frontend may be promotable while its device adapter remains private. Deployment configuration and credentials remain workspace-owned even when publishing logic becomes bundled.

For each module: obtain approval of the exact export allowlist/revision, extract only reviewed working-tree contents into task-local staging, normalize public identifiers/configuration, audit contents and assets, and run focused tests. Never cherry-pick or merge private history into the public repository. Verify the public commit closure before its first push; name-guard success is necessary but not sufficient.

Deliver core discovery support before retiring any private copy. Old private copies can coexist only with explicit origin selection and a clear migration diagnostic. Remove or retire a private copy in its own PR after public availability and paired compatibility tests; preserve local overrides and rollback. Do not blanket-delete a workspace folder to resolve a duplicate.

## D6. Agent entry and coordinated delivery

Root `AGENTS.md`, `.claude/CLAUDE.md`, OpenSpec context and the delivery skill state the layout and routing table. Private root instructions remain authoritative for that independent repository and must be loaded when provisioned. Public-only tasks must not prompt for or clone private source unnecessarily.

Stage 4 tooling exposes owner routing, independently provisioned private-clone validation and tested-revision records, using local/private records rather than tracked private identifiers. Public-only work never needs a private clone. Provisioning is explicit and verifies expected remotes, task branch and independent Git/object/LFS storage; it never reuses a dirty destination or shares stores. Disposable local repository fixtures cover missing access, wrong remotes, core-only/embedded-only/private-only/paired routing and stale tested revisions. Tooling creates no PR, pushes no ref and performs no merge. Spec prerequisites are recorded and checked without changing predecessor deltas or simulating a real bot finalization in this task.

For an authorized task, determine affected owners, create/link the core worktree, and provision a fresh independent private clone on its own task branch only when required. Prefer pinned, verified local LFS reuse without linking stores; missing credentials or mismatched remotes block private changes, not redirect them into public files.

A request to implement alone does not imply permission to publish or merge. Define a documented task delivery authorization: when the owner requests delivery, the agent may commit/push scoped task branches and open/update PRs in the required repositories without repeated per-command confirmations. Preserve plan-before-implementation review for substantial changes. Never push main or merge as the agent. Production publication, hardware operations, hosting activation and destructive cleanup remain distinct permissions.

One local/private task record tracks repository identities, task branches, immutable tested SHAs, PR states, dependencies and blockers. Core-only work has one public PR; private-only work has one private PR and no empty public PR; cross-repository work has one PR per affected repository and one combined handoff. Do not put private repository URLs, PR links, names, logs or configuration in public PR bodies. The private record may link back to public delivery.

Cross-repository merges are not atomic. Prefer backward-compatible core support first; private delivery depending on it waits for an accepted merged core revision and tests against that revision. Retest if either head/base changes. A private PR cannot auto-merge merely because the combined local checkout passed while its required public core change remains unmerged.

## D7. Private app automation, separately owned and activated

Implement the private automation in that repository's independently reviewed companion, not in public CI with private credentials. Reconcile its existing pending instructions/CI/test work instead of silently replacing or duplicating it. Revise obsolete split sequencing and core-access assumptions; preserve relocated assertions. Local test success does not erase a failed remote run.

Proposed first policy: opt-in, same-repository, authorized task PRs changing allowlisted ordinary app source/tests may be automatically promoted and squash-merged by a trusted repository bot after all required checks pass at the current head/base. An authorized request for routine app delivery may opt into this lane once the maintainer has approved and installed the policy. Allow an explicit opt-out.

Require manual review for workflow/agent-policy/governance changes, dependency/lock/LFS changes, signing/publication configuration, native/device plugins, unresolved cross-repository dependencies and unclassified paths. Classify the full diff including renames/deletions; a PR cannot self-expand the allowlist. Broader plugin automation can be proposed later with its own tests and risk gates.

The privileged merge decision uses only trusted base-branch code and validated metadata, never PR scripts or artifacts as executable input. Candidate tests run without merge credentials. Require exact-head check identities from approved workflows, enabled/enforced repository policy, current base compatibility, resolved reviews/conversations, valid PR state and an owner-controlled opt-in. Recheck immediately before the merge; stale, missing, skipped, disabled, failed or unknown validation blocks the lane. Respect branch protection with no admin bypass. Git merge never triggers production publication by itself.

Public implementation PRs remain maintainer-merged. Agents do not merge or arm auto-merge in either repository. Actual App installation, permissions, rulesets, required checks and Actions enablement require separate maintainer approval and a sandbox test PR before routine use. If private branch protection is unavailable on the hosting plan, report the limitation and keep manual delivery rather than pretending enforcement exists.

## D8. Cleanup remains safe and finite

Do not expand this architectural PR into an unreviewed deletion-policy bypass. Current `.xrbuild` and KEEP protections remain. Coordinated tooling inventories private refs, working/ignored data, LFS and evidence and offers preservation/retirement steps after delivery. A future independently approved disposable-clone policy may avoid redundant full backups, but no current clone is classified disposable solely from clean outer Git status or a merged core PR.

## Completion validation and delivery

Restore an exact pinned TypeScript/type dependency toolchain and a strict no-emit check for public production TS sources,
without enrolling private packages. Public CI selects frozen embedded checks and the public SDK/compiler boundary fixture
for embedded/contracts/dependency changes; full host/device-independent tests retain the nightly/manual policy. Actual
module source, tests and dependency/license inventories are audited in an independent task-private clone before any
transfer. Neither general completion/delivery authorization nor a passing inventory permits exporting an unapproved file.

Repository handoffs bind both tracked/untracked source bytes and staged index identity, including LFS pointer/materialized
state. Provisioning suppresses LFS filters as well as hooks/routing overrides, so a Windows no-download clone does not
create hook files under a mistaken relative null-device path. Existing generated/private state is preserved, never cleaned
as part of this correction. Read-only remote CI capability checks do not authorize enabling disabled Actions or hosting.
Delivery may commit/push only reviewed owning-branch changes; blocked promotion/finalization work remains honestly open.

## Delivery stages and review gates

1. Review this architecture and routing policy. No private source copied or automation enabled in this stage.
2. Implement/test generic two-origin support and core session instructions in the public PR. Reconcile pending split specs through normal bot finalization and prevent older deltas from overwriting the approved new model.
3. Review export inventories privately; promote only approved modules with their public tests/notices and private compatibility/retirement companions. Each source export has an explicit public-push gate.
4. Deliver private instructions/CI and trusted app-merge policy separately; validate policy fixtures without live changes. Activate hosting only after separate approval and verified enforcement.
5. Exercise a public-only task, private-only task and cross-repository task, including blocked/error paths. Record manual/device gaps rather than marking them passed.

## Manual UI feedback: cursor defaults and section re-entry

System is the shared default cursor for unset/unknown preferences and SDK options; explicit saved cursor choices remain
unchanged. Apps workflow tabs must appear already selected when returning from Settings/Plugins, without an underline
moving from hidden zero-width geometry. Hidden tab lists must not supply remembered layout, and becoming visible snaps
the indicator before transitions resume. Deliberate visible tab changes keep their normal animation.

## Open decisions for the maintainer

- Confirmed by the maintainer: tracked `embedded/` and the selected user workspace use the same `plugins/`, `projects/`, dependency, manifest and configuration structure. Project migration includes all non-client projects; the excluded client-project path has been confirmed and is recorded only in the local/private migration inventory. Bundled-source read-only behavior in normal panel use and explicit copy-to-workspace editing remain part of the proposed UX.
- Approve explicit origin selection for duplicate integrations instead of automatic workspace override.
- Approve the narrow private app auto-merge lane; retain manual review for native plugins, publishing/signing policy and infrastructure.
- Approve each module's audited public export separately. Some requested candidates may remain partly private until dependencies, identifiers and redistribution rights are resolved.

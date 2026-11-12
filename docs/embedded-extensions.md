# Embedded and user extension contracts

## Implementation status

The initial implementation supplies a shared plugin resolver, qualified project catalog records, origin-aware plugin
management, publisher/packager factories, managed-tool loading and selected native binary paths. It also standardizes
`projects/unsorted/` without migration logic. Approved source includes consolidated Publisher, the authored hand
implementation/diagnostic, the explicitly configured headset packager and eight public project groups, including archives.
No private configuration, deployment identity, credentials, model weights, prebuilt device payloads or Git history accompany those snapshots.

The panel lists embedded and ordinary projects in one normal Develop / Publish / Build workflow. Both support runs,
development, builds, icons, packaging, publication and user sections/archive; only embedded deletion is forbidden.
Mutable embedded sources/settings use durable user-owned working trees without requiring a separately listed copy.
Build preparation installs the frozen public graph outside product sources. General embedded setup/build/test commands validate the separate package
graph in retained writable snapshots. Explicit installed-service activation, adapter-neutral package staging, declared
component references, safe automatic discovery, schema-bound advanced run choices and reviewed working-cache cleanup
are implemented. Further module promotions and full distribution/device acceptance remain pending. Existing workspace
project APIs retain their IDs.
Native plugin build/freshness follow resolved origins. Managed full/core-only host rebuilds now use a user-owned cache
and immutable runtime snapshots; product-side host sources and build artifacts are not changed.

## Ownership and identities

- `<core>/embedded/` belongs to core Git. It is not another repository.
- The selected user workspace is `XRB_HOME`, otherwise the existing home workspace. Repository-development launchers
  explicitly select the linked checkout's independent ignored `.xrbuild/` clone.
- A separately selected project repository still owns editable projects.
- Both origins use the same `xrb-plugin.json` and `xrb-project.json` validation. Catalog keys are `bundled:<id>` and
  `workspace:<id>`; archived project keys retain `archive/` after the origin prefix.
- Sources, package/install root, dependency root, native binary root and writable config root travel with the resolved
  plugin. Consumers must not reconstruct a workspace path from an embedded plugin's logical ID.

A duplicated plugin is unavailable until `xrb-plugins.json` in the selected user workspace chooses an origin:

```json
{
  "disabled": [],
  "settings": {},
  "panelSettings": {},
  "origins": { "example-plugin": "bundled" }
}
```

Origin keys are lowercase logical IDs; values are `bundled` or `workspace`. A missing selected source is an error, not
permission to fall back. Invalid duplicate metadata also blocks fallback. Qualified settings such as
`settings["bundled:example-plugin"]` belong to that source. Unqualified legacy settings apply only to an unambiguous
plugin. A disabled logical ID disables that integration; a qualified disabled key targets one instance.

Publisher/packager service-name collisions make the affected services unavailable rather than keeping whichever
loaded first. Tool IDs and routes must be unique across the selected plugins and workspace tool declarations.
After changing the source or routes of a running tool, restart the panel: it will not reuse the previous source's runtime.
Plugins labels sources with lowercase **embedded/custom** badges alongside build/version, not sidebar suffixes, and offers **Plugin source → Use selected source** when sources conflict
or a preference no longer resolves. The selection uses an origin/preference/declaration-bound revision, preserves unrelated
settings, and refreshes publisher/packager services as one pair without restarting the panel. Stop apps/jobs first: launch,
settings and service-action preparation also reserve their state, so a source cannot change between validation and job start.
Publisher statuses/release views, provider discovery and package setup views are invalidated; late old-source statuses cannot
repopulate the new cache. A failed new factory stays unavailable rather than reusing the prior source's implementation.

Preferences use an exclusive `xrb-plugins.json.lock` and atomic replacement. Unknown saved fields survive; malformed,
oversized (over 64 KiB), linked or concurrently changed state is preserved and rejected. Leftover locks require verifying
the writer stopped before manual recovery. Out-of-band preferences/catalog/declaration and installed-runtime changes
are detected automatically; idle refresh publishes publisher/packager discoveries as one pair. Busy work keeps its pinned
implementations, but new consumers are blocked until refresh. New actions recheck discovery rather than trusting the UI
poll interval. Changed already-executed JS/TS/package code requires an actual restart: imports cannot safely unload its
transitive state. Tool source/route/runtime changes invalidate executing tools and require restart, never old-source fallback.
Unrelated preference refreshes retain unchanged tools. Stale tool documents redirect to non-modal recovery, which refuses
embedded-frame activation and waits
for idle runs, queued/running jobs, preparation, tool cleanup and in-flight writes; it requests an instance-bound restart
without confirmation override and returns only to the registered route in the same repository/workspace. Recovery permits
one automatic restart per tool/workspace in 60 seconds and has a bounded wait plus a Back to Apps link. Failed genuine
startup still supports ordinary retry. Shutdown stops accepting reconnects before draining owned streams/tools.
Arbitrary JSON runtime-state writes are not executable-code changes.

Project workflow tabs hide Publish when the installed publisher list is empty, including stale saved Publish selections.
An installed but unconfigured publisher still exposes its configuration workflow. Workflow switches preserve the mounted
project identity/title while updating fields and actions. Global Settings hides the redundant All filter when Apps is the
only settings module, selecting Apps instead; All remains available when another settings-owning module exists.
Project row provenance uses **embedded** without separate embedded-only section headings or a read-only detail screen.
Installed source remains immutable; normal controls edit persistent user state. Sidebar focus outlines are inset and following section headings do not overlap preceding row borders.
Settings sidebar subtitles are lowercase **settings** (All) and **core** (Apps). Apps cursor preferences and unset SDK cursor options default to System; explicit saved choices are preserved.
Tab underlines snap to their selected position on section entry, hidden-list reveal and layout/font resizing; only
actual visible selection changes animate, so returning to Apps does not slide the Develop/Build underline from the left.

## User-owned configuration

An optional `config` field in `xrb-plugin.json` uses the existing bounded setting-field schema:

```json
{
  "title": "Example Publisher",
  "type": "publisher",
  "version": "0.1.0",
  "config": [
    { "key": "enabled", "label": "Enabled", "type": "boolean", "default": false },
    { "key": "destination", "label": "Destination", "type": "text", "default": "" }
  ]
}
```

Service and catalog discovery read `<user-workspace>/config/plugins/<id>/config.json` when present and otherwise use
validated defaults in memory without creating the workspace or configuration. Explicit configuration initialization
can publish missing defaults: a complete temporary file is published with an exclusive hard link, and an existing
file is never replaced. Filesystems without hard-link support fail rather than falling back to partial writes.
Malformed JSON, invalid known values, unsafe links and oversized files are diagnosed without echoing their contents.
Unknown fields remain on disk; new missing fields use defaults in memory without rewriting the user's file.
New workspace templates ignore `config/plugins/`; an existing workspace's `.gitignore` is not rewritten automatically.

Plugins must not put credentials, certificates, signing identities or live deployment destinations in defaults.
Discovery does not generate keys or authorize publication. Production adapters must stay unavailable until explicitly
configured and authorized. Configuration is separate from existing runtime/panel preferences in `xrb-plugins.json`.

## Service factories and containment

Existing static `publisher` / `packager` exports remain supported for plugins without a config declaration. Without a
schema, an existing static/default service takes precedence over a same-named older helper factory; helper signatures
are not assumed to accept the new context. Configured services still require and invoke the context factory. A plugin
with config exports `createPublisher(context)` or `createPackager(context)` from its declared service module. Factories
may be asynchronous and return the existing neutral service contract. They receive:

- `core`: selected core root;
- `workspace`: selected writable user workspace, never the embedded source root;
- `plugin`: the resolved origin-qualified source record;
- `config`: `{file, created, values}`, or `null` when no schema is declared;
- `runtimeRoot`: installed public workspace when applicable, otherwise `null`. Bundled `plugin.installRoot` points there;
  a workspace consumer of a declared public component retains its own install identity.

Managed `createWorkspaceTool(context)` modules receive `plugin` and `config` for plugin-owned tools, alongside their
existing route/server/cancellation context. Their module root is the owning plugin, not the whole integration workspace.
Workspace-declared tools retain the workspace boundary.

Service declarations cannot escape their owner through absolute paths, traversal, symlinks, junctions or hard links.
Unchecked sibling imports are refused. An owner can declare `exports: { "helper": "./dist/helper.mjs" }` in its
`xrb-plugin.json`; a consumer declares `references: { "helper": { "plugin": "bundled:example", "export": "helper" } }`
and uses `#helper` as its publisher/packager/tool module. The target must be the selected enabled origin, and the named
export must be a contained owner module. This declaration is a component API, not source-export approval. Factories
retain the declaring plugin's configuration/identity. Containment is not a sandbox for arbitrary plugin code.

## Projects: normal embedded workflows

Both origins use the same compact project card, capability-based Develop / Publish / Build tabs, settings and menus.
Embedded project route IDs remain `bundled:example` / `bundled:archive/example`; the logical `key` is `bundled:example`
independent of archive placement. Ordinary projects retain `example` / `archive/example` and `workspace:` aliases.
Unqualified references never fall back to embedded projects. URL-encode each ID segment in API/preview routes.
A separately selected project repository owns app working state and layout; integration-only projects are not scanned.

Embedded projects support normal development, native/browser runs, web builds, icons, settings/name edits, packaging,
publication/release actions and section/archive organization. Ordinary kind, target, provider, signing and tool prerequisites
still apply. **Only Delete is disabled because of embedded origin**, with server/direct-method enforcement even for archived
or uninitialized entries. Users may drag both origins into the same sections, reorder them, rename/remove sections,
archive/unarchive, and unarchive product-supplied archived entries. Source-scoped placement in `xrb-panel.json` overlays
product defaults; embedded folders never move. Layout revisions and cooperating-writer locks prevent lost updates.
`PUT /api/layout` requires the current `layout.revision` returned by `GET /api/projects`. Embedded manifest saves use
`{ "manifest": { ... }, "mtimeMs": 0, "revision": "<manifestRevision>" }` with the actual metadata values from the project
response. The revision covers complete settings, timestamps and any not-yet-imported personal choices, so equal
Windows file timestamps cannot hide a changed settings snapshot. Manifest files are replaced atomically.

Discovery remains read-only. Explicit actions needing writable files create/reuse a durable working tree under
`<project-repository>/.xrb/embedded-projects/<scope>/w-<id>/workspace/`. Scope includes canonical core, integration workspace,
selected project repository and product identity. This is not another project in the list. Open Folder/JSON addresses
these editable files; installed defaults remain unchanged. Mutable manifests, source edits, icons and deployment identity
survive restart/rebuild and live outside disposable build generations. Normal mutations reject linked/hard-linked paths.
The first materialization imports existing personal run choices once; subsequent normal manifest edits take precedence.

Valid packaged output can still run/preview without installation, scripts or finalization before working state is needed.
Missing compiled output can be built through the normal explicit Run/Build path, never in installed sources. Managed
built consumers share validated immutable finalized generations. Host launch configuration/default icons remain in
integration-workspace `build/project-state/`; effective recording paths are relative to user-owned working sources.
Project execution is trusted code, not a sandbox preventing a user-authored script or host argument from accessing files.
New project/workspace templates ignore `.xrb/`, layout locks and atomic layout scratch; existing ignore files are not
rewritten automatically. Keep durable working trees backed up separately before deleting a workspace, and never stage
local credentials/signing state or treat a working tree as an approved public source export.

`POST /api/projects/<bundled-id>/copy` takes `{ "folder": "my-example", "name": "My example" }` (`name` is optional).
It creates a new live project in the selected project repository's `projects/unsorted/`. Portable manifest fields survive;
publication routes/IDs, plugin/platform/signing configuration, host arguments/recordings and monitor selections do not.
The new package name matches its folder and is private by default. Installed packages, Git metadata, common generated
output, configuration/credential files and recorded state are excluded. Static packaged output is retained when there
is no build script; script-built output is rebuilt in the editable copy instead. Existing folders are never replaced,
including concurrent requests. The manifest is written last; an interrupted copy leaves its incomplete folder for review
rather than deleting potentially concurrent user data. Known-state filtering is not a substitute for the export audit.

Copy is optional: it creates an independent ordinary project, not a prerequisite for embedded workflows. For a prepared
project it copies current working sources through the same portable-field/identity-reset rules. HTTP and headless-browser
fixtures cover normal tabs/actions, mixed sections/archive, persistent edits, frozen builds, publication/packaging adapters,
legacy run-choice import, Copy and generation-pinned assets without native device execution.

### Embedded package setup, build and test

The core-owned `embedded/` registers **seven packages**: WebXR publisher under `plugins/publisher-webxr` (local/production destinations,
no external npm dependencies), the hand diagnostic under `plugins/input-hands/samples/hand-tracking`, the headset packager under
`plugins/platform-headset/packager`, and four buildable projects. Four additional archived static diagnostics need no package installation.
Publisher production defaults disabled/unconfigured; local TLS setup is explicit. The hand plugin owns authored native
provider/diagnostic/tests/build descriptors; default use is synthetic and requires no private source, cameras or model.
The exact public vision runtime and marker source have reviewed pins/notices; explicit preparation places assets in core
`third_party`. User configuration/calibration/preferences, recordings and caches remain in the selected workspace.
Unverified device SDK inputs and model weights are optional external contracts, not shipped/fetched payloads.
Eight standalone project groups retain core/unsorted/archive membership, portable desktop/no-input defaults and no live deployment/device identity.
The launcher has no ambient production catalog or sibling/private workspace traversal; external catalog selection is explicit. The starter source
is checked against the canonical template and retains the font license. The hand diagnostic remains a plugin-owned sample.
The headset factory discovers safely as unconfigured. Its source/provenance/version/license/file-inventory descriptor, native tools and existing
signing identities are explicitly user-provisioned. No global package lookup, PATH mutation, automatic tool/key installation or hosting exists.
Explicit builds use exclusive user-owned generations/locks/receipts, offline build options, bounded loopback icon serving, password redaction,
existing key preservation and exclusive version output. Optional licensed tools and actual installable/device/distribution acceptance remain separate.
Core pnpm globs remain `packages/*` and `tools/*`; they never enroll embedded or private packages implicitly.
The root scripts `setup:embedded`, `build:embedded` and `test:embedded` accept an explicit `--workspace=<writable-root>`;
`--core=<product-root>` is optional. Setup installs a fresh snapshot; Build installs and builds declared packages;
Test installs, builds prerequisites and then runs available package tests with an isolated writable `XRB_TEST_ROOT` outside
product source. Root lifecycle/build/test scripts are not
implicitly run. Missing build/test scripts are reported, not fabricated as passes. Zero registered packages are reported
as zero. Only explicit `--if-present` skips an absent embedded directory; partial/malformed workspaces still fail.

Registered package names must be unique. Local edges use `workspace:*`, `workspace:^` or `workspace:~`; missing targets,
implicit local resolution and dependency cycles fail before commands. Builds follow dependency order. Project manifest
build-script names override the standard package `build` script; ordinary package tests use `test`. Default scripts must
be public/credential-free and require no hardware; native/device acceptance remains a separate lane.

The bounded package contract uses canonical packages-only globs (including explicit `plugins/*/samples/*`, never `**`)
and pnpm v9-format frozen locks. Lock importers must
match the declared workspace exactly, and local lockfile links must resolve to their declared package locations, not a
surrounding repository. Filesystem resolutions, unsupported lock configuration, duplicate YAML keys and aliases are
rejected. SSH dependencies, embedded URL credentials and direct loopback/unencrypted dependency URLs are rejected;
ambient Node preload/module-path and SSH-agent settings are not inherited by build children. This is not a network sandbox
or proof of a package's public redistribution rights. The parser is the exact core dependency `yaml@2.9.1` (ISC); its distribution must retain its license notice.
Post-install checks reject dependency links leaving the working generation before any build/test script runs.

Operations use `<workspace>/build/embedded/e-<canonical-core-key>/` with an exclusive PID/time `operation.lock` and atomic
running/complete/failed `operation.json`. Each call creates a fresh working generation; it does not reuse a possibly
modified prior install. Source changes fail completion. Old working trees and failed state remain for inspection; a stale
lock requires verifying its writer stopped before manual recovery. These receipts describe validation operations, not
runtime activation. Do not publish whole working trees: the explicit service activation below is separate from ordinary
setup/build/test, and app packages use separately checked runtime inventories.

Root `test` first runs `check:types` using pinned TypeScript/type declarations and a strict no-emit production-source
configuration, then includes this lane using worktree-local `.artifacts/embedded-user`. Public Node CI selects embedded
changes and uses its own `.artifacts/embedded-ci` cache after core tests. A separately selected Windows embedded boundary
job checks frozen installation, types, isolated services/package/settings/cache contracts and both synthetic origins compiled
against the real public ABI header. Embedded manifests/source/tests/lockfiles, core contracts/SDK headers, build/dependency
helpers and compiler configuration select the required checks. Full host tests and actual selected public native rebuilds
use managed user caches on the existing nightly/manual lane, never private checkout/credentials/devices. This does not enable repository hosting/CI settings.
A fresh public-source installation with no Git/private clone, read-only source files and a separate writable cache passes
setup/build/test; generated multi-package fixtures exercise real installs and prerequisite builds. The real Publisher tests
exercise simulated destinations, source/config ownership and preserved legacy history. Hand checks include full strict
types, authored/mocked algorithm/lifecycle fixtures, user-state/link/revision isolation and actual synthetic native CTest.
Public-only, read-only-source installation validates the product graph without a private clone, model/toolchain download, cameras or
inference. Distribution and physical-device/model acceptance remain separate from local graph/module validation.

### Explicit installed public services

`pnpm setup:services --workspace=<writable-root>` (optional `--core=<product-root>`) or the explicit `POST /api/plugins/setup-bundled`
installs/builds the public embedded graph in a fresh writable snapshot and explicitly activates that completed generation.
Discovery never installs. This does not install user/private packages or build native/device runtimes. Bundled managed
tools do not run ordinary user-package preparation as a side effect.

`build/services/s-<core-key>/services.json` binds canonical core/source, current input content and installed-tree membership/
stamps, with an exclusive PID/time lock. Dependencies and supported internal links must remain inside that snapshot.
Missing/building/failed/stale/foreign/linked state never silently falls back after local activation exists. Old reserved or
published service generations are retained; operation locking reserves a generation before service publication can race
working-cache cleanup. The panel remains available for explicit setup/recovery if service state is invalid. Existing
consumers retain prior snapshots; new service/tool requests do not execute the previous source while refresh is pending.
Input digests and installed-output membership/stamps have different integrity semantics; neither is a sandbox or license audit.

### Normal development and builds

Embedded apps use the normal Run, Dev server, Rebuild and Build/Publish actions. The existing
`POST /api/projects/<bundled-id>/rebuild-app` and `build-web` routes use their persistent effective sources.
Already-valid packaged output does not require setup; actions needing current source/builds prepare user-owned inputs.
The product's `embedded/package.json` must have `private: true` and an exact `pnpm@<version>` package manager, alongside
`pnpm-lock.yaml` and a packages-only `pnpm-workspace.yaml` containing `projects/*/*` and optional canonical projects/plugins
globs. Package manager configuration/hooks, nested workspace declarations, inconsistent package-manager versions and
external file/link dependencies fail preparation with a corrective diagnostic rather than installing an ambient workspace. Internal dependencies use `workspace:*`, `workspace:^` or
`workspace:~`. The project's declared package script must build a dedicated relative entry directory, not its source root.
Static projects need no build script; their user-owned output can be finalized into a checked generation.

The first writable action copies validated public inputs, excluding installed/generated/Git/common credential state,
into the durable tree described above. Later builds reuse it without discarding source edits. Frozen installation disables
dependency lifecycle hooks, validates installed link ownership and builds transitive local prerequisites before the selected
script. `XRB_CORE` selects core sources; workspace/package-manager/Git configuration is isolated to the working tree.
No user/private workspace packages are enrolled. Unsupported changes to package declarations/locks must be corrected
explicitly. These are cooperating-tool ownership guards, not an execution sandbox or confidentiality/export audit.

Successful output is finalized and copied into an exclusive immutable `r-<generation>/out` directory. Only that declared
output tree is served, not the working workspace or receipt. Receipts bind canonical core/project identity, embedded and
SDK/UI/build-helper/package-lock input content/membership, and output content/membership. Once local state exists,
missing/building/failed/foreign/stale/linked/changed output blocks new Run and unqualified preview without packaged
fallback. The metadata and detail view show the problem and relative recovery directory. Rebuild successfully to recover.

Cached browser URLs include `@r-<generation>/`; native launches pin the same output. Already-open cached pages keep their
assets during later rebuilds. Retained valid generation URLs remain explicitly readable even after a failed newer build;
they are never selected automatically as fallback. Product defaults and personal settings remain outside these caches.
Managed operations serialize through `<project-repository>/.xrb/embedded-locks/<scope>.lock`; active managed runs retain
the lease until idle. Legacy disposable snapshot builders retain their separate `build.lock`. Leftover locks require
verifying their writer stopped before manual recovery; they are never removed automatically. Durable working trees,
retained runtime generations and failed state are not automatically deleted.

After a pull or installation update, the next explicit project action automatically prepares current installed public
inputs in a new working generation. Browsing is read-only and shows no routine source-review banner or button. The
normal Run/preview/build/package/publication paths use refreshed sources and require current output; static apps are
finalized without inventing a compilation step. Shared SDK/build-input changes and static entry-file changes also trigger
refresh. The old `keep-working-sources` mutation returns 410: accepting a fingerprint alone cannot authorize stale code.

Version-two working state records a content/membership source baseline, separate from personal manifest overrides.
Upstream additions/changes/deletions are adopted, compatible actual local source edits survive, and name/icon/provider
choices, publication/deployment/signing identity, run defaults and recordings remain user-owned. Panel-generated static
favicon/card stamping is tracked by exact before/after hashes so it is not mistaken for a user edit. The logical project,
user section/archive placement and finalized-output namespace survive source-generation or installed-section changes.
Already pinned immutable output URLs remain readable; they are never selected as fallback for a new action.

Older state cannot prove which source files were edited. Its complete previous generation is retained and listed in
`state.json`'s `previous` recovery list; current installed sources and validated personal choices become the new working
generation. Unknown old source edits remain recoverable there, rather than being deleted or guessed to be installed
defaults. Nothing in source refresh authorizes cleanup of these generations.

A genuine conflicting source edit, ambiguous legacy source/build declaration, invalid manifest or unsafe/interrupted
state stops the attempted action with a specific recovery error. Correct conflicting working files to the intended
content (or carry your edit manually onto current installed code), then retry. The error identifies the preserved working
location when needed. Linked/hard-linked/foreign state is refused rather than reset; active project leases prevent refresh
until the consumer stops. Updates revalidate installed/working/personal inputs before atomic state replacement.

### Personal run settings

Normal project controls now own input/display/monitor/fullscreen/projection/camera choices. Provider selection still follows
ordinary enabled/available checks; saving a name does not install or enable it. Existing legacy personal settings remain
readable/validated before materialization and seed the effective manifest and run defaults exactly once. Afterward, edit
normal project settings (or Open JSON); the old run-settings API is not a second editor for an effective manifest.
The following legacy API/storage contract remains available for unmaterialized projects and retained user records.

Settings live in `<integration-workspace>/config/projects/<core-and-project-key>/run.json`, outside product source,
the separately selected project repository and disposable build caches. Missing fields inherit current product defaults
without creating or rewriting a file. New workspace templates ignore `config/projects/`; existing ignore files are not
automatically changed. Config records are bound to the canonical core/source and qualified project identity; copying one
between unrelated installations is refused. The API metadata includes the relative settings path for manual recovery.

`GET /api/projects/<bundled-id>/run-settings` returns `defaults`, `overrides`, effective `values` and `revision`.
`PUT` to that route takes `{ "revision": "<current-revision>", "overrides": { "fullscreen": true } }`.
`DELETE` takes `{ "revision": "<current-revision>" }` and writes an empty override set. The revision covers source
defaults and saved bytes: reload after a stale-editor conflict. Only the run-setting fields above are accepted; arbitrary
plugin configuration, raw host arguments, targets, paths, scripts and publication/signing state are not overrides.
Advanced choices use `providerSettings[provider] = { owner, schema, values }` only for actual selected native providers'
declared boolean/number/select fields. The server binds binary ownership, selected origin and schema, rejects text/secret/
path/recording-like fields, and validates ranges/enums. Unselected saved choices remain inactive rather than erased.
Changed ownership/schema blocks use without reinterpreting or rewriting saved bytes.
Explicit per-run options override saved values for that launch only, without changing the settings file.

Cooperating writers use an exclusive lock and atomic replacement. Invalid/oversized (over 8 KiB)/linked/foreign records
block Run and are never automatically reset or echoed in errors. Inspect the indicated user file to recover; stop panel
writers before editing it manually. A leftover `run.lock` requires checking that its writer stopped before manual recovery.
Changes are refused while the project runs/has an active job or while a launch is preparing. Browser and native launches
consume one settings snapshot; neither writes back to the bundled manifest.

## Explicit conservative working-cache maintenance

An embedded project's normal row menu offers **Review build cache** in a shared dialog. This does not change its workflow
card or require a copy. Durable `.xrb/embedded-projects/` sources are outside cleanup roots and cannot be selected as
obsolete build working generations; unknown effective runtime generations remain conservatively retained.

Bundled project details offer **Review working cache**. The Plugins sidebar has no global setup/cache controls or maintenance-status panel.
Explicit GET `/api/projects/<bundled-id>/cache` or `/api/plugins/cache` lists candidates and protected reasons without deleting anything. DELETE requires the exact
review revision, selected `generations` and `confirm: true`; the UI also asks for confirmation and starts an exclusive job.
Only obsolete, closed, explicitly owned `w-<generation>` working directories are eligible. Builder locks, receipt/marker
scope and complete-tree membership/stamps are rechecked, then an exclusive quarantine rename is revalidated before deletion.

Published project/host/native/service runtimes, reserved service work, current work, configuration, recordings, unknown/
foreign/incomplete state and Git/private/KEEP-marked trees are preserved. KEEP ancestors are checked within the selected
workspace and its owning task core, not unrelated filesystem ancestors. This never removes a worktree/private clone,
reclaims immutable runtimes, resets failed state, removes stale locks or automatically deletes data. Old unmarked caches
are not adopted for cleanup. Another writer/source change invalidates review and requires reviewing again.

## Desktop package content boundary

All panel packagers first receive isolated checked app/runtime/selected-plugin snapshots, not source/build trees, plus
portable selected-provider configuration and bounded identity. Static app-root packaging explicitly omits only root
project/package manifests; other prohibited content fails. WebXR adapters receive app/icon/identity only. The neutral
stager preserves explicit extra-asset inventories when a desktop adapter stages again. This constrains supplied inputs,
not what trusted adapter code can access independently.

The built-in desktop packager no longer recursively copies the whole host build directory. Its fixed Windows host/CEF
runtime allowlist includes runtime files, locale packs and license/notice text; tests, debug symbols/maps, old plugins,
packaged configuration and adjacent source/state do not enter the package. Only explicitly selected provider directories
are staged. By default those contribute root DLLs and license/notice text, not arbitrary neighboring files.

A plugin requiring additional distributable assets provides a bounded `xrb-runtime.json` beside its binaries:

```json
{ "version": 1, "files": ["example.dll", "dependency.dll", "models/runtime.bin", "LICENSE.txt"] }
```

Inventory paths must be portable, relative, unique and regular/unlinked. Source, history, generated/debug artifacts,
common credential state and escaped paths are refused even when declared. The built web tree is independently checked
for prohibited source/state/credential names and supported asset extensions. This is an operational package inventory,
**not** a confidentiality/license/export audit: reviewed content can still require separate redistribution approval.

The generated host configuration includes only selected providers; unselected plugin configuration is omitted. Raw host
arguments, recording state, sensitive configuration keys and machine-local paths are refused. Legitimate settings that
need private/machine-local resources must stay user-owned rather than be embedded into a portable package.

Staging reserves a new generation; existing caller folders are never recursively deleted. Copies are exclusive, regular
files, with input/output digests checked before/after copying. Staging membership/bytes are checked again around archive
creation. Completed ZIPs are atomically/exclusively published through a same-filesystem link, then the builder's temporary
link is removed; existing versions are not overwritten. Unsupported filesystems fail rather than publish partially. Failed
staging generations remain for review. No automatic package-cache reclamation is performed. Operational staging is
implemented; actual promoted adapters and full product/license/distribution acceptance remain separate.

Local acceptance creates/extracts a real public-core desktop ZIP and probes the extracted host's built-in providers without
activating a device. This does not claim production app display/hardware or redistribution/license acceptance.

## Native builds and providers

### Host cache and runtime selection

Managed host rebuilds use `<workspace>/build/native/h-<canonical-core-key>/b` for CMake output and publish an exclusive
`r-<generation>/` runtime snapshot after success. Host source, headers and pinned dependencies are read from the selected
core; no generated file is written into its host source/build tree. Native runs, provider queries, icon jobs, packages and
`pnpm host --tests` consume the same resolved runtime. A full build then builds selected plugins; core-only does not inspect
optional plugin metadata. Existing source-local developer builds remain usable before a local host rebuild exists.

The host receipt binds core/source identity, source/dependency-lock membership/stamps and the published runtime's file
membership/stamps. Deleting an older source marks a successful build stale; missing, modified, linked or foreign runtime
state blocks activation. These checks are not cryptographic signatures or a sandbox for arbitrary build code. Once cache
state exists, missing/building/failed receipts do not silently fall back to product binaries. Rebuild successfully to recover.
Changing source during compilation prevents successful publication. Working trees and receipt/runtime paths reject links
and hard-linked writable files; a user cache cannot be created in core source/dependency directories.

Published snapshots are never overwritten by a later rebuild, so consumers already handed a runtime path retain stable
files even when a separate CLI rebuild starts. Old snapshots, incomplete copies and CMake reset folders remain for inspection;
automatic cache reclamation is not implemented. Exclusive cross-process builder locks live above the CMake tree, record the
writer PID/start time, survive tree resets and require verifying that the writer stopped before manual stale-lock recovery.
Panel-managed rebuilds still refuse overlapping native launches and package/icon jobs. Product-side legacy plugin folders
remain untouched; cached legacy plugin folders are preserved outside the published runtime rather than activated.

Direct developer CMake commands and the low-level `hostPaths`/`hostFreshness` helpers retain their source-local meaning.
Standalone app-icon tooling accepts `--runtime` for an explicit runtime; the panel passes the resolved path automatically.
These developer defaults are not the installed-product rebuild path. Neutral adapter staging is implemented; complete
promoted-product installation/distribution/license and device acceptance remain pending.

### Plugin outputs and provider probes

Native plans include only enabled, unambiguous plugins by default. The rebuild CLI supports `--core-only` to skip all
optional plugins, `--plugins-only` to leave the host/product tree untouched, and `--include-disabled` for an explicit
rebuild of disabled plugins. Core-only and plugins-only are mutually exclusive.

Workspace plugins retain their source-local `build/`, `runtime/build/` and `bin/` paths. Embedded plugin output uses
`<workspace>/build/native/b-<core-and-source-key>/`: `b/` and `r/` are short CMake build directories, `bin/` is runtime
output. Compact paths avoid MSBuild compiler-check path-length failures. Workspace plugin state uses a separate
`build/native/w-<source-key>/` slot so CMake cache resets cannot move its lock or build receipt.

The receipt binds output to the canonical core and plugin source. During a rebuild, or after failure, partial binaries
are unavailable. A failed/mismatched cache does not silently fall back to packaged output; rebuild successfully to
recover. Before any local rebuild exists, an embedded plugin may use its packaged `bin/`. Existing build locks are
not automatically deleted: verify that the previous process stopped before recovering a stale lock. Output trees
and their parents reject links/junctions. Source freshness and runtime/package paths use the selected artifacts.
Panel-managed native rebuilds cannot overlap package/icon jobs or a starting/running native app.

The panel probes the core and each selected native binary root independently. It rejects reserved built-in names,
duplicate role/name claims, cross-root package-name collisions, rejected DLLs and paths outside their owning root.
Only validated roots are passed to the host; invalid plugins do not silently win by scan order. Query caches include
binary tree membership, not only the newest timestamp. Legacy output next to the selected host blocks managed discovery;
a managed core rebuild publishes a clean cached runtime without deleting product-side files. The standalone host CLI's own search policy is unchanged.

`test/native-build.fixture.ts` in the control-panel package is an explicitly run Windows compiler smoke test, separate
from the fast test glob. It builds a synthetic cached host and plugins from both origins against synthetic SDK/dependency headers;
it requires no private source, runtime download, native device or production configuration.

## Delivery boundaries

Engine and approved embedded modules use the public core PR. Private-only work uses a private PR without an empty
public PR. Paired work has separate PRs and a private/local handoff recording tested revisions and dependencies.
Public source promotion requires an exact reviewed allowlist, confidentiality/license checks and explicit export
approval. Never import private Git ancestry or publish private inventories, client material, credentials or binaries.
The independent-clone, linked-worktree and KEEP preservation rules remain unchanged.

`pnpm task:repos <route|provision|inventory|record|verify> --config=.artifacts/repositories.json` uses bounded ignored
local configuration with explicit affected paths and expected remotes. Core/embedded paths route public; `.xrbuild/`
paths route private; paired work retains separate owners. Case/path aliases are rejected. `provision` is explicit and only
needed for private/paired scope; it creates an independent task clone with separate Git/object/LFS storage and a typed
branch, refuses existing/shared destinations, and requires private instructions before edits. It never stages, exports,
pushes, creates PRs, merges or cleans repositories. Git routing overrides/hooks cannot redirect task operations.

Inventory and tested records are create-only ignored files (`--record=` chooses a fresh name). Tested attestations bind
both HEAD and dirty/untracked work fingerprints; changed work or an unmet required core revision fails verification.
`requiredCore` must be reachable from both the observed `origin/main` tracking ref and the selected task core HEAD;
private-only dependencies also bind that tested core. This is a local handoff, not proof of fresh remote CI/PR policy. Public summaries omit private identifiers; private policy/delivery stays manual. Delivery still
requires explicit authorization and actual remote dependency checks. Task-private compatibility is tested separately in its independently provisioned clone; the public routing/provisioning matrix uses disposable synthetic repositories.

`openspec/changes/bundled-extensions/prerequisites.md` records predecessor synchronization order. Canonical synchronization/
archive remains the repository bot's delivery gate; older active changes are not overwritten or manually finalized.

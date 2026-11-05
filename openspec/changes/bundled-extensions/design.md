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
    third_party/           reviewed public dependencies only
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

When bundled and external plugins claim the same identity, do not silently override or merge them. Report the conflict and disable the ambiguous integration until the selected workspace explicitly chooses an origin. That choice selects the whole plugin consistently across metadata, tools, provider binaries, packagers and publishers; it cannot select metadata from one copy and execute the other. Preferences and cached results include the resolved origin.

The standalone host's existing `<exe>/plugins` then `--plugin-dir` search and duplicate diagnostics stay intact for packaged apps/direct CLI use. The panel validates conflicts first and passes only the selected roots; it must not rely on incidental filesystem order. Test collisions by folder ID, service ID, runtime role/name and route, including distinct folder names advertising one provider.

## D3. Bundled apps are product sources, not user folders

The panel presents a Bundled catalog alongside editable workspace projects, with source/ownership visible. Use origin-qualified catalog keys so a bundled app and user app with the same folder name remain distinct. Legacy user project IDs remain readable.

Ordinary panel operations must not rename, archive, delete, rewrite manifests, change icons, or persist publication receipts in bundled sources. Provide an explicit copy/import action to create an independently editable workspace project. New user apps always start from `templates/app` in the selected writable project root. Agent changes to bundled source happen only in the linked core worktree through core delivery.

Keep product defaults in bundled manifests; store user overrides, layout preferences, publication identity/state, signing references and recordings in the selected writable workspace/project-state root. Keep application identity separate from catalog identity: publishing a copied template must obtain its own identity and cannot inherit a production deployment or signing identity.

Bundled apps have packaged/prebuilt output for normal use. Development builds use task-local output; any ordinary-user rebuild must use an explicitly writable output/cache root, not modify an installed core or require a private clone. Preserve preview, icon generation, launcher inventory and separate-project-root behavior for both catalog origins.

The existing UI library remains in `packages/ui-kit`; only its demonstration app is a candidate bundled app. A starter example and the default template must have a canonical generation or consistency check rather than drift as two hand-maintained copies.

## D4. Build, dependencies and package ownership

The embedded workspace has its own package/workspace manifests and lockfile, tracked by core Git; external workspaces retain the equivalent independent package/install structure. Core setup/build/test entry points orchestrate the embedded install explicitly rather than enrolling two nested pnpm workspaces under overlapping globs. `.xrbuild` remains excluded from public/core package discovery and CI. User extension installation is opt-in against the explicitly selected user workspace. Every task's private clone has independent Git/LFS storage; do not share workspace source or private generated outputs by junction.

Native build orchestration accepts resolved bundled/workspace projects and passes correct SDK/core-dependency/plugin-dependency/output roots. Host freshness, provider discovery and packaging all refer to the same selected binaries. The public core-only build does not eagerly build optional device/toolchain-dependent modules. CI has explicit bundled-module jobs that cover approved modules and mocks without private hardware/software.

Public dependency locks may contain only reviewed redistributable dependencies. Restricted runtimes/models/calibration/device adapters remain private and are consumed via optional contracts, never copied into public `third_party` or downloaded with private credentials in public CI. Package artifacts contain only selected plugins and distributable runtime files, not entire source roots, Git metadata, credentials or workspace state.

Test public-only, public plus an empty ordinary workspace, public plus an independent private fixture, a distinct project repository, and a read-only installed product. Both source layouts must behave without fixed machine paths.

## D5. Promotion is an audit, not a bulk move

Candidate roles include local/web publishing components, a generic headset packager and synthetic/browser hand diagnostics. The maintainer's project scope is all existing non-client projects, including archived examples and diagnostics, not only currently active apps. Client-facing projects, their assets, source/reference documents and deployment identities remain exclusively private. The maintainer has confirmed the client-project mapping privately. That entire project and related assets are excluded from the export inventory; a neutral folder name is not evidence of public eligibility. Any further uncertain client-owned material remains blocked until clarified. Preserve each project's section/archive placement rather than silently unarchiving it. This destination intent is not approval to expose current folders without the export audit.

Plugin triage: the local publisher and publisher selector are straightforward candidates after state/path separation; the production publisher requires external deployment configuration and disabled-until-configured behavior; the headset packager requires neutral metadata and workspace-owned signing/publication configuration; synthetic/browser hand functionality is a candidate only after separating and auditing the native sensor bridge, distributed runtimes and model assets. Restricted display, tracking and station integrations remain private. Plugin-owned sample projects follow the audited plugin/component boundary rather than being duplicated into the global project catalog.

Project promotion must replace private provider defaults with portable defaults or explicit optional capability selection, preserve optional external-provider support through user overrides, and remove machine monitor selections, deployment UUID/routes, prior packaging state, recordings and private fixtures from the export. Hardware-dependent diagnostics must clearly report unavailable capabilities or provide explicit synthetic/replay test modes; they must not require private software simply to load the embedded catalog.

Create a private per-module inventory of source, dependencies, binaries, model assets, tests, deployment identifiers, rights/notices and private coupling. Review current publisher configuration, application publication identity, native sensor bridges and runtime bundles particularly carefully. A generic frontend may be promotable while its device adapter remains private. Deployment configuration and credentials remain workspace-owned even when publishing logic becomes bundled.

For each module: obtain approval of the exact export allowlist/revision, extract only reviewed working-tree contents into task-local staging, normalize public identifiers/configuration, audit contents and assets, and run focused tests. Never cherry-pick or merge private history into the public repository. Verify the public commit closure before its first push; name-guard success is necessary but not sufficient.

Deliver core discovery support before retiring any private copy. Old private copies can coexist only with explicit origin selection and a clear migration diagnostic. Remove or retire a private copy in its own PR after public availability and paired compatibility tests; preserve local overrides and rollback. Do not blanket-delete a workspace folder to resolve a duplicate.

## D6. Agent entry and coordinated delivery

Root `AGENTS.md`, `.claude/CLAUDE.md`, OpenSpec context and the delivery skill state the layout and routing table. Private root instructions remain authoritative for that independent repository and must be loaded when provisioned. Public-only tasks must not prompt for or clone private source unnecessarily.

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

## Delivery stages and review gates

1. Review this architecture and routing policy. No private source copied or automation enabled in this stage.
2. Implement/test generic two-origin support and core session instructions in the public PR. Reconcile pending split specs through normal bot finalization and prevent older deltas from overwriting the approved new model.
3. Review export inventories privately; promote only approved modules with their public tests/notices and private compatibility/retirement companions. Each source export has an explicit public-push gate.
4. Deliver private instructions/CI and trusted app-merge policy separately; validate policy fixtures without live changes. Activate hosting only after separate approval and verified enforcement.
5. Exercise a public-only task, private-only task and cross-repository task, including blocked/error paths. Record manual/device gaps rather than marking them passed.

## Open decisions for the maintainer

- Confirmed by the maintainer: tracked `embedded/` and the selected user workspace use the same `plugins/`, `projects/`, dependency, manifest and configuration structure. Project migration includes all non-client projects; the excluded client-project path has been confirmed and is recorded only in the local/private migration inventory. Bundled-source read-only behavior in normal panel use and explicit copy-to-workspace editing remain part of the proposed UX.
- Approve explicit origin selection for duplicate integrations instead of automatic workspace override.
- Approve the narrow private app auto-merge lane; retain manual review for native plugins, publishing/signing policy and infrastructure.
- Approve each module's audited public export separately. Some requested candidates may remain partly private until dependencies, identifiers and redistribution rights are resolved.

# Proposal: bundled and workspace extensions

## Why

Starting an agent in the core checkout should be enough to work on the product, bundled modules, or an authorized private workspace. Today every concrete plugin and product app is workspace-owned, discovery assumes that location, and an agent must manually coordinate independent repositories. This makes product modules harder to deliver and ordinary private app development unnecessarily manual.

The repository split remains intact: public product code and private/user material have different owners. The missing distinction is between the generic engine and the larger public distribution, which may include reviewed first-party plugins and apps without embedding integration-specific branches in the engine.

## What changes

- Add a tracked `embedded/` workspace in the public repository with the same root-relative structure and manifest schemas as a user workspace: `plugins/<id>/`, `projects/<section>/<id>/`, `third_party/`, package/workspace manifests and default panel/plugin configuration. Both plugins and projects have embedded and user-defined origins. Projects may be product apps, examples, diagnostics or tests. Keep SDK/UI libraries in core `packages/` and project templates in core `templates/`. Identical structure does not mean shared contents, Git history, installed packages or mutable user state.
- Preserve external extensions in the selected workspace's `plugins/` and `projects/` trees. Repository development may select an independently cloned, ignored `.xrbuild/`; ordinary user workspaces need not be Git repositories and retain existing resolution.
- Introduce shared origin-aware discovery for native providers, packagers, publishers, tools, samples and apps. Define identity, collision handling, build/output ownership, preferences and catalog behavior consistently across both origins.
- Keep extension navigation minimal: lowercase embedded/custom origin labels, unclipped sidebar selection/focus, explicit maintenance through CLI/API rather than global Plugins buttons, and bounded same-workspace idle-only recovery for genuinely stale managed tools without a dead-end Retry card. Unrelated preference refreshes retain unchanged tool implementations.
- Consolidate local and production publication into one embedded publisher plugin. Embedded publisher/headset configuration lives in the selected user's workspace and is created from safe defaults only when missing, never overwriting existing settings.
- Fetch reviewed public hand-tracking dependencies into core `third_party/` with reproducible pins and required notices; do not equate open-source intent with approval to copy current opaque binary payloads.
- Use lowercase `projects/unsorted/` consistently in both roots and related code, templates, tests and documentation; no migration or legacy-compatibility logic.
- Document session-start routing and coordinated delivery: one task/session, isolated worktree, independent private clone when required, changes committed/pushed only to their owning repository, and one combined private/local handoff. Cross-repository work still has separate PRs.
- Propose opt-in private app delivery automation owned by the private repository. Trusted automation may merge qualifying private app PRs only after separate policy/setup approval and exact-head checks; agents never merge or push main. Core implementation PRs remain maintainer-merged.
- Inventory candidate module promotions privately. Export only maintainer-approved, audited source snapshots and redistributable assets; do not import private Git history, deployment settings, signing material or private dependencies into public history.

## Capabilities

### New

- `bundled-extensions`: two extension origins, coherent discovery and isolated state/output, public module promotion and credential-free bundled validation.
- `coordinated-delivery`: deterministic repository routing, task-scoped delivery authorization, private/local coordination and a separately governed private app automation lane.

### Modified

- `plugin-host`: distinguish generic engine sources from separately built bundled plugin modules while preserving existing ABI and standalone host discovery behavior; define bounded, same-panel managed-tool recovery without forced interruption of active work.

## Impact and boundaries

Affected areas include panel discovery/catalog/build/publication/tool code, native plugin build orchestration, dependency tooling, pnpm membership, CI path selection, templates, session instructions and delivery tooling. The private repository requires its own companion changes for instructions, module retirement, CI and merge policy. No private code, repository URL, PR number or deployment identity belongs in public planning artifacts.

This is a plan-only change. Existing rules continue to apply until implementation is approved and delivered. No module is copied or published, no hosting setting is changed, no PR auto-merge is armed, and no cleanup guard is weakened by this proposal. Private companion setup and hosting activation need separate approval. Pending split-spec synchronization must be reconciled through the normal finalization process, not overwritten or manually declared complete.

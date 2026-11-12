## Context

`readLayout()` in `packages/control-panel/src/layout.ts` combines selected project folders and embedded logical placement but deduplicates section names with exact spelling and excludes the reserved Unsorted name case-sensitively. `renderProjects()` in `packages/control-panel/ui/app.js` renders every returned named group, including empty ones, then derives another Unsorted group from unplaced projects. This can expose multiple visually identical headings.

Desktop dev launches already receive `xrb-panel` through `HostRunner`. However, `server.ts` grants catalog/preview read CORS to `https://app.local` only; loopback development origins are currently admitted only for preview projection reads. Browser dev previews receive `xrb-preview-panel`, not the catalog context read by Launcher. Launcher can consequently attempt publication inventory at a development server instead of displaying selected-panel apps.

## Goals

- One origin-independent section per logical name, no empty section headings/placeholders in the normal sidebar.
- One trailing Unsorted group when there are unplaced active projects.
- Browser and Desktop development Launcher runs use the selected panel library in sidebar order, without production inventory availability.
- Preserve qualified project identity, working sources, saved item order, revision checks, archive behavior and immutable installed embedded sources.

## Decisions

### 1. Normalize grouping at the layout boundary

Use the existing case-insensitive section-name semantics consistently when excluding reserved names, combining section candidates and assigning projects. Keep origin-qualified IDs intact: merging headings must never merge apps with identical display names. Preserve saved section/item ordering; derive remaining order deterministically. Keep Unsorted outside named layout sections and derive it once from unplaced projects.

Do not delete layout entries or folders solely to hide an empty group. Rendering filters empty groups while retaining their original layout indices for rename, move, reorder and context-menu operations. Preserve the existing new-section naming dialog and inline rename interaction as temporary editing states; once editing ends, an unoccupied section is hidden. Do not remove stored empty sections while saving an unrelated drag operation.

The shared effective layout remains the source for Launcher ordering; do not add an embedded-only list or another independent ordering rule.

### 2. Carry explicit local catalog context in all panel-owned previews

Use the existing `xrb-panel` contract for panel-owned Browser dev previews as well as Desktop dev/built runs. Identify the current local project through explicit preview/project context rather than relying on a deployment identity that unconfigured embedded apps may not have. Validate loopback panel URLs, exclude the current Launcher by stable project identity, and preserve all other eligible projects.

Treat an explicitly panel-bound run as local even when its page is served at a different dev-server port. Keep packaged/published runs without this context on publisher inventory. Avoid silently substituting an unrelated published library when a bound panel library cannot be read; report the local error and use the existing refresh behavior to recover.

### 3. Bound cross-origin reads

Extend the current catalog/icon/preview read allowlist to clean HTTP(S) loopback development origins. Keep `https://app.local` support. Reflect only validated allowed origins with `Vary: Origin`; never use wildcard origins or expose mutations/general APIs. Preserve Host validation and same-panel mutation checks. Test rejected remote/malformed origins and write requests as well as successful catalog/icon/preview reads.

### 4. Verification

Use synthetic public fixtures only. Cover mixed-origin named sections and Unsorted, case variants, an empty saved section, no active projects, archive/unarchive, reload and drag/context-menu index correctness. Exercise Browser/Desktop and dev/built launch context, Launcher self-exclusion and ordering, and HTTP origin restrictions. Run focused changed-code tests, strict TypeScript checking, the name guard and strict OpenSpec validation after implementation. A real native Launcher run is separate maintainer acceptance; do not restart an active panel or claim native acceptance from fixtures.

## Non-goals

No private workspace edits/provisioning, private data export, source migration, installed product writes, publication changes, plugin-specific engine branches, host rebuild or automatic running-process restart.

## Risks

- Filtering groups before assigning indices can make context menus or drag/drop target the wrong section; retain original indices and test gaps.
- Unsorted case normalization must not rename/move existing folders during read-only discovery.
- CORS must remain a bounded read surface, not general loopback write authorization.
- New section editing must stay usable even though completed empty groups are hidden.
- Current-project identity must remain stable for generation-pinned previews and unconfigured embedded Launcher projects.

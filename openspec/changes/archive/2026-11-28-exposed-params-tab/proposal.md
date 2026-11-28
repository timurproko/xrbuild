# Proposal

## Why

Launcher already consumes UI Kit components and accepts a live scene theme prop, but its users cannot select that theme through project settings. A small declarative exposed-parameter contract will make library choices available without bespoke panel controls or changing app rendering ownership.

## What Changes

- Add typed, data-only library parameter declarations and explicit consumer references; UI Kit initially exposes only a Theme choice sourced from its registered themes.
- Add one conditional Components tab immediately after the existing Develop tab (the brief's Developer settings tab), grouping declared parameters by library and reusing existing tabs, rows, labels and selects without other visible changes.
- Persist selections in the consuming project's ordinary settings, including existing user-owned bundled-project state, and bind Launcher selections to its existing scene theme prop. Apply live on existing live-settings paths and otherwise at next start.
- Preserve app defaults, theme/control implementations, state continuity and the sole SDK runtime. Do not add hints, messages, banners, buttons, confirmations or Theatre integration.
- Add focused contract, settings and runtime tests and capture before/after panel and Launcher proof for Default and Chamfer in the task output folder after implementation approval.

## Capabilities

### New Capabilities

- `app-library-parameters`: Declarative discovery, conditional per-project editing, project-scoped persistence and runtime delivery of consumed component-library parameters.

### Modified Capabilities

- `ui-kit-themes`: Permit explicit per-project panel selection while retaining unchanged defaults, scoped props/providers and no selector inside app scenes.

## Impact

- Shared serializable parameter types/validation and project manifest/discovery metadata; no runtime evaluation of app bootstrap during discovery.
- Control-panel project detail tabs, existing settings writer/API, bundled-project effective settings and supported runtime-settings transport.
- UI Kit theme registration metadata and library declaration, Launcher consumer metadata and runnable entry binding to its existing theme prop; optional UI Kit self-consumption only if the same path requires no special UI.
- Documentation in `docs/app-components.md` and affected app guides; focused tests beside current panel settings and component/theme tests.
- No private workspace changes, dependency additions, new renderer, theme redesign or control behavior changes are planned.

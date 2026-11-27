# Proposal

## Why

Apps need a reusable component layer without replacing the SDK's stereo, managed projection, WebXR or hand-interaction runtime. This foundation enables apps to export their authored components for build-time reuse, beginning with Hello Cube, while leaving existing vanilla apps intact.

## What Changes

- Add an opt-in React 19 / latest stable React Three Fiber 9.x bridge using a custom root attached to the SDK-owned scene, renderer and managed camera; the SDK remains the only animation-loop and final-draw owner.
- Add a small, explicitly documented React mounting API and hooks for SDK access, frames, hands, SDK-picked pointer handlers and existing interaction targets, including Strict Mode, HMR and disposal behavior.
- Rebuild only the embedded Hello Cube sample as React components, with separate executable and side-effect-free component-export entries, preserving its exact existing appearance and behavior, interaction, framing, relative base, icon entry and output layout. This is an under-the-hood re-architecture only: no app receives visible UI or behavior changes.
- Add focused bridge/sample regressions and documentation covering projection, stereo, WebXR transitions, picking, teardown and source-alias component consumption, including matched before/after pictures against the vanilla Hello Cube baseline.
- Do not migrate the template, UI Kit or other samples; do not add themes, application settings, panel UI, an editor or another XR runtime.

## Capabilities

### New Capabilities

- `app-components`: Optional reusable application components hosted by the existing SDK runtime, with shared frame, input and lifecycle behavior and separate run/export boundaries.

### Modified Capabilities

None. Existing hand-input and launcher-return contracts remain unchanged.

## Impact

- New optional `packages/react` source package, SDK frame/input extension points in `packages/sdk`, and their focused tests; vanilla SDK imports do not acquire a React dependency.
- `embedded/projects/archive/hello-cube` source, package metadata, Vite configuration and tests; core and embedded manifests/locks are updated only for the opt-in dependency graph.
- Root production type-check configuration covers the new public bridge and JSX where necessary; isolated embedded build-input tracking includes the new bridge without changing panel UI or workspace ownership.
- SDK/root/development documentation explains new APIs, resource ownership, source aliases and verification limits. No native ABI, provider, private-workspace or runtime module-sharing change.

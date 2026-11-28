# Proposal

## Why

UI Kit already separates several default mesh builders from input, but apps cannot choose a coherent mesh style. A complete second theme, used by both the showcase and Launcher, will establish a real geometry/material contract and a small app-selection seam for later settings work without changing today's default appearance or interaction.

## What Changes

- Introduce a complete typed UI Kit theme contract for every control, variant and visual primitive: geometry builders, materials, state colours and typography, with explicit resource ownership and fixed interaction/layout anchors.
- Extract the current look as the `default` theme without intentional rendering changes; preserve existing constructors, exports and React-free imperative imports.
- Add `chamfer`, a coherent satin graphite/ivory style with clipped corners, crisp bevels, inset faces, faceted round controls and restrained blue accents; it is a mesh redesign, not a palette substitution.
- Add scoped `UiKitThemeProvider` selection and per-control overrides, plus imperative construction options and `setTheme`. Runtime switching replaces owned visuals in place while retaining values, targets, held interactions and app state.
- Declare a side-effect-free `uiKitTheme` default in each consuming app (`defaultTheme: 'default'`). UI Kit and Launcher expose a theme prop and inherit a surrounding provider; their run entries apply their own declared default. The later settings task can supply the existing prop/provider value without a settings registry now.
- Cover both themes with focused contract, lifecycle, input and consuming-app regressions; retain deterministic default-picture comparisons and a reviewable second-theme picture/state matrix outside source control.
- Update package/app reuse guides. Add no selector UI, messages, buttons, control-panel code, exposed-settings declarations, persistence, template migration, other samples or Theatre changes.

## Capabilities

### New Capabilities

- `ui-kit-themes`: Complete mesh themes, bounded visual variation, scoped app selection and owned runtime visual replacement.

### Modified Capabilities

- `app-components`: Clarify that current appearance is preserved for the default theme, while an explicitly selected theme can change visuals only; preserve all existing SDK, app composition and interaction guarantees.

## Impact

- `packages/ui-kit/src/`: theme types/registry and builders, existing visual helpers, control colour updates, primitive styling, visual resource ownership and optional React adapters/provider.
- `packages/ui-kit/test/`: contract/geometry and lifecycle tests, plus both-theme mouse/hand-only replay using existing SDK fixtures and projection paths.
- `embedded/projects/core/{ui-kit,launcher}/`: public theme/default declarations, scene props/run wiring, app/component/build regression tests and guides. Launcher continues to consume UI Kit's public app export.
- `packages/ui-kit/README.md`, `docs/app-components.md` and the two app guides describe theme use, authoring constraints and disposal.
- No new rendering/input runtime or dependency is planned. Deterministic captures and disposable build/browser output stay in the task evidence folder, not the repository.

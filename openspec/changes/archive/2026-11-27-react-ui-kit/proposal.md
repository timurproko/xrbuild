# Proposal

## Why

The SDK-hosted React foundation is merged, but UI Kit, Launcher and newly generated apps still construct their scenes imperatively. Make UI Kit the first runnable component library and Launcher its first real build-time consumer, without any visible or behavioral change.

## What Changes

- Add optional React components for every public UI Kit control and visual primitive, including a reusable Board surface, using thin adapters over existing imperative classes rather than rewriting their input or animation logic.
- Add backward-compatible control listener removal and explicit owned-resource cleanup; component lifetimes attach/detach SDK targets, update once per SDK frame and release subscriptions, captures, audio and graphics resources.
- Rebuild the UI Kit showcase with separate run and side-effect-free public component entries; export its controls for other apps to import at build time.
- Rebuild Launcher from that public UI Kit app component export, preserving catalog loading, paging, tilt, reveal, icon loading, launch timing, return/projection URLs and explicit XR entry.
- Generate React apps from the canonical template with the same run/export shape, identical text scene, icon and notices. Existing generated/user apps and non-migrated imperative consumers remain supported.
- Document source aliases, deduplicated dependencies, ownership and cross-app component reuse. Isolate default visual construction from adapters/behavior so later themes can replace geometry/materials as well as colours; use ordinary component props without implementing themes or exposed settings.
- Preserve full deterministic verification: before/after pictures for all three apps in mono perspective, orthographic and stereo; icon/production builds; every control exercised by mouse and hands, including Mouse-off and stereo hand picking.

## Capabilities

### New Capabilities

None; extend the existing app-components contract rather than creating a parallel component capability.

### Modified Capabilities

- `app-components`: Add React UI Kit lifetimes and parity requirements, make the showcase and Launcher run/export component apps, and adopt the component shape in newly generated templates while preserving existing vanilla compatibility.

## Impact

- `packages/ui-kit`: optional React entry, control subscription/disposal APIs, default-visual construction boundary and focused lifecycle/interaction tests; preserve the imperative root entry and appearance.
- `packages/react`: reuse existing SDK hooks and lifecycle; extend focused regressions only where needed, without another runtime or input manager.
- `embedded/projects/core/ui-kit`, `embedded/projects/core/launcher`: TSX composition, component exports, aliases/dependencies and migrated behavioral contracts/tests; retain manifests, relative assets and standalone icon output.
- `templates/app`: React bootstrap/export scene, Vite/dependency configuration and focused generated-project checks; no control-panel UI changes.
- Owning core/embedded locks and strict JSX/type/build-input boundaries where required; README and developer/package/app documentation.
- No native ABI/provider change, other sample migration, theme implementation, app-settings registry/tab, editor, alternate XR framework or runtime module sharing.

# Proposal

## Why

Rebuild failed on a hand-mesh plugin whose CMake project builds a standalone program instead of a host plugin DLL. Hand-mesh layers reported Ready while their runtime was missing, stale or bound to an older plugin version, and then failed with a generic message. Installing a licensed model archive or a Python tool needed manual commands, and each plugin provisioned Python its own way.

## What Changes

- Native rebuild and its freshness check skip plugins that declare a hand mesh; their programs are built by their own setup.
- The hand-mesh layer card shows a Prerequisite state while setup is missing: only Install, and the setting that asks for an optional runtime, stay active.
- Discovery compares a prepared runtime with the current plugin source, so a plugin update shows as a setup step. Install re-checks an installed runtime and re-binds it without downloading, through the plugin's optional `refresh`.
- A setup plan can name a local file (for example a licensed archive) that the Install dialog asks for with a design-system file picker. The panel copies it to a private user folder for that install only.
- Core provisions plugin Python: a plugin declares an exact Python and hash-locked wheel sets in its manifest, and core installs them with one pinned uv, either as a reusable environment or inside the plugin's own runtime folder covered by its receipt. The downloads join the same consent plan.
- The setup dialog keeps long messages within its width.
- Plugin and layer on/off switches share one behaviour: they move and lock on click, show the requested state at once and unlock when it is confirmed.
- The SDK mesh client holds each hand's latest valid mesh, compensated to the current pose until it ages out, so processors that skip repeated samples no longer flicker.
- The app library parameters tab is named Settings and comes last; UI Kit gets its own Settings tab to choose the theme it runs with.
- UI Kit's Chamfer style is replaced by Accent: solid accent controls with soft fillets and a satin finish, white ink on control bodies and a slider that fills inside its dark channel with a half-accent fill.
- Hands keeps Start clickable when only the provider choice blocks it and explains the reason in a toast with Open Setup.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `control-panel`: native rebuild scope, core-provisioned plugin Python and confirmed plugin switches.
- `hand-postprocessing`: layer-card prerequisite state, stale-runtime setup and re-check, and local setup files.
- `hands-module`: Start explains why it cannot run.
- `app-library-parameters`: the Settings tab name, position and library self-consumption, and Accent as the second theme choice.
- `ui-kit-themes`: Accent replaces Chamfer as the second built-in style.

## Impact

- `packages/control-panel/src/host-build.ts`, `hand-mesh-runtime.ts`, `hand-mesh-plugins.ts`, `hand-mesh-setup.ts`, `plugin-manager.ts`, new `python-env.ts`, and the setup routes in `panel.ts`.
- `packages/control-panel/ui/hands-postprocessing.js`, `hands-mesh-setup.js`, `hands.css`, `design-system.css`.
- Plugin manifests may declare `python`; setup modules may return `input`, `python` and export `refresh`. Existing plugins without them are unchanged.
- Python environments live under the user's `~/.xrbuild/python`; nothing is written to a workspace or repository.

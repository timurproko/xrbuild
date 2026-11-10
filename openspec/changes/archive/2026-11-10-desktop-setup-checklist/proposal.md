## Why

Rebuild currently starts a job before detecting missing desktop prerequisites, so a new user sees an opaque CMake error rather than actionable setup. Show a scoped checklist and offer explicit background setup instead.

## What Changes

- Check the core desktop build toolchain, pinned native libraries and host runtime before rebuild, with Ready, Missing, Installing, Blocked and Restart required feedback.
- Offer one grouped Build tools installation/repair action through the system package manager or a verified official signed-installer fallback, and pinned native-library fetching into isolated user-owned generations. Keep CMake/compiler/SDK checks compact under that header without repeated installation instructions. Require explicit download/license/elevation consent; never run arbitrary browser-supplied commands, auto-install during browsing or reboot the machine.
- Reuse the shared progress modal and Jobs output, recheck prerequisites after each action, retain failures/retry guidance and keep rebuild a separate explicit action.
- Expose System/Light/Dark in core settings as an immediate browser-local appearance preference. Promote the isolated preview into a reusable Design gallery at /design with a default Main shared-component catalog and a separate Install dependencies case, compact plain scenario navigation and a plain dimmed backdrop; use the standard XR Build Design product header and expose its built-in app-menu link only in Dev/repository launch mode. Remove the subtitle, visible Cases label and separate View/Theme/Width/Reload controls.
- Keep the gallery shell's shared explicit Restart/Rebuild menu separate from simulated case interactions. Use /hands/ for the plugin-owned diagnostic route, retaining safe local redirects from old URLs without changing provider IDs or stored state.
- Keep browser-only use independent of native setup, and keep optional plugin prerequisites outside generic core system installation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: scoped desktop prerequisite checklist, explicit background setup and restart-aware progress.
- `plugin-host`: managed host builds may consume checked user-cached core dependencies without mutating installed product sources.

## Impact

Core panel setup/detection, background job coordination, shared rebuild UI, pinned dependency output routing and the host's dependency-root option. No private workspaces, plugin-specific installers, device/model setup, export or runtime distribution. The maintainer approved this extension in the same PR #6 after the already bot-finalized menu and lazy-workspace changes. The maintainer also requested the follow-on core theme control and reusable design-system gallery during visual review. Tests use synthetic tools/installers and disposable worktree-local storage; no actual system installer is run by the coding agent.

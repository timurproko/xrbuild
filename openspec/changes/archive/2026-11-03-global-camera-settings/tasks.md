# Tasks

## 1. Workspace-global Camera settings

- [x] 1.1 Add bounded, versioned `xrb-settings.json` persistence for camera policies keyed by combined Platform choice, resolving missing entries to Perspective and retaining saved unavailable choices; verify with control-panel tests for missing files, valid overrides, invalid/oversized input, disabled choices and a newly discovered choice.
- [x] 1.2 Add `/settings/` to shared navigation and implement the global Settings page with a Camera section, channel selection, Perspective/Orthographic control and mono-versus-stereo guidance; verify with navigation/UI tests and a browser check at wide and narrow layouts.
- [x] 1.3 Add settings GET/PUT APIs with local-origin protections and atomic saves that omit default-only entries; verify with server tests for read, update, rejection and no-op default persistence.

## 2. Distribution-aware app builds

- [x] 2.1 Resolve the selected project's combined distribution choice and camera policy for every build/dev invocation and expose the bounded build context to the app toolchain, defaulting to Perspective outside the panel; verify with panel tests that inspect native, standalone WebXR, plugin-platform and direct-terminal environments.
- [x] 2.2 Record the resolved camera context in successful build receipts and make changed global policy invalidate prior output before Run, package or publication consumption; verify with build-finalization tests that unchanged policy reuses output and a projection change triggers the normal rebuild path.
- [x] 2.3 Make global settings refresh and errors visible without changing project manifests or restarting the panel, while requiring a running dev server to be restarted for a new policy; verify with UI/API tests and a browser save/reload check.

## 3. Managed app camera runtime

- [x] 3.1 Add an SDK app runtime that owns Xrb creation, Perspective/Orthographic camera construction, resize handling, animation-loop rendering and cleanup while exposing scene/Xrb/camera setup and frame hooks to app content; verify with SDK tests for defaults, app framing options, hook order, resize and disposal.
- [x] 3.2 Generalize SDK rendering so an orthographic camera draws directly in mono browser/2D host views while stereo host and immersive paths retain perspective eye cameras with the same hands, interaction and performance updates; verify with SDK tests covering mono orthographic, stereo fallback, immersive rendering and 2D/3D switching.
- [x] 3.3 Document the managed runtime contract, the Perspective fallback and the compatibility boundary for apps that still call `createXrb()` directly; verify the documented starter pattern builds without panel-specific globals.

## 4. Template and maintained-app adoption

- [x] 4.1 Convert `templates/app` to inject its scene content and framing into the managed runtime, with no app-owned camera, resize listener or render-loop plumbing; verify a generated starter app builds and source-contract tests confirm the runtime owns those concerns.
- [x] 4.2 Convert the tracked workspace apps to the managed runtime/camera contract while preserving each app's existing pose, controls, icon behavior and visuals under the default Perspective policy; specialized render pipelines may retain loop ownership while using the managed camera helper; verify their focused tests and production builds pass in the task worktree.
- [x] 4.3 Exercise one Orthographic Desktop/browser policy and one Perspective WebXR or stereo policy from global Settings, confirming all converted apps receive the selected projection without per-app edits; verify with browser/runtime inspection and report any hardware-only visual acceptance as a gap.
- [x] 4.4 Preserve the launcher's active mono camera projection when it opens another managed app by carrying a bounded launch context that overrides stale compiled policy without changing stereo or immersive perspective rendering; verify SDK and launcher tests cover both projections, invalid fallback and existing launch/return parameters.

Hardware-only visual acceptance on a stereo panel or headset remains a maintainer follow-up; automated SDK coverage verifies perspective eye cameras for stereo and immersive paths.

## 5. Plugin-contributed global settings

- [x] 5.1 Extend bounded plugin metadata and preferences with shared text, number, boolean and select field schemas, numeric limits, section grouping and a separate namespace for plugin-owned panel/tool values; verify control-panel tests reject malformed or excessive declarations and keep runtime values distinct from panel/tool values.
- [x] 5.2 Add a same-origin effective-settings API for plugin-owned tools and split save rules so runtime provider changes still require stopped apps/jobs while panel/tool preferences can change independently; verify server tests cover reads, valid saves, invalid values, disabled plugins and runtime configuration receiving only runtime fields.
- [x] 5.3 Redesign global Settings with an All / Control Panel / contributing-plugin sidebar filter, generic design-system controls, disabled-plugin presentation and compact per-card save status; remove settings controls from Plugin Manager; verify UI tests and wide/narrow browser checks cover filtering, field types, saving and plugins with no contribution.
- [x] 5.4 Migrate the hand-tracking integration's provider fields and diagnostic preferences to the contribution schema, remove the diagnostic tool's local Settings tab and make it consume effective global preferences with standalone defaults; verify the plugin metadata tests plus diagnostic unit, UI, typecheck and production-build checks pass.
- [x] 5.5 Document the plugin contribution contract, storage/runtime separation, tool read API and restart/reload expectations; verify an example declaration contains no custom panel markup and its values remain plugin-namespaced.
- [x] 5.6 Polish dense contributed settings with a sticky **Module** filter heading, sticky outside-card owner titles, opaque scroll occlusion, lower-emphasis shared helper copy, section dividers and full-row boolean controls; verify component/UI tests and a scrolled browser check cover owner-title placement, overlap, separators and vertical checkbox layout.
- [x] 5.7 Remove repeated plugin descriptions from Settings, use full-width owner rules and shared equal divider spacing, keep the module sidebar fixed unless its own list overflows, add Plugin Manager shortcuts for contributed settings, shorten the visible core/plugin page labels to **Apps** and **Plugins**, and optically align shared fallback emoji icons across both sidebars, including a purple component tint for puzzle placeholders; verify focused tests and scrolled browser checks cover all states.
- [x] 5.8 Add bounded manifest glyph icons with PNG precedence and automatic light/dark tinting, tint matching favicons, and rename the hand-tracking product identity to **Hands**; verify metadata, panel UI, diagnostic integration and production build checks.

Hand Tracking migration tests, standalone TypeScript checking and the production build pass after correcting the shared SDK camera narrowing, hand-visual field and numeric-reduction types plus the design-system declaration.

## 6. Checks and handoff

- [x] 6.1 Re-run the SDK and control-panel suites, maintained workspace app and plugin tests/builds, JavaScript syntax checks and `pnpm check:names`; verify every command passes and the diff contains no generated output or credentials.
- [x] 6.2 Record stereo-panel or headset visual acceptance as a maintainer post-merge follow-up, while automated tests continue to verify perspective eye cameras for stereo and immersive paths; verify the PR acceptance and handoff state the remaining physical-device check without representing automation as device acceptance.

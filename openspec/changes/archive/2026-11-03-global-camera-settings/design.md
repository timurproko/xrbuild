# Design

## Context

The panel already represents a project's distribution choice as one combined Platform value: `host:` for Desktop,
`webxr:` for WebXR and `<target>:<platform>` for an installed platform. That value determines how the app runs and
is packaged, but it does not currently affect the app build environment. Workspace-global state is limited to panel
layout and plugin preferences.

Apps created from `templates/app` construct a `THREE.PerspectiveCamera`, update its aspect on resize and call
`xrb.render(scene, camera)` from their own animation loop. The SDK's stereo renderer also accepts only a perspective
head camera and always creates perspective eye cameras, including for a mono browser/host view. The WebXR path
already renders through the headset's perspective camera rather than directly through the app camera.

Workspace plugins can already declare a small top-level `settings` field schema. The panel stores those values in
`xrb-plugins.json`, passes effective values to selected native providers, and renders the controls inside each Plugin
Manager detail. Plugin-owned tools separately implement and persist their own settings UI, so workspace configuration
is split between Plugin Manager, global Settings and each tool.

## Goals / Non-Goals

**Goals:**

- One workspace setting selects Perspective or Orthographic for each distribution choice and applies to every app
  that follows the shared app runtime.
- Desktop/browser channels can render orthographically while stereo displays and immersive sessions retain correct
  perspective rendering.
- New distribution choices work without setup and default to Perspective.
- Apps keep control of content, camera pose and scene-specific framing without owning projection selection, resize or
  the render loop plumbing.
- Existing project manifests, platform metadata and package formats remain compatible.
- Installed plugins can contribute bounded, design-system-native settings to one global Settings page.
- Native-provider settings remain distinct from plugin-owned tool/app preferences, while both are owned and stored by
  the contributing plugin.
- Plugin-owned tools can read their saved preferences through a same-origin panel API without duplicating settings UI.

**Non-Goals:**

- Inferring the physical monitor type from browser APIs.
- Remotely starting or controlling an immersive session.
- Forcing arbitrary third-party pages that do not use the SDK runtime to obey the policy.
- Sharing one camera pose, near/far range or world scale across unrelated apps.
- Adding publisher-specific camera settings; camera policy follows the project's Platform/distribution choice.
- Allowing plugins to inject arbitrary HTML, scripts or credentials into the global Settings page.
- Making ordinary project manifests a store for plugin-global or tool-global preferences.

## Decisions

### D1. Camera policy keys reuse Platform choice keys

The settings model uses the existing stable combined choice (`host:`, `webxr:` or `<target>:<platform>`) rather than
introducing another channel registry. The Settings page derives its active choices from the same provider/packager
metadata as project settings and also shows saved unavailable choices so temporarily disabled plugins do not lose
configuration. Labels are user-facing platform labels; storage remains neutral stable keys.

The initial policy is:

```ts
interface CameraPolicy {
  projection: 'perspective' | 'orthographic';
}
```

A missing entry resolves to `{ projection: 'perspective' }`. The file therefore stores only deliberate overrides,
and a newly installed choice automatically receives the required Perspective fallback. The schema is bounded and
versioned so later camera properties can be added without changing project manifests.

*Alternative:* key by display provider or runtime capability. Rejected because the requested control is per
distribution choice, the WebXR browser fallback must keep the WebXR policy before an immersive session starts, and a
single platform can select different displays per project.

### D2. Global settings live in `xrb-settings.json`

Add a workspace-level settings file separate from `xrb-panel.json`. The latter remains project-list layout and tab
order; global runtime policy has an independent validator, API and save path. Writes are atomic, preserve unknown
future top-level versions only when understood, and reject unknown keys, oversized files or invalid platform-choice
keys. The panel creates no file until a non-default override is saved.

The Settings route is `/settings/`. Navigation order is Apps, workspace tools, Plugins, Settings,
then maintenance actions. It uses the shared menu and page identity behavior. The Camera section presents one
channel selector and a two-option Projection control with explanatory text that orthographic affects mono views and
stereo/immersive output remains perspective.

### D3. The panel supplies a resolved build context

Before starting an app's `build` or `dev` script, the panel resolves its current combined Platform choice and global
camera policy and sets bounded environment values for that invocation. The app template's Vite configuration exposes
a compile-time camera policy to the SDK runtime, defaulting to Perspective when the variables are absent so direct
terminal development remains safe.

The successful build receipt records the resolved camera context. Receipt verification compares it with current
global settings as well as project source/settings, so changing a policy makes output stale. Automatic Run, package
and publication paths then rebuild normally. Dev-server runs receive the policy at process start; changing the global
setting requires restarting that app run, not restarting the panel.

*Alternative:* have published apps fetch settings from the local panel. Rejected because packages and published apps
must work without the developer machine. Query-string-only configuration was also rejected because direct published
routes do not necessarily carry a query.

### D4. The SDK app runtime owns projection and frame plumbing

Add a small runtime API used by the starter template. It creates `Xrb`, the managed camera selected from the compiled
policy, resize handling and the animation loop, then calls app-provided setup/frame hooks. The app receives the scene,
camera and Xrb objects so it can position the camera, add controls and inject scene/UI objects, but projection type is
created by the runtime rather than chosen in app code. App-specific options retain near/far, perspective field of
view and orthographic vertical span; those are framing hints, not workspace-global policy.

The API keeps the underlying objects available because existing apps need direct scene graph and camera pose access.
It does not hide three.js or require a new UI framework. Cleanup removes resize listeners, stops the animation loop
and disposes Xrb resources.

*Alternative:* inject or rewrite camera code during finalization. Rejected because source rewriting is brittle,
opaque to tests and cannot safely identify arbitrary app camera ownership.

### D5. Orthographic applies to mono; stereo and immersive stay perspective

Generalize the SDK render entry point to accept a perspective or orthographic managed camera. Frame input, hand
mapping, interactions, cursor and performance reporting run identically for both.

- In a mono browser or 2D host view, an orthographic camera is rendered directly with its resize-adjusted bounds.
- In a stereo host view, the app camera still defines pose, panel mapping, clipping and focus, but the SDK renders the
  two physical eyes with its existing off-axis perspective cameras.
- In an immersive session, the headset renderer continues to use its own perspective camera and takes clipping and
  panel placement from the managed app camera.
- A perspective policy preserves today's behavior in all modes.

This makes an Orthographic desktop channel useful without allowing a parallel projection to break stereo window
geometry. Switching a host between 2D and 3D changes the effective eye projection on the next frame without app code.

### D6. Adoption is explicit and testable

The starter app and standard-loop tracked workspace apps move to the shared runtime. A source-level test ensures the
starter no longer constructs a camera or owns resize/render-loop plumbing. A tracked app with specialized projection
or render-loop behavior may use the runtime's managed-camera helpers while retaining that pipeline; it still stops
constructing its own top-level camera and receives the same compiled policy. Workspace apps keep their visual behavior
by moving existing pose and framing values into runtime options/setup hooks or managed-camera options.

Apps outside the template remain supported by `createXrb()` and continue to own their cameras; the panel does not
claim the global policy applies until they adopt the runtime. Documentation states this compatibility boundary.

### D7. Plugins contribute bounded settings, not custom panel UI

The global Settings page also becomes the single configuration surface for installed plugins. The existing top-level
plugin `settings` list remains the declaration for native runtime/provider values. Those values stay in
`xrb-plugins.json` and continue to be merged into selected provider configuration at app launch, but Plugin Manager no
longer renders or edits them.

A new `panel.settings` declaration describes plugin-owned tool/app preferences that must not be passed to a native
provider. Both declarations use the same bounded field vocabulary: text, number, boolean and select controls; labels,
hints, defaults and optional numeric bounds; select options with stable values; and an optional section label. The
panel validates field counts, unique keys, strings, bounds and saved values before rendering generic design-system
controls. Plugins cannot provide markup or executable settings code.

The Settings page uses a two-column manager layout. Its left sidebar is a filter, not another settings owner: **All**
shows every contribution, **Apps** shows core-owned cards such as Camera, and one item per contributing plugin
shows only that plugin's cards. Plugin filter items use the plugin's panel title and icon, appear only when the plugin
exposes settings, and retain the selected filter during the panel session. At narrow widths the filter remains usable
without forcing the settings cards into a horizontal scroll.

The content column renders the core Camera card first and one card per plugin with contributed fields. It uses the
same bounded middle column as Plugin Manager and leaves the third desktop column empty rather than stretching cards
across all available width. The left filter heading is **Module** and remains sticky; the whole module column stays
viewport-sticky while its list scrolls internally only when it exceeds the available height. Each displayed owner has
its own full-width outside-card heading (**Apps**, then each plugin title) rather than repeating the owner title
or general plugin description inside the card; a plugin may instead declare a bounded Settings-specific explanation for its controls. In **All**, those owner headings divide the sequence of cards. Owner headings
remain sticky within their section, paint an opaque layer above scrolled cards and stay below the higher app-bar layer
so segmented tabs and other controls never overlap either header. Runtime and tool/app fields may be grouped into
labelled sections in that card; subsequent sections use the shared design-system divider with the same spacing token
before and after each rule, and boolean fields occupy full rows so groups of checkboxes read vertically. Shared
field-help copy is intentionally lower-contrast than labels and values to keep dense forms scannable. Installed disabled
plugins remain visible with preserved values but non-editable controls, so enablement remains an explicit Plugin Manager
action. The core project surface is labelled **Apps**, and the lifecycle surface is labelled **Plugins**, in navigation and page chrome. A plugin may declare one bounded `glyph` character when it has no PNG icon; PNGs take precedence, declared glyphs and the fallback puzzle emoji use the same light/dark theme tint, and matching tool favicons use that tint. The hand-tracking plugin presents this identity as **Hands** with its existing `👋` favicon glyph. Plugins that contribute settings
expose a Settings shortcut beside the folder action there. Each card saves through the panel API and uses the same
compact saving/saved/error status behavior as Camera.

Plugin preferences remain namespaced by plugin ID. Runtime values and panel/tool values are stored separately so only
runtime fields enter host provider configuration. A same-origin read endpoint returns one plugin's effective runtime
and panel values to its managed tools. Panel/tool preferences may be changed while a managed tool is open; changing
runtime provider settings keeps the existing rule that running apps and jobs must stop first. Settings changes emit a
bounded event so a tool may refresh, but the initial contract only requires tools to read effective values when they
start or reload.

The hand-tracking integration proves the contract: its synthetic provider values become a Runtime section, while
processor, confidence thresholds and recording preferences become plugin-owned panel settings. Its diagnostic tool
removes its own Settings tab and reads the global values, retaining validated defaults when run without the panel.

*Alternative:* embed each plugin's settings page or custom element. Rejected because it would execute plugin UI in the
privileged panel surface, fragment accessibility and styling, and prevent the panel from validating or safely storing
values. Keeping settings only in Plugin Manager was rejected because Plugin Manager is lifecycle management, not the
workspace's configuration destination.

### D8. Launcher navigation carries the active mono projection

A launcher may navigate to a previously published app bundle whose compiled camera policy predates the launcher's
current workspace setting. The launcher therefore adds one bounded `xrb-camera=perspective|orthographic` parameter to
the destination URL. The managed SDK runtime accepts only those two values and gives that launch context precedence
over the compiled policy; invalid or absent values keep the compiled Perspective-safe fallback. Direct published URLs
without launcher context continue using their own build policy.

This handoff affects the managed app camera used in mono browser and 2D host views only. Stereo host output and an
immersive WebXR session still replace it with required perspective eye cameras, preserving the existing stereo rule.
The existing `xrb-xr` and `xrb-return` parameters remain intact.

*Alternative:* require every published app to be rebuilt before launcher use. Rejected because launcher navigation
should preserve the active user-visible mode even while a publication is temporarily older than the workspace build.

## Risks / Trade-offs

- [One built output represents the currently selected distribution choice] → The build receipt includes the camera
  context, and every action verifies/rebuilds for the current choice before consuming output.
- [Orthographic framing differs among apps] → Orthographic vertical span remains an app-specific framing hint while
  only projection selection is global.
- [A platform is removed after saving an override] → Keep the saved unavailable entry and restore its label/status
  when metadata returns; do not silently discard user policy.
- [Existing apps can mutate the managed camera projection] → The runtime documents projection ownership and reapplies
  resize/projection parameters; template-based tests prevent accidental camera replacement in maintained apps.
- [Stereo output may surprise a user who selected Orthographic] → The Settings help explicitly says stereo and
  immersive eye rendering is perspective because that geometry is required for correct depth.
- [A plugin declares malformed or excessive settings] → Reject the contribution as invalid plugin metadata and keep
  the rest of Settings usable; schemas and values are bounded and arbitrary markup is never accepted.
- [A tool is opened while its global preferences change] → The tool reads effective values on startup/reload and may
  subscribe to the panel event; the Settings UI states when a reload or provider restart is required.
- [Old plugin preferences outlive a removed field] → Preserve the file safely but expose and apply only fields still
  present in the validated schema, matching existing runtime-setting behavior.

## Migration Plan

1. Add settings persistence/API/UI with Perspective defaults; no app behavior changes yet.
2. Add build-context propagation and receipt invalidation, still defaulting all missing settings to Perspective.
3. Add the SDK app runtime and orthographic mono path with focused tests.
4. Convert the starter and tracked workspace apps to the managed runtime/camera contract, preserving their current
   perspective appearance under defaults.
5. Move plugin runtime controls from Plugin Manager to Settings, add bounded plugin-owned panel settings and the
   same-origin effective-values API.
6. Migrate the hand-tracking provider and diagnostic tool to the global contribution contract, removing its local
   Settings tab while preserving standalone defaults.
7. Set desired non-default workspace channel policies through Settings and verify one mono browser/desktop run and
   one stereo or immersive run.
8. Rollback consists of returning policies to Perspective and removing plugin `panel.settings` declarations; old apps
   using `createXrb()` and plugins with only legacy top-level runtime settings remain compatible throughout.

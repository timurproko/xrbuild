# Design

## Context

The panel currently has two separate concepts:

- a panel-local **2D** run option that only controls a switchable native display (`--view=2d` and
  `kSetView`), and
- a workspace-global camera projection policy that is compiled into app output as Perspective or Orthographic.

The first is live but is unavailable for the built-in desktop display and browser previews. The second covers mono
camera rendering but requires a rebuild or dev-server restart, applies to every project in the workspace and is
configured far from the app being run. The project toolbar also places the per-platform Dev server choice beside the
run options, although the requested placement is the project hero beside the folder action.

Managed SDK apps already centralize camera creation and render orthographic cameras directly in mono while retaining
perspective eye cameras in stereo and immersive sessions. The missing pieces are a stable live projection change, a
native transport, and a local browser-preview transport that cannot leak panel-local mode into a publication.

## Goals / Non-Goals

**Goals:**

- One visible 2D checkbox expresses the selected app's local 2D/3D intent on Desktop and local WebXR preview paths.
- Desktop and local browser previews switch Orthographic/Perspective live without rebuilding or restarting the app.
- Station platforms retain their existing physical 2D/3D display switching and continue to use perspective eye
  cameras in 3D.
- Directly opened published WebXR starts Perspective; launcher-opened apps inherit the bounded launch context, while
  immersive sessions are always perspective.
- A managed app keeps its scene, runtime and camera reference while projection changes.
- Existing app manifests and packages remain compatible.
- Dev server, Fullscreen and 2D are each remembered once per app and stay synchronized between Desktop and standalone WebXR; Display and Input remain platform-specific.

**Non-Goals:**

- Making arbitrary pages that do not use the managed SDK camera react to projection changes.
- Persisting 2D in the project manifest or package format.
- Changing a station display plugin's existing view-switch contract.
- Allowing a public URL query parameter to force an Orthographic published WebXR app.
- Running a packaged headset target from the panel; those platform tabs remain build-only.

## Decisions

### D1. Preview toggles are local project run preferences

The panel stores 2D, Fullscreen and Dev server in local browser storage keyed only by project, so Desktop and standalone
WebXR always present the same run intent. They are not workspace settings and do not modify `xrb-project.json`.
Existing project-and-platform values migrate from the selected tab on first use. Display and Input remain in each
platform's manifest settings because those provider choices are genuinely platform-specific.

The Display platform toolbar keeps the 2D checkbox:

- Desktop shows editable Fullscreen and 2D choices.
- Standalone WebXR shows editable Fullscreen and 2D choices for the panel's local browser preview.

The checkbox is available before launch and remains live for the managed camera. Station and packaged-headset targets
live on Build and omit Run and 2D because the panel builds those targets for installation rather than previewing them.

### D2. Shared preview toggles stay together

For Desktop or standalone WebXR with a dev script, the Dev server pill sits with Fullscreen and 2D in the Display
platform row. All three remembered keys are project-only instead of project-and-platform. Dev server and Fullscreen
remain disabled while a managed run makes those launch choices unavailable, while 2D remains live when the running
camera/display can switch. A fresh project without a build still starts from source on its first run as today.

Standalone WebXR exposes the same monitor Display selector and Input field as the local run surface, except its Display
choices are monitors only rather than native display providers. Run uses the built panel preview when Dev server is off.
When it is on, the panel starts and owns the project dev-server process. In both modes the panel resolves the executable
serving the request, starts a dedicated browser-profile window on the selected monitor, keeps the child process as the
run lifecycle, and closes it through Stop. The action changes immediately to a disabled Launching state while browser
startup is pending, preventing duplicate windows, then becomes Stop once the process is owned.

Built previews open their app route directly, preserving the app's normal viewport, title, favicon and browser chrome.
Cross-port dev previews use the panel-owned dark wrapper only where it is needed to forward token-bounded live
projection updates into the dev-server iframe. A normal window is positioned on the selected monitor with standard
browser title-bar controls; Fullscreen uses browser kiosk startup on that monitor so the app covers the taskbar without
an in-page prompt. Packaged headset tabs expose only Build because installation and device launch are outside the local
run lifecycle.

### D3. Camera mode and physical view are related but independent

The panel resolves a local run mode to a managed-camera projection:

- 2D checked: Orthographic in a mono local view.
- 2D unchecked: Perspective.

For Desktop the host is always mono, so only camera projection changes. For a station display, the panel also uses the
existing `--view=2d`/`kSetView` path: checked requests mono output and unchecked requests stereo output. In stereo the
SDK still renders off-axis perspective eye cameras regardless of the managed mono camera. This preserves physically
correct depth and the display plugin contract.

The host therefore treats projection as page/runtime state rather than a display-provider setting. It accepts a
bounded initial option (`perspective` or `orthographic`), publishes the current value to pages, keeps it for later page
connections/reloads, and accepts a bounded control-panel update independently of `kSetView`.

### D4. Managed camera projection changes without replacing the public camera object

The SDK managed camera becomes a stable camera object with both perspective framing (`perspectiveFov`) and
orthographic framing (`orthographicHeight`). A projection setter updates its projection identity and matrix in place,
then resizes from the current mono view. App-held references, pose, clipping range, controls and scene content remain
valid.

The runtime exposes the effective projection as live state and subscribes to the host projection message. Rendering
rules remain:

- mono + Orthographic: render the managed camera directly;
- mono + Perspective: render the existing perspective mono path;
- stereo host: render physical off-axis perspective eyes;
- immersive WebXR: render the browser/headset perspective camera.

Apps that construct their own camera through `createXrb()` remain compatible but do not receive managed projection
switching.

### D5. Panel previews use a loopback-only live signal

A panel browser preview receives its initial projection plus a random token, panel origin and control route in a
preview-only launch context. The panel stores the current projection by control route and token behind a read-only
loopback endpoint. The managed SDK polls that bounded endpoint while the preview runs, so a direct built preview in a
dedicated browser profile still receives later 2D changes even though its browsing context does not share the panel's
`BroadcastChannel` storage partition. Same-context broadcasts remain an immediate optimization, and the cross-port
dev wrapper continues to forward token-keyed `postMessage` updates.

When a launcher preview navigates to an app, returns, and opens another app, the SDK propagates the bounded control
route, token and panel origin through the launch/return URLs; the destination path therefore changes without losing
the original preview run's live 2D scope. Poll requests require the matching route and token, accept only a loopback
panel origin, and expose no write capability. The panel removes the state when the managed run stops, and runtime
disposal stops polling and closes the other preview listeners. Multiple previews ignore state for other routes or
tokens. Other pages, including direct publication routes, have no bounded panel context and ignore these signals.

### D6. Publications and builds are Perspective by default

The panel stops setting `XRB_DISTRIBUTION_CHANNEL` and `XRB_CAMERA_PROJECTION` for app scripts. Build receipts stop
recording camera context; a receipt created under the old context fails the first context-free verification and is
rebuilt normally. Vite templates and tracked apps remove the compile-time projection define.

The managed runtime defaults to Perspective when neither a host projection, a bounded launcher context nor the
loopback preview context exists. A directly opened published standalone WebXR route therefore remains Perspective,
while an app opened by the launcher can inherit the launcher's current mono projection without embedding a
provider-specific build policy. Immersive eye rendering remains Perspective in every case.

### D7. Distribution-neutral launcher continuity

The SDK owns a bounded launch-context helper for projection and return intent. The launcher uses that helper rather
than constructing provider-specific query state, and every managed app reads the same context regardless of whether
the destination is a Desktop host route, station route, panel preview or published WebXR route. Direct URLs without a
launcher context keep the Perspective default.

A native launcher started by the local panel receives a bounded loopback panel URL and reads every active,
non-archived buildable workspace app as a local `/preview/` route, regardless of publication state. It follows the
panel layout's section/item order so sidebar top-to-bottom becomes launcher left-to-right, and it does not pad the
catalog with synthetic empty slots. Apps with the generated default icon receive the equivalent lit sphere geometry
inside the launcher even before an app-specific built `icon.js` is available; the default sphere uses 85% of the
standard icon scale for visual balance, while app-provided 3D icons still win.
Therefore **Rebuild** updates what that development launcher opens without a remote publication. Read-only catalog, preview and icon responses allow only the native `app.local` origin; panel
writes remain same-origin. A packaged launcher has no panel context and continues to use the canonical published
catalog. If a panel disappears during a local launcher run, the launcher falls back to that published catalog.

The return control is an SDK module bundled with the destination app instead of a script loaded from the launcher's
origin. It attaches to the destination's existing scene and interaction runtime rather than creating another renderer,
host channel or hand-input state. On activation it decorates the bounded HTTP(S) return URL with a resume marker and
the camera projection currently rendered by the destination. The resumed launcher accepts that marker without
showing another return control, so Orthographic/Perspective continuity works across local and published origins while
ordinary direct publication URLs still default to Perspective. This removes the same-origin distribution mismatch
while keeping the return URL protocol-bounded and avoiding arbitrary remote script execution. The launcher also
renders the SDK's standard spatial cursor so pointer feedback is consistent before and after navigation. Older
published apps need one normal rebuild/publication to receive the new SDK-owned return module; the bounded legacy
projection parameter remains during that transition.

### D8. One display frame across distributions

The SDK treats the configured display aspect as the app's stable frame. A normal browser canvas covers its viewport
at that aspect and centres the excess outside the viewport, so window resizing crops rather than distorts scene
geometry. Mono native windows use the same cover rule, while stereo native output keeps its provider-supplied eye
size. Immersive rendering uses the same physical virtual-panel bounds as four global clipping planes, preventing a
headset from revealing content beyond the panel edges. Pointer normalization uses the resulting canvas rectangle, so
cropped views retain aligned mouse interaction.

Display discovery remains panel-owned. A **Refresh displays** command in the Display selector's context menu reruns
monitor discovery without rebuilding providers. If the selected desktop monitor disappeared, refresh immediately
saves the available primary/first monitor and omits the stale Missing monitor choice; still-unavailable provider names
remain readable for later re-enablement. The normal form remains free of a one-off icon action.

The SDK return control copies the UI kit's round-button bevel, colours, sounds and thin close glyph at half the standard
round button's diameter/depth, and remains in the SDK to avoid a package cycle. It no longer places invisible HTML hit
areas above the canvas; the shared Interactor owns mouse and hand activation, allowing the standard spatial cursor to
remain visible. Activation fades the destination to the shared dark surface before navigation, and a resumed managed
launcher keeps that cover until its first rendered frame then fades it out, removing the browser/page flash. The
native host follows CEF's main-page favicon notifications and replaces the window/taskbar icon after launcher
navigation, just as it already follows the document title.

### D9. Empty core Settings navigation is removed

Remove the core Camera card and camera settings API/storage without changing plugin-contributed Settings behavior.
Because no core-owned Settings remain, omit the empty **Apps** contribution from the Module list and normalize stale
`module=control-panel` navigation back to **All**. An obsolete `xrb-settings.json` camera file is ignored/removed
rather than migrated into project manifests.

### D10. Display and Build are separate project surfaces

The project-column title becomes shared-design-system **Display** and **Build** tabs. One project card below them keeps
the icon, title, primary action, publication URL and the selected surface's controls together. **Display** is the local
preview surface and lists only Desktop and standalone WebXR. It owns Run/Stop plus Dev server, Fullscreen and 2D in the
platform row, followed by physical Display and preview Input when applicable. **Build** is the distribution surface and
lists standalone WebXR publication plus installed package targets such as Desktop, Station and headset packages. It
owns package identity/version/history or publisher/slug controls and places the target's Build, Publish or Unpublish
action in the same hero position as Run. A published route appears once as the hero URL link, using deployment-detail
typography, rather than as a second green deployment block. A published root route keeps an empty disabled slug field
instead of displaying the project-id fallback. Switching Display and Build animates the shared card's height with the
same expand/collapse behavior used by platform changes.

The active Display/Build surface is one panel-level choice, so switching projects keeps the same tab active. Each
surface still remembers its selected platform choice per project. Switching surfaces restores that surface's last valid
choice through the existing atomic platform save and per-platform settings snapshot, so a package target does not
replace the developer's preferred preview target. Runtime/provider targets do not appear under Display unless they are
one of the two preview forms; package-only headset and Station choices remain under Build. The shared design-system
panel-height behavior keys each platform and surface independently, so changing to a target with less content smoothly
shrinks the card instead of retaining a previously visited taller target. The same transition applies between Display
and Build, while one shared surface-content stack keeps the platform-to-field spacing equal across every target. No
previous minimum height is retained after a switch, so publisher and package targets settle at their natural height.
At regular widths Display/Input use equal columns, and package title/version use the same wider-first ratio as
Publisher/App slug; all pairs share the narrow stacking breakpoint. When the hero leaves view, its mirrored sticky app
bar action sits compactly after the selected project name rather than at the far edge.

## Risks / Trade-offs

- [Custom apps keep their own camera] → Live projection is guaranteed only for the managed SDK runtime; documentation
  keeps the compatibility boundary explicit.
- [Camera consumers inspect concrete three.js camera flags] → The stable managed camera updates the standard
  perspective/orthographic identity fields and tests cover controls/picking-visible behavior across switches.
- [A preview app can observe or forge local signals] → Projection reads require a random route/token pair, the endpoint
  is loopback-only and read-only, writes remain same-origin panel actions, and no privileged capability is exposed.
- [Old published output compiled Orthographic remains deployed] → The next build is invalidated by receipt-context
  removal and republishing replaces it; existing remote deployments cannot be rewritten locally.
- [A station display refuses a physical view switch] → The checkbox returns to the host-reported state and keeps the
  existing disabled behavior; camera projection alone does not pretend the display switched.

## Migration Plan

1. Remove global camera storage/UI/build context and make old build receipts rebuild once.
2. Move Dev server and expose 2D consistently in project controls while retaining existing saved `flat` values.
3. Add native projection option/messages and panel runner support alongside the existing view switch.
4. Add stable live managed-camera switching and loopback preview signaling.
5. Replace launcher-specific projection/return plumbing with the SDK launch-context and return-control modules, use
   the standard cursor, remove Vite policy hand-off, update tracked apps/docs and delete obsolete camera settings.
6. Apply one aspect-preserving cover/crop frame, add display refresh, align the return button with the UI kit and follow
   destination favicons in native launcher navigation.
7. Verify Desktop mono, station 2D/3D, local WebXR preview and published WebXR boundaries; rollback is to default every
   local run to Perspective while retaining the existing station view switch.

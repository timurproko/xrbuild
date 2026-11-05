## Context

The Control Panel currently owns the outer grid measurements for Apps, Plugins and Settings, while the tracking diagnostic duplicates a similar but different full-viewport grid. The App project card separates Display and Build at a sticky page heading, while the Activity column has another heading above the Running and Log/Jobs cards. Native host launches default to 1600 x 900 and browser previews use 80% of an arbitrary selected display, so equivalent non-fullscreen Desktop and WebXR sessions do not open at the same size.

## Goals / Non-Goals

**Goals:**
- Give developer-tool pages one tokenized outer inset and inter-column/section gap system.
- Present selected-project Run and Build workflows inside the project card with title-aligned identity actions and deployment URL.
- Offer safe SemVer Patch, Minor and Major suggestions without persisting an edit until Build.
- Center equivalently constrained non-fullscreen Desktop and WebXR windows on the selected display.

**Non-Goals:**
- Change package version validation, package history, publication routing or build semantics.
- Change fullscreen/kiosk behavior.
- Make plugin tools share the Control Panel's page-specific card content or lifecycle.
- Persist a version merely because a context-menu action selected it.

## Decisions

### D1. Shared outer-layout primitives own rhythm, products own topology

The design system will expose named custom properties and an `xrb-workspace-layout` primitive for desktop page inset, grid gap, sidebar width and compact sidebar width. The Control Panel, Plugins and Settings will consume it rather than declaring divergent outer grid values. The tracking diagnostic will consume the same variables for its three-column workspace while retaining its full-viewport, capture-specific topology.

Sticky column offsets use the same responsive block-start token as the workspace inset, rather than a fixed pixel offset that pushes headings into their cards at compact widths. Plugins and Settings use the same section-label primitive in both columns, including baseline alignment.

At its existing responsive breakpoints, each product may change its topology (for example, the panel stacks Activity below Project), but it will retain the shared rhythm. This avoids forcing a diagnostic viewport to mimic the panel's scrolling behavior.

### D2. Project workflow is card-local

The selected app's top-level surfaces are `Develop`, `Publish`, and `Build`, in that order, inside its hero card. Develop holds local Desktop/Browser previews; Publish holds publisher/slug and publication actions; Build holds distributable targets and package controls. Separate project and Activity column labels are removed. Analytics names the runtime metrics region; Jobs precedes Log inside the Activity card without resetting saved selection.

Workflow tabs share the Activity tab treatment. Below them, the hero keeps the project icon and title together. The following row holds the primary action on the left and Folder then JSON on the right. The deployment URL is right-aligned in the workflow-tab row; no duplicate green success block is rendered.

Publish keeps the JSON action but has no folder action: it does not produce a local package. Develop retains the project-folder action and Build retains the package-folder action when available. Where both actions are present, Folder precedes JSON in DOM, visual, and keyboard order.

All developer-tool tooltip hints use the shared tooltip component. Normalize legacy HTML `title` hints at mount and after dynamic updates, preserving explicit tooltip copy and detailed hints ahead of short accessible names. Include fields, status text, disabled controls and swatches, while preserving semantic iframe titles and document titles. Associate visible hints with their owner using `aria-describedby`, dismiss on Escape/scroll/removal, and render above modal dialogs without clipping. Verify the behavior in browser-driven tests as well as both panel and workspace diagnostic consumers.

The app document suppresses the browser's native context menu. Purpose-built context menus, including the project, section, icon, display and package-version menus, continue to prevent the event themselves and open the panel-owned bounded menu.

### D3. Version action menu updates only the pending input

Right-clicking a valid package version will open the shared bounded floating menu with Patch, Minor and Major actions. Patch increments the final component; Minor increments the middle component and resets patch; Major increments the first component and resets the other two. The selected value is written into the existing pending input and dispatched as a normal input event, but remains unsaved until the existing package request consumes it. Invalid or incomplete values show no increment choices.

Using a native context menu was rejected because it cannot provide the panel's shared keyboard, theme and viewport-bounded behavior. Persisting the action immediately was rejected because the current version field is intentionally a build-time value.

### D4. One windowed preview contract

Non-fullscreen native and browser previews request one 1520 x 856 decorated outer-window target, constrained to the selected monitor with the existing safety margins and centered on that monitor. Fullscreen keeps its current display-filling/kiosk behavior. Both native and browser launch pass that same outer geometry, avoiding client-decoration differences.

A fractional-monitor browser size was rejected because it differs from native Desktop and varies unnecessarily with monitor resolution.

### Preview regression follow-up: shared app interaction and framing

The managed app runtime must bind mouse interaction itself, with idempotent binding and disposal so existing UI apps can keep their explicit binding. Empty-template apps must not need a UI-library setup step for the SDK return control to hover or click.

When no explicit orthographic height is authored, derive it from the physical display height and the active panel mapping's scene-units-per-metre scale. Perspective rendering uses that physical panel frustum, not the camera's configured FOV; a guessed orthographic height or a copied metre-scale world mapping cannot preserve framing. Keep explicit app framing overrides. Restore the template's camera-relative mapping, reduce its decorative content, and exercise both projection modes, repeated switches, mouse release, and listener cleanup in regression tests. Rebuild the existing Test app; browser/native visual acceptance remains separate from automated coverage.

### Preview-state and activity follow-ups

Browser projection updates must update both the token-bounded preview scope and the runner's emitted active state. The panel checkbox reads that active state across Launcher-to-app-to-Launcher navigation, never the initial launch preference while a preview is running. Reject projection updates after the browser stops. Keep native host projection behavior unchanged.

The monitoring card is labeled `Analytics`; lifecycle messages still describe running apps. Activity tabs are ordered Jobs then Log, including Home/End keyboard navigation, while preserving the saved selected tab. The Browser Run action has no tooltip.

### Return feedback and control showcase cleanup

Use one SDK-owned sound engine for the SDK return control and UI Kit controls, preserving UI Kit's public sound API through re-exports. The return X uses the same press/release and dialog-close (`off`) voice, volume and mute state, not a copied synthesizer. Keep audio optional and lazily initialized; do not create an SDK-to-UI-Kit dependency.

The workspace control showcase removes its checklist, completion tracking, bottom help and diagnostic keyboard shortcuts. Four top controls remain; Slider and Stepped slider share a horizontal row on opposite sides of the trackball; the round button sits bottom-left at the Dial's height. Keep the actual control interactions and trackball axis selector intact.

### Shared mouse cursor

The managed app shell mounts the SDK round cursor and mouse binding automatically, including empty-template apps. A shared `mouse` option can disable both; managed preview URLs carry the selected Mouse input as a bounded boolean flag across app launch/return. Native hosts retain their input-event gate, while built and dev preview URLs also expose the selection to the SDK. Applying an input selection to a newly launched session must never show a cursor when Mouse is absent. App-specific manual cursor setup is no longer required. Input-provider selections remain launch configuration (not a new live native-provider switching feature).

## Risks / Trade-offs

- [Shared layout changes affect several routes] → Add static UI coverage for common tokens and preserve every route's existing responsive breakpoint behavior.
- [Version actions can encourage an unintended release number] → Limit actions to a pending field, preserve direct typing, and retain the package-time existing-version warning.
- [A fixed window target cannot fit every monitor] → Constrain the target to the monitor work area before centering.
- [Tracking diagnostic is workspace-owned] → Change only its product layout stylesheet after following its plugin instructions; do not move its tool-specific behavior into the core.

## Migration Plan

No data migration is needed. Existing remembered surface selection can map the legacy Display surface to Run. Existing manifests, pending typed versions, fullscreen behavior and package history stay compatible. Rollback restores the prior layout and launch geometry without changing stored project data.

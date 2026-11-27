# Spec Delta

## MODIFIED Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible without optional input/tool plugins or compiled viewers. `/hands/` SHALL be the sole Hands page, titled Hands, with the 3D viewer beside one side panel of Setup, Transform, Visual, Post and Log tabs, present with Start and status from the first paint, and no recording section. Old diagnostic routes and `/hand-tracking/` SHALL return normal not-found responses without redirects, and no separate diagnostic page or link SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional hand tools plugin or checked tool build
- **THEN** the core layout, provider picker and available core controls still open without recording placeholders

#### Scenario: Diagnostic installed
- **WHEN** the optional recording implementation is available
- **THEN** Hands still exposes no recording UI or second diagnostic page, while retained recorder code and stored data remain intact

#### Scenario: Old route requested
- **WHEN** a client requests `/hands-diagnostics`, `/hands-diagnostics/`, `/hand-tracking`, `/hand-tracking/` or their children
- **THEN** the panel returns its normal not-found response with no redirect or old page startup

#### Scenario: Reload keeps the selected tab
- **WHEN** the page reloads or the panel restarts
- **THEN** the previously selected tab shows from the first paint and Start appears disabled, never hidden, until live controls load

### Requirement: Minimal provider picker with availability

Hands SHALL lead the viewer toolbar with Start/Stop and show the session status in the header. The Setup tab SHALL hold the autosaving Skeleton provider, listing only workspace-installed trackers. Selection SHALL save silently, retain missing identities and offer inline retry. Acquisition SHALL keep its launch source until Stop. Diagnostics SHALL go to the Log tab, with no viewer centre text, Save/Reload, recording UI or generated substitutes.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands retains and labels that option without selecting a replacement or routine availability prose

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** the compact Start control does not claim hardware is connected or running, and no separate not-started sentence appears

#### Scenario: Built-in sources hidden
- **WHEN** only built-in synthetic, replay or browser sources and one installed tracker exist
- **THEN** the list offers the installed tracker, while a hidden source that is already the saved choice stays listed

#### Scenario: Standalone live session not available
- **WHEN** the standalone session runtime is missing, outdated or unsupported on this platform
- **THEN** the hand view stays idle and Start stays disabled with the concrete reason in the Log tab, without starting a full host or fabricating provider frames

#### Scenario: Explicit live delivery replaces page-only idle
- **WHEN** the person starts the saved selected provider and valid session frames arrive
- **THEN** the viewport shows those actual hands through the shared SDK adapter
- **AND** before Start it shows no hand and no centre text or cached app history

#### Scenario: Non-live data is not provider input
- **WHEN** calibration data or replay is available
- **THEN** it does not impersonate the selected provider's live hand

#### Scenario: Source Save independent of tools
- **WHEN** the person selects a provider while an adjustment edit is unfinished
- **THEN** only source selection is saved, without committing/discarding that edit, starting acquisition or switching a running app's source

#### Scenario: Selection save fails
- **WHEN** saving a selected provider fails
- **THEN** a short inline error and retry preserve the unsaved selection without a success claim

#### Scenario: Source draft differs from session
- **WHEN** the person edits or saves another source while a session is active
- **THEN** the active provider remains identified separately and Stop remains available for that session
- **AND** a different source cannot start until the active session has stopped and its source choice is saved

### Requirement: Grouped adjustment controls and explicit Apply

Hands SHALL provide the Transform and Visual tabs in the side panel. Each SHALL start with a Preset dropdown offering Default, saved presets and Custom when the values match none, with save and delete actions. Per-tab Reset to defaults SHALL remain. Finished edits, slider drags, presets and resets SHALL save automatically, without Apply.

#### Scenario: Reset one group
- **WHEN** the user resets Transform
- **THEN** only geometry returns to defaults (offset zero, size one) and saves immediately; appearance, selected source and provider calibration remain unchanged

#### Scenario: Appearance reset
- **WHEN** the user resets Visual
- **THEN** default standard drawing saves immediately while geometry and source remain unchanged

#### Scenario: Drag without Apply
- **WHEN** the user drags a slider or previews a color
- **THEN** values apply while dragging, with at most one save in flight that always ends on the latest value, without Apply

#### Scenario: Committed field and switch
- **WHEN** the person commits a number field or toggles a switch
- **THEN** that finished change saves and delivers once, retaining validation and exact untouched linear colors

#### Scenario: Choosing a preset
- **WHEN** the person chooses a preset
- **THEN** only that tab's values change and save, and the dropdown shows Custom after any later edit that matches no preset

### Requirement: Real-session interaction checks

Hands SHALL offer one object, a cube, sphere or Suzanne chosen in Setup at a set position in front of the screen frame, that the current session hand can pinch or grab to pick up through the shared SDK interaction path. A held object SHALL keep its offset from the hand and turn with the palm. Holds SHALL clear on no hands, staleness, geometry reset, Stop, failure or disposal. It SHALL NOT use generated poses or count mouse actions as evidence of tracked-hand success.

#### Scenario: Live pinch and drag
- **WHEN** the current session hand pinches or grabs the object and moves or rotates
- **THEN** the object follows the processed hand and turns with the palm through shared SDK events, and returns to its set position on Reset

#### Scenario: Discontinuity while dragging
- **WHEN** tracking becomes stale or the session stops while the object is held
- **THEN** the object is released without a click and late old frames cannot resume the hold

### Requirement: Paired numeric adjustment rows

Each numeric adjustment SHALL have its label above one row with a number input on the left and synchronized slider on the right, all sliders in a tab sharing one width. Both controls SHALL retain existing bounds, steps and validation. Color swatches SHALL sit at the row end, aligned with the panel's content edge. Joints, bones and the pinch/grab indicator SHALL be one Display multi-select. The panel SHALL fit narrow widths without horizontal scrolling in light and dark themes.

#### Scenario: Every numeric setting has paired controls
- **WHEN** the person opens Transform or Visual
- **THEN** X (mm), Y (mm), Z (mm), Size, Joint diameter (mm), Bone diameter (mm), Skeleton opacity, Indicator diameter (mm) and Indicator opacity each show one labelled number-and-slider row

#### Scenario: Number and slider stay synchronized
- **WHEN** the person edits either control of a numeric setting
- **THEN** its paired control reflects that setting's finite valid value without changing other settings
- **AND** the number input still accepts every value valid under the existing bounds and steps

#### Scenario: Existing commit timing and validation remain
- **WHEN** the person types a number or drags a slider
- **THEN** typing does not save until committed by change or Enter, while slider drags apply live without duplicate saves
- **AND** invalid number values retain field errors without changing saved or running state

#### Scenario: Compact sidebar in both themes
- **WHEN** adjustments are displayed in light or dark at the normal panel width or in a 320-pixel-wide panel
- **THEN** each number and slider remain beside one another, color swatches stay at their row end, and the content requires no horizontal scrolling

### Requirement: Accessible section reset gear menus

The Transform and Visual tabs SHALL each show a plain gear in the tab bar that opens a small menu containing only Reset to defaults, right-aligned under the gear. Buttons and menus SHALL support keyboard and screen-reader use, Escape and outside-click dismissal. The viewport Reset SHALL remain separate.

#### Scenario: Opening and operating a section menu
- **WHEN** the person activates a tab's gear by pointer, Enter or Space
- **THEN** its single Reset to defaults menu item is shown and keyboard reachable with focus in the menu
- **AND** the trigger has an accessible tab-specific name and exposes its popup and expanded state

#### Scenario: Dismissing a reset menu
- **WHEN** the person presses Escape in an open menu or clicks outside it
- **THEN** the menu closes without changing adjustments
- **AND** Escape restores focus to that tab's gear button

#### Scenario: Resetting exactly one section
- **WHEN** the person activates Reset to defaults from a tab's menu
- **THEN** the menu closes and that tab resets through the existing immediate commit path
- **AND** the other tab's saved values and unfinished edits, selected source and provider calibration remain unchanged

#### Scenario: Viewport reset is separate
- **WHEN** the person uses Reset in the viewer toolbar
- **THEN** it frames the monitor and resets the object without changing saved adjustments

## ADDED Requirements

### Requirement: Viewer reference scene

The viewer SHALL show an endless grid and a monitor frame in the screen plane, a bottom-left orientation widget and the centre object, each on by default and toggled from View. The frame SHALL follow the Monitor resolution (4K by default, 2K or custom). Hands SHALL be drawn where they physically are relative to the frame; the Transform offset changes only what apps receive. Left drag SHALL orbit, middle drag pan and right drag zoom, without smoothing.

#### Scenario: Hands relative to the screen
- **WHEN** a Transform offset is set and a tracked hand is in front of the screen's top-left corner
- **THEN** the viewer draws that hand in front of the frame's top-left corner

### Requirement: Hands log tab

The Log tab SHALL list provider start and stop events, diagnostics and failure reasons as rows with a source badge, message and time, newest last and bounded, with a clear action.

#### Scenario: Provider lifecycle
- **WHEN** a session starts, runs and stops
- **THEN** the log shows one starting, one started, one stopping and one stopped row

### Requirement: Post-processing layers

The Post tab SHALL follow Visual and offer an Add layer multi-select of installed post-processing plugins. A chosen plugin SHALL show as a layer card with its settings and a remove action; one hand-mesh layer runs at a time, so adding another replaces it. A plugin whose runtime is not installed SHALL stay selectable and show a small Install action in its card header when it exports a prerequisite setup, and Ready once it can run. With none installed, the tab SHALL show a short empty note.

#### Scenario: Adding a layer that needs prerequisites
- **WHEN** the person adds a post-processing plugin whose runtime is not installed
- **THEN** it becomes the saved layer with an Install action instead of an unavailable label

#### Scenario: Switching a layer off
- **WHEN** the person turns off a layer's switch in its card corner
- **THEN** the layer and its settings stay saved, no mesh runs, and turning it on again resumes it

#### Scenario: Cancelling an install
- **WHEN** the person presses Cancel while an install runs
- **THEN** the install stops, its downloads are kept, and the next Install continues where it stopped

#### Scenario: Installing prerequisites
- **WHEN** the person presses Install and accepts the shown downloads, sizes and licences
- **THEN** the plugin's setup runs as a panel job with live output, Restart waits for it, and the layer becomes ready when it finishes
- **AND** progress follows one core contract for every plugin, showing each step's percent or running time

### Requirement: Resizable side panel

A splitter between the viewer and the side panel SHALL resize the panel by pointer drag or arrow keys, remember the width and redraw the viewer without blank frames. Tabs that do not fit SHALL move into a more menu at the end of the tab bar, keeping the selected tab visible.

#### Scenario: Narrow side panel
- **WHEN** the person drags the splitter until not every tab fits
- **THEN** the last tabs move into the more menu, and choosing one there selects it

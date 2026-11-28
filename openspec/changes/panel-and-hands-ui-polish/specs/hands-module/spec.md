## ADDED Requirements

### Requirement: Unified hands presets menu

Hands SHALL offer one presets menu from a sliders icon at the end of the side panel's tab bar, on the Transform, Display and Mesh tabs only. A preset SHALL store every Transform, Display and Mesh value at once, including the Mesh layer and its settings. Presets SHALL be saved in this browser, and older per-tab presets SHALL be carried over once.

#### Scenario: Where the presets menu shows
- **WHEN** the person switches between the Hands side-panel tabs
- **THEN** the presets icon shows on Transform, Display and Mesh and is hidden on Setup and Log

#### Scenario: Older presets
- **WHEN** the browser holds presets saved per tab before this change
- **THEN** they appear once in the presets menu, merged by name

### Requirement: Presets menu contents

The presets menu SHALL list saved presets with a check on the one the current values match, then Add preset below a line, enabled only when the values match no preset, then Reset to defaults below another line. A saved preset SHALL offer Rename, Duplicate and Delete on right-click.

#### Scenario: Saving custom values as a preset
- **WHEN** the current values match no preset and the person chooses Add preset and confirms a name
- **THEN** a preset holding all Transform, Display and Mesh values is saved and shown checked, and Add preset becomes unavailable

#### Scenario: Applying a preset
- **WHEN** the person chooses a saved preset
- **THEN** Transform, Display and the Mesh layer with its settings change together through the normal save path, and the preset shows checked

#### Scenario: Reset to defaults
- **WHEN** the person chooses Reset to defaults
- **THEN** Transform, Display and the selected Mesh layer's settings return to their defaults while the chosen Mesh layer stays

#### Scenario: Managing a preset
- **WHEN** the person right-clicks a saved preset and chooses Rename, Duplicate or Delete
- **THEN** that preset is renamed, copied under a new unique name or removed, without changing the current values

## MODIFIED Requirements

### Requirement: Grouped adjustment controls and explicit Apply

Hands SHALL provide the Transform and Display tabs in the side panel. Presets and Reset to defaults SHALL live in the shared presets menu in the tab bar rather than in each tab. Finished edits, slider drags, presets and resets SHALL save automatically, without Apply.

#### Scenario: Drag without Apply
- **WHEN** the user drags a slider or previews a color
- **THEN** values apply while dragging, with at most one save in flight that always ends on the latest value, without Apply

#### Scenario: Committed field and switch
- **WHEN** the person commits a number field or toggles a switch
- **THEN** that finished change saves and delivers once, retaining validation and exact untouched linear colors

#### Scenario: Choosing a preset
- **WHEN** the person chooses a preset in the presets menu
- **THEN** all its values change and save, and the menu shows no check after any later edit that matches no preset

### Requirement: Post-processing layers

The Mesh tab SHALL follow Display and offer an Add layer single-choice picker of installed post-processing plugins; choosing one replaces the running layer because one hand-mesh layer runs at a time. A chosen plugin SHALL show as a layer card with its settings, a live status badge, an on/off switch and a remove action. A plugin whose runtime is missing SHALL stay selectable and show Install when it exports a setup. With none installed, the tab shows a short empty note.

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

## REMOVED Requirements

### Requirement: Accessible section reset gear menus
**Reason**: Reset to defaults moved into the shared presets menu, which resets every section at once.
**Migration**: Use Reset to defaults in the presets menu at the end of the Hands tab bar.

### Requirement: Post-processing section reset menu
**Reason**: The Mesh tab's gear is replaced by the shared presets menu.
**Migration**: Use Reset to defaults in the presets menu; it restores the selected layer's declared defaults without changing the layer.

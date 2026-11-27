# Spec Delta

## MODIFIED Requirements

### Requirement: Next-run selection and context notice

The selector SHALL save only post-processing selection/settings under the common profile revision discipline, independently of source and adjustment drafts. Compatible active consumers SHALL follow finished configuration edits; older consumers SHALL receive relaunch guidance without false live success. Browser previews, published web builds and offline packages SHALL remain excluded. Multiple-stage ordering and bypass controls SHALL remain absent.

#### Scenario: Save independently
- **WHEN** the person finishes a mesh selection or setting while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved, the running skeleton source is unchanged, and only supported post-processing delivery is attempted

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** a compact notice identifies browser previews, published web builds and offline packages as excluded without claiming unsupported Hands-session delivery

## ADDED Requirements

### Requirement: Declared post-processing controls

The selected plugin's declared settings SHALL render generically as labelled number-left/slider-right rows, select dropdowns and boolean switches. Bounds, steps, defaults and hints SHALL come from the declaration. Paired numbers SHALL remain synchronized and usable at normal and narrow widths in light and dark themes. Core SHALL contain no plugin-specific control behavior or wording.

#### Scenario: Mixed declared settings
- **WHEN** an installed plugin declares number, select and boolean settings with arbitrary valid keys
- **THEN** only its declared settings appear with their own labels, defaults, options and hints using the shared Hands control style
- **AND** each numeric setting has its label above a number input on the left and a slider on the right, without horizontal overflow at a 320-pixel sidebar width

#### Scenario: Plugin identity and visibility
- **WHEN** at least one plugin is installed and None or a missing/unavailable saved plugin is selected
- **THEN** the section remains visible with None and installed choices and retains a missing saved identity without selecting a replacement
- **AND** the entire section is hidden only when no plugin is installed, without altering saved selection or starting any runtime

### Requirement: Post-processing section reset menu

Post-processing SHALL have a plain borderless accessible gear opening a menu containing only Reset to defaults. Reset SHALL commit the selected plugin's declared defaults through the normal finished-edit path without changing the plugin selection, source, adjustments, calibration or other plugins' stored settings. None SHALL not create plugin settings.

#### Scenario: Keyboard and pointer menu operation
- **WHEN** the person activates the gear by pointer or keyboard
- **THEN** its single Reset to defaults item receives usable menu focus and the gear exposes its section-specific name and expanded state
- **AND** Escape restores gear focus and outside activation dismisses without resetting

#### Scenario: Reset current plugin
- **WHEN** Reset to defaults is activated for a selected available plugin
- **THEN** all its declared defaults are saved together immediately, independently of unrelated unfinished edits, with delivery status governed by acknowledgement

#### Scenario: None or unavailable declaration
- **WHEN** None or a missing plugin with no usable declaration is selected
- **THEN** Reset cannot fabricate settings or change the stored selection

### Requirement: Finished post-processing edits persist safely

Valid finished edits SHALL save immediately without routine Save or Reload. Intermediate or invalid input SHALL not persist or deliver. Writes SHALL preserve unrelated fields and unfinished drafts, safely rebase nonconflicting changes and retain same-field conflicts for explicit review/retry or use-saved recovery. Rapid commits SHALL not lose the newest intention or overwrite it with older responses.

#### Scenario: Number and slider commit timing
- **WHEN** the person types a number or drags its slider
- **THEN** paired preview updates alone do not save
- **AND** valid change, Enter, number-stepper completion or slider release commits once; duplicate completion events do not cause duplicate writes
- **AND** invalid input keeps a field error without changing the saved or live setting

#### Scenario: Select and switch commit timing
- **WHEN** the person chooses a plugin, None or an option, or toggles a boolean
- **THEN** the finished change saves immediately without a submit action and retained per-plugin values survive switching away and back

#### Scenario: Concurrent unrelated write
- **WHEN** another editor changes source, adjustments or another unedited plugin setting before a local commit
- **THEN** only the locally committed changes are reconciled against current profile and catalog revisions without overwriting that writer or unfinished local fields

#### Scenario: Concurrent same-field write
- **WHEN** another writer changes the same edited value or selection from its original base
- **THEN** the editor preserves the newer saved value and local intention, shows the conflict and requires explicit review before retrying or using saved

#### Scenario: Save in flight or component retired
- **WHEN** another finished edit occurs during a pending save, or the component is disposed before a response arrives
- **THEN** older completion cannot erase the newer edit, mark it applied or resurrect retired UI work

### Requirement: Acknowledgement-fenced post-processing feedback

Compact status near the controls SHALL distinguish saved, applying, Preparing, Applied and Failed using current owner/run, saved revision and configuration-generation evidence. Applied SHALL require the desired requested generation to be acknowledged, never just saved, written or skeleton-acknowledged. Failure SHALL retain saved choices and expose a reason and explicit Retry. Missing evidence SHALL not imply success or drawing.

#### Scenario: Saved before configuration acknowledgement
- **WHEN** persistence succeeds while the desired configuration generation is still pending
- **THEN** the UI reports applying or Preparing, never Applied, even if an older generation was applied

#### Scenario: Repreparation while input continues
- **WHEN** a plugin-declared reprepare setting is committed and current delivery reports Preparing
- **THEN** the control shows Preparing with available bounded progress, keeps saved choices and does not stop the skeleton session or demand relaunch of a compatible consumer

#### Scenario: Acknowledged settings without drawing
- **WHEN** the current desired generation is acknowledged for the matching run, plugin and saved configuration but no drawing generation is reported
- **THEN** the UI may say Applied but does not claim that a mesh is visible

#### Scenario: Delayed status or changed owner
- **WHEN** a poll, save or retry response belongs to an older request, revision, generation or retired run
- **THEN** it cannot replace newer feedback or report the current desired settings applied

#### Scenario: Delivery failure and retry
- **WHEN** preparation or live application fails after a successful save
- **THEN** a short reason and Retry appear without erasing the desired values or retrying automatically
- **AND** Retry targets the current run and saved revision without rewriting the profile or starting an idle consumer

#### Scenario: No active or compatible consumer
- **WHEN** there is no active mesh consumer or it cannot acknowledge live configuration
- **THEN** saves remain valid and navigation/edits start no capture or processor, while the UI avoids Applied and gives capability-appropriate relaunch guidance when needed

# Spec Delta

## ADDED Requirements

### Requirement: Paired numeric adjustment rows

Each numeric adjustment SHALL have its label above one row with a number input on the left and synchronized slider on the right. Both controls SHALL retain existing bounds, steps, validation and finished-edit autosave/delivery. Colour swatches SHALL remain beside their diameter row. The sidebar SHALL fit narrow widths without horizontal scrolling in light and dark themes.

#### Scenario: Every numeric setting has paired controls
- **WHEN** the person opens adjustments
- **THEN** X (mm), Y (mm), Z (mm), Size, Joint diameter (mm), Bone diameter (mm), Skeleton opacity, Indicator diameter (mm) and Indicator opacity each show one labelled number-and-slider row
- **AND** Size no longer puts its slider below its input

#### Scenario: Number and slider stay synchronized
- **WHEN** the person edits either control of a numeric setting
- **THEN** its paired control reflects that setting's finite valid value without changing other settings
- **AND** the number input still accepts every value valid under the existing bounds and steps

#### Scenario: Existing commit timing and validation remain
- **WHEN** the person types a number or drags a slider
- **THEN** intermediate edits do not save or deliver adjustments
- **AND** a valid number committed by change or Enter, a number-stepper click, or slider release saves and delivers through the existing path without duplicate saves
- **AND** invalid number values retain field errors without changing saved or running state

#### Scenario: Compact sidebar in both themes
- **WHEN** adjustments are displayed in light or dark at the normal sidebar width or in a 320-pixel-wide sidebar
- **THEN** each number and slider remain beside one another, colour swatches stay next to their respective diameter rows, and the adjustment content requires no horizontal scrolling

### Requirement: Accessible section reset gear menus

Position and size and Appearance SHALL each show a plain borderless gear icon button matching the Apps project-header icon style instead of a reset text button. Each gear SHALL open a small menu containing only Reset to defaults. Buttons and menus SHALL support keyboard and screen-reader use, Escape and outside-click dismissal. The viewport Reset SHALL remain unchanged.

#### Scenario: Opening and operating a section menu
- **WHEN** the person activates a section's gear by pointer, Enter or Space
- **THEN** its single Reset to defaults menu item is shown and keyboard reachable with focus in the menu
- **AND** the trigger has an accessible section-specific name and exposes its popup and expanded state

#### Scenario: Dismissing a reset menu
- **WHEN** the person presses Escape in an open menu or clicks outside it
- **THEN** the menu closes without changing adjustments
- **AND** Escape restores focus to that section's gear button

#### Scenario: Resetting exactly one section
- **WHEN** the person activates Reset to defaults from a section menu
- **THEN** the menu closes and that section resets through the existing immediate commit path
- **AND** the other section's saved values and unfinished edits, selected source and provider calibration remain unchanged

#### Scenario: Viewport reset is separate
- **WHEN** the person uses Reset inside the 3D view
- **THEN** its existing scene-only reset behavior and control remain unchanged

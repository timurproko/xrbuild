# Proposal

## Why

Daily use of the panel and the Hands page surfaced many small usability problems: maintenance labels that looked alike, noisy errors during Restart, a stuck build lock after an interrupted rebuild, and a Hands page whose three columns, centre text and test targets made it hard to see where hands really are relative to the screen.

## What Changes

- Panel maintenance: short `restart`, `rebuild` and `update` labels, a distinct update colour and visible Update dot, fixed-height progress logs, Restart waiting for Rebuild/Update, and no error dialog for requests refused during a restart.
- Design system: one field hover line for inputs, steppers, dropdowns, slider thumbs and swatches; a themed colour popover with copy and paste; multi-select summaries that count choices; dropdowns that open inside a fullscreen element.
- Hands layout: the viewer on the left and one side panel with Setup, Position, Visual and Log tabs present from the first paint; Start and the session status are shown disabled until live controls load; the viewer carries no centre text.
- Hands viewer: an endless grid, a corner axis widget, a monitor frame sized from a chosen resolution, one centre object (cube, sphere or Suzanne) that hands can pick up and turn, direct 3D-tool mouse controls, and hands drawn where they physically are relative to the frame.
- Hands settings: Position and Visual presets with save and delete, a Display multi-select, sliders that apply while dragging, and only installed tracker providers offered.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hands-module`: page layout, viewer reference scene, presets, Log tab, interaction object and slider timing.
- `control-panel`: maintenance labels, restart behaviour and shared control styling.

## Impact

Control-panel UI, the Hands page and its tests, the design system, one native test fixture position and one small public test mesh. No profile schema, provider ABI or app delivery change.

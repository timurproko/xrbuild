# Proposal

## Why

Hands numeric adjustments currently mix grid fields with a Size slider below its input, making the narrow sidebar harder to scan and tune. Section reset text buttons crowd the headings and should become compact, accessible gear menus.

## What Changes

- Give all nine numeric settings a label above one row containing the number input on the left and a synchronized slider on the right.
- Preserve existing bounds, steps, validation and finished-edit autosave/delivery; keep colour swatches beside their corresponding diameter rows without horizontal overflow.
- Replace each section's reset text button with a plain shared gear icon opening a single Reset to defaults menu item, with keyboard, screen-reader, Escape and outside-click support.
- Leave the viewport Reset and all live-session, lease and provider behavior unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hands-module`: Specify paired numeric controls and accessible per-section reset menus in the adjustment sidebar.

## Impact

Implementation is confined to `packages/control-panel/ui/hands-adjustments.js`, adjustment layout rules in `packages/control-panel/ui/hands.css`, and adjustment-focused tests. Reuse shared field, number-stepper, range, icon and floating-menu primitives without new dependencies or endpoint/profile changes. Light/dark and narrow-width before/after pictures will use an isolated disposable preview after plan approval; no person's app, panel, profile or other checkout is involved.

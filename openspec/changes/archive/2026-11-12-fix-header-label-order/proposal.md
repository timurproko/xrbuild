## Why

The header currently renders rebuild before restart, while the shared menu orders Restart before Rebuild. The same mismatch exists in the embedded hand diagnostic. Matching order makes the maintenance labels easier to associate with their menu actions.

## What Changes

- Make header maintenance labels follow the shared menu's maintenance ordering: Restart, then Rebuild.
- Reuse one maintenance order definition/ordering path rather than maintaining independent product-specific ordering.
- Apply the rule to the panel's Apps/Plugins/Settings header and the approved embedded hand-view header, retaining stable element IDs, state text, colours, visibility and behavior.
- Add focused source/unit/browser checks for both-visible, single-visible, no-visible and asynchronous refresh/navigation states.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: header maintenance labels follow the corresponding shared menu items.

## Impact

Shared navigation/header helpers, panel and embedded hand header markup, focused UI tests and design-system documentation. Core/approved embedded only; no private clone, provider/host changes, workspace data migration, dependency-install changes or running-panel restart is required.

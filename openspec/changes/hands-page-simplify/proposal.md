# Proposal

## Why

Hands has redundant save actions, status prose and recording tools where the person wants a minimal provider picker and direct adjustment controls. Finished edits should save and reach a running app immediately, without sacrificing revision or delivery safety.

## What Changes

- Keep only Skeleton provider on the left, with silent save on selection and an inline error/retry on failure; leave space above it for the separately delivered Start/Stop controls.
- Hide the entire post-processing mount when no plugin is installed; retain it below the provider when plugins exist.
- Remove Record from the page without deleting recorder implementations, compatibility readers, routes or stored recordings; recording remains unreachable from this page pending future placement.
- Render Position and size and Appearance directly in the right panel using existing Apps section and secondary-action styles, retaining all controls, per-section resets and the size/contact hint.
- Save and deliver committed adjustment changes and resets without Apply, routine Reload or success prose; preserve conflicts, validation, geometry resets, exact colours and retryable failures.
- Rename the Apps Input display option to Hands without changing the persisted `hand` value.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hands-module`: Minimal provider sidebar, hidden empty post-processing, retained but unmounted recorder, flat adjustment sections and commit-time persistence/delivery.
- `control-panel`: Apps Input displays Hands while retaining the existing saved value.

## Impact

UI changes centre on `packages/control-panel/ui/hands.html`, `hands.js`, `hands-adjustments.js`, `hands-postprocessing.js`, `hands.css` and the Input label in `app.js`, plus focused tests and Hands documentation. Existing profile storage and `/api/hands/apply` remain authoritative; no new dependency, data migration or acquisition implementation is proposed. Preserve the `handsPage.view`, `snapshot` and `request` interfaces and active-session profile ownership for the parallel live-provider change.

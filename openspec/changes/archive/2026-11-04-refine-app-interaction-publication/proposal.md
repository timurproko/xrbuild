## Why

The maintainer approved five updates in conversation and explicitly requested implementation: return-only Escape, momentary axis buttons without re-selection toggling, a detailed tinted Apps glyph, optically balanced Activity clear action, and consistent publication controls. Current publication controls use package-target eligibility while the badge uses independent deployment status, producing a published app with disabled Publish and editable slug.

## What Changes

- Escape returns only validated launcher children; direct apps and Launcher remain open in fullscreen and windowed sessions. Remove native automatic-close fallbacks.
- Full/X/Y/Z retain selection/highlight but spring back on release; selecting the current axis never restores Full automatically.
- Reuse the Apps favicon emoji in Settings with a shared detail-preserving theme tint.
- Align the visible Activity X inset with the left tab label while preserving its hit target.
- Decouple publication eligibility/actions from package target; use the selected publisher's status consistently and lock destination fields while published.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-runtime-sdk`: return-only Escape.
- `web-host`: native Escape never quits the session.
- `hand-ui-controls`: opt-in momentary selection visuals in the showcase.
- `dev-control-panel`: publication consistency and shared visual fixes.

## Impact

SDK, native host, UI controls, panel, showcase, regression tests and docs. No live publish/unpublish operations, plugin capture changes, shortcut retargeting, or primary-checkout edits. Approval covers the five decisions above; broader design-system migration remains excluded.

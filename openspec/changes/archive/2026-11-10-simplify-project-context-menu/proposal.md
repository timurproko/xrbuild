## Why

The project context menu exposes an unwanted build-cache review action and modal, and shows an unusable disabled Delete action for embedded apps. Remove that clutter without changing backend safety or ordinary project deletion.

## What Changes

- Remove Review build cache from the project menu and remove its modal and unused browser wiring.
- Hide Delete for embedded projects in Projects and Archive; preserve ordinary project deletion and existing running-project restrictions.
- Keep cache review/cleanup APIs, preservation checks and server-side embedded deletion refusal unchanged.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: simplify project context menus and omit embedded deletion instead of disabling it.

## Impact

Core-owned control-panel browser UI and focused menu/browser tests. No private workspace, export, cleanup, native build or plugin changes. Canonical spec synchronization and archive remain owned by the repository bot.

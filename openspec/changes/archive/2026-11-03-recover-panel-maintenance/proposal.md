# Proposal

## Why

Control Panel maintenance can report an ambiguous result even after the requested work completed: restart recovery recognizes only a changed process ID and can leave its blocking dialog open, while a successful plugin rebuild that did not relink its DLL can continue to show `rebuild available` because freshness considers only the DLL timestamp.

## What Changes

- Give each running panel an explicit startup identity and wait for that identity to change before replacing the active document after Restart.
- End the restart overlay automatically when the replacement panel is ready, preserve the active route, and retain a bounded recoverable failure state when reconnection does not complete.
- Record each successfully completed workspace-plugin build independently of whether the linker rewrote its DLL.
- Use that successful-build record for plugin freshness so a completed Rebuild clears the chip and menu indicator immediately and remains clear after refresh.

## Capabilities

- `dev-control-panel`: Restart reliably reconnects and replaces the active page, and successful host/plugin rebuilds converge to a visibly fresh state.

## Impact

- Shared maintenance navigation and restart API identity metadata.
- Host/plugin build freshness records under generated build folders.
- Focused restart, server, host freshness and browser regressions.
- No change to maintenance authorization, route ownership, restart window behavior, build commands or failed-build visibility.

## Why

A hidden control-panel process can remain after it stops serving the panel, leaving the Start-menu shortcut unable to bind its loopback port and with no visible failure. The shortcut needs to recover from that stale process without disrupting a healthy panel or an unrelated program.

## What Changes

- Add a shortcut-launch recovery path that detects a nonresponsive panel process belonging to the same checkout and selected launcher, stops it, waits for the port to become available, then starts a replacement panel.
- Preserve healthy same-workspace panel reuse and the refusal to open, stop, or replace another workspace's panel or an unrelated port owner.
- Add focused coverage for the launcher recovery command construction and panel startup outcomes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: make Start-menu launcher startup recover a verified stale panel process while retaining healthy reuse and collision isolation.

## Impact

- `start.vbs`, `start-repo.vbs`, and `start-auto.vbs` launch behavior.
- Control-panel startup helpers and focused control-panel tests.
- No plugin interfaces, workspace data, or network exposure changes.

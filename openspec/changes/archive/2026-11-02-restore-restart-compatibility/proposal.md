# Proposal

## Why

A Control Panel process started before the detached Node restart change still tries to invoke `packages/control-panel/src/restart-silent.vbs`. The newer checkout deleted that file, so the first restart after updating shows a Windows Script Host error, leaves the panel stopped and eventually reports **Restart failed**.

## What Changes

- Restore the hidden restart script as a backward-compatibility shim for already-running older panel processes.
- Keep current panel processes on the direct detached Node restart path; the restored script is not reintroduced as the active implementation.
- Add regression coverage that prevents removing or making the compatibility shim visible while stale installed processes may still reference it.

## Capabilities

No requirement changes (`skip_specs: true`). Existing silent, route-preserving restart behavior is repaired across an on-disk update boundary.

## Impact

- One compatibility VBScript and focused Control Panel restart coverage.
- No confirmation, route, port, workspace, launcher or current restart-process behavior changes.

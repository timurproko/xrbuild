## Context

The three hidden VBScript launchers start Node directly. `launch()` probes `/api/ping` before it binds its loopback port, reuses a responsive panel only when its workspace matches, and otherwise refuses a port owner. A hidden, nonresponsive Node process therefore leaves a shortcut activation with only a log entry.

## Goals / Non-Goals

**Goals:**
- Recover only a panel process left by the same checkout and shortcut mode when it no longer answers the panel identity probe.
- Keep normal same-workspace reuse and workspace/port collision isolation intact.
- Keep every launcher hidden and avoid taking ownership of arbitrary port users.

**Non-Goals:**
- Restart healthy panels on each shortcut activation.
- Kill a panel from another checkout or workspace, an ordinary command-line panel, an application process, or an unrelated port owner.
- Change ports, workspace routing, panel APIs, or persistent shortcut targets.

## Decisions

### D1. Mark and identify shortcut-owned processes

Each VBScript launcher will add a launcher-specific internal marker to the Node invocation. The recovery helper will require both the canonical checkout-local server path and that marker when locating a process. For the existing auto and repository shortcut forms, it will also recognize their distinct legacy command-line mode arguments so the first updated shortcut activation can recover a process left by the prior launcher version. The legacy plain user launcher is intentionally not recognized because its arguments are indistinguishable from an ordinary command-line panel.

The helper will query the Windows process command line because a nonresponsive process cannot provide the existing HTTP identity. A generic port-to-PID kill was rejected because it could terminate another local application. Matching only the Node executable or source path was rejected because it could terminate a different launcher mode or checkout.

### D2. Recover only after a failed panel probe

The server keeps its current `/api/ping` check first. A responsive same-workspace panel remains reusable; a responsive panel for a different workspace stays an error. Only after the selected port does not provide a valid panel identity does the shortcut invoke targeted recovery, wait for the selected port to clear with a bounded timeout, and launch a new process.

This preserves the existing quick path and prevents using recovery as a general panel restart feature. A direct restart endpoint alone was rejected because a stuck process cannot answer it.

### D3. Fail closed

If process identity cannot be verified, termination fails, or the port does not clear before the timeout, the launcher leaves the owner running and records the existing startup failure rather than guessing. The helper will not terminate child processes, avoiding forced shutdown of a running host or other work started by the panel.

## Risks / Trade-offs

- [A stale plain user-mode panel from an older launcher or manual start is indistinguishable from a command-line panel] → Leave it untouched and retain collision logging; the distinct auto and repository legacy forms remain recoverable.
- [A process can take longer than the bounded wait to exit] → Do not launch a competing server; log the failed recovery for diagnosis.
- [Forced termination skips panel cleanup] → Limit it to a nonresponsive, marker-identified Node panel process and do not terminate its children.

## Migration Plan

The updated shortcut uses the new marker on its next activation. No shortcut reinstallation, workspace migration, or configuration change is required. Rollback restores the prior launcher behavior; any currently running marked process remains a normal panel process until exited or recovered.

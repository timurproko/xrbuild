# Design

## Cause

The running Node process retains the restart implementation loaded when it started. A pre-update process therefore continues to launch `restart-silent.vbs` even after Git updates the checkout to code that restarts Node directly. Deleting the compatibility file breaks the one restart needed to load the new implementation.

## Decision

Restore `restart-silent.vbs` at its historical path with its historical argument contract: working directory, Node executable and remaining server arguments. It quotes every argument and launches with window style `0` without waiting. Current `server.ts` continues to use `hiddenNodeInvocation()` directly, so the shim exists only for stale-process compatibility.

## Verification

A focused test requires the historical file, hidden non-waiting launch and argument quoting while retaining the direct detached Node assertions for current restarts. Full Control Panel tests verify no launcher regression.

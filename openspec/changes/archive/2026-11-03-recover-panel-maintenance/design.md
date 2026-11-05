# Design

## Replacement-panel handshake

The restart response and `/api/ping` will expose the same startup identity for the running panel instance. The shared restart flow will keep the modal open while the old process shuts down, ignore responses from that same identity, and accept recovery only after the configured panel origin answers with a different identity. Process ID remains diagnostic metadata rather than the completion condition, avoiding a stalled dialog if Windows reuses a PID.

After the replacement is ready and the existing minimum progress interval has elapsed, the shared flow will close the restart dialog and replace the current document at its existing URL. Replacing rather than merely requesting a cache-sensitive reload preserves the active Control Panel, Plugins Manager or registered-tool route while guaranteeing that the new document loads the replacement server/UI. The existing bounded timeout becomes a non-blocking retryable failure presentation rather than an indefinite maintenance state.

## Successful plugin-build record

A CMake build can succeed after a `CMakeLists.txt` or copied runtime-input change without relinking the plugin DLL. DLL modification time therefore cannot by itself represent the last successful plugin build.

After each workspace-plugin `cmake --build` exits successfully, the panel will update a small generated success record inside that plugin's build directory. Plugin freshness will compare the newest eligible source against the newer of the installed/built DLL and this record. The record is written only after success, so a failed build cannot make stale sources appear fresh; a missing DLL still remains missing regardless of the record. Existing manual builds remain compatible because DLL timestamps continue to count.

The rebuild job already returns post-build freshness and the UI already refreshes host state on completion. Once the success record participates in that calculation, the top-bar chip and navigation dot clear at successful completion and stay clear after page refresh or panel restart.

## Verification

Focused tests will cover restart/ping startup identity, replacement-instance detection, document replacement and bounded failure, plus plugin freshness after a successful no-relink build and after a failed or incomplete build. Server and UI tests will retain route preservation, silent Windows restart and shared-dialog behavior. An alternate-port browser smoke will perform a real restart and a fixture no-relink rebuild, confirming automatic page recovery and disappearance of the stale rebuild indicators.

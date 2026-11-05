## 1. Make the published library root-safe

- [x] 1.1 Accept root and named publication inventory entries, derive their canonical routes and exclude only the launcher's own current route; verify launcher catalog tests cover launchers published at the root and at a named slug while every other published app remains visible.
- [x] 1.2 Use a valid same-origin manifest icon when available and the finalized `xrb-app-icon.png` otherwise; verify catalog tests cover apps with a manifest icon, no manifest, a missing app-specific `icon.png` and unsafe cross-origin icon metadata.

## 2. Queue publication operations

- [x] 2.1 Add queued background-job state and FIFO scheduling for publication jobs while preserving same-project web/package safety conflicts and bounded history; verify job tests cover immediate start, multiple queued operations, strict order, failure followed by the next operation, reload/list state and reserved-project conflicts.
- [x] 2.2 Route Publish and confirmed Unpublish through the queue with their requested identity and operation metadata; verify server tests submit simultaneous operations for different projects and observe accepted queued jobs executing sequentially without the current conflict error.
- [x] 2.3 Render queued and running publication jobs as pinned pending actions and distinguish queued work in Activity without claiming remote progress; verify focused UI tests cover restored queued jobs, disabled controls, operation labels and completion feedback only after execution.

## 3. Preserve app icons through publication

- [x] 3.1 Keep queued Publish on the verified browser-build preparation path and add an end-to-end fixture with a custom project icon; verify the publisher receives HTML with one cache-busted project favicon and matching `xrb-app-icon.png` bytes after waiting behind another publication job.
- [x] 3.2 Update the affected capability documentation and run strict OpenSpec validation, focused launcher and Control Panel tests, the private publisher suite, `pnpm check:names` and `git diff --check`; verify all commands pass without performing a production publication.

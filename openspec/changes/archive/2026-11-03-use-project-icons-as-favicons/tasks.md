## Implementation

- [x] Add an idempotent browser-build favicon finalizer that materializes the manifest PNG or generated default and reconciles only page-favicon links; verify focused tests cover custom/default icons, changed icon bytes, existing favicon declarations, preserved non-favicon metadata and repeated execution.
- [x] Integrate favicon finalization with successful, existing and receipt-backed browser builds before their output digest is accepted; verify local preview, package/publication build input and refreshed receipts all contain the same app-specific favicon without changing project source HTML.
- [x] Add browser-facing regression coverage and documentation for the project-icon contract; verify UI Kit-style output without a source favicon and Launcher-style output with one both show the project icon locally, strict OpenSpec, focused/full Control Panel tests, name guard and `git diff --check` pass, with no production publication performed.

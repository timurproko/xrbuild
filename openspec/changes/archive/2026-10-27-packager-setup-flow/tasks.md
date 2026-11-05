## 1. Core setup contract

- [x] 1.1 Add optional packager prerequisite-status and setup hooks with validation and backwards compatibility; verify discovery and packager tests cover missing, ready, unavailable and legacy packagers.
- [x] 1.2 Add project-scoped readiness and setup routes, enforce the same readiness gate on package creation and selected-packager authorization on setup; verify server tests cover stale status, direct API bypass and malformed requests.
- [x] 1.3 Run setup through the background jobs pipeline with bounded sanitized logs, conflict prevention and explicit terms acknowledgement; verify job and route tests cover success, failure, concurrent jobs and no build/publication side effects.

## 2. Panel feedback

- [x] 2.1 Show Setup for a missing toolchain and Build package only after fresh ready status; discard stale project/platform checks and leave legacy packagers unchanged; verify focused UI tests cover each state and switching.
- [x] 2.2 Show streamed installation logs, close the setup dialog only after verified success, and keep failures available for retry without automatic packaging; verify focused UI tests cover completion, retry, restored jobs and unchanged package progress.

## 3. Verification and integration handoff

- [x] 3.1 Run control-panel tests, strict OpenSpec validation and name guard; verify each command passes and document the private packager integration and physical-device acceptance as follow-up gaps rather than claiming they were completed by this core change.

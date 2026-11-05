## 1. Shortcut recovery

- [x] 1.1 Add per-launcher markers, distinct legacy auto/repository signatures, and a checkout-local stale-process recovery helper to the hidden launchers; verify a nonresponsive matching process is stopped, its port is released, and a replacement starts without a visible terminal.
- [x] 1.2 Preserve responsive same-workspace reuse and refuse mismatched or unverified port owners; verify focused startup tests cover reuse, mismatch, recovery eligibility, timeout, and no unintended termination.

## 2. Verification

- [x] 2.1 Add focused launcher-source and recovery tests for all three launcher modes; verify `node --test "test/**/*.test.ts"` passes in `packages/control-panel`.
- [x] 2.2 Run `pnpm check:names` and strict OpenSpec validation; verify both commands pass and record Windows shortcut activation as a manual acceptance gap if it cannot be automated.

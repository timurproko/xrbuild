## 1. Repository startup repair

- [x] 1.1 Enable dependency-lock reconciliation only for repository-development panels; verify stale repository fixtures install successfully while ordinary and explicit modes retain frozen installs.
- [x] 1.2 Isolate managed-tool setup failures from server startup; verify the panel starts, the affected tool reports a retryable error, and healthy tools remain ready before the browser opens.

## 2. Verification

- [x] 2.1 Add focused control-panel tests for stale workspace startup repair and failed managed-tool isolation; verify `node --test "test/**/*.test.ts"` passes in `packages/control-panel`.
- [x] 2.2 Run `pnpm check:names` and strict OpenSpec validation; verify both commands pass and record a real shortcut launch after a stale workspace lock as a manual acceptance test.

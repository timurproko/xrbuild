# Tasks

## 1. Freshness scan

- [x] 1.1 Record the panel process start time and scan the panel server sources and loaded packager/publisher folders for files changed since (D1, D2); verify unit tests with back-dated files report up to date, then outdated naming the newest changed file, and ignore UI, `node_modules` and build folders.
- [x] 1.2 Serve `GET /api/panel` with `{ pid, startedMs, outdated, newestSource }`, cached briefly (D3); verify a server test reads it before and after a scanned file changes.

## 2. Presentation

- [x] 2.1 Show the "restart available" chip and the dot on Restart control panel only while outdated, sharing the menu dot style with Rebuild host, refreshed with the host's timer and on focus (D4); verify a UI test or manual check shows both after touching a panel source and neither after Restart.

## 3. Checks

- [x] 3.1 Run `node --test "test/**/*.test.ts"` in `packages/control-panel` and `pnpm check:names`; verify both pass.

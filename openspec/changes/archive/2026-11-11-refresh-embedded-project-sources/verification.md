# Verification and handoff

## Implemented behavior

- Explicit embedded project actions compare current installed source membership/content and shared build/SDK inputs, stage a new generation and atomically publish it under the existing operation lock. Static entry changes are checked even when excluded from the shared package-build digest.
- Version-two state stores bounded, content-bound baselines and a stable output namespace. File additions/changes/deletions and compatible local edits refresh; genuine conflicts preserve prior state and fail the requested action. Exact panel-managed favicon/card stamping is not mistaken for an authored edit.
- Personal settings, icons, provider configuration, run defaults, publication/deployment identity and recordings survive. Manifest editor changes rebase onto refreshed source declarations rather than writing a complete stale manifest back.
- Legacy state automatically adopts current sources while retaining the complete previous generation in its recovery list. Unknown source edits remain recoverable in that old tree. Ambiguous legacy source/build declarations are refused, not silently dropped. Older acknowledgement-only receipts are accepted as legacy input rather than mistaken for version-two proof.
- Generation markers, isolated manager configuration, baseline metadata and containment are validated. Concurrent working/installed/personal changes do not publish candidates. Active leases prevent refresh. No old generation, lock, private data or worktree is cleaned by this change.
- Develop/native/browser/build/icon/package/publication/copy paths consume coherent current sources. Run/preview rediscover the project after a build switches generations. Old pinned output URLs remain readable; new consumers do not automatically select old output.
- Normal Apps cards no longer show the source-update explanation or button. The retired mutation returns 410 without changing state.

## Local results

- Strict public TypeScript no-emit check passed.
- Name guard passed, including the newly staged source helper; 27 banned-name hashes checked.
- Strict OpenSpec validation of `refresh-embedded-project-sources` passed. Whitespace/diff checks passed.
- Final embedded project workflow and embedded project suites: **45 passed, 0 failed, 0 skipped**, with an explicitly configured real browser. Includes actual refreshed bytes, static output updates, shared SDK changes, personal settings, legacy migration, genuine conflicts, source/personal-file races, interrupted/foreign markers, changed manager configuration, malformed baselines, links, separate roots, section relocation, active leases, generation-pinned previews and intercepted native/adaptor consumers.
- The earlier wider focused run selected 11 control-panel suites (145 tests). All non-browser-readiness cases passed; two environment-dependent cases skipped (no real package zip and unavailable symlink privilege in that fixture). The browser readiness case initially accessed a not-yet-created document body; its predicate is now null-safe and passes in the final suites. This did not remove its UI assertions or extend deadlines.
- The workflow browser regression initially raced a platform-save continuation when immediately switching to Publish. It now reloads the persisted platform state before testing the separate publisher-selection action; its original publisher persistence assertions remain. Final browser tests passed.
- Real public Launcher smoke build: **1 passed, 0 failed, 0 skipped**. Uses frozen public dependency installation, real prerequisite/application build, finalized output and an unchanged-product-source inventory assertion, entirely inside disposable task-local fixtures.
- Incorporated current `origin/main` through `06be4ae` (only worktree guidance/automation changes). Its instruction-integration regression suite passed after the merge. Production code tested above is unchanged by that integration.

Local logs are retained only in ignored `.artifacts/`: `focused-tests.log`, `final-refresh-tests.log`, `final-focused-retest.log`, `public-launcher-build.log`, `instruction-integration.log` and the real Launcher build's detailed log. Initial failing development runs drove the static-entry digest, managed-stamping and stale pre-build-project fixes; they are not represented as successful acceptance runs.

## Remaining acceptance and ownership

- Actual desktop shortcut execution against an existing long-lived user workspace and physical devices was not performed. The maintainer can use the isolated public-only panel command in the handoff, then perform the normal shortcut check after a maintainer merge. Public fixture/native interception results are not hardware acceptance.
- The two environment-dependent wider-suite skips remain skips, not passes; package-zip and symlink-capable environment acceptance stays with the maintainer/CI lanes.
- Exact-final-head remote CI, trusted draft promotion and OpenSpec synchronization/archive remain automation-owned. The maintainer alone chooses when to merge. No main checkout, private clone, installed shortcut or physical device configuration was changed for this implementation.
- Keep this task attached for review/follow-up. Completion/cleanup is not authorized before a verified maintainer merge and must use the repository's guarded completion flow.

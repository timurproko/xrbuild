## Implementation

- [x] Remove the project build-cache menu action, dialog and unused browser wiring while preserving backend cleanup; verify focused UI assertions and cache-maintenance API tests pass.
- [x] Hide embedded Delete without affecting ordinary deletion or running-project restrictions; verify Projects/Archive menus and embedded-to-ordinary menu transitions in focused tests.
- [x] Update browser regressions for the removed modal and hidden Delete; verify the browser-enabled tests pass or record the unavailable browser prerequisite without claiming execution.
- [x] Run focused tests, strict TypeScript, name guard and strict change validation; verify results are recorded before handoff and leave bot synchronization/archive untouched.

## CI repair

- [x] Repair Windows preference-lock contention without weakening writable-path or exclusive-create protections; verify a deterministic regression fails before the fix and passes afterward, foreign/link locks remain untouched and independent writers preserve unrelated settings.
- [x] Run focused preference/access tests, strict TypeScript, name guard and strict spec validation; verify results are recorded and the bot finalization commit remains in branch ancestry. Report subsequent remote CI separately only when observed.

## Verification

- Focused design-system, shared-menu behavior and cache-maintenance API suites: 26 passed, no skips.
- Embedded-project workflows with the real-browser fixture enabled: 12 passed, no skips. Covers embedded and archived menus, transition to an ordinary project, absent cache controls/modal and preserved server deletion refusal.
- Strict TypeScript, name guard, strict change validation and diff whitespace check passed.
- Detailed local command record: `.artifacts/verification.md`. No canonical specs or predecessor tasks were changed; repository bot finalization was pending at initial handoff. Bot finalization was subsequently observed at `d22e25b`; its canonical synchronization is preserved. Node CI at that revision failed on preference-lock contention; the CI repair is tracked above.
- CI repair: the deterministic EPERM regression failed before the fix and passed afterward. Plugin-source tests (real browser enabled): 11 passed, no skips. Plugin-manager tests: 4 passed. The independent-writer regression passed 10 consecutive runs. Strict TypeScript, name guard and all 24 spec/change validations using the repository-pinned OpenSpec 1.11.0 passed; bot-finalization ancestry and diff whitespace checks passed. Detailed commands and the unpinned-CLI mismatch are recorded in `.artifacts/ci-repair.md`. Remote CI on the repair is a subsequent integration result, not a claimed local outcome.

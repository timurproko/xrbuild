## Implementation

- [x] Remove the project build-cache menu action, dialog and unused browser wiring while preserving backend cleanup; verify focused UI assertions and cache-maintenance API tests pass.
- [x] Hide embedded Delete without affecting ordinary deletion or running-project restrictions; verify Projects/Archive menus and embedded-to-ordinary menu transitions in focused tests.
- [x] Update browser regressions for the removed modal and hidden Delete; verify the browser-enabled tests pass or record the unavailable browser prerequisite without claiming execution.
- [x] Run focused tests, strict TypeScript, name guard and strict change validation; verify results are recorded before handoff and leave bot synchronization/archive untouched.

## Verification

- Focused design-system, shared-menu behavior and cache-maintenance API suites: 26 passed, no skips.
- Embedded-project workflows with the real-browser fixture enabled: 12 passed, no skips. Covers embedded and archived menus, transition to an ordinary project, absent cache controls/modal and preserved server deletion refusal.
- Strict TypeScript, name guard, strict change validation and diff whitespace check passed.
- Detailed local command record: `.artifacts/verification.md`. No canonical specs or predecessor tasks were changed; repository bot finalization remains pending.

## Implementation

- [ ] Remove the project build-cache menu action, dialog and unused browser wiring while preserving backend cleanup; verify focused UI assertions and cache-maintenance API tests pass.
- [ ] Hide embedded Delete without affecting ordinary deletion or running-project restrictions; verify Projects/Archive menus and embedded-to-ordinary menu transitions in focused tests.
- [ ] Update browser regressions for the removed modal and hidden Delete; verify the browser-enabled tests pass or record the unavailable browser prerequisite without claiming execution.
- [ ] Run focused tests, strict TypeScript, name guard and strict change validation; verify results are recorded before handoff and leave bot synchronization/archive untouched.

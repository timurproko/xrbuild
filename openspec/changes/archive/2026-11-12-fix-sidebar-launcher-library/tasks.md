## 1. Unified nonempty sidebar sections

- [x] 1.1 Normalize logical section grouping across embedded and selected user projects, keep one trailing Unsorted group and preserve qualified identities and saved ordering; verify layout fixtures with mixed origins, case variants, reserved names and reload.
- [x] 1.2 Hide unoccupied groups without deleting stored organization, preserve temporary new-section naming and original action indices, and add sidebar regression tests; verify empty Unsorted/named sections are absent and section creation, drag/reorder, archive/unarchive and context menus still target the intended groups.

## 2. Selected-panel library in Launcher development runs

- [x] 2.1 Propagate validated selected-panel and current-project context through Browser/Desktop local launches and use it for Launcher catalog selection and self-exclusion without deployment identity; verify dev/built launch-context and Launcher catalog fixtures retain sidebar order and exclude only the current Launcher, archived and ineligible projects.
- [x] 2.2 Permit only bounded catalog/icon/preview reads from validated loopback development origins while preserving native-origin reads and existing mutation protections; verify allowed reads, rejected remote/malformed origins, forbidden writes and no explicit-context packaged/published inventory behavior.
- [x] 2.3 Add recovery and mixed-origin library regressions and perform focused changed-code checks; verify targeted suites, strict TypeScript, `pnpm check:names` and strict OpenSpec change validation pass, with real native visual acceptance reported separately if not observed.

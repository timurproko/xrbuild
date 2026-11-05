## 1. Present publication state in the project sidebar

- [x] 1.1 Make active publication jobs override remote sidebar publication status with yellow `queued` and blue `running` shared state badges, including the shared running-dot animation; verify running takes priority when later work for the same project is queued.
- [x] 1.2 Derive idle sidebar publication state through the existing optimistic per-publisher completion status, remove sidebar-specific color overrides, and re-render the project list on accepted jobs and every publication transition; verify successful Publish shows green `published` and successful Unpublish removes it immediately without waiting for status polling, while failures restore the prior state.
- [x] 1.3 Add UI regression coverage for shared queued/running/published classes, running animation reuse, event-driven list refresh, immediate completion, and reload restoration; verify existing publication and design-system UI assertions remain green.

## 2. Verify delivery

- [x] 2.1 Run focused and full Control Panel tests, strict OpenSpec validation, `pnpm check:names` and `git diff --check`; verify all pass without performing a production publication.

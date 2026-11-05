## Implementation

- [x] Add a bounded navigation-error presentation policy and use it during panel startup; verify stale panels retain restart indicators without opening the generic dialog, while current/unknown freshness still reports the error.
- [x] Add focused navigation/UI regression coverage; verify existing managed/external navigation and freshness behavior remain unchanged.
- [x] Repair stale or incomplete pinned workspace package graphs before managed-module import; verify an existing `node_modules` directory with an old virtual-store lock runs one frozen-lockfile setup, while a matching graph starts without setup.
- [x] Run focused Control Panel tests, strict OpenSpec validation, `pnpm check:names` and `git diff --check`; verify the fix in the linked worktree without modifying the primary checkout.

## Context

Panel freshness is loaded before workspace-tool navigation during initial startup. A stale process therefore already knows whether newer panel source exists when `/api/navigation` returns a configuration error. The current UI reports every such error through the generic modal even when restarting is the only useful action.

Managed-tool setup currently treats any existing workspace `node_modules` directory as ready. A pull can update the pinned workspace lockfile and add a package link while leaving that directory present but stale; the subsequent module import then exposes a missing-package Retry page.

## Decisions

1. Treat a navigation error as restart-covered only when `state.panel.outdated` is explicitly true.
2. In that state, keep navigation tools empty, preserve the restart chip/menu indicator, and write the compatibility message to the browser console without opening a modal.
3. When freshness is current, unavailable or malformed, retain the existing generic error dialog so real configuration faults remain visible.
4. Put the small policy predicate in the shared navigation helper so it has direct unit coverage and does not depend on DOM timing.
5. Treat a pnpm workspace graph as ready only when its normalized lockfile matches the virtual-store lock recorded by the last successful install. Missing or stale installation metadata runs the panel-owned frozen-lockfile setup job before module import.
6. Keep setup generic and trusted: neither tool metadata nor HTTP requests provide a command, package name or install arguments.

## Risks and mitigations

- A genuine configuration error can coincide with stale panel code. It is deferred until after restart rather than discarded; if it remains under current code, the normal dialog appears.
- Suppression could become too broad. It applies only to the navigation response's bounded error and an explicit outdated freshness result, not to API failures or unrelated startup errors.
- Lockfiles can differ only by checkout line endings. Compare normalized text so CRLF/LF differences do not trigger repeated installs.
- Setup can still fail for a real environment problem. The existing managed-tool failure state remains available for that terminal condition; an ordinary stale package graph is repaired before import.

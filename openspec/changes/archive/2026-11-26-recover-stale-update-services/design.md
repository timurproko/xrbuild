# Design

## Context

See proposal.md. Current `startJob` rejects `servicesPending` before allocating a job; Run also checks service freshness before launch. `rebuild-dialog.js` substitutes “The job could not start” without output when admission throws. Update bypasses that guard but never prepares activated public services. The existing `setupBundledServices` API is a recovery path, exposed only in a tool missing-view fallback rather than Apps/Rebuild.

## Goals / Non-Goals

**Goals:** one user concept, Rebuild, including needed service refresh and native compilation as visible steps; Run/Build invoke it automatically as needed and Update ends with it; preserve concurrency, immutable source and restart boundaries.

**Non-Goals:** automatic setup during discovery, private dependency installation, administrative/native tool installation, broad build entry-point refactors or changing the person's running panel.

## Decisions

1. Distinguish ordinary source-input staleness from unsafe/foreign output and active or leftover locks using structured service readiness. Reuse the checked frozen snapshot setup, never string-match an error to authorize resetting state.
2. Reserve a logged action job before asynchronous preparation. Share a Rebuild preparation path: refresh required stale services and rebuild stale native output when prerequisites pass. Run/Build invoke it automatically when needed, without requiring a second action or page. Re-resolve consumers afterward; never execute a captured old factory. Keep busy/setup/launch exclusions and existing consent for administrative tool installation.
   Service setup does not inherently require restart: it publishes a fresh immutable generation with new module paths, and idle publisher/packager discovery can replace the pair. Continue without restart in that normal case. In-place changes to executed core/workspace code or a running tool identity may make restart unavoidable; end with one sentence and a Restart button in the same job result, never unload imports or silently restart.
3. Update prepares changed public services through fresh post-pull code, after core dependency setup and before native rebuilding. Preserve retry markers until all required setup/build completes; include pending service setup in partial-failure final output. Git recovery remains independent of broken loaded services.
4. Normal UI says only Rebuild, with progress such as preparing application components; do not expose bundled/public-services jargon or a separate setup action. Reword the header chip/description so it covers required preparation instead of implying native-only rebuilding. Ordinary preparation failure is a failed job with logs and Retry. Refusals provide one actionable sentence and a direct control; exceptional restart has its button right there. Keep the existing tool fallback setup button only as last-resort recovery.
5. In `update-rebuild.ts`, probe the desktop-validated tools in the child and pass both CMake and generator into `rebuildHost`. That selection propagates to host and plugin configure/build. The direct panel rebuild already passes `desktopSetup.deps.tools()`; standalone developer CLI defaults are outside Update's production call chain and stay unchanged unless inspection finds the same defect on that chain.

## Risks / Trade-offs

- Setup adds downloads/build latency → only explicit actions trigger it; stream progress and reuse valid readiness.
- Concurrent setup or source changes → preserve locks and old generations, serialize preparation and recheck fingerprints before activation.
- Executed modules cannot safely unload → require explicit restart with a control; no stale-service fallback.
- Unsafe state must not look like routine staleness → typed readiness and negative fixtures keep repair fail-closed.

## Migration Plan

No destructive migration. Keep existing service generations, configuration and failed state. Add targeted disposable Git/service and HTTP/UI fixtures for changed inputs, failure/retry and busy/restart boundaries; fake competing CMake executables exercise selection without a native build. Run only touched tests. Implementation follows plan approval, services recovery first, CMake second.

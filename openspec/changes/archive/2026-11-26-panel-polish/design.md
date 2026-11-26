# Design

## Context

See proposal.md for motivation. On current main, app.js awaits ping, workspace, multiple maintenance/activity requests, projects, page setup and navigation, then font readiness, before removing workspace-pending. Navigation uses same-tab document links for standalone routes. index.html also loads an external font stylesheet. These are observed gates, not yet a measured attribution of elapsed time. Hands, Calibration and Design have independent boot paths that need the same first-paint audit.

Existing Update status is cached/local Git information, not a live remote check. update.ts already discovers origin HEAD for explicit Update; its safety rules must remain separate from a passive notice. renderSettingsStatus inserts a saving/error block into the form. rebuild-dialog.js owns shared Rebuild/Update output; Jobs already has the desired copy-block markup and clipboard interaction. PR 56 edits Update results and remains open at planning time.

## Goals / Non-Goals

**Goals:** Keep route/header identity visible while data arrives; distinguish remote availability from eligibility to update; preserve save ordering and Update safeguards; reuse controls and styles.

**Non-Goals:** A new SPA/router, speculative preloading of device services, background pulls, changed dirty-workspace policy, visual redesign, or access to the person's running panel/profile/projects.

## Decisions

1. **Measure, then remove actual paint gates.** After approval, run an isolated panel on an unused port with disposable workspace and browser profile under the task evidence directory. Record click-to-header/frame and click-to-content times, navigation/resource timing and request waterfalls for all six modules, repeated with warm assets and deliberately delayed data/fonts. Compare identical before/after conditions (median of at least five warm transitions per destination, plus cold results). Prefer early static shell visibility, non-blocking font loading if measured, and route-specific parallel/deferred hydration over a router rewrite. Do not hide the entire body until unrelated requests settle. Preserve canonical routes, back/forward, keyboard navigation and existing theme-before-paint behavior.
2. **Cache passive remote discovery server-side.** Add a bounded, noninteractive, read-only origin HEAD/default-tip query, normally git ls-remote --symref origin HEAD, with a short timeout and no fetch/ref/index writes. Compare advertised commit with local history: a contained tip is not an update; an unknown tip means remote content is available, not proof of fast-forward eligibility. Use the repository's actual top-level root and deduplicate equivalent paths. Never inspect dirty settings/projects to decide this notice. Cache per repository and expose lightweight status without waiting in page boot. Check at startup and every five minutes, single-flight, only when no job is queued/running. Coordinate admission with existing job starts so they cancel/defer an in-flight passive query rather than overlapping. Offline/authentication failures stay silent; retain only honestly qualified prior knowledge, never label a failure a fresh check. Recheck after explicit Update finishes. Reuse maintenance chip/dot classes, ordering and action handlers on applicable module headers.
3. **Keep saves silent and position only failures out of action flow.** Remove pending-save text while retaining SettingsWriter's serialized writes, overlay, retries and action flush/error protections. Use existing field-error/help primitives in a non-displacing anchored error area; verify a long error and narrow layout do not cover Run. No success toast or replacement status line.
4. **Make the dialog change additive and small.** Wrap the existing log in xrb-copy-block and use the Jobs xrb-copy-action/icon-button markup and copy feedback. Copy the complete current job lines, not the displayed last twenty lines; use diagnostic output when no job exists. Apply at the shared log component so Rebuild, Update and prerequisite states inherit it. Avoid rewriting Update result presentation. Check PR 56 at implementation finish and merge main if it has landed, as requested.

## Risks / Trade-offs

- Early shell reveal exposes partial data → retain correct route-specific frame and existing concise loading/empty/error primitives; add delayed-request browser coverage.
- A remote tip can be unknown or rewritten → the badge is advisory only; explicit Update still freshly discovers, fetches and validates safety.
- Remote commands can hang or race jobs → bound runtime, disable prompting, single-flight queries and cancel/defer them on job admission.
- Error text may overlap controls at small widths → reserve an independent anchored error surface and check geometry at desktop and narrow widths.
- Shared dialogs affect the gallery/tools too → targeted shared-component tests cover these consumers without changing Update result logic.

## Validation and Migration

No data migration or new dependency is planned. Run only focused navigation/shell, remote-discovery/job-admission, settings-save and dialog-copy tests. Use real-browser screenshots for each changed module shell, the update indicator, pending/failed settings save and maintenance running/failed log views. Save screenshots and before/after timing tables in the crew task directory, then stop all disposable processes. At implementation handoff, push the final head and dispatch CI without waiting or polling; keep the PR draft and do not merge. Rollback is the ordinary code revert, with no workspace transformation to reverse.

## Context

`native/host/src/presenter.cpp` currently invokes `onQuit` directly for Escape before normal keyboard forwarding. The SDK's ReturnControl separately listens for Escape, so it cannot consistently win in the native host. The browser fullscreen wrapper currently relays projection messages only. The cursor already draws a ring and an interactive-target dot, but that style is fixed. `Segmented.select()` returns immediately when the selected index is activated again.

The maintainer merged the preceding task as `8828296` and approved implementation. This task now uses that baseline in its own linked worktree.

## Goals / Non-goals

Goals: shared Escape semantics, global cursor choice for managed app launches, no double cursor, reusable axis re-selection, and a balanced showcase.

Non-goals: changing hand tracking, making every existing segmented control toggle, closing unrelated browser tabs, hot-swapping native providers, redesigning the entire Settings system, or applying local preferences to already deployed packages.

## Decisions

### 1. Resolve one shell action, then execute it once

The shared runtime owns the decision; host and browser lifecycle adapters execute it. Remove the independent ReturnControl Escape listener in favor of that shell handler, while retaining X's existing navigation and sound path.

| Current context | Windowed | Fullscreen |
| --- | --- | --- |
| App with a validated launcher return | Return to launcher | Return to launcher, keep session alive |
| Direct app with no return | No shell action | Close owned session gracefully |
| Direct Launcher with no return | No shell action | Close owned session gracefully |

Validate return destinations using the existing bounded launch-context rules. A malformed or rejected return is not permission to navigate elsewhere. Preserve the current projection, Mouse selection, and cursor choice when returning. Ignore key repeat and duplicate in-flight actions; listeners and pending work are disposed with the runtime. Escape must never both navigate and quit. Do not change unrelated app keyboard bindings or in-page dialog behavior in windowed direct apps.

Native Escape must no longer unconditionally invoke `onQuit` before the SDK sees it. Use a neutral main-frame host bridge for close/cursor requests, validated against the current frame and document URL rather than exposing session-close privileges on the shared telemetry socket. Inject a deferred Escape fallback before page scripts; a synchronous SDK preventDefault takes precedence. Scope bridge functions to the originating page context so stale navigations cannot affect the current page. Honor actual presentation fullscreen state, not browser viewport dimensions or a stale app manifest. A requested close uses the host's ordinary cleanup path, not forced process termination. A fullscreen direct launch without a usable SDK retains a safe graceful Escape fallback; an already registered launcher-return context must not be timeout-closed. Test navigation/reconnection and repeated Escape explicitly.

A managed browser window belongs to the preview lifecycle. Allow its current page to request only that fullscreen session's closure using existing route/token scoping, origin checks, and active-session validation. Do not expose unrestricted run-stop privileges to app pages. If a wrapper relays requests, check both message origin and source window. Stale pages, foreign tokens, windowed sessions, and stopped sessions must be unable to close anything. Update runner state after actual closure. Avoid a focus-dependent global key hook.

An ordinary browser page cannot reliably close a tab it did not open. Leave windowed tabs alone; permit the browser's normal Escape exit from fullscreen. Do not suppress browser security behavior or claim a plain fullscreen tab can always remain fullscreen during return navigation. This exception is distinct from panel-owned fullscreen previews.

### 2. Cursor is a core Apps preference, not a plugin preference

Add a core Apps contribution on the existing Settings page, visible under both All and Apps. Reuse design-system form/dropdown/tooltip primitives. Proposed label and choices:

- Cursor: **System** — native/browser pointer, no SDK ring.
- **Ring** — SDK ring, no center dot.
- **Ring with hover dot** — SDK ring with a dot only over an enabled interactive target; default.

Persist a bounded enum in workspace-owned core preferences. Absent or invalid legacy values resolve to the default without affecting other settings; reject invalid writes. Show that changes apply on the next run. Read the preference on both built and dev launch paths, with no rebuild required. SDK option and finite launch-context value share the same parser; propagate through launcher launch/return. Independently opened SDK apps use their explicit option or the same default without requiring a panel.

Cursor style does not enable Mouse input. Mouse-disabled launch configuration prevents mouse binding and app-surface mouse feedback regardless of selected style. For enabled Mouse, System restores host/browser pointer visibility and disables the SDK ring; rendered modes hide the system pointer over the app surface. Coordinate native presenter visibility across mono/stereo switches and browser canvas style restoration on disposal. Never leave an invisible cursor in System mode or two pointers in rendered modes. Ring radius, idle hiding, physical scaling, press feedback, and enabled-target hit testing remain shared runtime behavior.

### 3. Axis re-selection is opt-in

Extend the shared segmented-control contract with an optional re-selection fallback index. Its default remains the existing radio behavior. A hand or mouse activation of the already selected non-fallback segment selects the fallback once; programmatic selection remains idempotent. The showcase supplies Full (index zero) as fallback. Activating Full while selected does nothing. Keep normal enabled-state handling, change events, statuses, and sound centralized. Test all three axes and both hand/mouse sources, not just a source-code assertion.

### 4. Reorder the showcase without adding clutter

Preserve the top row. Place the round button, robot trackball, and dial on a common middle-row world-space Y. Place stepped and continuous sliders below them, on symmetric left/right positions; keep the axis selector below the central trackball. Keep title/status text within the visible panel and clear of neighboring controls in Perspective and Orthographic. Do not restore checklist, footer help, or Tab/R diagnostics. Shared APIs own behaviors; the showcase owns only positions and wiring.

### 5. Put all Activity controls in one header

Use one shared header row above the Activity content: Jobs/Log tabs at the left, the selected tab's filter group in the center, and its existing X clear action at the far right. Keep Jobs first without resetting the saved selected tab. Switching tabs swaps filters and clear-action scope in place; preserve each tab's filter state, counts, tooltips, disabled/hidden states, and clear semantics. X clears log output or finished jobs as before; it does not close Activity or stop active jobs.

Keep only the tabs inside the ARIA tablist. Filters retain their own labeled group and clear buttons retain their accessible names. All header controls remain keyboard reachable with the existing tab navigation intact. Use shared design-system layout primitives/tokens rather than another bespoke toolbar style. At narrow supported widths keep the header on one row, with bounded horizontal overflow for filters if necessary, never overlapping tabs/X or putting controls back into the content area.

Remove the separate tools rows from both tab panels. Their content areas contain only log/job items, selected item output, or the normal empty state. Preserve quiet background jobs, explicit log expansion, and existing top-anchored section transitions. Verify both tabs with large counts, dynamic debug filters, empty/nonempty states, keyboard focus, and narrow/wide panel layouts.

### 6. Existing Settings visual regressions

Apply the existing glyph tint token to the All gear and Settings favicon. Keep selected/focused navigation cards inside their paint bounds and prevent sticky-heading shadows from covering the first card's top border. Check narrow/wide layouts, scrolling, light/dark themes, and keyboard focus; no plugin configuration changes.

## Risks and mitigations

- Native key routing can race with page navigation: use page-scoped state and idempotent actions; test old connections and repeated keys.
- Browser fullscreen can consume Escape: test a real owned fullscreen window separately from mocked DOM and ordinary tabs, and report the unmanaged-browser limitation honestly.
- Native system cursor is currently hidden for stereo: cursor policy must reach the presenter, not only canvas CSS.
- New controls can overlap in perspective: capture both projections at windowed and fullscreen sizes after building the showcase.
- Existing uncommitted work overlaps these files: resolve the dependency before coding; do not adopt another task's worktree or claim its changes in this branch.

## Verification

Exercise Desktop/Browser x windowed/fullscreen x direct/launcher-return with Test and Launcher. Include actual native host cleanup, actual browser focus/fullscreen behavior, repeated Escape, invalid return context, stale close requests, projection changes, and launch/return cursor persistence. Unit-test the policy independently, cursor modes and hit feedback, Settings persistence, and segmented re-selection. Rebuild affected apps against this worktree's SDK and capture showcase layouts. Native/fullscreen checks not performed must remain explicit acceptance gaps.

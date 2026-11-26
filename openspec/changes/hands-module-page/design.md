# Design

## Context

See proposal.md for motivation. The person's correction supersedes the earlier preview recommendation: **no fixture or generated preview**, and no separate advanced diagnostic page.

Observed at planning time:

- Main is `48a59a5`, including merged PR 48. `ui/hands.html` and `hands.js` are core-owned source configuration; `server.ts` reserves `/hands/` and `/hand-tracking/`. `hands-state.ts` owns revision-safe workspace `config/hands/profile.json`.
- The optional public input plugin currently registers `/hands-diagnostics/`. Its nested sample provides the requested three-column layout, header chips, orbit/view/reset/fullscreen controls, Output and Stats. Its `main.ts` also combines camera/depth/recording/fusion workflows and constructs `HandInput` with smoothing, prediction and grace disabled. Copying that application would copy the wrong hand pipeline and optional dependency boundary.
- Native providers currently start with the complete app host. There is no selected-provider session behind the core Hands page, and historical app status does not supply live browser frames.
- PR 50 is still open, at `c7c2a1e8f78b7f0a968e87aea56f46533edc2338` when inspected. Its design owns the shared profile validator, ingress transform, visual appearance, explicit Apply and run-bound delivery. Its final controls are a self-contained `hands-adjustments.js` mount with load/apply callbacks and refresh/dispose, deliberately independent of source-card markup.
- Core already serves three.js and a strict subset of SDK browser modules for its icon preview. The new core viewer must not depend on optional diagnostic build/service setup.

## Goals / Non-Goals

**Goals:** reuse the existing page's visual topology, not its laboratory application; preserve global source and adjustment semantics; have one SDK-based viewport whose future provider-session transport can be connected without replacing the page or controls.

**Non-Goals in this first PR:** standalone provider startup, app observation, camera acquisition, model/runtime setup, native ABI changes, post-processing loader/ABI, mesh support, recording migration, new filters or calibration. No generated-hand feature, fixture controls or fixture-only tests/targets. Ordinary software regressions may use fake metadata/transports; they do not introduce a product fixture mode or run installed providers.

## Decisions

### 1. Two back-to-back PRs, with explicit limits of the first

**Recommend the split:** ship this page-only change first, followed immediately by a separately planned live-provider session change. Removing the fixture means the first page has an honest empty canvas, not a live-hand demonstration. This limitation is deliberate and must appear in the UI and handoff, not be hidden by animation.

| Delivery | Scope | Estimate |
| --- | --- | --- |
| This PR: Hands working-surface shell | Three-column core UI, real provider picker/status, idle SDK viewport and real adjustment controls, post-processing slot, Output/Stats, diagnostic UI retirement and isolated screenshots | 3–4 engineer-days after adjustment integration is available |
| Immediately following PR: real live Hands | Explicit selected-provider Start/Stop, headless worker, exclusive app/session acquisition lease, authenticated transport, SDK ingress/profile updates, errors/no-hand/cleanup states and real-hand interaction targets | 5–8 engineer-days, excluding physical-device acceptance |
| Alternative: one combined PR | Both scopes, first useful live hand delivered only when native lifecycle/lease is finished | 8–12 engineer-days before delivery |

The combined PR is technically possible, but holds a straightforward UI replacement behind cross-process safety work. The split avoids rebuilding anything: the core viewport has one empty-frame-capable SDK adapter now; the following PR supplies its transport and session status. PR 50's shared controls/profile are reused in both. The next PR needs its own approval; this PR does not sneak in native worker work. No third interim fixture implementation.

### 2. Exact layout and initial tabs

```text
XR Build  Hands v                           [render fps] [hand tracking fps]

+-----------------------+  +--------------------------------+  +---------------------------+
| SOURCE | POST-        |  | [View v]     [Reset] [fullscreen]|  | ADJUSTMENTS | OUTPUT |    |
|          PROCESSING   |  |                                |  |                         STATS|
|                       |  |        large 3D viewport       |  | POSITION AND SIZE         |
| Skeleton provider [v] |  |                                |  | X / Y / Z (mm), Size      |
| purpose / availability|  |        No live hand session.   |  | [Reset to defaults]       |
| reason / idle notice  |  |                                |  |                           |
| [Save source] [Reload]|  |        no generated hand       |  | APPEARANCE                |
| next-launch help      |  |        no fixture targets      |  | existing PR 50 fields     |
|                       |  |                                |  | [Reset to defaults]       |
|                       |  |                                |  | [Apply]  delivery status  |
+-----------------------+  +--------------------------------+  +---------------------------+
```

Source and Adjustments are selected on every initial opening; tab changes do not destroy dirty forms. Post-processing is a full tab caption (it may wrap as an existing responsive tab layout allows), not an invented Pipeline editor. The two adjustment sections remain together, as required by PR 50. Output and Stats preserve the diagnostic's useful generic readouts, not camera/fusion/source selectors. There is **no Capture or Record tab** in the new page.

Post-processing initially says exactly: **“No post-processing plugins are installed.”** No invented registry, stage toggle, example plugin, installer, asset fetch or new profile field. A future registry change replaces that empty state; this PR only provides its location.

Use existing `xrb-app-bar`, product menu, `xrb-tabs`/`xrb-tab`, sidebar content/section, cards, media stage/empty state, key/value lists, chip, field grids and button rows. Use the diagnostic's existing three-column responsive topology and existing shared spacing/theme rules, not copied palettes, custom controls or an iframe. At narrow widths use existing panel stacking; keep the viewport usable and forms internally scrollable. All tabs are keyboard accessible and use existing focus/indicator behavior. View/Reset/fullscreen are scene controls, independent of profile reset and fixture Restart (which is removed).

### 3. Source, viewport and metrics are separate truths

The provider picker is the **first control** in Source. Continue owner-qualified IDs, saved missing choices, availability reasons, unique-real initial default, revision/registry checks, source Save/Reload and next-launch-only behavior from PR 48. No installed/device-ready equivalence. Saving source must preserve unknown/adjustment fields and adjustment drafts. Explicit Synthetic selection is identical to any other installed provider choice; there is no local synthetic transport in this page.

Before standalone sessions land, next to source status show: **“Live view is idle. The selected provider runs when an app is launched; live viewing here is not available yet.”** The viewport says **“No live hand session.”** No nonfunctional Start/Stop button, promise that opening an app populates this view, hardware check or silent synthetic fallback. With no source: “Choose a provider. No live hand session.” A historical app result is labelled **Previous app session**, not Running in the Hands viewport.

Keep both header chips. Render fps is actual viewport animation/render frequency. Hand tracking fps is `—` with an idle/unavailable description until frames arrive from a Hands session; never count requestAnimationFrame as tracking fps. Output shows selected/saved source and view idle status. Stats uses only real page metrics; hand count/frame age/capture rate are `—` without a session, not fabricated zeros or a green 60-Hz chip. No capture/performance claim from software tests.

Without the optional input plugin: the entire core shell, viewport, profile controls and tabs still open. List other installed providers normally, preserve an unavailable saved choice, or show “No providers available” with its reason. There are no install/retry walls and no diagnostic compiled-output dependency. Valid profile adjustments remain editable even when the source is missing. Invalid profile state is an actionable error and is not replaced by defaults; no frames are admitted without a validated profile.

### 4. One SDK renderer seam, no raw diagnostic path

Create a small core view module owning renderer/scene, camera/orbit tools, resize/fullscreen, scene disposal and one source-neutral frame/status adapter. Extract only neutral camera/view/layout behavior from the public sample, retaining necessary notices. Do not import its boot module, fixture generator, rawOptions, bridge, recording panels or source-specific visuals.

Use SDK `HandFrameIngress` and `HandInput` with app-default smoothing/prediction/grace, the PR 50 validated profile/one-time adjustment stage, shared scene-hand mapping and standard `HandVisual`. Match the existing managed SDK pipeline order and use regression comparisons against that same pipeline, not newly authored hand math. The view starts with no frames and the applied saved snapshot. Do not apply profile geometry again to a visual group. Geometry Apply uses PR 50's release/reset semantics, appearance-only Apply does not reset interactions, and unsaved edits are not rendered as an alternative profile.

Extend the existing core read-only SDK module serving with an explicit minimal transitive module allowlist, browser-safe import rewriting and import-map resolution for the SDK's installed three.js dependency and the required orbit addon. No arbitrary path-based source serving, client transpiler, optional plugin build, npm install or compilation on page navigation. Test unsupported paths and dependency closure so missing modules fail visibly rather than fall back to diagnostic assets. If existing SDK lifecycle helpers are extracted for reuse, both app and Hands use them without behavior changes.

The transport-facing adapter accepts canonical frames plus epoch/sequence/time metadata and a validated profile/status, and exposes clear/reset/dispose. It does not know a provider name or camera API. In this first PR it has **no production frame producer**. Stop/disposal clears hands and held input. Generic adapter contract tests do not expose generated hands in the product.

**Interaction targets:** omit the old generated pinch/drag targets from this first PR. The following live-session PR adds a shared SDK pinch target and drag target driven by the actual session hand; do not keep synthetic-only logic or count mouse actions as tracked hand tests. This is an explicit change from the original brief, following the correction.

### 5. Mount PR 50, do not reimplement it

Reserve the right Adjustments panel for the exact self-contained adjustment root from PR 50. Mount once with its load/apply callbacks; tab changes only hide/show the root and preserve drafts. Position and size and Appearance keep their own Reset to defaults and one explicit Apply for both. Keep Save source independent from Apply, including incoming-change/stale/conflict recovery and accurate saved/applied/delivery-failed states.

Because PR 50 is not merged at planning time, this plan contains no alternative schema, transform, field bounds or competing form. At implementation, update from main after PR 50 merges, mount its delivered component and connect the viewport's saved-profile subscription to that same validated snapshot. Shell/source/retirement work can proceed first; the adjustment-integration outcome cannot be completed without PR 50. If PR 50 is delayed, report that dependency rather than ship duplicated or pretend-enabled controls. Reconcile its delta specs before finalizing this change so both additions survive; do not overwrite its profile requirements.

### 6. Diagnostic feature disposition and data ownership

Recommendation: retain only the general viewing/status affordances in Hands. All laboratory workflows leave product UI; their source code stays in the public sample for now but is **unreachable through the panel**. No advanced page, hidden link or iframe replaces the removed diagnostic.

| Existing feature | Decision in this PR | Detail |
| --- | --- | --- |
| Generated fixture delivery and scenarios | Removed from Hands UI; old implementation unreachable | No Local fixture, Fixture dropdown, animation, Pause/Restart or fixture test feature is ported |
| Browser camera landmarks | Code retained but unreachable | No source option, capture button, media permission or automatic model request |
| Native RGB-D capture | Code retained but unreachable | No capture service/tool registration or native bridge activation from Hands |
| Markers and calibration | Code retained but unreachable | No marker detector or calibration workflow; stored calibration is untouched |
| Surface reconstruction | Code retained but unreachable | No reconstruction controls, depth view or surface pipeline imported into Hands |
| Two-view fusion | Code retained but unreachable | No multi-view source, calibration or fusion startup |
| Benchmarks | Code retained but unreachable | No benchmark tab/action, no fabricated performance results |
| Diagnostic recordings | Code retained but unreachable | No Record tab/start/export/import action; files remain on disk |
| Diagnostic replay | Code retained but unreachable | No viewer replay delivery or format migration; provider-level Replay, if installed/configured, remains a normal separate provider |
| View, orbit, Reset, fullscreen | Kept inside Hands | Scene controls only; no settings or calibration writes |
| Output and Stats / header fps | Kept inside Hands | Generic pipeline/page readouts with honest unavailable states |
| Generated-only pinch/drag targets | Removed in first PR | Restore only as real session-driven SDK targets in the immediately following PR |

Remove the optional tool declaration and related component/service references so ordinary discovery cannot register or start it. Reserve old page routes in core before tool dispatch, hide obsolete route entries even from stale tool navigation, and refuse retired diagnostic asset/API routes instead of activating their handlers. Preserve the plugin's ordinary native provider declaration. Update source documentation and route/navigation tests; do not delete historical archived OpenSpec records to remove a historical name. Direct developer source files are not a product route or a supported user workflow.

**Data stays exactly where it is, relative to the selected writable workspace:**

- Global source/adjustments: `config/hands/profile.json` (only explicit current source/Apply operations may write it).
- Diagnostic preferences and scalar calibration: `config/plugins/input-hands/preferences.json`.
- Optional user-supplied models and plugin configuration: `config/plugins/input-hands/`.
- CSV recordings: `.xrb/hand-tracking/recordings/`.
- Explicit raw image/depth exports: wherever the person saved them; no discovery/import/move.
- Existing caches such as `build/hand-tracking/`: retained, not cleaned as part of page retirement.

No data is relocated into core or auto-migrated to the Hands profile. Runtime Apply/source writes never touch plugin data. Unreachable data is retained deliberately; document its path rather than imply a recording browser still exists. Deleting dormant algorithms and their own regression coverage is outside this page change.

### 7. Following real-provider PR: contract already allowed for by the page

This section specifies the proposed immediately following scope, **not implementation tasks or promised behavior in this first PR**.

- Add a headless native session worker reusing provider loader/ABI create/start/stop/destroy, without display/CEF or a second full app host. Passive navigation stays passive. An explicit authenticated Start snapshots the saved selected source/provider settings and global profile; Stop releases it. Source draft edits do not hot-switch acquisition.
- Use one exclusive acquisition lease shared with managed app launches, across relevant panels/checkouts in the same device/runtime scope. A running app blocks Hands Start with an owning-session reason; a Hands session blocks app Run. No implicit app termination, second capture open, lease stealing on heartbeat timeout or simultaneous observation. Verify worker death/callback quiescence before releasing an abandoned lease. Standalone-host participation/unsupported paths must be explicitly bounded in that plan, not assumed safe.
- Token-bound loopback transport sends bounded latest frames, not an unbounded FIFO. Validate finite coordinates, frame size/count and clocks; carry owner, epoch, sequence and capture/delivery timing. Late frames from stopped/replaced sessions are rejected, not drawn with a new profile. Keep native hand ABI/wire payload unchanged.
- Feed the existing core view adapter, not another renderer. Initial valid profile precedes first frame. Apply subscribes to PR 50's global validated profile with ordered session-bound acknowledgement; geometry changes clear SDK holds/filter state, appearance does not. Profile changes do not change the running source.
- Distinguish Starting, Running/no hands, Running with hands, Stopping, Failed, source unavailable and lease occupied. **Never** insert synthetic data for no hands/error. Tracking fps derives from provider frames, render fps from rendering. UI idle guidance can then become “Start <selected provider> to see your hand.” Labels use generic provider metadata.
- Stop acquisition and retire frame epochs on explicit Stop, owning page/session disposal, disconnect timeout and panel shutdown. Bounded cleanup covers start cancellation, crash, denied start, lost tab and repeated Stop. Do not expose credentials in URLs/logs/preferences. Unsupported browser/XR contexts remain explicit; no automatic XR session entry.
- Add pinch/drag targets using shared SDK interaction with real provider frames only. Validate ownership/clock/lifecycle and no-data behavior using fake workers/transports; actual hardware correctness and latency require separate opt-in acceptance and are not claimed by mocks.

### 8. Isolated implementation acceptance

Planning creates only OpenSpec files and a draft PR; **no new-page screenshot is claimed now**. After approval, run a disposable panel on a free non-personal port, with explicitly task-owned workspace/projects/browser profile under the allowed task output folder. Never connect to, restart or modify the person's panel, home workspace, profile or projects. No camera, hardware, model download, installed tracker or real provider startup in this task.

Capture screenshots of the implemented Hands page from that isolated instance at the browser's **default window size**, without widening or device-metrics emulation; record actual outer/inner dimensions. Include Source + Adjustments opening state, Post-processing, Output/Stats and missing optional plugin. Use the existing panel theme(s); narrow-width checks are supplementary, not substitutes for the default-size proof. Pictures, logs and disposable state stay in the task output folder, not project source.

Targeted checks cover layout/tab persistence, saved/missing/empty providers, no generated controls/canvas hands or acquisition/writes on navigation, historical-versus-viewport status, profile Apply/source independence and conflict handling, shared-pipeline parity/one transform, accurate idle rates, default-window and responsive overflow, alias redirects before tool startup, retired routes returning no service, and byte-identical pre-seeded preferences/calibration/recordings after page operations. Assert the core page opens without optional plugin/build dependencies. Stop every owned server/browser/process before the report. Broad integration belongs to CI; no native/hardware result is inferred from a skipped lane.

## Risks / Trade-offs

- [Page-only delivery is not yet a useful live hand tester] -> explicit idle copy next to source status, no fake motion, and the bounded immediate 5–8 day follow-up; combined delivery remains the stated alternative for approval.
- [Optional plugin silently remains a second page/service] -> remove tool declarations/references, reserve aliases before managed-tool dispatch, block old endpoints and check navigation with the plugin present and absent.
- [SDK browser exposure grows too broad] -> explicit minimal transitive allowlist and import rewriting, no user-provided filesystem paths or arbitrary source-serving endpoint.
- [PR 50 merges different component details] -> integrate its actual exported mount/validated snapshot after merge; preserve its independent outcomes/schema and dirty-state semantics rather than clone it.
- [Moving forms destroys drafts or conflates Reset actions] -> mount once, hide tabs without disposal; separate scene Reset from adjustment resets and source Save.
- [Data is mistaken for obsolete build output] -> no cleanup/migration step and byte-preservation tests at the documented plugin storage paths.

## Migration Plan

1. Land PR 50 before completing this PR's adjustment integration; update this branch from current main and reconcile requirements additively.
2. Replace the core page and unregister the optional browser tool. Preserve provider registrations, global profile semantics and all plugin/user data. Old page bookmarks redirect; retired tool endpoints no longer initialize services.
3. Document the first delivery as an idle surface, not real tracking. Next PR connects the same adapter and Source status/action slot to the headless session.
4. Rollback restores prior UI/registrations without any data conversion. Saved profiles remain compatible with the existing source/adjustment owners. No rollback deletes files or rewrites user projects.

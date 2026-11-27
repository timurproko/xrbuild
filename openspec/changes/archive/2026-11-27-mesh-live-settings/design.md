# Design

## Context

See `proposal.md` for motivation. This clean task branch was fast-forwarded from an old pooled snapshot to `main` at `a3549fd6c5c846e2a23f383815b2828cc52b7a3d` before planning. The archived `mesh-contracts` change and `docs/hand-mesh-{plugins,protocol}.md` define the existing boundary.

- `ui/hands-postprocessing.js` is independently mounted and owns GET/PUT polling, local drafts and Save/Reload. It currently blocks all controls during a save, marks foreign revisions stale and displays a string status rather than interpreting `delivery`.
- `ui/hands-adjustments.js` supplies the matching number/slider layout, shared number steppers, floating gear menu and commit-time behavior. `hands-commits.js` provides a reusable field-wise three-way commit helper. Its existing page queue is not passed to post-processing, so backend revision checking remains essential even within one page.
- Post-processing GET returns `plugins`, `choice`, `revision`, `registryRevision`, `running`, `active`, `status`, `delivery` and `problem`. PUT takes selected identity, full effective values, profile revision and catalog revision; it persists first and schedules asynchronous reconciliation. POST retry requires current `{runId,revision}`.
- Delivery includes `{runId,phase,reason,progress,step,requestedGeneration,appliedGeneration,drawingGeneration,savedRevision,owner,id}`. Modern capabilities are `live-configure-v1`, `preparation-progress-v1` and `final-pose-observations-v1`; settings use `changeMode:live|reprepare`. No new message or capability is needed.
- Main does not yet attach a mesh run to the standalone Hands viewport. That is the parallel session integration's responsibility. This UI consumes supplied evidence without creating sessions, guessing status or changing runtime ownership.

## Goals / Non-Goals

**Goals:** Local editor and delivery state machines that keep incomplete input, committed intentions, persisted state and acknowledged application separate; shared visual and accessibility patterns without cross-worker edits.

**Non-Goals:** Backend or protocol changes, new settings declarations, process lifecycle changes, session/viewport/SDK edits, appearance toggles, runtime setup, physical hardware acceptance or quality/performance claims for a real processor. Ordinary adjustments and their shared helper files remain unchanged.

## Decisions

### 1. Keep the component root and derive every control from declarations

Retain `mountHandsPostprocessing` and existing `refresh/reload/dispose` compatibility so `hands.js` need not change. Extend its injectable test boundary for retry as necessary; production defaults call existing endpoints. Use shared fields, number steppers, icons, floating menus and keyboard handling, scoped to the post-processing root. Reuse the numeric row classes; add only root-scoped styling in `hands.css` if needed. Use safe text/attribute escaping for all plugin metadata, including hints.

Render each numeric setting with the declared finite min/max and optional step. Omitted step must preserve the existing number field's `any` acceptance; the slider is a bounded approximation of valid continuous values and must not quantize typed values. Degenerate valid ranges must not invent values or cause division errors. All field labels remain plugin-owned; neither keys nor control wording imply a particular plugin or device.

Keep the section when installed entries are unavailable or None is selected. Preserve missing identities. The gear resets only the current plugin's declared settings, not the selector: selecting None is already an explicit independent action, and resetting another section must not erase saved plugin preferences. Reset is unavailable without a usable current declaration. Use unique per-mount IDs and remove document-level listeners and floating menus on disposal.

Alternative rejected: adding widgets or plugin branches to the shared design system, changing page markup, or treating Reset as a destructive global-profile reset.

### 2. Model field intentions and commit only completed values

Use `input` for synchronized local previews and `change`/Enter/stepper completion for valid commits. Track field base value, current value, local edit version and committed state, including selection as an independent intention. Do not collect unfinished neighboring numeric fields into a save. Use a local serial writer with the newest pending committed intentions; snapshot each submission and remove only edits matching its version on completion. Keep later edits during a pending request recoverable rather than silently ignoring them. Deduplicate equivalent completion events.

Use the existing `commitHandsFields` helper through a post-processing-specific read/save adapter when its conflict semantics fit, or the same bounded three-way algorithm locally without changing shared helpers. Before PUT, load current choice/catalog/profile revision, compare only intended selection/settings against their original bases, merge untouched values from the latest selected plugin's effective settings, and send the required full values. Retain settings schema version in comparisons; a changed declaration/catalog requires fresh validation or explicit review, not a stale automatic write. HTTP wrappers retain status codes for conflict handling. Bound retries and never automatically retry unsafe data, busy/preparation, validation or transport failures.

Unrelated profile changes rebase safely. Same-field or selection/schema conflicts show saved versus intended values with explicit Retry and Use saved; subsequent unseen changes still conflict. Clean fields incorporate newer snapshots while unfinished local fields remain untouched. Switching plugins must preserve per-plugin intentions and saved values; a completion for a previously selected plugin cannot replace the current selector. Invalid saved state blocks writes without resetting the file. No routine Save/Reload controls remain, though the programmatic reload hook and explicit error recovery can reload reviewed state.

Alternative rejected: optimistic full-profile replacement, treating revision hashes as ordered clocks, autosaving every input event, or sending every draft value on an unrelated commit.

### 3. Let service evidence, not UI timing, determine application

Immediately retire any Applied display when a newer local commit/save/retry is pending. Maintain monotonically increasing local read/write/status request epochs and bind observations to the current desired saved choice/revision and run. Within one run reject older requested generations; across runs never compare generation numbers or carry applied evidence. Poll while mounted using the existing interval, but stale reads cannot override newer writes, retries or component disposal.

The component shows Applying for unacknowledged live configuration and Preparing for matching service preparation, using optional finite progress/known steps only. A setting's `changeMode` can explain why preparation is expected but cannot manufacture readiness or completion. Applied requires matching selected identity (including None), saved configuration revision and `requestedGeneration === appliedGeneration` for the current run, with usable modern evidence and no newer local committed intention. Ready alone is insufficient, especially for legacy peers. None follows cleanup acknowledgement, not merely selector save.

Use `reason`/safe server status for Failed and unsupported/relaunch guidance. Persisted choices remain on delivery failure. Retry posts only the currently observed run ID and current saved revision; revalidate after races and retire old retry results. Save/network conflicts use editor recovery, not mesh delivery retry. Idle saves are quiet and start nothing. Applied does not imply Drawing; do not infer mesh visibility from ready or a remembered drawing generation. Keep the exclusion notice concise and truthful without asserting that unwired Hands mesh delivery already works.

Alternative rejected: showing Applied after HTTP 200, interpreting skeleton acknowledgements as mesh acknowledgements, starting a provider to obtain a status, or implementing configure/ACK transport again in the browser.

### 4. Fake-only validation stays inside this component's boundary

Adapt `test/hand-mesh-browser.test.ts` away from explicit Save/Reload expectations and add focused post-processing tests for arbitrary schemas, field/selection commits, reset menu accessibility, invalid values, nonconflicting rebases, same-field conflict review, queued edits, old response/poll/retry fencing, legacy peers, idle operation and disposal. Delayed fake delivery must demonstrate that a successful save does not display Applied, reprepare stays Preparing without ending the fake input session, exact ACK advances status, and failure exposes explicit Retry.

Capture the unmodified production component before editing and the final component after editing, using the same fake declared number/select/boolean schema and selected identity. Retain eight baseline/final images covering light/dark at normal and narrow widths, plus open reset-menu/status proof where useful. Browser tests use task-owned disposable servers/workspaces and never the person's running panel or real user home. All scratch, profiles, logs and pictures stay in the assigned external task folder; project edits stay in this checkout. Stop every owned server/browser/process before the report.

Run targeted post-processing UI/browser and nearby Hands adjustment/page contract checks only, with browser opt-in enabled for actual browser evidence. The brief's later no-full-suite rule and shared delivery skill govern validation: no full local repository/package sweep. Hosted CI supplies broad coverage; do not present skipped browser checks as passed UI evidence. Publish the approved implementation incrementally, ensure CI registers on its final head and report immediately without waiting for completion.

## Risks / Trade-offs

- [A clean GET races a new local intention] → Fence requests, retain edit versions and merge only clean fields.
- [A whole-value settings PUT overwrites a sibling edit] → Read current state and three-way merge only committed fields before each revision-checked write.
- [Legacy Ready or old-run ACK looks successful] → Require exact current identity/revision/generation evidence and keep relaunch guidance explicit.
- [The parallel session integration changes status ownership] → Preserve the existing component boundary and consume its supplied contract; coordinate an additive adapter if required rather than editing session/viewport/server files here.
- [Tiny sliders cannot represent all arbitrary continuous values] → Keep authoritative numeric acceptance, declared bounds and step semantics; do not round-trip typed values through the slider.
- [An old test encodes explicit Save behavior] → Update only post-processing tests and retain source/adjustment/passive-navigation assertions.

## Migration Plan

No file-format or API migration. Existing per-plugin values/defaults load without read-time writes. Rollback restores the prior editor against the same persisted profile and service endpoints without deleting user data. Session integration remains independently deliverable; this component never claims evidence unavailable from its current owning consumer.

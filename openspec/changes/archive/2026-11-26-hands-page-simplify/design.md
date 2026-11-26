# Design

## Context

See proposal.md for motivation. The merged page uses `hands.html` for three persistent panels, `hands.js` for provider state, notifications and idle preview, `hands-adjustments.js` for adjustment drafts/Apply, and `hands-postprocessing.js` for independent next-run mesh selection. Source and adjustments share a revision-checked profile; `/api/hands/apply` persists and sends run-bound updates. Existing revision tracking treats hashes as identities, not ordered versions, and delivery polling is fenced across writes/retries.

The current specs explicitly require Save/Reload, draft-only edits, Record and an empty post-processing sentence. This change deliberately replaces those requirements; it does not weaken storage, provenance or runtime safety.

## Goals / Non-Goals

**Goals:** Reduce page structure and prose, commit finished edits automatically, preserve recoverable errors and safe multi-client writes, and keep the live-session integration boundary stable.

**Non-Goals:** No Start/Stop implementation, acquisition changes, new profile schema, recording relocation/deletion, installed post-processing lifecycle change, hardware validation or broad panel/style redesign. Source selection still affects future launches, not the acquisition source of an existing app. Installed post-processing retains its current independent next-desktop-run save/settings semantics; only its empty visibility changes.

## Decisions

### 1. Make small structural changes in existing roots

Keep `#hands-provider`, `#hands-form`, `#hands-postprocessing-root`, `#hands-adjustments-root`, all viewport controls and three-column topology. Remove the source Save/Reload buttons and routine availability/session/history paragraphs. Reserve the top of the left panel above `#hands-provider` for the parallel `hands-live-controls.js`; do not add or implement Start/Stop here. Keep error/retry content hidden when healthy.

Remove the Record tab, panel and page mounting of legacy tools; keep recorder modules, readers, API routes and files. Preserve the exported `handsPage.view`, `snapshot` and `request` access patterns exactly; retain recorder compatibility where consumed by the parallel change without exposing recorder controls. A component root is preferable to a replacement page because it limits overlap with the live-provider worker.

### 2. Reuse the Apps visual language

Remove `.card` from the two adjustment group sections. Use the shared heading/section layout exemplified by Analytics and the Develop form, within the existing outer sidebar panel, with existing small secondary buttons for each reset. Keep every field, label and the size/contact hint; remove axis/drawing helper sentences. No new theme, bespoke cards, fonts or shared design-system changes.

The post-processing root starts hidden to avoid an empty-state flash and remains completely hidden unless discovery reports at least one installed plugin, even if a missing selection remains stored. Plugin polling can reveal it when plugins arrive; hiding does not clear saved selection/settings.

### 3. Separate input drafts from commit events

Use input events only to update the local value and synchronized slider/field display. Save on change/committed field, completed slider interaction, toggle or committed colour, not on every input. Prevent Enter from submitting a full form twice; a field commit and a blur for the same value produce at most one effective write. Number steppers must commit their finished operation too. Each reset commits only that section. Validation runs before sending and leaves invalid input visible with its field error. Untouched linear colours never round-trip through the 8-bit picker.

Serialize local writes across source and adjustments; coalesce queued intentions without dropping a later finished edit. Track the original reviewed base and changed fields, rather than replaying a stale whole profile. Continue POSTing adjustments through `/api/hands/apply`; do not invent a second persistence or delivery path.

### 4. Refresh automatically without silently resolving real conflicts

Retain revision/registry checks and atomic storage. Automatically incorporate fresh state into clean controls on notifications and refresh provider discovery when it changes, without routine Reload. An own notice before/after its response reconciles by revision; stale polls and notices cannot clear newer errors or intentions.

For an unrelated external edit, refresh the base, merge only locally changed fields and retry with the latest revision, bounded to avoid an endless conflict loop. If an external edit changed the same field relative to the pending edit's reviewed base, do not auto-retry over it: keep the local intention, show the current saved value in a compact inline conflict and offer an explicit retry/use-saved choice. This replaces routine Reload, not conflict review. Invalid/unsafe saved state is never reset.

### 5. Preserve the delivery owner and retry semantics

Successful source and adjustment saves show no routine success or saved-for-next-launch prose. Errors are short and inline with an existing secondary retry action. A failed save retains the pending intention; delivery failure retains saved values and can retry without another edit. Pending or failed acknowledgement never counts as applied. Keep generation/epoch fences and run/sequence-bound deadlines; an old poll cannot overwrite a newer save/retry result.

`hands.js` must continue to avoid `setProfile` while `view.active` is true. The separate live session alone applies and acknowledges its owned module envelope at a frame boundary. The backend remains responsible for separate running-app and module envelopes in the parallel change. Do not move profile application into the editor or idle polling. Existing geometry changes still release held interactions and reset filters; appearance-only/equivalent geometry keeps current behavior.

### 6. Change only the Input display mapping

In `app.js` change the labels for `hand` and its unavailable form from Hand to Hands. Keep `provider-choice.js`, manifests, persisted arrays and runtime provider resolution unchanged.

## Risks / Trade-offs

- [Cross-client changes can race every automatic commit] → Exercise own-before/after notices, unrelated/same-field conflicts, older-hash restoration, writes in flight and stale delivery polls with focused tests.
- [Native colour pickers and number steppers emit different event sequences] → Real-browser checks must demonstrate one finished edit is delivered, with no intermediate save and no duplicated blur/change write.
- [Recorder removal overlaps the live-provider worker] → Keep provider id and public view/snapshot/request interfaces, leave the top slot free and list every actual element/export change in the handoff; do not remove recorder implementation or storage.
- [Flat sections can overflow the narrow sidebar] → Use shared responsive fields/secondary actions and capture both sections at ordinary desktop and narrow widths.
- [Concurrent updates can repeatedly conflict] → Bound automatic unrelated-field retries; retain the pending value and expose explicit retry on exhaustion rather than silently lose or overwrite it.

## Validation and Migration Plan

No data migration. Update `docs/hands.md` and `docs/hand-adjustments.md` alongside each outcome. Use only targeted panel tests for the changed UI/revision/delivery/label paths, retaining focused SDK geometry regressions where useful. Update old explicit-Apply UI assertions to committed-edit behavior instead of dropping safety coverage.

After approval, use disposable workspace/projects/profile state and a separate free-port panel, never the person's running instance or preferences. Real-browser proof covers idle Hands without plugins, installed-plugin Hands, both right sections, committed edits and inline failure/retry/conflict states, and the Apps Input dropdown. Save screenshots in the crew task folder and stop all disposable instances before reporting. Plan-stage checks only validate these artifacts and the draft body; implementation tests and browser proof wait for approval.

Rollback is a code revert only; stored profiles and recordings remain compatible. Publish the final implementation head and trigger CI once without waiting/polling, then report exact files, element ids and exports for the live-provider worker to rebase.

# Tasks

Each group corresponds to the same-order Implementation outcome in the draft PR. Implementation waits for plan approval.

## 1. Minimal source sidebar with safe automatic selection saves

- [ ] 1.1 Remove source Save/Reload and routine status/history/guidance elements while retaining `hands-provider`, the top live-control slot, public view/snapshot/request interfaces and active-session ownership; verify focused Hands page/picker tests.
- [ ] 1.2 Save provider selection silently on change with revision/registry protection, automatic clean refresh, bounded unrelated-change reconciliation and inline failure/conflict retry; verify concurrent source/adjustment writes and pending-selection retention tests.
- [ ] 1.3 Hide the complete post-processing root when no plugin is installed, without clearing a missing stored choice; verify empty, installed and plugin-change cases in focused post-processing/browser tests.
- [ ] 1.4 Unmount Record and legacy recording tools without deleting recorder/readers/routes/data, update `docs/hands.md` and recording UI assertions, and verify retained recorder tests plus no recording UI/import startup.
- [ ] 1.5 Capture isolated real-browser Hands sidebar views without and with an installed plugin; verify no person's state was used and retain screenshots outside the checkout in the task folder.

## 2. Standard direct adjustment sections

- [ ] 2.1 Flatten Position and size and Appearance into the existing right panel using Apps heading/section styles and shared secondary Reset to defaults actions; verify all existing controls remain and no nested cards exist in focused UI tests.
- [ ] 2.2 Remove axis/drawing helper prose while retaining the size/contact hint; update adjustment UI documentation and assertions and capture both sections in isolated desktop/narrow real-browser screenshots.

## 3. Committed adjustments save and deliver with retry and conflict safety

- [ ] 3.1 Separate input drafts from finished-edit commits for sliders, numeric fields/steppers, switches and colours; remove Apply/routine Reload/success prose and auto-commit each section reset; verify no intermediate or duplicate writes and exact untouched colours in targeted tests.
- [ ] 3.2 Serialize/queue local finished edits with source writes, refresh clean editors automatically and reconcile only unrelated external changes; verify same-field conflicts retain pending intentions and require explicit review/retry rather than overwriting newer profiles.
- [ ] 3.3 Retain POST `/api/hands/apply`, live-session-only profile ownership, geometry release/filter resets and revision/epoch fences; update focused own-notification, stale-poll, older-hash, pending/late-ack and retry regression tests.
- [ ] 3.4 Show short inline save/delivery errors and working retries without another edit, document new semantics in `docs/hand-adjustments.md` and `docs/hands.md`, and capture isolated real-browser completed edits plus failure/retry/conflict states.

## 4. Compatible Hands display label in Apps

- [ ] 4.1 Rename only the `hand` option's display mapping to Hands and Hands (unavailable), leaving stored values/provider resolution unchanged; verify option, selected-summary and persistence compatibility in targeted Apps tests.
- [ ] 4.2 Capture the Apps Input dropdown in an isolated real browser, then stop every disposable server/app/browser started for this change; verify teardown and report exact files, changed/removed ids and exports for the live-provider worker.

## Workflow follow-up

- Publish each approved outcome with its tests/docs and tick the matching PR outcome as it lands.
- Trigger CI on the final implementation head and report immediately without waiting or polling; never mark ready or merge.

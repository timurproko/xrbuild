# Global hand adjustments

Hands owns one profile at `<workspace>/config/hands/profile.json`, shared with the source picker, not a provider's calibration or an app's settings. Opening Hands writes nothing and starts no tracking. Existing source-only records inherit identity geometry and the exact standard SDK look without migration.

Position is panel-space millimetres: X right, Y up, Z toward the viewer; each -150..150, default 0. Size is uniform .5..1.5, default 1, about each hand's own wrist. It changes where the hand touches.

Appearance affects drawing only: joints/bones on by default, diameters 15 mm (bounds 1..40 / 1..30); linear colours [0,.541,1] / [0,.482,1]; skeleton opacity .333. The pinch-or-grab indicator defaults to on, 30 mm (1..60), white [1,1,1], opacity .9. Opacities/linear colour components are 0..1; visibility values are booleans. Colour pickers display sRGB but untouched colours retain their precise stored linear components.

## Finished edits save automatically

`mountHandAdjustments(root, {load, apply, serialize})` owns both standard right-sidebar sections, without nested cards. Queries, listeners, input drafts and unique heading IDs belong to that root. All controls and independent small secondary Reset to defaults actions remain. Only the size/contact hint is shown; axis/drawing helper prose is omitted.

Typing, slider movement and colour previews change local input only. Committing a number (change or Enter), releasing a slider, toggling a switch or committing a colour saves and delivers the finished value. Enter plus blur/change does not duplicate a save. Custom number-step buttons commit their click. A reset immediately commits only its section; unfinished edits in the other section remain local. There is no Apply, routine Reload or saved-for-next-launch line. Successful saves are quiet. Invalid values retain a field error without touching saved/running state; unfinished or pending edits warn before leaving.

The page serializes source and adjustment writes. Later finished edits made while a save is in flight are queued, not discarded. Source selection saves separately for future launches; it never switches the acquisition source of an existing app. Adjustment commits continue to POST `/api/hands/apply`; no alternate delivery path is introduced.

## Revision and error safety

Every write still uses the shared profile revision, registry validation and exclusive atomic writer, preserving unrelated state and unknown fields. Invalid, foreign, linked or oversized saved records are reported, never silently reset. Updates never touch provider calibration or recordings.

Clean controls refresh automatically. Pending inputs keep their original field-level reviewed base. Before committing, the editor reads the latest saved profile and merges only finished fields. An unrelated external edit is preserved; profile/registry races receive bounded retries. If another client changed the same field, the editor retains the person's intention and shows a short inline conflict with the saved value. Retry explicitly reviews that displayed value; a newer unseen edit still conflicts. Use saved discards only the conflicting local fields. No routine Reload is required and another client's profile is never silently overwritten.

Revision hashes are identities, not ordered clocks: returning to an older hash is still a real change. Notifications trigger a fresh read rather than treating their payload as profile authority. Own notices before/after the save response, pending reads and delivery results are fenced across writes/retries, including retries at an unchanged saved revision. A transport/validation/busy failure remains visible with Retry and the pending input intact.

## Managed live delivery

Persistence precedes delivery to the current managed run with its monotonic run-bound sequence. Geometry changes release held interactions/pointer presses without a click, clear old hands and reset filters before the next adjusted frame. Appearance-only or geometrically equivalent updates keep holds/filters. Stale, malformed, reordered and retired-run messages cannot revert the app.

The UI does not claim pending acknowledgements as applied. Failed delivery shows a short inline error and Retry without requiring another edit; retry reads the latest saved profile and resends it without manufacturing a geometry change. A matching current-run late acknowledgement clears the error. Old/disconnected bundles may need an ordinary rebuild/relaunch.

Native acknowledgement observation starts with the owning host channel, so launch sequence zero can become acknowledged without an edit. The observer reconnects read-only and retires on stop/disposal. Pending acknowledgements have a three-second run/sequence-bound deadline, including browser runs and old bundles without the subscription. A new delivery replaces the prior deadline; stop/replacement/disposal retire it. Browser acknowledgements use the authenticated no-store polling endpoint; arbitrary broadcast messages cannot change the active profile.

Every managed native/dev/browser launch receives a validated portable snapshot. Native hosts retain the newest run profile on the authenticated channel across navigation/reconnect; browser previews use their existing bounded token/session/route/project context. Trusted Launcher links carry that scope without opening a second provider.

While `handsPage.view.active` is true, the live-session component alone applies and acknowledges its owned module envelope at a frame boundary. The editor still uses the existing save endpoint; idle view polling never takes over active-session `setProfile` or acknowledgement. The parallel live-session implementation is responsible for its separate app/module delivery envelopes.

Desktop/headset packages and both publication paths freeze the build-time profile in checked output copies. They neither read the author's workspace nor subscribe to its panel; later commits do not change them. Rebuild packages to use new values. A managed launch requiring the new native profile channel fails closed in a new SDK on an older host, with host rebuild/relaunch guidance instead of unadjusted contacts.

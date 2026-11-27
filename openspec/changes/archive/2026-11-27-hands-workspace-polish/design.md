# Design

## Context

See `proposal.md` for motivation. The panel UI is vanilla modules over a shared design system (`design-system.js/.css`); pages
receive server events from `/api/events`. Hands draws through the SDK `HandVisual` and, for post-processing, the SDK
`HandMeshClient`, which talks to a run-owned mesh server in the panel (`hand-mesh-run.ts`). Post-processing plugins declare a
`handMesh` sidecar; SOMA additionally exports its own consent-gated runtime installer (`mesh-runtime-setup`). Restart already
refuses to interrupt desktop setup; plugin work had no cancellation and no shared way to show progress or notices.

## Goals / Non-Goals

**Goals:**
- One place for each cross-cutting piece: one progress-dialog template, one toast API, one setup-progress shape, one log.
- Plugins stay in charge of what they install; core only runs, reports and cancels it.
- The browser hand mesh draws steadily without relaxing protocol safety for other consumers.

**Non-Goals:**
- No change to the provider ABI, the profile schema or how apps receive hands.
- No server-pushed toast actions beyond panel links; no persistence of view-only preferences beyond the browser.
- No stacked post-processing pipeline: one hand-mesh layer runs at a time.

## Decisions

### Plugin setup runs through a small, validated contract

A plugin's `mesh-runtime-setup` export provides `plan()`, `install()`, optional `status()` and optional `setupKinds`. Core
loads it through the existing contained module resolver, shows `plan()` (sizes and licences, never URLs) and installs only the
plan the person accepted, as a `mesh-setup` job with an `AbortSignal`. Restart waits for that job like desktop setup.
Alternative rejected: core-owned installers per plugin, which would hard-code plugin knowledge in core.

### One progress shape, formatted by core

`onProgress({ step, done?, total?, unit?: 'bytes' | 'items', detail? })` is validated and turned into identical log lines for
every plugin; malformed events are dropped. The dialog shows the step with its percent, or its running time when there is
no total. Alternative rejected: free-text progress from plugins, which made every plugin's log look different.

### Install kinds follow saved settings

`setupKinds` names separate runtimes, each needed always or while one setting has a value (SOMA: GPU runtime when the
device is GPU). Core picks the first needed, missing kind from the saved settings and the plugin's `status()`, and offers
Install for it. Alternative rejected: core reading plugin-specific reasons to infer missing runtimes.

### Mesh freshness is negotiated per frame, with defaults unchanged

The viewer may send `maxAgeMs` (bounded 100–2000 ms) with a mesh frame; the server uses it for its deadline and acceptance,
and the client for drawing. A short client-side carry bridges single bad tracking frames. Defaults stay at 100 ms, 10 mm and
no carry, so only the Hands viewer opts in. Alternative rejected: raising the global limit, which would change every app.

### Toasts are one page API plus one server event

`toast.js` renders toasts in a top-layer region (visible over fullscreen and dialogs). Server code and plugin services call
`notifyPanel` / `context.toast`, which validates and sends a `toast` event; pages subscribe with `listenForToasts`.
Server toast actions are limited to panel links because functions cannot cross the event stream.

## Risks / Trade-offs

- [Held meshes lag fast motion by up to the hold time] → the hold is bounded at 500 ms in Hands and the pose tolerance
  still hides a mesh that no longer matches the hand.
- [Plugins can declare misleading install kinds] → kinds are validated (ids, labels, count), consent covers the exact plan,
  and the plugin's own `status()` decides what is installed.
- [A setup that ignores the abort signal keeps running] → a cancelled job never reports success; the next Install resumes
  from kept downloads.
- [Toast noise] → ids replace earlier toasts, info fades, and only errors with actions stay.

## Migration Plan

No data migration. Old viewers omit `maxAgeMs` and keep the 100 ms behavior; plugins without `setupKinds` keep a single
install; existing saved post-processing choices load with the layer switched on. Rollback is a revert of this change.

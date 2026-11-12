## Context

`Panel.run()` and `Panel.preview()` guard on `restartPending`, `changingPlugins`, `maintainingCache`,
`servicesPending`, `preparingPreview`, `preparingNativeRun` and per-project `settingsWrites`, and throw one shared
409 message for all of them. `servicesPending` can stay set until restart (`servicesProblem` records why), so the
generic "wait" text is wrong for the most persistent cause.

Plugin user configuration (`xrb-plugin.json` `config`) is read by `readUserPluginConfig` and passed to service
factories, but the panel has no editor for it. The WebXR publisher returns an "unavailable" production service
with origin `https://unconfigured.invalid` so discovery still succeeds; the Publish dropdown shows origin hostnames,
so the placeholder appears as a destination.

## Goals / Non-Goals

**Goals:** one accurate message per launch-blocking cause; an in-panel, explicit way to fill plugin configuration;
an unconfigured publisher that reads as "not configured" with a route to fix it.

**Non-Goals:** provisioning hosting, storing credentials, changing publication safety checks, changing Plugin
Manager ownership of enablement, or automatically restarting the panel.

## Decisions

- **Ordered launch guard.** A single helper returns the first blocking cause in a fixed order (restart pending,
  plugin services pending/changing with `servicesProblem`, cache maintenance, launch being prepared, project
  settings saving). The 409 body carries a stable `reason` code and the message; when the cause needs a restart, the
  error dialog offers the existing Restart action. Existing guards keep their semantics; only wording and metadata
  change.
- **Config editing in Settings, not Plugin Manager.** Declared `config` fields render as a separate "Configuration"
  section in that plugin's Settings card using the same panel-owned controls as settings. Writes go through a new
  explicit route that validates against the declared schema, checks a content revision, preserves unknown fields
  and replaces the file atomically. Existing hard-link-only *creation* of defaults stays; an explicit user save is
  allowed to replace the user's own file. Saves are refused while plugin consumers, runs or jobs are active, like
  other plugin mutations, and refresh services afterwards.
- **Destination-scoped tabs.** A config field may declare `shownWhen: <boolean runtime setting key>` (validated
  against the plugin's own settings). Settings groups shown config fields into shared `xrb-tabs` by `section`, hides
  fields whose setting is off, keeps unsaved drafts when a checkbox or tab changes, and saves only shown fields so
  hidden destinations keep their stored values.
- **Neutral "not configured" contract.** A publisher may expose `configured: false` and a bounded
  `configurationProblem`. The panel never shows the origin of such a publisher, lists it as `<label> (not
  configured)`, disables Publish, and links to `Settings?module=<plugin-id>`. Publishers without the field behave as
  today. The WebXR publisher sets it instead of relying on a placeholder origin (the origin stays a syntactically
  valid reserved value only to satisfy the existing contract shape).
- **Explicit enablement stays.** Filling configuration does not enable production by itself: the existing
  `productionConfigured` flag remains a field the user turns on, now visible next to the other fields.

## Risks / Trade-offs

- [Users enter wrong repository/branch] → existing validation and live hosting verification still refuse
  publication; the reason is shown inline.
- [Replacing a user-edited file] → revision check rejects stale saves; unknown fields are preserved.
- [Config edited while services are in use] → saves use the plugin-mutation guard and report a specific busy cause.

## Why

Two panel states hide their real cause from the user:

- When plugin services are pending (for example, plugin module code changed and the panel must restart), Run and
  Preview refuse with the generic "Wait for launch preparation or settings saving to finish". Waiting never helps;
  only a restart does, and nothing says so.
- A publisher that needs explicit destination configuration (the production WebXR destination) is enabled with a
  Settings checkbox, but its destination fields live only in a hand-edited user config file. Until it is filled in,
  the Publish card lists a placeholder hostname (`unconfigured.invalid`) that looks like a broken destination and
  gives no route to fix it.

## What Changes

- Run, Preview and related launch refusals report each blocking cause separately: restart pending, plugin services
  changing or awaiting refresh (with the recorded problem, such as "restart the panel"), cache maintenance, another
  launch being prepared, or this project's settings being saved. The UI offers Restart when the cause requires it.
- Settings renders a plugin's declared user `config` fields (the existing bounded schema) as an explicit
  configuration section under that plugin, with revision-checked saves to
  `<selected-workspace>/config/plugins/<id>/config.json` that preserve unknown fields. Saves refresh plugin services
  when idle.
- A publisher MAY report itself unconfigured with a bounded reason. The Publish card then lists it by label with
  "(not configured)" instead of a placeholder hostname, disables Publish for it, shows the reason and links to that
  plugin's Settings section. The WebXR publisher uses this for its production destination and stops exposing a
  placeholder origin.
- The WebXR publisher's Settings description and config labels explain what production needs (HTTPS origin,
  output repository, branch, site folder) and that hosting is verified, never provisioned.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-control-panel`: specific launch-refusal causes; plugin user-configuration editing in Settings; unconfigured
  publisher presentation in the Publish card.
- `web-publication`: optional publisher configuration state reported through the neutral publisher contract.

## Impact

Control-panel server (`panel.ts` launch guards, plugin config read/write route, publisher status projection) and UI
(`app.js` Settings and Publish card, error dialog actions), `plugin-config.ts` explicit write path, and the embedded
WebXR publisher's unconfigured service and metadata. No native host, SDK or private workspace changes. Configuration
holds no credentials: production authentication stays with the operating-system credential integration.

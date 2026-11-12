## 1. Specific launch refusal causes

- [x] 1.1 Replace the shared Run/Preview/rebuild 409 text with an ordered cause helper returning a reason code and message (including `servicesProblem`); verify panel tests cover each cause, order and the restart-required case.
- [x] 1.2 Offer Restart in the error dialog for restart-required refusals; verify a UI test shows the action only for that reason.

## 2. Plugin configuration in Settings

- [ ] 2.1 Add a revision-checked, schema-validated, unknown-field-preserving atomic write for user plugin config and its route, guarded like plugin mutations and followed by an idle service refresh; verify tests for success, stale revision, invalid value, busy refusal and unknown-field preservation.
- [ ] 2.2 Render declared config fields as a Configuration section in the plugin's Settings card with shared controls and inline errors; verify UI tests for rendering, save, stale and invalid feedback.

## 3. Unconfigured publisher presentation

- [ ] 3.1 Add optional `configured`/`configurationProblem` to the publisher contract and project status, and have the WebXR publisher report its unconfigured production destination with clear Settings description and field labels; verify publisher and panel tests.
- [ ] 3.2 Show "<label> (not configured)" in the Publish dropdown, disable Publish and link to the plugin's Settings section; verify UI tests and that configured publishers are unchanged.

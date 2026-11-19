## 1. Retire workflow and one-time-process capabilities

- [x] 1.1 Remove all five `change-delivery` requirements.
- [x] 1.2 Remove all three `public-history-export` requirements.
- [x] 1.3 Declare `retire_capabilities: true` in `.openspec.yaml` so the archive deletes both emptied spec files.

## 2. Reduce ci-validation to this repository's CI

- [x] 2.1 Rewrite "One required check" to the rules of `tools/pr-automation/required.mjs`, dropping the ruleset claim.
- [x] 2.2 Replace "Jobs by changed paths" with "Job selection by event and changed paths", matching the selectors and events of `.github/workflows/ci.yml`, naming `develop` and dropping the private-repository scenarios.
- [x] 2.3 Rewrite "Drafts skip heavy jobs" without promotion or finalizer behaviour.
- [x] 2.4 Rewrite "OpenSpec length advice does not block validation" to the CI job only.

## 3. Remove one-time migration and governance requirements

- [x] 3.1 Remove `web-publication` "Publication repository cutover" and "Safe transition to Actions hosting".
- [x] 3.2 Remove `workspace-location` "Embedded workspace versioning", "Private workspace naming boundary" and "Independent task workspace ownership".
- [x] 3.3 Remove `bundled-extensions` "Audited source promotion" and "Retire duplicate embedded starter without removing templates".

## 4. Fix requirements the code contradicts

- [x] 4.1 Rewrite `web-runtime-sdk` "Return to a launcher" to the SDK-owned return control.
- [x] 4.2 Use lowercase `projects/unsorted/` and lowercase section folders in `dev-control-panel` "Project convention" and "Project list".

## 5. Specify implemented behaviour

- [x] 5.1 Add the Apps cursor preference to `dev-control-panel`, the cursor styles to `web-runtime-sdk` and system cursor visibility to `web-host`.
- [x] 5.2 Add opt-in segmented re-selection to `hand-ui-controls`.
- [x] 5.3 Add the single-row Activity header to `dev-control-panel`.
- [x] 5.4 Add the `name-guard` capability.
- [x] 5.5 Add the `app-sdk-supply` capability.

## 6. Fold in the pending synchronization

- [x] 6.1 Carry `dev-control-panel` "Start without a terminal" from `repair-dev-workspace-startup` unchanged into this change.
- [x] 6.2 Delete `openspec/changes/repair-dev-workspace-startup/`.

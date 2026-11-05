# Tasks

## 1. Plugin metadata and inventory

- [x] 1.1 Add bounded validation and typed inventory data for plugin-owned samples and hidden provider IDs, including canonical containment and sample-manifest checks; verify with plugin-manager tests for valid declarations, duplicate/invalid IDs, path escapes, links, missing manifests and providers not owned by the plugin
- [x] 1.2 Apply hidden-provider metadata when producing project role choices while preserving explicit saved selections as unavailable; verify with provider-choice and panel API tests covering hidden, saved-hidden, disabled and later-visible providers

## 2. Independent sample import

- [x] 2.1 Add a safe atomic sample copier that derives a valid project folder, checks live/archive collisions, skips dependency/generated output, rejects links/special entries, rewrites copied project/package identity and cleans failed staging folders; verify with focused workspace tests for success, duplicate names, malformed manifests, generated folders, link rejection and rollback
- [x] 2.2 Add the plugin sample import API, project-change notification and returned project description for combined and split integration/project roots; verify with server tests that the copy lands in `projects/plugins`, the original remains unchanged and a disabled installed plugin's sample can still be imported

## 3. Plugins Manager experience

- [x] 3.1 Render plugin samples in the selected plugin's Details content with description and Import actions using shared cards/dialogs, then select the imported copy and return to Control Panel; verify with UI tests for the default name, inline collision error, pending state and the imported project's `PLUGINS` section placement
- [x] 3.2 Keep imported copies on the ordinary project lifecycle with no source-plugin ownership controls; verify manually that an imported copy can be renamed, run, archived, unarchived and deleted without changing the plugin details sample

## 4. Private workspace migration

- [x] 4.1 Move the tracking diagnostic source beneath its owning plugin, point the managed tool at the plugin-owned source and include plugin samples in the workspace package graph/lockfile; verify its focused tests, typecheck, build and managed-tool startup all use the new path
- [x] 4.2 Declare the diagnostic sample, hide its fixture provider and remove that provider from the sample project inputs while leaving the camera-backed provider selectable; verify the fixture provider is absent from ordinary Input choices, the other provider remains, and importing the sample creates a working copy under `PLUGINS`
- [x] 4.3 Confirm the old ordinary diagnostic project path is gone and no panel runtime locks an imported copy; verify the imported copy archives and deletes successfully while the plugin-owned managed tool continues serving its original source

## 5. Completion checks

- [x] 5.1 Update neutral control-panel documentation and the private plugin/sample documentation for ownership, import and provider visibility; verify the documented workflow matches the UI and contains no claim that diagnostic camera output is application input
- [x] 5.2 Run the focused control-panel suite, private diagnostic/plugin checks and `pnpm check:names`; verify all required commands pass and record any device-only gap in the handoff

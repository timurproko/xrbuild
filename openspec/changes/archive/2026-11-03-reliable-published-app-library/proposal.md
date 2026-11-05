## Why

A published launcher currently treats an empty root-route slug as an invalid inventory entry, so one valid root publication can make the complete app library unavailable. Publication requests also reject a second Publish or Unpublish while another publication job runs, and published app identity needs an end-to-end regression so every app keeps its project icon in browser and catalog surfaces.

## What Changes

- Make the published launcher accept both root and named publication routes, omit only its own current route, and show every other live inventory entry whether the launcher itself is published at `/apps/` or `/apps/<slug>/`.
- Resolve catalog icons from app metadata with the finalized project favicon as the reliable same-origin fallback, so apps do not depend on app-specific build configuration to copy a second icon filename.
- Queue valid Publish and Unpublish requests as visible background jobs and execute them in request order instead of rejecting them because another publication operation is active.
- Keep queued publication controls pinned to the requested project, publisher, slug and operation, and preserve the existing safety conflicts with web/package work on the same project.
- Verify that publication preparation still finalizes each app's custom or generated project icon into the browser build before the queued publisher operation receives it.

## Capabilities

- `workspace-location`: the published app catalog handles root and named launcher routes and uses finalized app icons reliably.
- `dev-control-panel`: publication operations are queued, observable and executed sequentially without blocking unrelated panel use.
- `web-publication`: an empty slug remains the publisher route-prefix root and queued publication still receives verified browser output.

## Impact

- Launcher catalog parsing, metadata/icon fallback and private workspace tests.
- Control Panel background-job state, publication API/UI handling and focused tests.
- Publication specification consistency and browser-icon integration coverage.
- No production publication, route migration, credential, hosting or package-association change is performed by this work.

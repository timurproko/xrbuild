# Tasks

## 1. Explicit app rebuild

- [x] 1.1 Add a force-rebuild project operation that always executes the validated app build script, finalizes the browser output and advances the successful receipt only after verification; verify server tests cover a current build rebuilding again, success, failure, missing scripts and unchanged publication/package state.
- [x] 1.2 Add **Rebuild** to eligible project-row context menus, omit it for invalid or scriptless projects and select the returned background job in Activity; verify focused UI tests cover live and archived projects, hidden unavailable actions and job presentation.

## 2. Published desktop launcher catalog

- [x] 2.1 Separate loopback development previews from native app hosting so only `localhost` and `127.0.0.1` receive local route substitution or synthetic empty slots; verify launcher tests cover panel preview, development server, native local hostname, published HTTPS and inventory-failure behavior.
- [x] 2.2 Embed the launcher's stable publication ID and bounded slug at build time and use them with path-based filtering so native root hosting and published routes omit only the launcher itself; verify catalog tests cover root and named publications plus a desktop root URL.
- [x] 2.3 Make native desktop launch cards retain canonical published routes, matching the published browser catalog; verify a production launcher build and source-contract tests show no local preview route in native mode.

## 3. Launcher pointer presentation

- [x] 3.1 Remove the SDK spatial mouse cursor object from the launcher scene while preserving mouse binding, UI Kit control attachment and hand interaction; verify launcher source tests and a browser/native visual check confirm controls work without the flashing ring.

## 4. Documentation and delivery checks

- [x] 4.1 Update launcher development documentation to distinguish loopback fixtures from native/published catalog behavior and document the explicit rebuild action; verify the documented modes match the tested origin rules.
- [x] 4.2 Run control-panel and launcher focused tests, the launcher production build, JavaScript syntax checks, `pnpm check:names` and `git diff --check`; verify no generated output, credentials or live workspace settings are committed.

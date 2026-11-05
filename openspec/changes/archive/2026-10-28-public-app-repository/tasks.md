# Tasks

## 1. Separate project and integration roots

- [x] 1.1 Add project-repository resolution (`--projects=<path>`, then `XRB_PROJECTS_HOME`, else the selected workspace) and show both resolved roots in panel identity/status; verify unit tests cover defaults, explicit paths, conflicting arguments and two panel instances using different root pairs.
- [x] 1.2 Route project discovery, layout, create, move, archive, delete and editor configuration through the project root while plugin discovery, host rebuild, dependency fetch and package output remain on the integration workspace; verify control-panel tests use sibling temporary roots and no project operation writes into the integration root.
- [x] 1.3 Install app dependencies from the project repository's package workspace and bind build receipts to the canonical project path; verify a clean sibling checkout builds and a receipt from another checkout is rejected.
- [x] 1.4 Add repository-development launch support and documentation for selecting the private integration workspace plus sibling public app checkout without a tracked machine path; verify the documented command starts the panel with both expected roots.

## 2. Prepare the public app source

- [x] 2.1 Add a one-time source export that copies only the approved project set, project layout and app package metadata into a fresh tree, excluding builds, credentials, signing files, integration plugins and private dependencies; verify an exposure scan reports no prohibited file or local/private reference.
- [x] 2.2 Split the workspace package metadata so the public tree has an app-only lockfile and the private workspace lockfile has plugin/packager importers only; verify frozen installs pass independently in both trees.
- [x] 2.3 Remove tracked `.xrbuild/projects/` and app-specific layout/lock data from the private repository only after a clean public clone builds the exported apps; verify `git ls-files .xrbuild` contains no project source or app importer.

## 3. Move production publication

- [x] 3.1 Change the private production publisher configuration to the explicit public repository's `main` branch and `/docs` subtree, with no permanent seed from the private repository; verify plugin tests prove Publish changes only `docs/` and never project source.
- [x] 3.2 Strengthen readiness checks for the intended public target, `main` branch, `/docs` Pages path, custom origin and HTTPS while preserving non-force serialization, verification and rollback; verify simulated hosting tests cover wrong repository, wrong branch/path, wrong origin and successful cutover.
- [x] 3.3 Add a one-time site migration that preserves root files, publication IDs, slugs, inventory, associations and route bytes from the old branch; verify source and destination tree digests match before custom-domain cutover.

## 4. Cut over and clean up

- [x] 4.1 With the maintainer, create and configure the public repository and `main` rules so authenticated source pushes and publisher direct non-force `docs/` updates succeed while force-push and branch deletion are blocked.
- [x] 4.2 Configure Pages on public `main` from `/docs`, attach `xrbuild.dev`, enforce HTTPS and run one controlled publication; verify the inventory, every recorded route and association document are live through the custom origin.
- [x] 4.3 Delete the old private publication branch and remove its old hosting configuration after the new origin remains healthy; verify the private repository has no app source on `main`, no publication branch and no custom-domain file.

## 5. Documentation and regression coverage

- [x] 5.1 Update workspace, publication and repository-development documentation for the two-root setup, public-source boundary, credentials and rollback; verify every manual command is reproducible from a clean private core clone plus public app clone.
- [x] 5.2 Run focused control-panel and publisher tests, the full Node suite, OpenSpec strict validation and the name guard; verify all pass without weakening publication validation or private-workspace exclusions.

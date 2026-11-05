# Tasks

## 1. Add the neutral publisher model

- [x] 1.1 Add workspace publisher declaration types, discovery, duplicate/invalid reporting and enabled-plugin filtering; verify fake publisher tests cover valid, missing, malformed, duplicate and disabled declarations without affecting Build, Run or packaging
- [x] 1.2 Add the manifest publication schema, stable ID generation, generic slug validation and publisher-owned final validation; verify project tests cover traversal, separators, normalization, wrong targets, unavailable publishers, collisions and project renames
- [x] 1.3 Persist successful web-build receipts and deterministic entry-tree digests in ignored workspace state, refusing unsafe or changed entries; verify control-panel tests cover success, restart recovery, changed output/settings, missing index, links and failed builds

## 2. Add panel publication API and UI

- [x] 2.1 Add dedicated publication configuration, Publish, Move, Unpublish and status services and HTTP routes that call only the selected publisher contract; verify API tests cover every refusal, confirmation and successful call while preserving unrelated manifest fields
- [x] 2.2 Add publication jobs, log streaming, operation conflicts and recovered publisher status to project descriptions and events; verify job and server tests cover pending, success, failure, restart recovery, unavailable status and diagnostic links
- [x] 2.3 Add WebXR-only Build-card publisher selection, slug, selected/deployed URL, Publish/Republish/Unpublish actions, confirmations and status without changing Build, Run or package behavior; verify automated UI tests cover desktop and narrow layouts, keyboard use, cancelled confirmations and native-project absence

## 3. Define the external publisher and migration gates

- [x] 3.1 Document the neutral publisher authoring contract and the approved private `apps` content-branch behavior: complete checkout, isolated route updates, root associations, normal push conflict retry, verification and revert rollback; verify the document contains no private integration name, credential, hostname, package ID or private path
- [x] 3.2 Document the separate private publisher/headset-packager migration and maintainer runbook for disposable testing, live source switch, HTTPS/root/app/association checks, device launch, rollback and separately authorized deletion; verify every destructive step has an explicit prerequisite, confirmation and rollback
- [x] 3.3 Run focused control-panel tests, strict OpenSpec validation and `pnpm check:names`; verify every command passes and no concrete hosting implementation, generated site, credential, private workspace data or live setting is included in the core change

## Workflow follow-up

- Implement and test the concrete `apps` content-branch publisher in the private workspace as a separate reviewed change.
- Migrate the private headset packager to consume the canonical publisher route and stop publishing as a package-build side effect; produce and device-test the replacement signed package.
- After both changes are delivered, obtain explicit maintainer authorization before switching the live source to `apps`; follow the runbook and roll back on any failed check.
- Keep the disposable proof repository, legacy publication branch and old root-site repository until the new route, association document, replacement package and rollback are verified.
- Delete `xrb-publication-proof` and the old root-site repository only after a final explicit authorization naming each repository; delete the legacy publication branch only when that same authorization names it.

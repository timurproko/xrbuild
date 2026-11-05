# Web publication cutover

This runbook is intentionally separate from the core publisher-contract change. Do not switch live hosting or delete legacy infrastructure while reviewing the core PR.

## 1. Prepare the private integration

- Implement the publisher plugin against a disposable remote and an `apps` content branch.
- Remove publication side effects from package creation.
- Configure one canonical HTTPS route in the package launcher.
- Keep signing identity unchanged for package updates.
- Store credentials only in the private workspace's local credential store.

## 2. Disposable acceptance test

Publish two synthetic apps and verify both routes plus every required root file. Republish the first app and verify the second is unchanged. Unpublish the first and verify only its route and explicitly retired associations disappear. Cause a non-fast-forward conflict and verify the plugin reapplies without force-pushing. Cause post-push verification failure and verify a revert restores the complete previous site.

Capture commit IDs, route responses, association response and rollback result. The disposable repository can be removed only after the maintainer authorizes deletion by name.

## 3. Pre-cutover checks

Record the current hosting source, custom-domain setting, DNS records and last-known-good commit. Confirm the replacement package opens the new canonical route and its identity/fingerprint are represented by the generated root association document. Keep the old source and old root repository intact.

## 4. Live switch — explicit authorization required

After the maintainer explicitly authorizes switching the live source, select the `apps` branch and its root folder. Do not delete or rewrite the previous source. Wait for hosting completion and verify:

- origin root returns success over HTTPS;
- custom-domain certificate is valid;
- each canonical `/apps/<slug>/` route returns the expected build;
- unrelated routes and required root files remain present;
- the root association document has the exact approved records;
- Publish, Republish and Unpublish isolate one route at a time;
- browser WebXR entry works; and
- the replacement signed package launches and enters WebXR on the device.

## 5. Rollback

If any check fails, restore the recorded previous hosting source immediately. Verify its root and known route, then retain both branches and repositories while diagnosing. A failed cutover is not authorization to alter package identity, signing material, DNS or legacy content.

## 6. Retirement — separate final authorization required

After a stable observation period and a proven rollback, present the exact disposable repository, old root-site repository and legacy branch proposed for deletion. Delete only items explicitly named by the maintainer. Recheck the live root, app routes, association document and device launch after each deletion. Publish and Unpublish operations never perform repository or branch deletion.

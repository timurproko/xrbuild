# Tasks

## 1. Build and security boundary

- [x] 1.1 Add a reviewed public-repository workflow dispatch with fixed project choices, explicit operation, trusted default ref and no PR secret access; verify tests reject unknown projects and unconfirmed operations and inspect the main-only workflow gate.
- [x] 1.2 Wire a private-core read-only short-lived GitHub App checkout in the trusted build job, frozen installs and `XRB_CORE`; verify both approved projects build locally with a private core checkout, and the workflow's private token has only Contents: read and is absent from the deployment job.
- [x] 1.3 Validate app build output and artifact boundaries; verify tests reject symlinks, forbidden files and missing index, and the Pages artifact uploader points only at the complete `docs/` tree.

## 2. Publication semantics

- [x] 2.1 Add a public site updater that derives identity from committed manifests and preserves launcher, unrelated routes, inventory, associations, CNAME and `.nojekyll`; verify fixture tests compare unaffected paths byte-for-byte across publish and explicit unpublish.
- [x] 2.2 Serialize non-force updates to `main:docs/`, handle concurrent source commits and deploy the exact committed tree with Pages Actions; verify fixtures reject ownership collisions and refuse changed project sources without touching the last published site.
- [x] 2.3 Verify root, inventory, associations, marker and route bytes through the production HTTPS origin and restore a known-good site after failure; verify simulated verification failure triggers a route-scoped revert and verifies the restored tree, with an explicit failure path when restoration cannot be verified.

## 3. Compatibility and rollout readiness

- [x] 3.1 Update the private publisher to remain read-only for status and refuse local writes after a verified Actions cutover; verify plugin tests cover both legacy and Actions Pages modes without weakening branch-hosting safety checks.
- [x] 3.2 Document GitHub App setup, manual Actions publish/unpublish, deployment and rollback, trust model and continued local-checkout requirements for app editing; verify instructions against a disposable local build and no tracked secrets.
- [x] 3.3 Run public workflow fixture tests, private focused tests, full Node suite, name guard and OpenSpec strict validation; verify results pass without a production Pages setting change.

Creating the GitHub App and encrypted key, running a credentialed rehearsal on public `main`, switching Pages source, verifying the live Actions site and authorizing the old writer's retirement require a separately authorized post-merge cutover. They are not claimed verified in this PR.

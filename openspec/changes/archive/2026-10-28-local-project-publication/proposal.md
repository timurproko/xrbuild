# Restore local project publication

## Why

The current no-checkout publication flow moved app source into the public site repository and replaced local project publishing with a remote catalog. That removed the development workspace's apps and archived tests from the local panel. This is not the requested workflow: the maintainer wants to keep apps, drafts and tests in the private development workspace and click Publish on one selected local app without maintaining a separate checkout of the public site repository.

## What changes

- Restore the tracked app and archived test projects to the private development workspace, preserving their publication identities, routes, settings and assets; reconcile the maintainer's separately stashed manifest edits without consuming or overwriting that stash automatically.
- Make the local panel's existing per-project Publish/Unpublish controls build the selected local project, submit only validated generated site output to the public site repository, and invoke its trusted Actions deployment. No project source, private core, plugins or credentials enter the public site or browser.
- Retire the remote public-source catalog and public-source build as production writers; keep the public site repository's current `docs/` and Pages Actions deployment intact. Remove current public app source only after the private restoration and new deployment path are reviewed and verified, without rewriting public history.
- Preserve live routes, IDs, inventory, association data, domain and HTTPS throughout the transition. No real publication, Pages settings change or source deletion is part of the plan-only stage.

## Impact

The private panel, its production publisher plugin and the public site workflow need coordinated changes and separate reviewed PRs. The panel continues to use the maintainer's OS-backed login; the publisher may keep an internal disposable repository cache, but the maintainer does not clone or manage the public repository. This changes the recently introduced publication model and requires an explicit staged cutover and manual production acceptance after both repositories' changes merge.

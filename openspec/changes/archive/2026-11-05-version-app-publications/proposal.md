# Version app publications

## Why

A published app currently offers Unpublish rather than an update workflow. The publisher can replace its owned route, but neither its contract nor the panel exposes retained release versions or a way to choose the live release. Developers need to deploy updates without first removing the app, and to return to a known release without rebuilding old source.

## What changes

- Add Publish for an unpublished app and Update for an existing deployment when its publisher supports versioned releases; keep confirmed Unpublish separately available.
- Add an independent publication version, Patch/Minor/Major actions, release history and a verified Live marker. Package versions and canonical URLs remain unchanged.
- Support confirmed Make live for a retained release, using its exact verified output rather than rebuilding current source.
- Add an optional generic publisher capability for immutable release history and activation; implement it in the production workspace publisher. Preserve legacy publisher compatibility without claiming unsupported version history.
- Preserve legacy deployments without inventing semantic versions, retain history across Unpublish, and protect unrelated routes, root publications and association files during updates and rollback.

## Scope

Affected capabilities: `dev-control-panel`, `web-publication`. Expected implementation: core publication validation/types/jobs/API and shared panel controls; the workspace production publisher, its isolated tests and documentation. No native host, SDK interaction or package-version behavior changes.

## Non-goals

No production publish, unpublish, activation, hosting migration or remote configuration change during development. No automatic deployment on save, scheduled/channel releases, prerelease versions, historical preview URLs, retention deletion UI or automatic cleanup of archived releases. Ordinary publication remains independent of package target/platform.

## Delivery

This PR starts with the plan only. Implementation follows maintainer approval. Tests use disposable repositories, fixture publishers and a simulated public origin; any real deployment acceptance requires separate explicit authorization.

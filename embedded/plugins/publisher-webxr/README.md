# WebXR publisher

One plugin owns local and explicitly configured production destinations. Stable publisher service IDs remain
`local-test` and `production-web`. Generic engine code needs no publishing-provider branches.

This is the bundled publisher implementation. Product sources remain read-only during normal use; configuration,
persistent publication history and temporary working files belong to the selected writable user workspace.

## Configuration and state

The core reads `config/plugins/publisher-webxr/config.json` in the selected user workspace, preserving existing bytes
and unknown fields. If absent, discovery uses validated defaults in memory without creating the user folder or file;
explicit configuration initialization can create missing defaults without replacement. Product defaults contain no production site, repository, deployment identity or key.
`localhost` defaults enabled; `production` defaults disabled. Enabling a destination setting is not sufficient to
configure production: `productionConfigured` and complete validated destination fields are required explicitly.
Fill them in under Settings > WebXR > Production ("Use this destination" sets `productionConfigured`). Until then the production service reports `configured: false`
with what is missing, so the panel lists it as "Production (not configured)" instead of a placeholder origin.

Local HTTPS uses `localhost-cert.pem` and `localhost-key.pem` in that user config directory. They must already exist;
discovery/status never generate keys or start a listener. An explicit Publish/Activate starts serving. Status after a
restart can report retained-but-not-serving state until that explicit action. TLS setup itself is external.

Production association records, when needed, are supplied as user-owned `associations.json` in the same config
directory, version 1 with a records array. Absence means no associations in memory, not a write of defaults. Remote
association ownership is checked before publication; mismatches are refused. Authentication uses the operating-system
credential integration, never tracked tokens. The configured production hosting deployment is verified, never provisioned.

Local publications and retained releases are persistent user data under selected-workspace
`.xrb/publication/publisher-webxr/local`, outside build caches. Never sweep this data. Production uses fresh exclusive
per-instance working clones under `build/publication/publisher-webxr/production` and non-force updates. No source,
local output or configured remote is touched by module import. Tests use disposable local Git remotes/simulated origins.

Local operations are serialized in-process and protected by an exclusive cross-process writer lock. Incomplete/failed
transactions and corrupt/foreign state block reuse without deleting/resetting data or stale locks. Retained output is
content-checked, immutable by version, and route/identity conflicts fail closed. These are cooperating-tool safeguards,
not a sandbox or confidentiality/license audit of arbitrary app contents or trusted publisher code.

## Existing installations

This consolidated plugin keeps the `publisher-webxr` catalog ID and **WebXR** display name. If a legacy workspace
selector with the same ID exists, select the bundled origin explicitly; never rely on directory order or mix sources.
`reviewLegacy(workspace)` provides a revision-bound read-only source-selection/settings proposal; it does NOT edit
anything. Confirm the bundled origin and old workspace disable after public availability using the core preference writer. Preserve
old folders, history, certificates, deployment/signing identity and unrelated preferences. `reviewLegacyLocal(context)`
provides a content/revision-bound plan for existing local publications. `importLegacyLocal(context, {revision, confirm})`
requires the exact confirmation `import-reviewed-local-publications`; it copies only validated owned routes/retained
releases into an empty new store and normalizes new metadata without changing ANY original byte. Changed/corrupt/
uncatalogued source, foreign identities or existing destination state block import. Stop the old writer before review;
source changes during import fail completion and preserve both stores. This operation never starts TLS or removes data.
Production remains unconfigured until the user supplies its values; nothing is copied from a legacy production config.

## Tests

Set `XRB_CORE` to the selected compatible core and `XRB_TEST_ROOT` to a dedicated disposable fixture directory outside this
package; run the package test script. No private repository dependency is needed by these source files, and there are no
external package dependencies. Tests require Git and run only against disposable local repositories, not a real site.
The launcher protocol test contains an extracted version-one inventory consumer, without deployment defaults or routes.
Root `test:embedded` installs the frozen public graph and supplies isolated writable fixture roots automatically.
Real configured TLS/hosting/distribution acceptance remains separate; tests never publish to a real destination.

# Design

## Current state

There are two app stores inside the private repository:

1. `main` tracks `.xrbuild/projects/` (112 files today): one live app, the launcher and UI-kit showcase, plus archived
   diagnostic projects. `.xrbuild/xrb-panel.json` and `.xrbuild/pnpm-lock.yaml` also encode app names/importers.
2. The `apps` branch is publisher-owned static site state. It contains `CNAME`, `.nojekyll`, the publication inventory, the root association file and built route folders. The production publisher currently targets this private repository.

The domain already resolves to the hosting service's Pages addresses, but the origin returns a Pages 404 and the
repository Pages API is unavailable for this private repository. The current publication branch therefore cannot be
the durable public origin.

## Repository shape

Use the new public `xrbuild.dev` repository with one `main` branch and two explicit subtrees:

- Source files live outside `docs/`: `projects/<section>/<name>/`, `xrb-panel.json`, `package.json`, `pnpm-workspace.yaml`, the app-only lockfile, README and ignore rules. They contain no core source, private plugins, pinned integration SDKs, credentials, signing material or generated builds.
- `docs/` is deployment-only and contains the complete static site exactly as the publisher owns it: `CNAME`, inventory, association document and `apps/<slug>/` routes. Developers do not edit this subtree by hand after cutover.

The initial `main` commit is a fresh current-tree export after an exposure scan. Private repository history is not
filtered into the public repository because deleted files and commit metadata could expose unrelated private work.
Archived diagnostic projects are excluded by default; only source intentionally approved for publication moves.

## Separate project and integration roots

The panel receives two roots:

- **Integration workspace**: the existing selected workspace (`--workspace`, `XRB_HOME` or default). It owns plugins,
  third-party integration dependencies, package output, generated receipts and machine-local state.
- **Project repository**: `--projects=<path>` or `XRB_PROJECTS_HOME`; when omitted it defaults to the integration
  workspace for backward compatibility. It owns `projects/`, `xrb-panel.json`, app package files and editor config.

This keeps the two checkouts siblings rather than nesting one repository inside the other or committing a local path.
Repository-development startup accepts the second explicit path. The panel displays both resolved roots so a publish
cannot silently use projects from one checkout and plugins from another unintended checkout.

Project discovery, create, move, archive, delete, layout and app dependency installation use the project repository.
Plugin discovery/build/fetch, host runtime integration and package output continue to use the integration workspace.
Build receipts stay machine-local under the integration workspace and include the canonical project path, preventing
a receipt from one app checkout from validating another checkout accidentally.

## Publication target

The private production publisher remains a workspace plugin, but its configuration changes to the public repository's `main` branch and `docs/` site path. The old private `apps` branch is only a one-time migration source, not a permanent seed. Before any write, production readiness verifies:

- the configured target repository is the intended public repository;
- Pages serves `main` from `/docs` with HTTPS and `xrbuild.dev`;
- the target inventory is valid and route ownership has no collision.

The publisher still uses non-force serialized pushes, bounded retries, public verification and rollback. Publish and Unpublish stage only `docs/`; source files elsewhere on `main` remain unchanged. A concurrent source push causes the normal non-fast-forward retry rather than a force push.

## Migration and cutover

1. Create the empty public repository and verify domain ownership, but do not attach `xrbuild.dev` yet.
2. Export the approved current app sources to a fresh `main` commit. Generate an app-only lockfile and verify a clean
   clone builds every exported app with `XRB_CORE` set.
3. Copy the complete current private `apps` branch tree into public `main:docs/`, preserving inventory IDs, slugs, route contents, association data and `CNAME`.
4. Configure Pages on `main` from `/docs`. Verify inventory, launcher/root, every recorded route and association document.
5. Attach `xrbuild.dev`, wait for the certificate, enforce HTTPS and verify the same content through the custom
   origin.
6. Change the private publisher configuration to the public target and perform one no-op status check followed by a controlled publish. Verify only `docs/` changed.
7. Remove tracked projects, app layout entries and app lock importers from the private repository. Configure local
   startup with the sibling public checkout as the project repository and verify build, run, package and publish.
8. Delete the old private `apps` branch and remove any old Pages/custom-domain setting only after the new origin has
   remained healthy. DNS rollback is to reattach the old branch before it is deleted; source rollback is the private
   repository's retained history.

## Security and publication review

The source export scans current files, names, image metadata, licenses, package manifests and large assets; it rejects
credentials, signing files, local paths, private references and generated output. The site export applies the
publisher's existing forbidden-file rules. A public repository is not a backup for signing keys or private plugin
SDKs.

## Alternatives considered

- **Use a separate deployment branch.** It cleanly separates source and generated output, but the maintainer prefers a single visible branch. A dedicated `docs/` subtree keeps the boundary explicit while allowing Pages to deploy from `main`.
- **Clone the public repository inside `.xrbuild/projects`.** Project discovery would mostly work unchanged, but it
  creates nested Git metadata, leaves app importers in the private workspace lockfile and makes task worktrees
  ambiguous.
- **Make the public app repository the whole workspace.** It would expose or duplicate private plugins. Adding an
  explicit project repository root keeps the existing plugin boundary.
- **Publish private history after path filtering.** Rejected because deleted content and commit metadata are harder to
  prove safe than a fresh reviewed snapshot.

## Confirmed source boundary

The initial public set is launcher, UI-kit showcase and Control Room. Archived diagnostic projects remain excluded. No open-source license is granted; the public README records all rights reserved while retaining third-party asset notices.

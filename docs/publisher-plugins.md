# Publisher plugins

A publisher is a workspace plugin that makes a verified local WebXR build available at a stable HTTPS route. Hosting credentials and provider-specific code stay in the workspace. The panel has no standalone Build action. Publish reuses an unchanged successful build or builds automatically when needed; Run and Build package follow the same current-build rule without publishing.

## Declaration

An enabled package under `plugins/*` or `plugins/*/*` declares a module relative to its package root:

```json
{
  "xrBuild": { "publisher": "./src/publisher.ts" }
}
```

The module exports `publisher` or a default object with:

- `name`: unique lower-case stable plugin name stored in manifests.
- `label`: optional user-facing name shown by the panel's custom dropdown.
- `origin`: HTTPS public origin.
- `routePrefix`: optional path prefix; `apps` when omitted.
- `validate({id, slug})`: synchronous field errors.
- `status({id, slug})`: remote truth, including selected/deployed URL and operation state.
- `publish({app, publication, log})`: publish the supplied build entry.
- `unpublish({publication, log})`: remove only that publication.

See `packages/control-panel/src/publishers.ts` for exact TypeScript interfaces.

## Launcher card

`publish`, `releases.publish` and `releases.activate` receive an optional `card`: `{ name, description, icon: { default,
color, shape, model } }`, the same contract the panel's project API carries for local previews. A publisher stores it
with the active deployment record and serves it in its inventory (`card` on each entry), so a launcher presents a
published app exactly like its local preview, without rebuilding the app, and the card follows the latest publish or
activation rather than the retained bytes. Reject a malformed card rather than storing it.

## Optional versioned releases

A publisher that retains immutable release history adds a complete `releases` object; the panel validates it at
discovery and rejects an incomplete one (all three members are required). Without it the publisher is a legacy
publisher: the panel keeps Publish/Unpublish only, shows no version controls and never sends versioned requests.

- `releases.catalog({id, slug})`: read-only. Returns `{ revision, releases, requestedReleaseId, liveReleaseId, legacyLive }`.
  Each release is `{ releaseId, version, digest, createdMs, url? }`: an opaque publisher-issued ID (never a path or URL for
  the caller), a stable three-part version or `null` for a captured legacy deployment, the content digest, the creation
  time and, when the publisher serves its archives, the public HTTPS URL where that retained output can be previewed
  without deploying it (the panel's open link while that release is inspected). `revision` is a precondition token that changes whenever this identity's retained releases or its latest
  deployment decision change, and only then: unrelated site changes must not move it. `liveReleaseId` names the release
  verified live at the canonical route; `requestedReleaseId` the latest decision; `legacyLive` is true when a verified
  deployment exists that no retained release describes. A catalog read must never migrate or write remote state.
- `releases.publish({app, publication, version, expectedRevision, log})`: the verified build as a new release. Refuse a
  version that does not exceed the highest retained version, a retained version with different bytes and an
  `expectedRevision` that is no longer current; identical bytes under a retained version may reuse that release. The
  first versioned update of an unversioned deployment retains its exact verified bytes as a legacy release first.
  Returns `{ url, link, releaseId, version }` only after public verification.
- `releases.activate({publication, releaseId, expectedRevision, log})`: deploys the exact retained bytes of an owned
  release at the canonical route without rebuilding; refuses foreign releases, stale revisions and corrupt snapshots,
  and is a no-op for the verified live release.
- `releases.delete({publication, releaseId, expectedRevision, log})`: removes one owned retained release and its archive. Refuse
  the release deployed at the canonical route, the requested deployment, a foreign release and a stale `expectedRevision`;
  leave the live route, other releases and unrelated routes untouched, and move the catalog revision.

The panel validates app kind, publisher availability, identity, version syntax and catalog preconditions before it
queues a job and captures the decision (version or release ID plus revision) with the job; the publisher repeats the
ownership, integrity and revision checks before it mutates anything. Legacy `publish` must refuse an identity whose
release catalog already exists. Unpublish removes the live route and its active associations but keeps release
history; retained output in public storage is not confidential and is not erased by Unpublish. A developer removes a
retained release that is not live with the confirmed Delete action. Version drafts live in the
project manifest (`publication.versions.<publisher>`), independent of package versions.

## Required behavior

A publisher must own route assignment by stable publication ID rather than project folder. It must preserve unrelated routes and root files, serialize conflicts, avoid force-overwriting newer state, verify the public result, and preserve or restore the last-known-good complete site after failure. Status must not claim success before public verification.

The app path contains browser files only. Reject links, traversal, credentials, private files and source maps when the publication policy excludes them. Signing material must never enter the publisher.

## Approved content-branch implementation

The first private implementation uses a content branch named `apps`:

1. Fetch and check out the complete current branch without sparse checkout.
2. Verify route ownership in its tracked inventory.
3. Replace only `apps/<slug>/`, or remove only that route for Unpublish.
4. Rebuild the origin-root package-association document from explicit active records.
5. Preserve the root page, custom-domain marker, no-processing marker and every unrelated route.
6. Commit the complete transaction and push normally.
7. On non-fast-forward rejection, fetch current state, revalidate ownership, reapply and retry; never force-push.
8. Wait for hosting completion and verify the origin root, route and association document.
9. On failure after push, revert the publication commit and verify the restored site.

Git history is the durable inventory and rollback log. Generated content belongs only on the content branch, never the core development branch. A private publication repository or atomic object-store plugin can replace this implementation later without changing the panel contract.

## Installed packages

Browser and installed-headset use the same canonical app URL. For a configured WebXR app, the panel passes that publisher-derived route to the packager as `PackagerBuildOptions.launchUrl`; a packager must not expose a second web-folder setting. Package creation is separate from publication. An external packager may explicitly ask the publisher to register package identity and certificate fingerprints at the origin root, but it must not pass a key or password. Moving or retiring an associated route requires explicit confirmation and normally requires a replacement package.

# Design

## Context

See proposal.md for motivation. The panel already discovers workspace packagers, separates web Build, browser Run and
package creation, and passes WebXR packagers only the built app, icon and identity. Concrete hosting is another
integration and therefore belongs behind a workspace plugin contract rather than repository-specific code in the core.

A WebXR site and an installed headset launcher use the same canonical HTTPS route. The package embeds that route and
requires an origin-root package-association document, but signing and package identity remain private packager concerns.

## Goals / Non-Goals

**Goals:**

- Add provider-neutral publication controls and APIs to the panel.
- Let a workspace publisher receive a verified local build and own hosting, authentication and rollback.
- Keep routes stable across project renames and isolated across Publish/Unpublish operations.
- Make the same canonical site usable from browsers and installed headset packages.

**Non-Goals:**

- A built-in hosting provider or hosting credential in the public core.
- Publishing during Build or package creation.
- Separate copies of one app for browser and headset use.
- Keeping old routes or old installed packages working after an explicitly confirmed move or retirement.
- Changing live hosting, editing the private workspace, or deleting legacy infrastructure in the core PR.

## Decisions

### D1. Publisher is a workspace plugin contract

A package under `plugins/*` or `plugins/*/*` declares `package.json#xrBuild.publisher` and exports:

```ts
interface Publisher {
  name: string;
  origin: string;
  routePrefix?: string;
  validate(publication: PublicationIdentity): IdentityError[];
  status(publication: PublicationIdentity): Promise<PublicationStatus>;
  publish(options: PublisherPublishOptions): Promise<PublicationResult>;
  unpublish(options: PublisherUnpublishOptions): Promise<PublicationResult>;
}
```

The panel discovers enabled publishers independently from platform packagers. Invalid or duplicate declarations are
reported without preventing local Build, Run or package creation. The core passes paths and neutral data; it does not
import a hosting SDK, invoke a repository API or interpret provider credentials.

*Alternative:* implement one repository host in the core. Rejected because it violates the core's provider boundary and
turns authentication, branch policy and hosting changes into public engine changes.

### D2. Stable manifest identity and publisher-owned routes

A WebXR app opts in with:

```json
{
  "publication": {
    "enabled": true,
    "publisher": "web",
    "id": "generated-opaque-id",
    "slug": "demo"
  }
}
```

The panel generates `id` once. It is independent from the project folder, title, platform and package identity. The
selected publisher supplies the origin and route prefix; the approved concrete publisher uses `/apps/`, producing one
canonical route such as `/apps/demo/`.

The core validates the generic slug form: normalized lower-case ASCII letters, digits and dashes, 1-63 characters,
beginning and ending with a letter or digit. The publisher performs final reserved-name and ownership validation. A
live publisher or slug change is a confirmed Move, never an ordinary settings save.

### D3. Publish only a recorded successful unchanged build

After a successful panel web-build job, the panel hashes the entry tree and writes an ignored workspace receipt outside
the project source. The receipt records project ID, manifest file time, entry path, completion time, file count, byte
size and SHA-256 tree digest.

Publish recomputes the digest and requires it to match. The publisher receives the entry folder only after the receipt
passes. Links, paths outside the entry, missing index pages and configured size limits are rejected before the plugin is
called. A panel restart can use the persisted receipt; changed output or settings require Build again.

### D4. Publisher owns atomic complete-site behavior

The publisher contract requires observable outcomes rather than a storage mechanism. A conforming publisher must:

- keep authoritative route ownership by stable publication ID;
- replace or remove only the requested route;
- retain every unrelated route and required root file;
- publish the site and root package-association document as one recoverable operation;
- serialize conflicting operations and reject stale ownership decisions;
- report pending, deployed, failed and rollback status with a diagnostic link when available; and
- preserve or restore the last-known-good complete site when an operation fails.

The approved private implementation uses a complete checkout of an `apps` content branch. It updates
`apps/<slug>/`, inventory and root files in one commit, pushes normally, retries a non-fast-forward conflict after
reapplying the operation, and rolls back by reverting the publication commit. Generated files remain outside the
core's main branch. This implementation detail belongs in the private plugin, not the public contract.

*Alternative:* transfer local builds into hosted automation through release assets. Rejected after a disposable proof
showed that private release state requires extra credential and state machinery without improving the single-maintainer
publication flow.

### D5. Dedicated panel API and UI

Publication configuration and actions use dedicated HTTP routes. The server validates project target, manifest
freshness, publisher availability, slug, ownership, build receipt and confirmation; UI checks never authorize an
operation by themselves. Generic manifest saves apply the same publication-field validation and cannot silently change
a live route.

A publication runs as a panel job and streams publisher log lines. Project descriptions include selected and deployed
URLs, last success, pending operation, last error and diagnostic link. Network or plugin failures show status as
unavailable without erasing stored configuration.

Controls appear only for `target === 'webxr'`. Build remains first and never publishes. Run continues to open the local
browser preview. Package creation remains independent. Publication fields stack at the narrow panel breakpoint.

### D6. One site for browsers and installed headset packages

The installed package embeds the publisher's canonical route with the WebXR entry query. It does not carry a separate
site copy. The private packager migration must stop publishing during package creation, accept the canonical route,
preserve package/signing identity for updates, and expose a separate explicit association-registration command.

The publisher owns the origin-root association document and includes only explicitly supported package identity and
certificate-fingerprint records. A move or unpublish reports affected associations and requires confirmation. Signing
keys and passwords never pass through the publisher contract.

### D7. Live cutover and deletion remain separate maintainer actions

Before live cutover, the private publisher is tested against a disposable remote with at least two routes, republish,
one-route removal, conflict retry, root-file retention and rollback. The maintainer then rechecks domain ownership,
DNS, HTTPS and the current live source.

Only explicit maintainer authorization may switch the live source to the `apps` branch. Verification covers the origin
root, canonical app route, package-association document, Publish/Unpublish isolation and device launch. A failed check
restores the previous source while the old branch and root site remain available.

The disposable proof repository can be deleted after its evidence is captured. The old root-site repository and legacy
publication branch may be deleted only after the new route, replacement package and rollback are verified and the
maintainer gives a final deletion authorization naming them. Publish and Unpublish never perform those deletions.

## Risks / Trade-offs

- [A publisher plugin can mishandle credentials or overwrite unrelated content] → Keep it private, validate its
  declaration, require complete-site isolation tests, and expose every operation through panel jobs and status.
- [Generated public files remain in content-branch history] → Scan before commit, omit private files and source maps by
  policy, and use a private publication repository or an atomic object-store publisher later if retained history becomes
  unacceptable.
- [Two clients publish concurrently] → The publisher uses normal non-fast-forward protection, refetches, reapplies the
  operation against current inventory and retries without force-pushing.
- [A route move strands an installed package] → Show association impact, require confirmation and produce a replacement
  package for the new route; no legacy compatibility is implied.
- [The custom origin is configured but not serving content] → Treat repository configuration and live HTTPS checks as
  separate cutover gates and retain the previous source until rollback is proven.

## Migration Plan

1. Implement and test the publisher contract, discovery, manifest schema, build receipts, panel API and UI in the core.
2. Document the external `apps` branch publisher contract and cutover checks; merge no private credentials or concrete
   hosting code into the core.
3. In a separate private-workspace change, implement the publisher, migrate the packager to consume the canonical route,
   and test two-route isolation, association updates, conflict retry and rollback against a disposable remote.
4. Produce and device-test the replacement signed package without changing live hosting.
5. With explicit maintainer authorization, switch the live source to `apps`, verify all runbook checks, or restore the
   previous source immediately.
6. Ask for separate final deletion authorization, then remove the disposable proof repository and legacy root/publication
   infrastructure named by the maintainer.

## Context

The project manifest already names a PNG icon or selects a generated default. The panel uses that identity for project cards, native runs and packages. Browser apps remain responsible for their own `<link rel="icon">`, however: Launcher declares one and receives its rocket, while UI Kit does not and browsers fall back to a generic origin icon in both `/preview/.../` and `/apps/.../`.

Local browser preview, package creation and publication all consume the project's built entry folder. Build receipts digest that folder, so favicon normalization belongs in browser-build finalization before the receipt is written or accepted, not in individual apps or in one publisher.

## Decisions

1. Add a core browser-build finalizer that resolves the project's authoritative icon. It reads the manifest PNG when it exists and otherwise renders the selected generated default with the existing app-icon implementation.
2. Materialize that image at a stable core-owned filename in the built entry and add a content-derived query token to the HTML reference. The stable file keeps publisher and static-server behavior simple; the token causes browsers to request a changed icon after the project image changes.
3. Reconcile browser-tab icon declarations in built `index.html`: replace links whose `rel` value selects the page favicon (`icon` or `shortcut icon`) with one core-owned PNG link. Preserve manifests, `apple-touch-icon`, mask icons and unrelated metadata. Do not edit the project's source `index.html`.
4. Make finalization idempotent and bounded. Re-running it with unchanged HTML and icon writes nothing; malformed or missing build entry/index state remains a build failure rather than producing partial output.
5. Run finalization before a new build receipt is written. When a previously valid receipt predates this behavior or the source icon bytes changed, finalize the entry and replace the receipt with the digest of the complete output. Local preview, package creation and every publisher therefore consume the same verified tree.
6. Keep tool identity separate. Control Panel, Plugins Manager and managed tools retain their designated favicons; only project app builds receive the project icon.

## Risks and Bounds

- HTML links can vary in attribute order and quoting. Parse only complete `<link>` tags, inspect the `rel` token list case-insensitively and leave tags that cannot be identified as page favicons unchanged.
- Browsers cache favicons aggressively. Include a short content digest in the link query while retaining a stable copied filename.
- A project icon may be removed or missing on disk. Match existing project behavior by using the generated default rather than leaking a generic site icon.
- Rewriting output after a receipt would make publication fail integrity checks. Finalization and any receipt refresh occur in one build path, and tests verify the resulting receipt against the finalized tree.
- Production verification is destructive. Automated tests use temporary build trees and simulated/local publication only; no real production Publish is part of this change.

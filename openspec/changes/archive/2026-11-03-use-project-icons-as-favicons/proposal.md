## Why

A project already has one authoritative icon for the panel, native window and package, but its browser build can omit a favicon or retain an unrelated site icon. This makes local previews and published apps show a generic origin icon even when XR Build already knows the app-specific image.

## What Changes

- Finalize every successful browser build with a favicon generated from the project's authoritative custom or default icon.
- Reconcile the built `index.html` so one unambiguous browser-tab icon points to the finalized app icon while unrelated head metadata remains intact.
- Apply the same finalized build tree to local preview, packaging and publication, including existing current builds and later icon changes.
- Verify custom icons, generated defaults, repeated finalization and browser-facing preview/publication output without performing a real production publication.

## Scope

This changes browser-build output finalization and the project-icon contract. It does not change publisher route ownership, publication identity, source application HTML, package identity or developer-tool favicons.

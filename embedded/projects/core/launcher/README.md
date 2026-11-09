# Launcher

Spatial app catalog using the core SDK and UI kit. The authored icon is rendered by `src/icon.js`.

In a panel preview or a native run carrying explicit loopback panel context, the launcher lists active apps from that panel. A published launcher reads its own publisher's inventory and canonical app routes. An external inventory requires explicit `VITE_CATALOG_ORIGIN` (clean HTTPS, or loopback HTTP for development). No production site, user deployment identity or private workspace is built in; a plain dev server does not silently contact a production service.

Build through the selected core's frozen embedded lane. Product source is read-only in ordinary panel use: Rebuild writes to user cache; Copy to workspace creates an independently editable/publication-ready app. The product manifest has desktop/no-input defaults, no publication UUID, package/signing identity or machine settings. Configure those only in the editable copy/user workspace.

Launch actions preserve the SDK's return URL and projection contract. Enter XR is explicit. No camera, native provider or inference runtime starts because this catalog is viewed. The build never scans sibling project repositories or private source. Optional headset packaging uses the separately configured embedded packager and existing user-owned signing material; it never publishes a second web site.

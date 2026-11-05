## Why

Publish can reuse a valid browser-build receipt even after application or shared core source changed, because the receipt fingerprints generated output and project settings rather than every source dependency. Unpublish followed by Publish therefore redeployed the launcher's old bundle and left the production catalog broken despite the fix being merged.

## What Changes

- Run a project's configured browser build script on every Publish request, even when its prior output and receipt are internally consistent.
- Finalize the project favicon, write a fresh receipt and verify the rebuilt output before calling the publisher.
- Retain verified-output reuse for static projects without a build script, while refusing them when their existing output is stale or missing.
- Add regression coverage proving unchanged old output is replaced from current source before publication.

## Capabilities

- `web-publication`: Publish with a configured build script always prepares current source instead of trusting an older successful output tree.

## Impact

- Control Panel browser-build preparation used by publication and focused tests.
- Publish takes the build's normal execution time on every request; preview and package preparation retain their existing receipt reuse.
- No production publication, route, credential or publisher-plugin behavior is changed by the implementation itself.

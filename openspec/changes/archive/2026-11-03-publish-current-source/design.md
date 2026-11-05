## Context

A build receipt proves that the current entry tree matches a prior successful build for the same project manifest. It intentionally does not hash all application source, imported core packages or other build dependencies. That is sufficient when previewing or packaging a known output, but not for an explicit Publish action whose label and job title promise to build and publish current code.

The failure was observable in production: the publication timestamp advanced while its content hash, index hash and hashed JavaScript filename remained unchanged. The panel had accepted the old receipt and skipped the launcher build.

## Decisions

1. When a publishable project declares a build script, every Publish job executes that script at job execution time. This also applies after the job waited in the publication queue.
2. Reuse the existing browser-build execution path so dependency setup, `XRB_CORE`, favicon finalization and receipt creation remain identical to ordinary builds.
3. After the script finishes, re-read the project manifest timestamp and verify the fresh receipt/tree before passing the entry folder to the publisher. A settings change during the build fails rather than publishing an ambiguous output.
4. Keep receipt reuse for preview, packaging and ordinary web-build preparation; this change is deliberately limited to explicit publication.
5. A static project without a build script cannot be rebuilt. It may publish only when its existing entry and receipt are current; stale or missing static output remains refused.

## Risks and Bounds

- Publish becomes slower for projects with build scripts, but avoids silently deploying stale code.
- Build scripts can be nondeterministic or fail. Existing job logs and failure handling report this and the publisher is not called.
- This does not add a Republish button or automatically deploy after merging source. It guarantees that any subsequent Publish request uses current source.
- Automated tests use fixture publishers only; no production route is modified.

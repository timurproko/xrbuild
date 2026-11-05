## 1. Rebuild explicit publications

- [x] 1.1 Refactor browser-build preparation so Publish can run the configured build script, validate that settings stayed unchanged and verify the fresh receipt before publisher invocation; verify preview and package paths retain their current receipt-reuse behavior.
- [x] 1.2 Make every queued or immediate Publish with a build script use that forced rebuild path, while static projects reuse only current verified output; verify focused job/server tests cover an unchanged valid old receipt, current source producing different output, build failure, queued execution and no publisher call before verification.

## 2. Verify delivery

- [x] 2.1 Run strict OpenSpec validation, focused/full Control Panel tests, `pnpm check:names` and `git diff --check`; verify all commands pass without performing a production publication.

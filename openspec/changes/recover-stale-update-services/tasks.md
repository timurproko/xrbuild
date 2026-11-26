# Tasks

## 1. Rebuild includes required component preparation, used automatically by Run, Build and Update with actionable job results

- [x] 1.1 Add structured service readiness and one serialized Rebuild preparation path, automatically used by Run/Build for stale services or native output; synthetic fixtures cover changed inputs, unsafe state, active consumers and reload without restart.
- [x] 1.2 Complete public service setup through fresh Update code and preserve retry state; temporary repositories exercise changed service inputs across a pull, setup failure and same-commit retry with accurate final output.
- [x] 1.3 Present only Rebuild in normal UI, accurate header status and in-place Retry/Restart controls; targeted HTTP/UI regressions cover same-job progress, retained failures, unavoidable restart and no navigation or separate service-setup action.
- [x] 1.4 Update owner documentation for automatic action preparation and the manual recovery command; check described controls against the implemented UI.

## 2. Update native rebuilds reuse the desktop-validated CMake and generator

- [ ] 2.1 Probe validated tools inside the fresh rebuild subprocess and forward both selections; competing fake executables cover host and plugin command selection without real builds.
- [ ] 2.2 Audit Update's production build call chain for the same defect and fix only matching occurrences; record entry points inspected and targeted regression results.

# Tasks

## 1. Event routing and coverage

- [x] 1.1 Gate the full Windows host build and tests on scheduled CI and explicit dispatch only, removing the unused PR native-path selector while leaving the job steps and other path selectors intact; verify focused event fixtures for ready and draft PRs, `main` push, schedule and dispatch.
- [x] 1.2 Keep `CI required` dependent on the host job and accepting only intentional skips, while all other selected PR checks still gate merges; verify workflow tests for native-only and CI-workflow PRs plus an aggregate failure scenario for a failed scheduled host job.

## 2. Nightly safety and handoff

- [x] 2.1 Preserve the nightly schedule, complete cached host build and native test command, and scheduled-run-only triage; verify workflow tests for the host steps and the existing nightly triage trigger.
- [x] 2.2 Document the faster PR policy, loss of pre-merge native coverage and manual full-run option without calling skipped jobs a pass; verify documentation against event routing and the capability spec.
- [x] 2.3 Run targeted workflow tests, `pnpm check:names` and strict OpenSpec validation; verify each command passes and record any unobserved live nightly run as a post-merge observation, not a completed task.

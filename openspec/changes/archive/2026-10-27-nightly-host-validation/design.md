# Design

## Context

`ci.yml` currently selects `native=true` when a PR changes `native/`, `tools/fetch-deps/` or the CI workflow. The ready `Host build and tests` job uses a Windows runner to fetch core dependencies, configure CMake, build in Release mode and run `host-tests.exe`. `CI required` treats a skipped job as acceptable. The same workflow already runs nightly on `main` at 01:17 UTC and has an explicit dispatch; nightly triage reacts only to scheduled CI failures on `main`. A separate workspace-asset verification job checks pinned files when applicable.

## Goals / Non-Goals

**Goals:** Make PR feedback fast by removing the full host build from every PR, including native and CI changes; retain nightly and on-demand native coverage; keep all other PR gates and nightly triage working.

**Non-Goals:** Do not remove host tests, mark an unbuilt PR as natively tested, weaken the name guard, OpenSpec, delivery or Node jobs, merge automatically, or change hardware-only acceptance. Do not make scheduled CI optional.

## Decisions

### D1. Select the host job by event, not PR paths

Run `Host build and tests` only on the scheduled `main` run or explicit `workflow_dispatch`. A ready or draft PR always skips it, as does a push to `main`; other jobs keep their current path and readiness conditions. Drop the now-unused `changes.native` output, while keeping the `changes` job's `node` and `workspace_assets` outputs. Leave the host job's dependency fetch, cache, configure, build and tests unchanged. A manual dispatch uses the selected ref and still runs the full lane.

*Alternative:* Keep host builds on native-only PRs. Rejected because an eight-minute host build still delays exactly the native PR iterations this change is meant to speed up. An on-demand dispatch is available when the maintainer wants pre-merge evidence.

### D2. Make skipped native validation honest

Keep `CI required` dependent on the native job: an intentionally skipped job is allowed, while a failed or cancelled scheduled or manually dispatched host job still fails the aggregate. PR success means fast gates passed, **not** that the native host compiled. Preserve the nightly schedule, its full job selection, and the existing scheduled-run-only triage workflow. A post-merge `main` push remains useful for Node and other checks, but full host evidence arrives at the next nightly run.

## Risks / Trade-offs

- [A native regression merges before the nightly build] → The maintainer may manually request a full run for sensitive changes; the next scheduled run detects failures and the bot opens a draft triage PR. This is a deliberate loss of pre-merge native gating.
- [Nightly runner or dependencies fail] → The required nightly aggregate fails and triage reports the failing job; it cannot undo or block an already merged PR.
- [Workflow changes accidentally stop nightly host coverage] → Add selection tests for PR, push, schedule and dispatch events plus a check that nightly triage still targets the scheduled CI run.
- [Other expensive jobs remain on PRs] → Node tests and workspace-asset verification keep their own selection rules; those jobs are outside this native-build change.

## Rollout

Update event gates and remove the unused native path selector. Test the selection, required aggregation, and nightly triage trigger; run focused workflow tests, the name guard and strict OpenSpec validation. Confirm on this PR that the host lane is skipped once ready, and after merge observe a scheduled `main` run for native coverage; do not claim post-merge evidence in a pre-merge task.

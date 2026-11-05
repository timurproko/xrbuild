# Proposal

## Why

The Windows host build and native tests take several minutes on a ready pull request, even when the pull request changes only CI configuration. This delays ordinary iteration and repeats expensive compilation on every new PR head. The maintainer wants that full lane to run nightly instead of gating pull requests.

## What Changes

- Do not schedule `Host build and tests` on any pull request, including native-code and CI-workflow changes, or on the post-merge `main` push. Keep fast PR checks, relevant Node tests, workspace-asset verification and the required aggregate check.
- Keep the full Windows host build and tests on the scheduled `main` run, and allow an explicit CI workflow dispatch to run them on demand. Nightly failures continue through the existing triage workflow.
- Make job selection and required-check behavior explicit in tests and docs so a skipped host job is not mistaken for a successful native build.

## Capabilities

### Modified Capabilities

- `ci-validation`: native host compilation and tests move from path-selected ready PR runs and `main` pushes to scheduled nightly runs and explicit dispatch, with skipped jobs accepted by the aggregate PR check.

## Impact

- `.github/workflows/ci.yml`, targeted workflow tests, CI documentation and the `ci-validation` spec.
- Native regressions can reach `main` before the nightly run. Maintainers can run the full CI workflow manually before merging a sensitive change; the scheduled failure opens a draft triage PR, but a nightly failure cannot retroactively block a merged PR.

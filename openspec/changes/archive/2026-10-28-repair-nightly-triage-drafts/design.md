# Design

## Credential boundary

The workflow has two credentials with different purposes:

- `github.token`, with job permissions `actions: read` and `issues: write`, reads the completed CI run, jobs and job
  logs, finds an existing labelled repair, and writes labels and triage comments.
- The repository App token authenticates the branch push and creates the draft pull request, so its creation triggers
  the ordinary pull-request workflows.

`nightly-triage.mjs` accepts the workflow token as a separate environment variable instead of reusing `GH_TOKEN`.
Every Actions endpoint, direct log download and Issues endpoint uses the workflow token. The authenticated checkout
and pull-request creation continue to use the App. The App therefore does not need Actions or Issues access, while the
workflow token cannot bypass the App identity for creating the repair candidate.

## Actionable repair draft

On the first failed scheduled run with no open `nightly-failure` PR, triage creates the branch and OpenSpec change as
it does today, but renders the PR in the same human-readable shape trusted promotion expects:

1. Proposal: date, failed head, run link and a bounded list of failed job names.
2. Implementation: two unchecked outcomes—to reproduce and identify the cause, then fix it without weakening
   validation.
3. Acceptance: the failed lanes pass on the fix head without weaker assertions, budgets, timeouts or coverage.
4. Automation: the existing OpenSpec implementation link.

The detailed failure summary is posted as the first PR comment and copied into `design.md`. It keeps the failed job,
failed step names and sanitized bounded log tail already collected by triage. `proposal.md` explains why the repair
exists and `tasks.md` expands the same reproduce, fix and prove flow into verifiable tasks. The generated repair can
therefore be handed directly to an agent and later completed through the normal draft-promotion path.

## Later runs

A later failed nightly still comments on the one open repair PR with its own evidence. A later green nightly still
adds the recovery comment. Triage never marks the repair ready, merges it or arms auto-merge.

## Failure and retry behavior

Reading Actions evidence happens before repository mutation. If PR creation succeeds but the evidence comment fails,
a rerun finds the labelled open PR and posts the failure evidence as a repeat comment rather than creating a second
repair. Existing concurrency continues to serialize triage runs.

## Verification

Unit tests exercise token selection without live credentials, validate that the generated body satisfies the trusted
promotion layout, and verify that the initial comment and design preserve the failed jobs, steps, run link and log
excerpt. The workflow policy test asserts `actions: read`, `issues: write` and the separate workflow-token environment
variable. A manual
workflow dispatch against a retained successful scheduled CI run verifies that triage can read Actions data and exits
without opening a PR.

Implementation verification: all 45 PR automation tests passed, OpenSpec strict validation and the name guard passed,
and [nightly triage run 40674920279](https://github.com/timurproko/xrbuild/actions/runs/40674920279) read retained
scheduled CI run 40646457584, reported `none`, and left no open `nightly-failure` PR.

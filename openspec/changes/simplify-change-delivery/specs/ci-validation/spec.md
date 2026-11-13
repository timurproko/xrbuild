## MODIFIED Requirements

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL skip Node tests, host build and the delivery check while running name guard and OpenSpec validation. A draft SHALL NOT be promoted on the basis of a lightweight CI pass. Trusted readiness automation SHALL promote only a complete unheld linked implementation draft; its ready event SHALL trigger all applicable PR checks, and the finalizer's archive commit SHALL trigger exact-head PR validation again. The host build remains reserved for nightly or explicit dispatch even after promotion.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only the name guard, OpenSpec and change detection run and the PR remains draft

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every PR-eligible job its changes need but skips the host build

#### Scenario: Completed implementation
- **WHEN** trusted automation promotes a completed draft to ready and finalizes it on its branch
- **THEN** CI runs all applicable PR jobs on the final commit before `CI required` can make it merge-eligible

### Requirement: Automatic refresh of stale ready pull requests
Trusted default-branch automation SHALL reconcile open ready same-repository PRs targeting `main` after a PR merges into main. It SHALL also safely reconcile after completion of the existing documentation-auto-merge workflow without enabling that workflow. It SHALL skip held PRs, drafts, forks, closed PRs and other base branches and recheck hold before mutation, leave current heads unchanged, and update stale branches only through an expected-head-bound update-branch request using the event-producing repository App identity. It SHALL use bounded requests and pagination, report conflicts and head races without force pushes, and report operational failures without claiming validation success. It SHALL NOT execute candidate code, merge PRs, arm auto-merge, promote drafts or manufacture statuses.

#### Scenario: Another PR merges
- **WHEN** a PR merges into main and an open same-repository non-draft PR is behind current main
- **THEN** trusted automation requests an expected-head-bound branch update with the App identity and accepted updates trigger ordinary PR synchronization checks on the new head

#### Scenario: Current branch or ineligible candidate
- **WHEN** a listed PR already contains main, is held, a draft or fork, has closed, or no longer targets main
- **THEN** refresh reports its current or skipped disposition and makes no branch update for that candidate

#### Scenario: Head changes during reconciliation
- **WHEN** the candidate head changes after it is read and before the update request is accepted
- **THEN** the expected-head guard prevents replacement of the new head and refresh reports a deferred race rather than forcing an update

#### Scenario: Conflict or operational failure
- **WHEN** a stale branch conflicts with main or an independent update request fails
- **THEN** refresh reports the blocked or failed candidate and continues other candidates where safe, while authentication or authorization failures abort the pass and operational failures fail the job

#### Scenario: Documentation merge completion bridge
- **WHEN** the separately enabled documentation-auto-merge workflow completes
- **THEN** refresh reads trusted main policy and fresh open PR state without using the completed run's candidate code or artifacts, and repeated reconciliation makes no write to current branches

#### Scenario: Old workflow run stalled
- **WHEN** a ready PR already contains main but an earlier required job stalled
- **THEN** branch refresh leaves its head unchanged and does not fabricate a pass or claim that rerunning the historical workflow validates a newer base

#### Scenario: Hold appears before refresh
- **WHEN** a candidate gains delivery-hold after enumeration
- **THEN** fresh pre-mutation verification SHALL prevent its branch update

### Requirement: Nightly triage
When separately reviewed/enabled nightly triage receives a failed run, its workflow SHALL read the completed run, jobs and logs with its trusted workflow token,
use that token for labels and triage comments, and use the repository GitHub App for the branch push and pull-request
creation. It SHALL open one draft PR
`fix/nightly-<date>` labelled `nightly-failure` and linked to an OpenSpec change. The draft SHALL use the normal
delivery layout with a proposal scoped to the failed run and jobs, one or more meaningful unchecked implementation outcomes and one
acceptance outcome. Its initial triage comment and generated change design SHALL contain the run link, failed jobs,
failed steps and bounded log excerpts. While such a PR is open, later failures SHALL be added to it as comments, and
a green nightly run SHALL be noted on it. The workflow SHALL NOT merge, mark ready or arm auto-merge.

#### Scenario: First failure
- **WHEN** enabled nightly triage receives a failed run and no `nightly-failure` PR is open
- **THEN** an actionable draft repair PR is opened with the detailed failure evidence in its triage comment and change design

#### Scenario: Restricted repository App
- **WHEN** the repository App can write contents and pull requests but cannot read Actions runs or write Issues data
- **THEN** nightly triage uses the workflow token for run evidence, labels and comments while the App pushes the branch and creates the repair PR

#### Scenario: Repeated failure
- **WHEN** the nightly run fails again while that PR is open
- **THEN** no second PR is opened and the open one gets a comment with the new run's summary

#### Scenario: Recovery
- **WHEN** a nightly run succeeds while a `nightly-failure` PR is open
- **THEN** the open PR gets a comment identifying the green run and remains open for the maintainer

#### Scenario: Triage remains disabled
- **WHEN** the reviewed activation profile leaves triage disabled
- **THEN** instructions SHALL not promise automatic repair drafts or enable it as a side effect of delivery simplification

### Requirement: Nightly run
CI SHALL run every job on `main`'s head once a night, whatever changed, including the full Windows host build and native tests. An explicit workflow dispatch SHALL also permit a full run on the selected ref. The nightly run SHALL cover builds and unit tests only; checks that need a 3D display, a hand tracker or the rig's GPU stay manual.

#### Scenario: Quiet day
- **WHEN** no PR merged during the day
- **THEN** the nightly run still builds the host and runs every test suite on `main`

#### Scenario: Nightly native failure
- **WHEN** the scheduled host build or native tests fail on `main`
- **THEN** `CI required` fails and nightly triage reports the failure only when separately enabled without retroactively blocking a merged PR

#### Scenario: Manual full check
- **WHEN** the maintainer dispatches CI for a ref before merging a sensitive native change
- **THEN** the full host build and tests run without changing the required PR check policy

## ADDED Requirements

### Requirement: Automatic refresh of stale ready pull requests
Trusted default-branch automation SHALL reconcile open ready same-repository PRs targeting `main` after a PR merges into main. It SHALL also safely reconcile after completion of the existing documentation-auto-merge workflow without enabling that workflow. It SHALL skip drafts, forks, closed PRs and other base branches, leave current heads unchanged, and update stale branches only through an expected-head-bound update-branch request using the event-producing repository App identity. It SHALL use bounded requests and pagination, report conflicts and head races without force pushes, and report operational failures without claiming validation success. It SHALL NOT execute candidate code, merge PRs, arm auto-merge, promote drafts or manufacture statuses.

#### Scenario: Another PR merges
- **WHEN** a PR merges into main and an open same-repository non-draft PR is behind current main
- **THEN** trusted automation requests an expected-head-bound branch update with the App identity and accepted updates trigger ordinary PR synchronization checks on the new head

#### Scenario: Current branch or ineligible candidate
- **WHEN** a listed PR already contains main, is a draft or fork, has closed, or no longer targets main
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

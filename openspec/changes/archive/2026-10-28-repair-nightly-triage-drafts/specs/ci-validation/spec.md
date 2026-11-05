## MODIFIED Requirements

### Requirement: Nightly triage
When a nightly run fails, a workflow SHALL read the completed run, jobs and logs with its trusted workflow token,
use that token for labels and triage comments, and use the repository GitHub App for the branch push and pull-request
creation. It SHALL open one draft PR
`fix/nightly-<date>` labelled `nightly-failure` and linked to an OpenSpec change. The draft SHALL use the normal
delivery layout with a proposal scoped to the failed run and jobs, two unchecked implementation outcomes and one
acceptance outcome. Its initial triage comment and generated change design SHALL contain the run link, failed jobs,
failed steps and bounded log excerpts. While such a PR is open, later failures SHALL be added to it as comments, and
a green nightly run SHALL be noted on it. The workflow SHALL NOT merge, mark ready or arm auto-merge.

#### Scenario: First failure
- **WHEN** the nightly run fails and no `nightly-failure` PR is open
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

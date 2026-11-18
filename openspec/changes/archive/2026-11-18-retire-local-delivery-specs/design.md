## Context

The shared workflow promotes a fully ticked draft, finalizes its OpenSpec change in the pull request, publishes the
delivery check, refreshes ready pull requests and deletes merged branches. This repository keeps one caller workflow
and its own tests.

## Decisions

- Keep the four requirements that are about this repository's worktrees and private workspace; they are not delivery
  policy and the shared workflow knows nothing about them.
- Retire `repository-governance` whole with `retire_capabilities: true`: every requirement described the removed tool.
- This change is delivered by the shared workflow and is its first linked delivery here.

## Risks / Trade-offs

- The delivery rules are no longer specified in this repository; they are specified and tested where they are implemented.

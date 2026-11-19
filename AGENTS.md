# Agent instructions

This file is `templates/AGENTS.md` of `timurproko/MyWorkflows`, identical in every repository that uses the shared
delivery workflow. Never edit it in a repository: change the template, then run `delivery instructions --apply`.

## Delivering a change

Load the shared `change-delivery` skill before planning, making, shipping, merging or cleaning up after any change.
It is the only source of delivery rules; this repository states none.

If the skill is not available on this machine, install it once:
`git clone https://github.com/timurproko/MyWorkflows.git ~/.workflow && node ~/.workflow/bin/delivery.mjs install`

## Knowing the project

- `README.md` holds the most important things to know about this repository. It is written for people first,
  because it is the page they see, and you read it too. Read it before anything else.
- `docs/` holds the detail that is specific to this repository and maintained by its owner: how to build, run and
  test it, and what must stay private. Read what applies to your change, and follow it.
- `openspec/specs/`, when present, is written by agents for agents: it records what the product does. Read the specs
  of the area you change, and update them through an OpenSpec change in the same pull request.

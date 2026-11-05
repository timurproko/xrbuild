# Tasks

## 1. Governance

- [x] 1.1 Declare the admin-role bypass actor on `protect-main` in `config/github-repository-governance.json`; verify the governance tests pass and a drift diff against a live ruleset without bypass actors names `rulesets[protect-main].bypass_actors`.

## 2. Push guard and command

- [x] 2.1 Add `tools/workspace-push` with `check-push` (pre-push refs on stdin) and `push -m`; verify its tests pass against a temporary repository with a bare remote: a workspace-only push succeeds, a core path in a pushed commit is refused and named, a staged core path blocks the command, and an empty workspace diff exits 0.
- [x] 2.2 Call the check from `.githooks/pre-push` after `git lfs pre-push`, sharing stdin; add the `workspace:push` script and the package to `pnpm test`; verify a push of a core commit to `main` in a scratch clone with a bare remote is refused by the hook.

## 3. Docs

- [x] 3.1 Update the root and workspace `CLAUDE.md` and the delivery skill: the maintainer pushes workspace-only changes straight to `main` with `pnpm workspace:push`, agents never push to `main`; verify `pnpm check:names` passes.

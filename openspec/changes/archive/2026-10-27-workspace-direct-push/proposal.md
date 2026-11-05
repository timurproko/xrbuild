# Workspace direct push

## Why

The maintainer edits the tracked `.xrbuild/` workspace every day: new projects, renamed sections, deleted or archived
apps, lock files. The `protect-main` ruleset accepts `main` changes only through a PR with `CI required`, so even a
section rename in the private workspace needs a branch, a worktree and a PR. That workspace is logically outside the
core, and its changes need no plan, no OpenSpec change and no review.

## What Changes

- The `protect-main` ruleset gets one bypass actor: the repository admin role. Only the maintainer can push to `main`
  directly; the repo bot and other collaborators cannot.
- A tracked `pre-push` hook refuses a push to `main` that carries any commit touching a path outside `.xrbuild/`.
  Core changes keep the PR flow; the hook runs after the existing Git LFS pre-push step.
- A new command, `pnpm workspace:push -m "<message>"`, run from the primary checkout on `main`: stages everything
  under `.xrbuild/` (ignored files stay out), refuses if anything outside it is staged, commits
  `chore(workspace): <message>`, rebases on `origin/main` and pushes.
- Docs: the root and workspace `CLAUDE.md` and the delivery skill say workspace-only changes may go straight to
  `main` by the maintainer. Agents still never push to `main`.

## Capabilities

### Modified Capabilities

- `repository-governance`: the ruleset declares the admin bypass; a new requirement scopes direct pushes to `.xrbuild/`.

## Impact

- `config/github-repository-governance.json`: `bypass_actors` on `protect-main`; live after
  `pnpm governance apply --confirm apply-xr-build-governance`.
- `.githooks/pre-push`, new `tools/workspace-push/` (command, hook check, tests), root `package.json` scripts and the
  `pnpm test` list.
- `.claude/CLAUDE.md`, `.xrbuild/.claude/CLAUDE.md`, `.claude/skills/change-delivery/SKILL.md`.
- Each direct push to `main` starts the `push` CI run on `main`, as any merge does.

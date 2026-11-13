## Why

Task identity is tied to a single local worktree even for remote planning, while entry, scratch, progress and merge instructions contain conflicting permissions. Local removal accepts open PRs but does not prove commits are published and can delete unknown ignored data. Workflow promises also differ from the reviewed live activation profile.

## What Changes

- Permit planning-only draft publication and GitHub administration from any directory/machine without worktree setup, dependency installation or sweep.
- Preserve repository/branch/history/change/PR identity when adopting an existing proposal on another machine; keep implementation isolated and owned.
- Make explicit exact-checkout local removal publication- and preservation-based, independent of merge/CI/acceptance, without deleting remote work or silently sweeping unrelated worktrees.
- Use coherent progress checkpoints, one-or-more meaningful outcomes, material-scope approval, structural validation and explicit pause/resume instead of repeated procedural barriers.
- Align direct maintainer-requested protected exact-candidate merge with the companion runtime while retaining no independent agent/bot integration authority.
- Reconcile repository-owned delivery guidance and dormant workflow promises without modifying or overriding OpenSpec skills; preserve legacy histories and keep private/export/device safeguards intact.

## Scope boundary

OpenSpec skills and the OpenSpec framework are out of scope. Do not modify, regenerate, replace, or override `openspec-*` skills, generated OpenSpec/`opsx` commands, framework implementation, schemas, templates, or lifecycle semantics. Simplify only repository-owned delivery tooling and guidance around the unchanged framework. Project-specific proposal, design, tasks and specification deltas remain editable; that does not authorize framework changes. If an outcome requires changing OpenSpec, report the blocker and move that work to a separate explicitly approved scope instead of bundling it here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- change-delivery: portable planning, branch continuation, authorization, cleanup/handoff, progress, readiness, hold/resume and protected integration.
- ci-validation: explicit activation-dependent auxiliary behavior and hold-aware trusted refresh without weakening checks.
- repository-governance: no-bypass declaration consistency and separation of reviewed behavior from live activation.

## Impact

Public-core tools/worktree, tools/pr-automation, runtime operation declaration, AGENTS.md, `.claude/CLAUDE.md`, the repository-owned `.claude/skills/change-delivery/SKILL.md`, PR template, project-specific OpenSpec context and delivery/governance runbooks; OpenSpec skills, generated commands and framework assets are excluded. Coordinate with https://github.com/timurproko/a1/pull/923 but retain standalone Git/repository operations. This draft includes only public planning artifacts; it authorizes no implementation, private export, hosting apply, workflow activation, merge or deletion.

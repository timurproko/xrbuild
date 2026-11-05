# Proposal

## Why

XR Build already treats projects and concrete integrations as a workspace separate from the core, but keeping that workspace in another Git repository makes private development, task worktrees and coordinated changes harder than necessary. The private development checkout should be able to track a complete real workspace at `.xrbuild/` while ordinary users continue to receive the existing home-directory workspace by default.

## What Changes

- Define `<repo>/.xrbuild/` as the optional embedded development workspace. It has the same layout and behavior as any other workspace: its own `package.json`, `pnpm-workspace.yaml`, projects, plugins, layout, dependencies and ignored build output. It is not a core package folder and has no nested Git repository.
- Keep normal workspace resolution unchanged for users: `XRB_HOME` when set, otherwise `%USERPROFILE%\.xr-build`. The embedded workspace is selected only by an explicit repository-development launcher or workspace argument; its mere presence never changes user behavior.
- Add repository-development panel and dependency commands that resolve `.xrbuild/` from the current checkout. A task worktree therefore uses that worktree's tracked `.xrbuild/`, not the primary checkout's copy.
- Keep every concrete display, input, platform, packager and publisher integration as a separate plugin under `.xrbuild/plugins/`. Core code continues to reach integrations only through neutral contracts.
- Keep credentials, signing material, installs and generated output untracked. Track the embedded workspace's pinned third-party binaries through Git LFS so a fresh clone with Git LFS has the same dependencies without external source checkouts. Worktree builds and app outputs remain isolated.
- Keep the core and OpenSpec neutral. `.xrbuild/` is the private workspace and is outside the core's name-guard boundary, including its plugin, project and third-party paths; it must be excluded before any public export. This exemption does not apply to core files or paths.
- The maintainer will copy the existing workspace into the task worktree's `.xrbuild/` without its `.git` metadata. The imported workspace then becomes ordinary tracked content of the private repository, with credentials and generated state ignored and pinned LFS assets verified against dependency locks. Embedded project browser previews use the panel's workspace catalog instead of depending on an unpublished production inventory.

## Capabilities

### New Capabilities

- `workspace-location`: workspace resolution, the optional `.xrbuild/` embedded development workspace, its Git and worktree behavior, and its separation from the core despite sharing one repository.

### Modified Capabilities

- `dev-control-panel`: explicit launch of the embedded development workspace without changing the default user launcher.
- `change-delivery`: task worktrees use their own embedded workspace sources and isolated outputs while sharing fetched workspace dependencies safely.

## Impact

- `packages/control-panel/src/env.ts`, `server.ts` and tests: explicit workspace selection while preserving `XRB_HOME` and the home-directory default.
- Root scripts and launchers: separate user and repository-development entry points.
- `tools/fetch-deps`, `tools/worktree` and tests: convenient embedded-workspace dependency fetching and safe dependency links in task worktrees.
- `.xrbuild/`: the maintainer-imported real workspace, with no nested `.git` and with generated files ignored.
- `.claude/CLAUDE.md`, `AGENTS.md`, `openspec/config.yaml`, `README.md`, workspace template documentation and name-guard messages: logical workspace separation inside one private repository.
- Existing active change `user-workspace-public-core`: its earlier separate-repository topology is superseded and must be retired or reconciled separately; this PR does not edit a second active change folder.
- No plugin ABI, host channel, project manifest or package-layout change.

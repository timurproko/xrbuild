# Proposal

## Why

The tracked `.xrbuild/` development workspace prevents publishing the core safely. Deleting its current files or force-pushing rewritten history into the existing hosting repository would not remove private commits retained through pull requests or private LFS assets. The workspace keeps its history privately while the public core starts in a new hosting repository with an audited parentless initial commit. The maintainer explicitly chose a fresh core history instead of retaining filtered historical commits.

## What Changes

- **BREAKING repository layout:** stop tracking `.xrbuild/` in the core. Authorized maintainers clone the private workspace repository at the same path as an ignored, independent Git clone, not a submodule or junction.
- Preserve explicit repository launchers and ordinary user workspace resolution. Task worktrees must not share the primary workspace implicitly; private development uses an independently provisioned task-local clone.
- Remove private integration jobs, LFS rules and direct workspace-push tooling from the core. Keep generic dependency verification usable by the private repository through an explicit workspace path.
- Update repository instructions, workspace documentation and OpenSpec context. Correct the governance tool's repository-name check and its tests.
- Prepare a testable, fail-closed public-history audit and staged migration runbook. Extract workspace history with its LFS objects; export only reviewed tracked core files into a newly initialized repository with one parentless commit; retain old history exclusively in the private archive. Never copy the old Git object database or push old refs to the new destination. History filtering remains a tested optional route, not the selected migration.
- Defer license terms and dependency notices at the maintainer's request; this migration does not grant a new license. The maintainer created the new public destination explicitly. Keep the archive and workspace private, disable Actions during migration, and upload nothing until the clean snapshot is audited and the exact push is approved.

## Capabilities

### New Capabilities
- `public-history-export`: staged export, reachable-history verification and explicit publication gates.

### Modified Capabilities
- `workspace-location`: independent private versioning at the ignored `.xrbuild/` path.
- `ci-validation`: core CI no longer requires private workspace files, LFS assets or private-repository credentials.
- `change-delivery`: independently provisioned task workspaces and explicit cleanup protection.
- `repository-governance`: retire the workspace main-push exception and accept the correct core repository name.

## Impact

Core Git ignore/attributes, hooks and package scripts; workspace dependency verification and worktree tooling/tests; CI; governance tooling/tests; README, repository instructions and developer documentation; migration audit tooling and runbook. Licensing and notices are outside this split PR.

Private repository initialization, private CI, preserving the local launcher edit, archive rename, new-repository creation, bot configuration, remote pushes, visibility changes and checkout replacement are separately confirmed migration operations. They are not silently performed by this PR. A PR merge alone does not make any existing history safe to publish.

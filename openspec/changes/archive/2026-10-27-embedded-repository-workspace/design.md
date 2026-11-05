# Design

## Context

The runtime already separates two roots: the core repository (`REPO`) and a workspace (`WORKSPACE`). The panel accepts a workspace programmatically, `workspaceDir()` resolves `XRB_HOME` or `%USERPROFILE%\.xr-build`, and `fetch-deps --workspace=<path>` already accepts an explicit folder. Workspace projects and plugins use only the workspace root, while application scripts receive the core root through `XRB_CORE`.

The remaining coupling is operational. The command-line panel entry point does not expose its workspace option, the normal launcher always uses environment/default resolution, task worktrees share only core `third_party/`, and repository instructions assume the workspace must be another Git repository. The name guard also calls every tracked path “core”, even though an embedded workspace must remain logically outside the core modules.

Two similar folder names are deliberate:

- `.xrbuild/` is the private repository's embedded development workspace.
- `%USERPROFILE%\.xr-build` remains the default workspace for ordinary users.

## Goals / Non-Goals

**Goals:**

- Track the private development workspace and core in one Git repository.
- Preserve the workspace as a real, self-contained workspace root rather than turning its projects or plugins into core packages.
- Preserve existing user defaults and `XRB_HOME` behavior.
- Make repository-development commands and task worktrees select the correct checkout-local `.xrbuild/` reliably.
- Keep integrations separate, neutral at their boundaries and absent from core implementation paths.
- Track the private workspace's pinned binary dependencies with Git LFS, while build output remains isolated per worktree.

**Non-Goals:**

- No automatic workspace switching based on whether `.xrbuild/` exists.
- No rename of the user default `%USERPROFILE%\.xr-build` folder.
- No flattening of `.xrbuild/projects` or `.xrbuild/plugins` into the root pnpm workspace.
- No nested Git repository or submodule for `.xrbuild/`.
- No plugin ABI, host channel, manifest or package format change.
- No tracking of secrets, credentials or generated build output. Pinned workspace dependencies are the only binary exception, stored through Git LFS.

## Decisions

### D1. `.xrbuild/` is an ordinary workspace root

The embedded folder uses the same workspace layout and code paths as an external workspace. It keeps its own `package.json` and `pnpm-workspace.yaml`; the root `pnpm-workspace.yaml` continues to describe only core packages and tools. Panel services receive `.xrbuild/` as `WORKSPACE` and the checkout root as `REPO`, preserving all existing path boundaries.

The imported folder contains no `.git` directory. Its source files, manifests and lock files are tracked by the repository root. Its own `.gitignore` continues to exclude `node_modules`, builds, plugin output, generated editor configuration and project output, and is extended for local credentials when necessary. The pinned `.xrbuild/third_party/` files are tracked through Git LFS so a clone with Git LFS can build without access to the original external source checkouts.

*Alternative:* move projects and plugins directly to root folders. Rejected because it erases the tested workspace boundary, complicates package discovery and makes private integrations appear to be core modules.

### D2. Explicit selection, unchanged user default

Workspace precedence remains explicit workspace argument, then `XRB_HOME`, then `%USERPROFILE%\.xr-build`. The panel CLI gains an explicit workspace argument matching `fetch-deps --workspace=<path>`. The ordinary `pnpm panel` and `start.vbs` entry points pass no argument and retain user behavior.

Repository-development entry points explicitly pass `<current checkout>/.xrbuild`. They do not set a permanent machine-level `XRB_HOME`, because an absolute environment value would make task worktrees accidentally operate on the primary checkout. Relative arguments are resolved by the launcher against the checkout root, not an arbitrary caller directory.

*Alternative:* automatically use `.xrbuild/` when present. Rejected because a source checkout would silently behave differently from an installed or exported core and could expose the private workspace to users of that checkout.

### D3. Worktree-local sources and tracked workspace dependencies

Because `.xrbuild/` is tracked, every task worktree receives the workspace sources from its own branch. Repository-development launchers in a worktree select that worktree's `.xrbuild/`, so project and plugin edits stay branch-local.

Git LFS materializes pinned `.xrbuild/third_party/` files into each checkout. The worktree helper keeps the legacy linking behavior only for extra untracked dependency entries when the destination is absent; it does not overwrite tracked files. Core `third_party/` sharing is unchanged. Plugin builds, `bin`, application `dist`, workspace `node_modules`, packages and other generated state remain worktree-local. Git LFS must be installed for clones/worktrees and enabled for CI checkout; use pinned SHA-256 locks to validate materialized files. Workspace package installation remains the responsibility of the workspace/panel and uses the embedded workspace's own lock file.

### D4. Logical core boundary remains strict

“Inside the repository” does not mean “inside the core.” Core packages, native host code and tools must not import or branch on `.xrbuild/` plugin implementations. Integrations remain independently discoverable plugins under `.xrbuild/plugins/<neutral-name>/` and communicate only through the plugin ABI, host channel, packager or publisher contracts.

The name guard checks every tracked core path and core file content, excluding the entire private `.xrbuild/` subtree. Plugin folders, manifests, project samples, dependency filenames and display labels there are private workspace content, not core conventions. The core still uses neutral contracts and cannot embed or import a concrete integration. Credentials and signing material remain ignored; the name guard is not a secret scanner. If this repository is ever exported publicly, `.xrbuild/` and its LFS objects must be excluded before publication.

### D5. Maintainer-owned workspace import

The maintainer copies the current workspace into the task worktree at `.xrbuild/` and removes only the nested Git metadata. The implementation does not delete or mutate the source workspace automatically. Before the imported files are committed, inspect tracked candidates for generated output and credentials, then run workspace installation/tests, plugin discovery and the core name guard.

The import is part of this change only after it is present in the assigned task worktree. Copying it into the primary checkout is not part of the workflow. Credentials and generated state stay untracked; pinned binary dependencies are the only tracked third-party exception. The private workspace may use external identifiers throughout its paths and contents; nothing outside `.xrbuild/` gains this exception. An embedded project's panel browser preview must list local workspace apps even when the production publication inventory is missing or unreachable; the published launcher continues to use its configured production inventory.

### D6. Superseded unfinished workspace change

The existing active `user-workspace-public-core` change describes the earlier separate-repository topology and must not later be finalized unchanged. This PR remains linked only to `embedded-repository-workspace`, so it does not edit that other active change folder. The maintainer must retire or reconcile the superseded change separately under the delivery rules; the new canonical `workspace-location` capability owns the topology after this change is finalized.

## Risks / Trade-offs

- [`.xrbuild` and `.xr-build` are easy to confuse] → Document both spellings together and test both resolution paths explicitly.
- [A permanent `XRB_HOME` points task worktrees at the primary checkout] → Repository-development launchers pass the checkout-local workspace explicitly and take precedence over the environment.
- [Large workspace files increase clone and worktree size] → Track only pinned dependencies through LFS; each clone/worktree materializes approximately 2.2 GB, and Git LFS needs storage/bandwidth. Do not track generated output.
- [Private assets could leak into a future public export] → This repository is private; any future public export must exclude `.xrbuild/` and its LFS objects. Automatic selection never depends on the folder's presence.
- [Nested workspace package management is confusing] → Keep independent root and workspace lock files and commands; do not add `.xrbuild` packages to the core pnpm workspace.
- [Imported files may contain credentials] → Keep credentials and signing material ignored and audit staged files; the name guard still protects the core, not private workspace assets.
- [The unfinished earlier workspace change describes another topology] → Do not finalize it unchanged; retire or reconcile it separately because this PR cannot safely link two active changes.

## Rollout

1. Add and test explicit panel workspace selection plus repository-development launchers, leaving normal entry points unchanged.
2. Add embedded dependency commands and worktree support for `.xrbuild/third_party/`.
3. Update specs, repository instructions, docs and guard wording around one repository with two logical roots.
4. The maintainer copies the current workspace, without its `.git`, into the assigned task worktree's `.xrbuild/` and tracks pinned dependencies through Git LFS.
5. Validate project discovery, workspace installation, LFS checkout and pinned hashes, plugin discovery/build, core name guard and task-worktree isolation before finalizing the PR.

Rollback removes the repository-development entry points and embedded workspace from the branch; ordinary user workspace behavior remains unchanged throughout.

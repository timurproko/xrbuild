## Why

An absent or empty selected user folder currently blocks the whole panel with Create your workspace, and an initialized empty user workspace automatically opens New project. Users should be able to browse embedded apps and the panel before creating their own project.

## What Changes

- Open Apps, Plugins and Settings normally for missing, empty and uninitialized selected folders; remove the mandatory workspace-setup UI and automatic first-project prompt.
- Keep XRB_HOME/home-default, explicit workspace/project roots and auto-routing behavior unchanged. Do not provision a Git clone or worktree for users.
- Create the selected root's missing package-workspace scaffold when New project is explicitly confirmed, adding only the requested template project, not an extra starter app.
- Allow existing explicit writable actions (settings, embedded working state, builds and open-folder) to create only their required user-owned storage. Read-only startup/catalog browsing does not initialize the workspace.
- Use validated plugin configuration defaults in memory during service discovery, and let public service ownership checks accept missing plain user roots without eager directory creation.
- Preserve existing files, separate integration/project roots, path/link safeguards and user-versus-repository dependency-install policy.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: optional workspace onboarding, lazy template-project initialization and non-blocking empty states.
- `bundled-extensions`: read-only service/config discovery with explicit, non-replacing configuration initialization.

## Impact

Core-owned panel UI, workspace/template creation helpers, service configuration reads, server New project route, focused API/browser tests and user-facing startup documentation. Two already public service modules' prospective-path ownership checks and tests are updated without private sources or promotion. No private workspace changes, cache deletion or native changes.

The maintainer explicitly approved this UX extension in the existing PR #6. It follows the already bot-finalized menu change in that same PR; no new implementation PR or task worktree is requested.

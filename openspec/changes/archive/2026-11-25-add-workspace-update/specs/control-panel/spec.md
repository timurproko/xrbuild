## Purpose

Describes control-panel actions that maintain the selected workspace and its native build.

## ADDED Requirements

### Requirement: Update a Git workspace

The control panel SHALL offer an Update workspace action that brings the selected workspace's Git clone up to date with its upstream by fast-forward only, fetches its Git LFS content, and then rebuilds the native plugins, and the core host only when it is missing or outdated, with the same tool discovery as Rebuild. It SHALL never stash, merge, rebase, reset or discard local work, and SHALL never update the core checkout the panel runs from. Rebuild SHALL stay build-only.

#### Scenario: Workspace behind its upstream

- **WHEN** the workspace branch is 3 commits behind its upstream with no local commits and the person runs Update
- **THEN** the panel fetches, fast-forwards, pulls LFS content, rebuilds, and reports the old and new commit, 3 commits and what was rebuilt

#### Scenario: Already up to date

- **WHEN** the workspace has no new upstream commits after fetching, its LFS content is present and no earlier update is unfinished
- **THEN** the panel reports that the workspace is already up to date and does not rebuild

#### Scenario: Non-conflicting local changes

- **WHEN** the workspace has an uncommitted edit to a file the new commits do not touch
- **THEN** the update completes and the edit is still present

#### Scenario: Conflicting local changes

- **WHEN** the workspace has an uncommitted edit to a file the new commits change
- **THEN** the update stops at the pull step, lists the file, advises to commit or stash it, and leaves the commit and the edit unchanged

#### Scenario: Diverged branch

- **WHEN** the workspace has local commits and its upstream has new commits
- **THEN** the update stops before pulling and asks to merge or rebase by hand

#### Scenario: Remote unreachable

- **WHEN** fetching fails
- **THEN** the update stops and reports that nothing changed

#### Scenario: LFS content fails to download

- **WHEN** the pull succeeds and the LFS pull fails
- **THEN** the panel does not rebuild and reports that LFS files are missing and Update should be run again

#### Scenario: Running Update again finishes an unfinished update

- **WHEN** an earlier update pulled new commits but its LFS pull or rebuild failed, and the person runs Update again
- **THEN** the panel pulls the LFS content and rebuilds although no commit is new, and reports the update as finished

#### Scenario: Status leaves the Git index alone

- **WHEN** the panel reads the workspace status for the menu item and the behind hint
- **THEN** it takes no Git lock and does not rewrite the index, and it runs no Git in the workspace while an update is active

#### Scenario: Behind hint without fetching

- **WHEN** the last fetch found 2 upstream commits the workspace does not have
- **THEN** the panel shows "workspace behind origin by 2" with when the remote was last checked, and it never fetches on its own: only Update fetches

#### Scenario: Workspace cannot be updated

- **WHEN** the workspace is not a Git clone, its branch has no upstream, or Git LFS is not installed
- **THEN** the Update action is unavailable and shows the reason

### Requirement: Update does not overlap a run or a rebuild

The control panel SHALL refuse to start Update while a host is running or starting, desktop setup is busy, or a rebuild or another update is active, and SHALL refuse a run or a rebuild while an update is active.

#### Scenario: Host running

- **WHEN** a host is running and the person starts Update
- **THEN** the panel refuses with a conflict and asks to stop the host first

#### Scenario: Run during an update

- **WHEN** an update is active and the person starts a run or a rebuild
- **THEN** the panel refuses with a conflict until the update finishes

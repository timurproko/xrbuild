## MODIFIED Requirements

### Requirement: Update a Git workspace

The control panel SHALL offer an Update action that brings the selected workspace's Git clone up to date with its upstream by fast-forward only, fetches its Git LFS content, and then rebuilds the native plugins, and the core host only when it is missing or outdated, with the same tool discovery as Rebuild. It SHALL fast-forward to exactly the upstream commit it fetched and downloaded the LFS content of, without fetching again. It SHALL never stash, merge, rebase, reset or discard local work. It SHALL report the status of the core checkout the panel runs from next to the workspace's, and SHALL update each repository at most once per run, treating a workspace that is the core checkout as that one repository. Rebuild SHALL stay build-only.

#### Scenario: Workspace behind its upstream

- **WHEN** the workspace branch is 3 commits behind its upstream with no local commits and the person runs Update
- **THEN** the panel fetches, downloads the LFS content of the new commits, fast-forwards, rebuilds, and reports the old and new commit, 3 commits and what was rebuilt

#### Scenario: Remote moves during the update

- **WHEN** the upstream gets another commit after the panel fetched and downloaded the LFS content, and before it fast-forwards
- **THEN** the workspace ends at the commit that was fetched, not at the newer one, and the next Update brings the newer one

#### Scenario: Already up to date

- **WHEN** the workspace has no new upstream commits after fetching and no earlier update is unfinished
- **THEN** the panel reports that the workspace is already up to date, downloads no LFS content and does not rebuild

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

- **WHEN** downloading the LFS content of the new commits fails
- **THEN** the update stops before pulling, nothing changes, nothing is rebuilt, and the panel asks to run Update again

#### Scenario: Local LFS deletions and fetch exclusions

- **WHEN** the person deleted an LFS file the new commits do not touch, or the clone excludes some LFS files from fetching
- **THEN** the update finishes, the deleted file stays deleted and the excluded files stay pointers

#### Scenario: Running Update again finishes an unfinished update

- **WHEN** an earlier update pulled new commits but its rebuild failed, and the person runs Update again
- **THEN** the panel rebuilds although no commit is new, and reports the update with the commits of the earlier pull

#### Scenario: Status leaves the Git index alone

- **WHEN** the panel reads the core and workspace status for the menu item and the behind hint
- **THEN** it takes no Git lock and does not rewrite the index, and it runs no Git in either repository while an update is active

#### Scenario: Behind hint without fetching

- **WHEN** the last fetch found 2 upstream commits the workspace does not have
- **THEN** the panel shows "workspace behind origin by 2" with when the remote was last checked, and it never fetches on its own: only Update fetches

#### Scenario: Workspace cannot be updated

- **WHEN** the workspace is not a Git clone, its branch has no upstream, or Git LFS is not installed
- **THEN** the Update action is unavailable and shows the reason

#### Scenario: One Update action for both repositories

- **WHEN** the person opens the panel menu and points at the Update item
- **THEN** the item is named exactly "Update", no visible text says "Update workspace", and its tooltip gives the core's and the workspace's state and when the remote was last checked, such as "Core: up to date. Workspace: up to date. Remote last checked just now."

#### Scenario: Core status

- **WHEN** the core checkout is not a Git checkout, is on a detached HEAD, or its branch has no upstream
- **THEN** the panel reports the core as unavailable with that reason, does not require Git LFS for it, and the workspace status is unaffected

#### Scenario: Workspace is the core checkout

- **WHEN** the selected workspace is the core checkout the panel runs from
- **THEN** the panel reports one repository, and an update never fast-forwards it more than once

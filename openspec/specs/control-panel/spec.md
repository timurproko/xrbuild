# control-panel Specification

## Purpose

Describes control-panel actions that maintain the selected workspace and its native build.

## Requirements

### Requirement: Update a Git workspace

The control panel SHALL offer Update for the selected workspace's independent Git clone, freshly discover and fetch origin's default branch, download required LFS content first, and fast-forward only to the fetched commit. It SHALL refuse dirty, detached, local-ahead, diverged or unsuitable-upstream checkouts without altering their work. It SHALL never stash, reset, force, rebase or create merge commits. Rebuild SHALL stay build-only.

#### Scenario: Workspace behind its upstream

- **WHEN** the workspace is clean on origin's default branch with no local-only commits and the person runs Update
- **THEN** the panel freshly fetches that branch, downloads the required LFS content, fast-forwards, rebuilds and reports the old and new commits and what was rebuilt

#### Scenario: Remote moves during the update

- **WHEN** the default branch gets another commit after the panel fetched and before it fast-forwards
- **THEN** the workspace ends at the fetched and checked commit, without a second fetch, and the next Update can bring the newer commit

#### Scenario: Already up to date

- **WHEN** a fresh successful fetch proves HEAD equals the remote default branch and no setup or rebuild is unfinished
- **THEN** the panel reports already up to date with the unchanged commit and does not unnecessarily download LFS content or rebuild

#### Scenario: Non-conflicting local changes

- **WHEN** the workspace has an uncommitted edit to a file the new commits do not touch
- **THEN** Update refuses to move its HEAD or modify its files and gives one sentence asking the person to commit or move the changes before retrying

#### Scenario: Conflicting local changes

- **WHEN** the workspace has an uncommitted edit, staged change or untracked path that the new commits would change
- **THEN** Update refuses before checkout, leaves the commit, index and files unchanged and gives one actionable sentence about preserving the local changes first

#### Scenario: Diverged branch

- **WHEN** the workspace has local-only commits and the remote default branch has new commits
- **THEN** Update refuses before checkout and asks the person to reconcile the branch by hand before retrying

#### Scenario: Local-ahead branch

- **WHEN** the workspace has commits absent from the freshly fetched remote default branch but no remote commits are missing locally
- **THEN** Update refuses with an actionable local-commits explanation and does not claim already up to date

#### Scenario: Detached checkout

- **WHEN** the workspace has a detached HEAD
- **THEN** Update leaves it untouched and asks the person to switch safely to the remote default branch before retrying

#### Scenario: Removed or unsuitable upstream

- **WHEN** the workspace tracks a deleted upstream, another branch or another remote instead of origin's current default branch
- **THEN** Update leaves HEAD and local branch configuration unchanged, reports the branch problem and names the advertised default branch to switch to safely

#### Scenario: Remote unreachable

- **WHEN** remote discovery or fetching fails
- **THEN** Update reports that this repository was not updated, gives a recovery instruction and does not use cached references as proof of currentness

#### Scenario: LFS content fails to download

- **WHEN** downloading the LFS content of the new commits fails
- **THEN** Update leaves HEAD unchanged, does not rebuild that repository and asks the person to retry the download

#### Scenario: Local LFS deletions and fetch exclusions

- **WHEN** the person deleted an LFS file locally
- **THEN** Update refuses as for other uncommitted changes and preserves the deletion
- **WHEN** a clean clone instead excludes some LFS files from fetching
- **THEN** Update honors those exclusions and leaves the excluded content as pointers

#### Scenario: Running Update again finishes an unfinished update

- **WHEN** an earlier Update advanced the workspace but its setup or rebuild failed
- **THEN** the next Update retries unfinished work despite an unchanged commit and reports the commits already advanced

#### Scenario: Status leaves the Git index alone

- **WHEN** the panel reads repository status for the menu or behind hint
- **THEN** it takes no Git lock, does not rewrite the index and runs no Git beside an active Update

#### Scenario: Behind hint without fetching

- **WHEN** the last fetch found new commits that the workspace does not have
- **THEN** the panel qualifies the behind hint with that repository's last check time and never fetches on its own

#### Scenario: Workspace cannot be updated

- **WHEN** the workspace is not an independent clone, lacks a suitable upstream or lacks required Git LFS
- **THEN** its reason is shown without preventing Update from attempting an eligible core checkout

### Requirement: Update does not overlap a run or a rebuild

The control panel SHALL refuse to start Update while a host is running or starting, desktop setup is busy, or a rebuild or another update is active, and SHALL refuse a run or a rebuild while an update is active.

#### Scenario: Host running

- **WHEN** a host is running and the person starts Update
- **THEN** the panel refuses with a conflict and asks to stop the host first

#### Scenario: Run during an update

- **WHEN** an update is active and the person starts a run or a rebuild
- **THEN** the panel refuses with a conflict until the update finishes

### Requirement: Update reports the core checkout

The control panel SHALL update the running core checkout and selected workspace independently to their freshly fetched origin default-branch commits, report before/after commits for each, and update an identical repository only once. A refusal or failure SHALL not prevent the other repository's attempt. The overall job SHALL fail when either repository needs attention; successful workspace work alone SHALL NOT imply core success.

#### Scenario: One Update action for both repositories

- **WHEN** the person opens the panel menu and points at Update
- **THEN** its name is exactly Update and the tooltip describes both repositories with separately qualified check times, without a workspace-only or read-only-core claim

#### Scenario: Core status

- **WHEN** the core is packaged without Git, detached or missing a suitable upstream
- **THEN** the panel reports the specific limitation and recovery action and still attempts the workspace; core without LFS-tracked content does not require Git LFS

#### Scenario: Core behind while only its status is reported

- **WHEN** the core is behind as of its last fetch and the person reads status without starting Update
- **THEN** the panel reports the cached behind state and its check time without claiming that core was freshly checked or updated

#### Scenario: Core behind with a stale remote reference

- **WHEN** core HEAD and cached origin default-branch reference match but the remote has advanced
- **THEN** Update freshly fetches and advances the core, reports its before/after commits and does not derive success from the old reference

#### Scenario: Workspace is the core checkout

- **WHEN** the selected workspace resolves to the same checkout as the core
- **THEN** Update fetches, checks and fast-forwards it once, and reports that both roles refer to that repository

#### Scenario: Core failure and workspace success

- **WHEN** the core is dirty, detached, local-ahead, diverged, has a deleted upstream or cannot fetch, but the workspace can update
- **THEN** the workspace still updates and the job fails with its actual success and one actionable core failure sentence

#### Scenario: Workspace failure and core success

- **WHEN** the workspace cannot update but the core can
- **THEN** the core still updates and the job fails with its actual success and one actionable workspace failure sentence

### Requirement: Update completes setup and reports activation requirements

Update SHALL prepare changed public core app dependencies through the existing pinned frozen hook-disabled setup and rebuild native plugins, plus the host when missing or outdated. Setup/build failures SHALL preserve fetched commits and remain retryable. The final result SHALL distinguish files on disk from code loaded by the running panel and state any restart required; Update SHALL NOT silently restart the panel.

#### Scenario: Public core dependencies changed

- **WHEN** an accepted core fast-forward changes required public app dependency inputs
- **THEN** Update runs the pinned frozen-lockfile install with lifecycle hooks disabled, streams its output and reports failure if the dependencies cannot be prepared

#### Scenario: Native rebuild required

- **WHEN** either repository advanced or has unfinished build work
- **THEN** Update reports and runs native plugin rebuilds and rebuilds the core host only when missing or outdated, without automatically installing native prerequisites or private JS packages

#### Scenario: Panel activation

- **WHEN** core code or loaded workspace plugin code changed during Update
- **THEN** the final job output, including partial-failure output, explicitly says to restart the panel to load the new code and states that Update did not restart it

#### Scenario: Post-pull failure

- **WHEN** setup or rebuild fails after one or both repositories advanced
- **THEN** Update reports the actual before/after commits, fails rather than claiming completion and retains resumable setup/build work for the next Update

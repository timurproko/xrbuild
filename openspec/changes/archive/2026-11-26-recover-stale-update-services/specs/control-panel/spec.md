# Spec Delta

## ADDED Requirements

### Requirement: Explicit actions recover stale public services

Rebuild SHALL include preparing changed embedded services. Run and Build SHALL automatically perform the same needed preparation, and Update SHALL finish with it, using visible steps of the same job. Normal use SHALL expose only Rebuild, not a separate service-setup concept or page. Discovery SHALL remain read-only, unsafe state SHALL be preserved, and any refusal SHALL offer one recovery sentence and a direct control.

#### Scenario: Ordinary pull invalidates activated services

- **WHEN** a pull changes a previously activated public service's inputs and the person starts Run, Build or Rebuild
- **THEN** the action prepares the frozen public services in user-owned storage with visible progress before continuing safely, rather than refusing solely because services are stale

#### Scenario: Setup cannot complete

- **WHEN** required public service preparation fails
- **THEN** a failed job retains the setup output and an actionable retry, without launching an app or claiming the build succeeded

#### Scenario: Unsafe state or loaded module change

- **WHEN** automatic continuation is unsafe because of invalid state, an active consumer or changed executed modules
- **THEN** the panel preserves state and offers retry or the necessary recovery control in place; only truly unavoidable restart ends with one clear sentence and a Restart button, without silently using the old implementation

#### Scenario: Services need setup before a native rebuild

- **WHEN** service setup is pending while the host is outdated
- **THEN** the header and action dialog describe Rebuild as preparing the current application inputs, not solely native compilation, and that action prepares services before rebuilding without separate setup or unexplained job-start failure

#### Scenario: New immutable service generation

- **WHEN** refreshed services can be loaded from new immutable module paths while consumers are idle
- **THEN** the panel reloads them and continues the action without asking the person to restart or navigate away

### Requirement: Update rebuild uses the validated native toolchain

Update's native rebuild SHALL select a supported CMake executable and generator using the same validation as the desktop prerequisite check, including when builds run in a fresh process. It SHALL NOT fall back to an incompatible executable merely because it appears first on PATH.

#### Scenario: Competing CMake installations

- **WHEN** PATH contains an unsupported CMake before an installed supported executable and Update needs a native rebuild
- **THEN** Update configures and builds with the supported executable and its validated generator, for host and selected plugins

## MODIFIED Requirements

### Requirement: Update completes setup and reports activation requirements

Update SHALL prepare changed public core app dependencies through the existing pinned frozen hook-disabled setup, prepare required changed bundled services, and rebuild native plugins, plus the host when missing or outdated. Setup/build failures SHALL preserve fetched commits and remain retryable. The final result SHALL distinguish files on disk from code loaded by the running panel and state pending service setup and any restart required; Update SHALL NOT silently restart the panel.

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

#### Scenario: Public service inputs changed

- **WHEN** Update pulls changed embedded service inputs
- **THEN** it prepares and activates current public services before reporting success, and its final line names any remaining service setup or restart needed

#### Scenario: Retry at an unchanged commit

- **WHEN** service setup failed after a successful pull and Update is retried at the same commit
- **THEN** it retries the unfinished setup and reports the actual service readiness instead of claiming already up to date

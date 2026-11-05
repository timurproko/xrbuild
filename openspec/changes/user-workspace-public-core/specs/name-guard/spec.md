# Spec Delta

## Purpose

Keeps vendor, product, client and other private names out of the public core repo, so it can be published and kept
public without leaking what the user plugs into it.

## ADDED Requirements

### Requirement: Banned names stored as hashes
The core repo SHALL store the banned names only as hashes of normalized words and word pairs. No file in the
core SHALL contain a banned name in plain text, including the guard and its tests.

#### Scenario: Reading the guard reveals nothing
- **WHEN** someone reads the guard's source and its hash list in the public repo
- **THEN** no banned name appears in plain text

#### Scenario: Adding a name
- **WHEN** the user runs the guard's add command with a new name
- **THEN** only the name's hashes are added to the core's hash list (no plain list is written anywhere), and the
  guard then reports that name

### Requirement: Whole-repo check
The guard SHALL check every tracked file of the core: text contents, file and folder names, and package names. A match
SHALL name the file, the line and the matched word, and fail the check. There SHALL be no in-file exception markers.

#### Scenario: Name in a doc
- **WHEN** a banned name appears in `README.md`
- **THEN** the guard fails with `README.md`, the line number and the word

#### Scenario: Name in a file name
- **WHEN** a file named after a banned name is added
- **THEN** the guard fails naming that path

#### Scenario: Match inside another word is ignored
- **WHEN** a banned word appears only as part of a longer word
- **THEN** the guard does not report it

### Requirement: Enforced before commit, on agent edits and in CI
The guard SHALL run as a git pre-commit hook on staged files, as a Claude Code hook that refuses a file write or edit
containing a banned name, and as a CI job on every pull request.

#### Scenario: Commit blocked
- **WHEN** the user commits a staged change that adds a banned name
- **THEN** the commit is refused with the guard's report

#### Scenario: Agent edit blocked
- **WHEN** an agent writes a file in the core with a banned name
- **THEN** the write is refused with the guard's report and the file is unchanged

#### Scenario: Pull request blocked
- **WHEN** a pull request adds a banned name
- **THEN** the guard's CI job fails

### Requirement: Workspace is out of scope
The guard SHALL check only the core repo. Names in the user's workspace SHALL NOT be reported.

#### Scenario: Vendor plugin in the workspace
- **WHEN** a workspace plugin's sources contain banned names
- **THEN** the guard run in the core passes

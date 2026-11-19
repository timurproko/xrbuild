# name-guard Specification

## Purpose
The name guard keeps proprietary names out of the core repository: it checks tracked paths and text against hashed banned names from the command line, a pre-commit hook, an editor hook and CI, and leaves the private `.xrbuild/` workspace unchecked.

## Requirements

### Requirement: Banned names stored as hashes
The guard (`tools/name-guard/name-guard.mjs`) SHALL keep banned names only as SHA-256 hashes, one per line, in `tools/name-guard/banned.sha256`; no plain list SHALL be kept anywhere. `add <name>` SHALL split the name into at most three words and add the hashes of its lower-case words joined by spaces and joined without spaces. `add <name> --exact` SHALL add one hash that matches only the name's own spelling. `add` SHALL refuse a name with no letters or digits or with more than three words, and SHALL refuse a single common word unless `--force` is given. `add` SHALL write only the hash file.

#### Scenario: Add a name
- **WHEN** the user runs `add` with a two-word name
- **THEN** two hashes are added to `banned.sha256`, no file holds the name in plain text, and the check then reports that name written with or without a separator and in any letter case

#### Scenario: Exact spelling
- **WHEN** a name was added with `--exact`
- **THEN** the check reports only that exact spelling and ignores the same letters in another case

#### Scenario: Common word
- **WHEN** the user runs `add` with one common word and without `--force`
- **THEN** the command fails and the hash file is unchanged

### Requirement: Whole-repository check
`check` SHALL examine every file tracked by Git in the core: its path and, unless the file is binary, its text. The hash file itself SHALL be skipped. Text and paths SHALL be split into words at non-alphanumeric characters, camel-case boundaries and letter/digit boundaries; every word, every undivided run of letters and digits, and every run of two or three adjacent words SHALL be looked up. A banned word that is only part of a longer word SHALL NOT match. Each match SHALL be reported with the file, the line number or `(path)` for a path match, and the matched text, and the command SHALL exit with status 1. Without a match it SHALL exit with status 0. The guard SHALL have no in-file exception marker.

#### Scenario: Name in a document
- **WHEN** a banned name appears on line 3 of `README.md`
- **THEN** `check` fails and reports `README.md:3` with the matched word

#### Scenario: Name in a path
- **WHEN** a tracked file's path contains a banned name
- **THEN** `check` fails and reports that path as a path match

#### Scenario: Name in a package name
- **WHEN** a tracked `package.json` names its package with a banned name
- **THEN** `check` fails and reports that file and line

#### Scenario: Part of a longer word
- **WHEN** a banned word appears only inside a longer lower-case word
- **THEN** `check` does not report it

#### Scenario: Binary file
- **WHEN** a tracked binary file contains the bytes of a banned name and its path is neutral
- **THEN** `check` does not report it

### Requirement: Enforced before commit, on editor writes and in CI
`check --staged` SHALL examine only the added, copied, modified or renamed staged files, reading their staged contents. The repository's pre-commit hook SHALL run `check --staged`, and installing dependencies SHALL point Git at the repository's hook folder. `hook` SHALL read an editor's pre-write event as JSON on standard input and SHALL exit with status 2 and the reason on standard error when the target path, or the text being written or inserted, puts a banned name in a file inside the repository; it SHALL exit with status 0 for a file outside the repository, for the hash file, for a clean edit and for input it cannot parse. The repository's editor configuration SHALL register `hook` for file write and edit tools. CI SHALL run `check` in its Name guard job on every CI run, including draft pull requests.

#### Scenario: Commit blocked
- **WHEN** the user commits a staged change that adds a banned name
- **THEN** the pre-commit hook fails with the guard's report and the commit is refused

#### Scenario: Unstaged content is ignored
- **WHEN** a banned name exists only in an unstaged working-tree change
- **THEN** `check --staged` passes

#### Scenario: Editor write blocked
- **WHEN** an editor tool is about to write text with a banned name to a core file
- **THEN** `hook` exits with status 2 and names the word and the file

#### Scenario: File outside the repository
- **WHEN** an editor tool writes a file outside the repository
- **THEN** `hook` exits with status 0

#### Scenario: Pull request
- **WHEN** a pull request, draft or ready, adds a banned name to a tracked core file
- **THEN** the Name guard CI job fails

### Requirement: Private workspace is excluded
The guard SHALL NOT examine paths or contents beneath `.xrbuild/` at the repository root, in `check`, `check --staged` and `hook` alike. Every other tracked path SHALL remain checked.

#### Scenario: Name in the private workspace
- **WHEN** a plugin, project or dependency path or file under `.xrbuild/` contains a banned name
- **THEN** `check` passes and `hook` allows a write to that file

#### Scenario: Name outside the private workspace
- **WHEN** a tracked path or file outside `.xrbuild/` contains a banned name
- **THEN** `check` fails

## Purpose

Defines how the name guard adds a banned name, including when it refuses a common word.

## ADDED Requirements

### Requirement: Common words need an exact capitalised spelling or force

`name-guard add` SHALL refuse a single common word unless `--force` is given or `--exact` is given with a spelling that contains an upper-case letter. A refusal message SHALL suggest only options that would let that name through.

#### Scenario: Plain common word

- **WHEN** a maintainer runs `name-guard add display`
- **THEN** the command fails, adds no hash, and suggests banning it with another word, a capitalised `--exact` spelling, or `--force`

#### Scenario: Capitalised exact common word

- **WHEN** a maintainer runs `name-guard add Display --exact`
- **THEN** the command adds only the hash of `=Display`, and the lower-case word `display` is not flagged

#### Scenario: Lower-case exact common word

- **WHEN** a maintainer runs `name-guard add display --exact`
- **THEN** the command fails, adds no hash, and does not suggest `--exact`

#### Scenario: Forced common word

- **WHEN** a maintainer runs `name-guard add display --force`
- **THEN** the command adds the word's lower-case hashes

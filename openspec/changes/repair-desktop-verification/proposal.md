## Why

PR #6 CI at `bc93402` fails four system installer-verification checks because Windows PowerShell cannot discover `Get-FileHash`. The verification script currently depends on ambient module discovery inherited by its process, while the CI job runs from a newer PowerShell host. This blocks existing verification before the hash/signature decisions can be tested.

## What Changes

- Make the fixed system-PowerShell verification script resolve only the invoked engine's built-in modules, independent of inherited module paths.
- Reproduce unavailable module discovery with synthetic installer bytes and extend all four existing hash/signature/elevation scenarios to that condition.
- Preserve all hash continuity, expected-provider signature, read lease, normal elevation and failure assertions; no real installer is run.

## Capabilities

No requirement changes (`skip_specs: true`). This repairs the existing verified-installer contract without weakening it or modifying CI selection.

## Impact

Only the fixed desktop-installer script, focused synthetic tests and repair records. No workflow bypass, skipped checks, dependency updates, private source changes or panel restart.

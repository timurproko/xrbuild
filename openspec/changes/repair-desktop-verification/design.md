## Evidence

CI run `42895279024`, Node tests at `bc93402`, reports 404 passes, four failures and 38 opt-in browser skips. All failures are the system-verification unsigned, changed, wrong-publisher and verified cases in `desktop-installer.test.ts`. Each fails before its intended assertion because `Get-FileHash` is unavailable. The job starts Node from PowerShell 7 and the product intentionally invokes Windows PowerShell; the runner's exact inherited module-path value was not logged. Other required jobs, including Embedded public boundaries, passed.

## Decision

The fixed script must not rely on ambient module discovery. Before any verification cmdlet, set the process-local `PSModulePath` to `[System.IO.Path]::Combine($PSHOME, 'Modules')` and explicitly import the Utility, Security and Management manifests under that root, using the actual invoked Windows PowerShell installation rather than a caller-controlled search path or autoload cache. Imports remain fail-closed inside the existing verification try block. Do not change global environment/profile state or weaken executable verification. Existing signatures, hash comparison, read-only lease and synthetic elevation interception remain intact.

## Regression strategy

Retain the four existing system tests and run them again after a fixture preamble restricts module discovery to an isolated local directory. Disable fixture autoloading and unload verification modules, then prove it cannot resolve `Get-FileHash` before the production script begins. A local environment-only override was insufficient to isolate the machine's available/cached modules, so the deterministic fixture also removes that discovery state; a console-only output shim preserves the original missing-cmdlet diagnostic. All four isolated cases reproduced the CI `Get-FileHash` error before the product fix. The script must restore trusted built-in discovery and retain the same unsigned/changed/wrong-provider refusal and verified-only synthetic elevation outcomes. No test downloads or executes an installer.

## Validation

Focused installer/setup/native-dependency integration validation passed 47 checks, zero skipped, including 15 installer checks with all original outcomes and all four isolated-module outcomes. The isolated pre-fix run failed all four with the same missing verification cmdlet seen in CI. Core strict types, name guard, strict pinned repair-change validation and diff whitespace checks passed. Verification keeps its original byte hash, provider signature, lease and elevation gates; only the fully verified fixture reaches synthetic elevation. No real download/installer/elevation, running panel restart or private workspace modification occurred. Repaired-head remote CI remains pending until separately observed.

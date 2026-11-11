## Implementation

- [x] Reproduce unavailable built-in module discovery with synthetic installer bytes; verify the four isolated scenarios fail before repair for the same missing-cmdlet reason as CI.
- [x] Bind verification cmdlet discovery to the invoked system engine's built-in modules; verify existing and isolated unsigned/changed/wrong-provider/verified cases retain their hash/signature/elevation assertions without a real installer.
- [x] Validate focused setup integration, strict types, name guard and strict OpenSpec; verify public PR bookkeeping records local results separately from repaired-head remote CI.

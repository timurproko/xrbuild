# Tasks

- [x] Restore the historical `restart-silent.vbs` path and argument contract as a hidden compatibility shim; verify an older running panel can invoke the updated checkout without a Script Host missing-file error.
- [x] Extend restart regression coverage for both the compatibility shim and the current detached Node path; verify neither path creates a visible terminal and current code does not depend on the shim.
- [x] Run focused and full Control Panel tests plus strict OpenSpec and name validation; verify restart behavior, launchers and unrelated panel behavior remain green.

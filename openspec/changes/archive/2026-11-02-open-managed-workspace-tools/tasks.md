## Implementation

- [x] Extend bounded workspace-tool configuration and add the generic managed-module lifecycle; verify external links remain passive, managed routes/modules are canonically contained, reserved/duplicate paths are rejected, concurrent startup is single-flight, and shutdown is bounded.
- [x] Route managed tools through the panel origin with shared startup/error/retry presentation; verify first navigation no longer reaches a dead port, failures leave the panel usable, and requests cannot shadow panel APIs or bypass loopback/origin checks.
- [x] Add the private workspace adapter and migrate its navigation registration; verify the tracking diagnostic opens from its panel route with recording, panel-status and authenticated bridge endpoints intact while page load starts zero capture, model workers, recordings or native camera services.
- [x] Update focused documentation and run panel navigation/server tests, workspace tool UI/server tests, production build, `pnpm check:names` and `git diff --check`; verify the completed change without modifying the primary checkout.

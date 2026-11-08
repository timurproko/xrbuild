# Headset packager

One `headset`/`webxr` packager creates a launcher for the canonical HTTPS app route supplied by the selected publisher. It never publishes a second site, changes hosting, runs deployment Git commands, installs global tools or generates/adopts signing keys during discovery.

The default is **unconfigured**. Discovery reads no global mobile-tool configuration, signing directory or environment override. Product source is read-only; service factories receive explicit core, selected user workspace and effective config. Configure only that workspace's `config/plugins/platform-headset/config.json` after reviewing the external toolchain; unknown config fields are preserved by the core.

## Explicit user toolchain

Provision optional tools yourself after reviewing their source/versions/licenses. No tool library, SDK, JDK, build system, device binary or signing material is redistributed or fetched by this package. Set `toolchainConfigured` only after creating the configured relative `toolchainFile` (default `toolchain.json`) in this plugin's user config directory.

The bounded descriptor has `version: 1`, `reviewed: true`, `source` (`url`: clean public HTTPS URL, immutable `version`, source archive `sha256`, `license`, and relative `notice`), `module` (relative compatible library entry), and `files` (complete `{path,sha256}` inventory). All runtime paths are relative to the user config's `toolchain/` directory. Retain the upstream notice in that inventory. All files are checked; missing, changed, additional, linked/shared or incomplete state is refused, never installed/repaired. The descriptor's provenance is an explicit owner attestation, not independent license clearance or a sandbox. Executing a changed already-loaded library requires a panel restart.

Also declare absolute `jdkPath`, `sdkPath`, `gradleCommand` paths and explicit scalar `manifestOptions` for the reviewed target runtime. Core route, identity, icon and signing fields cannot be overridden by runtime options. The library provides the standard `JdkHelper`, `AndroidSdkTools`, `TwaManifest`, `TwaGenerator` and `KeyTool` build interfaces. No ambient package/global config fallback exists. Required mobile build tools must already be installed; the build system runs `assembleRelease --offline --no-daemon --stacktrace` with a child-only environment/cache. A supplied toolchain is trusted executable code, not sandboxed by file checks.

## Existing signing identity

Each package keeps `android.keystore` and `secret.json` (`alias`, `password`) under user config `signing/<package-id>/`. Preserve and back up BOTH files. Explicitly review/copy an existing identity there; no legacy machine directory is silently adopted and a missing/partial key is never replaced with a new identity. Provision a new identity only as a separate deliberate operator action. Passwords are scrubbed from job logs/errors.

Builds use exclusive per-identity locks, new `build/headset/<package-id>/g-*/` generations and building/complete/failed receipts in the selected user workspace. Failed/old generations are preserved, never recursively reset. Only the bounded icon is served on loopback during an explicit build. Product/source aliases, linked/shared files, output escapes and an existing version's package are refused. Signing and producing an actual installable package require configured licensed tools; synthetic tests do not establish physical-device or distribution acceptance.

Tests run in the public frozen embedded lane without optional tools, keys, hosting, camera or device activation. The authored implementation replaces the earlier unsafe global-tool/site-publication coupling; retired source/config remain outside the active repositories for recovery. No new license is asserted for third-party tools.

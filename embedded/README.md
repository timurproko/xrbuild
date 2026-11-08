# Product workspace

This is the core-owned, public embedded workspace. It includes **consolidated WebXR publisher** with local/explicit production
destinations, **the authored hand implementation/diagnostic**, including its plugin-owned sample and tests, and
**the explicitly configured headset launcher packager**. Eight standalone project groups preserve their core/unsorted/archive placement:
launcher, UI showcase, starter, cube example and four archived capability-aware diagnostics. Portable defaults select desktop/no input;
there are no live publication, package/signing or machine identities. Optional hardware remains an explicit choice. The independent user/private workspace
is never enrolled here. Each additional source promotion requires an audited file/dependency
allowlist and explicit export approval; a buildable package is not evidence of redistribution permission.

Use root `setup:embedded`, `build:embedded` or `test:embedded` with an explicit writable `--workspace`.
They install frozen snapshots, not this directory. Test builds registered package prerequisites before running tests
and provides an isolated writable `XRB_TEST_ROOT`. Sources/defaults stay here; user configuration, calibration, recordings,
caches and persistent publication history stay in the selected workspace. See [WebXR](plugins/publisher-webxr/README.md)
and [Hands](plugins/input-hands/README.md), plus [Headset](plugins/platform-headset/README.md).
The packager requires an explicitly inventoried user-provisioned toolchain and existing signing identity; it performs no hosting/global-tool discovery or implicit installation.
Project dependencies pin three/Vite and lucide; the starter retains the upstream font notice and a canonical template-source check.
Hand default validation is synthetic/mocked; model weights and
private prebuilt/device payloads are not transferred or downloaded implicitly.
The returned working tree is retained diagnostic/development state, not a distributable or an activated runtime.
See [the embedded contracts](../docs/embedded-extensions.md) for configuration, graph and ownership rules.

Approved packages use `plugins/<id>[/<component>]`, `plugins/<id>/samples/<sample>` and `projects/<section>/<id>`,
including `unsorted` and `archive`. The bounded `plugins/*/samples/*` glob registers plugin-owned diagnostics without
requiring a second package at the plugin root or enabling arbitrary recursive globs.
Each registered package needs a unique package name. Local dependencies must explicitly use `workspace:*`, `workspace:^`
or `workspace:~`; missing identities, implicit local resolution and cycles fail before installation. Standard `build`
and `test` package scripts are optional; a project's declared build-script name takes precedence. Root scripts and
installation/pre/post hooks are not implicitly run. Keep package-manager configuration and filesystem dependencies
out of this bounded public build contract. Native/device acceptance is separate from default package tests.

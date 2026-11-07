# Product workspace

This is the core-owned, public embedded workspace. It deliberately starts with **no promoted modules or projects**.
The independent user/private workspace is never enrolled here. Each source promotion requires an audited file/dependency
allowlist and explicit export approval; a buildable package is not evidence of redistribution permission.

Use root `setup:embedded`, `build:embedded` or `test:embedded` with an explicit writable `--workspace`.
They install frozen snapshots, not this directory. Test builds registered package prerequisites before running tests.
The returned working tree is retained diagnostic/development state, not a distributable or an activated runtime.
See [the embedded contracts](../docs/embedded-extensions.md) for configuration, graph and ownership rules.

Future approved packages use `plugins/<id>[/<component>]` and `projects/<section>/<id>`, including `unsorted` and `archive`.
Each registered package needs a unique package name. Local dependencies must explicitly use `workspace:*`, `workspace:^`
or `workspace:~`; missing identities, implicit local resolution and cycles fail before installation. Standard `build`
and `test` package scripts are optional; a project's declared build-script name takes precedence. Root scripts and
installation/pre/post hooks are not implicitly run. Keep package-manager configuration and filesystem dependencies
out of this bounded public build contract. Native/device acceptance is separate from default package tests.

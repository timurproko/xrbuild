## Context

The existing script launchers run `server.ts` hidden. Its static imports reach the public `yaml` dependency before `main()` calls `openLog()`. Missing installed packages therefore prevent both startup and any useful UI/log feedback. The existing rebuild dialog already defines the desired visual vocabulary: a status icon, clear title/message, scrolling output and terminal failure state.

The panel cannot serve its own bootstrap screen if it cannot import. Startup must use only Node built-ins and checked-in browser assets until core dependency readiness has been established. This is a core-only feature; no private clone or private installation is needed.

## Goals / Non-Goals

**Goals:**
- One shortcut action repairs missing core dependencies and opens the intended application, with understandable progress rather than a blank launch.
- Reuse the rebuild progress appearance, keyboard/accessibility conventions and system theme, not a terminal or an unrelated native installer.
- Keep the ready path fast and avoid unnecessary network/package-manager execution.
- Make failure/retry, duplicate clicks and startup identity explicit and safe.
- Preserve workspace routing, responsive running panels, locks, user state and all existing embedded/private activation boundaries.

**Non-goals:**
- Install/upgrade Node, global tooling, native SDKs, binaries or model assets; run project lifecycle hooks; advance devices or publication.
- Reconcile a private/user workspace graph, rewrite package manifests/locks, install embedded services or change managed-tool readiness policy.
- Automatically refresh or kill a running panel after a source update. Existing explicit restart and verified shortcut recovery behavior remains separate and is not broadened.
- Change plain developer CLI commands into hidden GUI commands or reinstall the user's Start-menu shortcuts during development/testing.

## Decisions

### D1. Put a built-in-only entry point before panel imports

Use a checked-in `.mjs` bootstrap that can run without workspace packages or TypeScript loading. Existing `.vbs` launcher paths remain stable but start this bootstrap rather than entering the server directly. Pass their existing launch selection through unchanged. Resolve the core from the bootstrap's own location, not caller cwd, a parent workspace, an environment-selected package root or package-manager discovery.

The bootstrap validates runtime support and public dependency readiness before importing/spawning the panel. Probe actual required package resolution and compatibility from the consuming public package locations; an old success stamp or existing `node_modules` directory is not sufficient. Any optional readiness stamp is bound to core manifest/workspace/lock bytes and runtime/manager identity, and is rechecked against actual installed resolution. Bootstrap planning/probes must not import panel services or execute project scripts.

A responsive panel with the exact selected core/workspace/projects identity may be opened directly without mutating dependencies underneath it. A different workspace/unknown listener is not adopted or terminated. If setup must wait for an in-use installation, report that clearly instead of changing its dependencies behind it. Do not add forceful process recovery.

### D2. Show the same progress language before doing repair work

When repair is needed, serve a small startup page using only built-ins on a separate ephemeral loopback port. It shows an open modal with the rebuild dialog's design-system classes/icons and these stages:

1. **Checking XR Build** — verify prerequisites and explain why setup is needed.
2. **Installing app dependencies** — show that this may download packages, the selected core location and live sanitized output.
3. **Starting XR Build** — launch the server, keep showing its early diagnostics and wait for the requested panel to answer.
4. **Opening XR Build** — replace this page with the verified panel URL in the same tab.

Begin installation only after the setup UI has been made available; do not leave a long-running invisible install ahead of browser startup. If the browser/UI cannot be opened, show an actionable native fallback and log location rather than installing invisibly. Healthy launches do not flash an unnecessary setup modal.

The progress log is plain text, bounded in memory/DOM and auto-scrolls while following its tail. There is no fabricated percentage. Keep full bounded/rotated diagnostics in an owned runtime log outside source. Do not dump environment values or authentication settings; redact sensitive command output before exposing or persisting it. Share a small presentation primitive if appropriate, but do not repurpose host rebuild requests, job IDs, host-copy labels or its saved autoclose setting for dependency installation.

### D3. Frozen public-core install only

Run the selected core's pinned package manager with `install --frozen-lockfile --ignore-scripts` from the exact public core root. The root's public workspace graph is the scope; never discover or install the selected private/user workspace or embedded build graph as part of this bootstrap. Reject an unexpected workspace declaration or unsafe/ambiguous installation root instead of following external/private package paths. Only generated dependency/cache state may change; tracked manifests, workspace declarations and lock bytes must remain unchanged, including on failure.

Use an available package manager/Corepack with the exact repository pin, noninteractive behavior and visible preparation output. Corepack may fetch only that pinned manager through its normal user cache; do not perform global installs, change shims or silently substitute an unpinned manager. Missing/unsupported Node or unavailable manager tooling gives precise prerequisite instructions, not a false dependency success or an automatic toolchain installation.

A lock mismatch, network problem, write denial or failed post-install resolution becomes a visible error with exit/reason details. No non-frozen retry, lifecycle enablement, package-root switching, source cleanup or endless automatic retry is permitted. Recheck readiness and the manifest/lock snapshot after install before accepting success.

### D4. One setup per canonical checkout

Concurrent shortcuts must not start multiple installers against the same dependency directories. Use a same-user, checkout-scoped local coordinator with a verifiable identity and lifetime bound to its owner process (prefer an OS-managed rendezvous over a persistent stale lock). Repeated requests for the same destination reopen/attach to the current progress session. Different launch modes share/serialize the core installation but retain their own destination; never navigate a development request into the ordinary user workspace merely because it arrived second.

Unverified ownership or a busy/unknown coordinator is an explicit error/wait condition, not permission to delete a lock or kill a process. If ownership uses a filesystem record, never automatically remove an unknown/stale record. Recheck the core snapshot while holding installation ownership; refuse a pull/edit during setup rather than certifying the wrong graph. Release only owned coordination resources on every terminal path.

### D5. Verify the handoff and keep errors readable

Do not equate an installer exit code or a spawned server PID with a ready application. Run the panel with the original selection and verify its loopback identity (application, core, workspace, projects and selected port) before reporting success. Keep collision/refusal/early import/startup errors in the setup dialog and startup log. Do not redirect to an arbitrary URL supplied by a listener or command output.

On failure, leave the modal open with a specific reason, last output, **Retry**, **Copy log** and **Close**. Retry is user-initiated and rechecks readiness/snapshot/ownership before doing work. In-flight close/Escape cannot silently orphan or force-kill installation: explain the running operation and keep its owner alive until completion; closing the browser tab does not imply cancellation, and reopening the shortcut reattaches. A failed/cancelled attempt never launches the panel as though setup succeeded.

After success, normal setup-window teardown must not terminate the long-lived panel or leave it writing to closed stdout/stderr pipes. Preserve early diagnostics before the panel opens its own log. Browser refresh/reconnect replays current state without starting another installation or launch. No extra panel tab should be opened by a child `--open` path during the setup-page handoff.

### D6. Treat the temporary UI as a narrow local control surface

Bind only to loopback on a separate OS-assigned port. Serve an explicit asset/route allowlist, not arbitrary core/workspace files. Validate Host, same-origin mutation requests and an unguessable per-session capability. Do not add wildcard CORS, credential/query-string logging, unauthenticated retry/start endpoints, filesystem endpoints or shell-command input. Output uses text rendering, never HTML interpolation. Reject foreign origins/hosts, bad sessions, unknown actions and unrelated rendezvous owners without starting work.

## Compatibility and predecessor handling

The existing `repair-dev-workspace-startup` change describes managed-tool/workspace setup after the panel has imported. This feature is earlier and limited to the public core's own installed runtime dependencies; its frozen install must not inherit that separate workspace lock-reconciliation policy. Add new requirements rather than replacing the older active `Start without a terminal` delta. Leave predecessor/spec synchronization and archiving to trusted delivery automation in the reviewed order; do not manually rewrite or archive older changes.

All three launcher modes and existing shortcut files retain their destinations and working-directory semantics. Headless developer CLI commands continue to produce normal terminal diagnostics. No primary checkout, stable shortcut or running application is modified during task validation; use the task worktree plus disposable public fixtures.

## Risks / Trade-offs

- [The main app is unavailable during missing-dependency repair] → The independent bootstrap must have no external runtime imports, and its browser assets must be directly usable without build/install.
- [Installer output can be long or sensitive] → Bounded plain-text UI, owned bounded logs, redaction and no environment/config dumps.
- [Package manager setup needs network or missing tools] → Explicit stage/reason, exact pin, no prompt hanging or global fallback, and user-controlled retry.
- [Duplicate shortcuts or a pull race dependency writes] → Checkout-scoped ownership, shared install, per-request routing and snapshot rechecks.
- [Reusing UI drifts host rebuild behavior] → Share only presentation and run existing rebuild-dialog regressions.
- [Bootstrap exits while server retains pipe ownership] → Explicit long-lived child handoff/logging tests; no implicit child termination.

## Validation approach

Use built-in-only launcher/unit fixtures that run with no installed packages and injected installer/server/browser adapters. Cover missing and dangling dependencies, ready fast path, stale stamps, wrong package versions, pinned/frozen/no-scripts scope, immutable lock/manifests, offline/permission/prerequisite failures, import errors, duplicate modes, pull races, wrong panel identity, browser failure and child survival. Keep installation tests synthetic unless a separately isolated public fixture is explicitly used; never delete installed packages from the real checkout to demonstrate the feature.

Browser tests assert real pre-import modal rendering and stage/log transitions, rebuild visual/accessibility parity, escaped output, persistent retryable failure, single-install replay, reconnect and same-tab exact-destination handoff. Run focused existing routing/rebuild-dialog tests, strict types, naming and strict change validation. Record actual Windows shortcut behavior with disposable task-local fixtures and no stable shortcut replacement or running-panel interruption. CI on the final ready head is later acceptance, not a planning checkbox.

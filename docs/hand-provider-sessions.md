# Native hand acquisition ownership

Windows x64 native Hand runs reserve a single acquisition slot before starting a development server or opening a display. The slot spans all providers, workspaces, panels and checkouts for the current Windows user/logon session. Different provider names can refer to the same cameras, so the initial policy deliberately does not allow concurrent native sources.

A busy message names the owning app or Hands session and asks you to stop it explicitly. Nothing terminates the owner or steals its lease because a heartbeat expired. Hand-off apps and standalone browser XR sessions do not take this native slot. Source and provider settings remain launch snapshots; no provider live-settings ABI is added.

## Ownership and launch handoff

The acquisition process holds a secured named Windows mutex. A separate transition gate protects managed launch reservation/handoff. Advisory metadata contains only a bounded display label, process ID and creation identity; metadata is not authorization to release ownership. Both objects are scoped independently of repository or workspace paths. Process death releases the OS mutex. An abandoned owning thread in a still-live or inaccessible process is not safe recovery: stop that process first.

`xrb-acquisition.exe` is a small CEF-free reservation helper. The panel supplies a random one-use handoff ticket through stdin. The new host receives it through its process environment (not arguments, URLs, saved settings or logs), authenticates to the private local named pipe and acquires the slot while every other contender remains behind the transition gate. The helper verifies the designated process identity, receives its acquisition acknowledgement and ends. The host clears the environment ticket before creating providers or browser children. Cancellation closes the reservation, and no late launch is allowed to continue. The handoff helper never loads a provider or opens a device.

New direct and packaged hosts also acquire the slot before input creation and display startup. The full host's existing singleton remains in place for display/CEF safety; it is not used as the hand slot. Legacy executables and unrelated applications cannot be made to cooperate retroactively. Running an old host concurrently with a new provider session is unsupported. Cross-user/logon-session arbitration needs a separate machine-wide broker/security policy and is not claimed here.

The native helper belongs to the selected immutable runtime next to the host; it is built by normal Rebuild host, and helper source changes invalidate the normal host fingerprint. Before reserving or starting an app, the panel also checks the host's existing passive `--list-plugins` inventory for `handAcquisition:1`; a helper file alone does not prove the host participates. A managed Hand run with an old/malformed inventory or absent helper fails with Rebuild guidance instead of using an unprotected old runtime. Offline app packages still require no author panel; their updated host can acquire the slot directly without the reservation helper.

## Standalone build and focused checks

The acquisition helper and tests configure independently of CEF, displays and plugin runtimes:

```text
cmake -S native/provider-session -B native/provider-session/build -G "Visual Studio 17 2022" -A x64
cmake --build native/provider-session/build --config Release
native/provider-session/build/Release/acquisition-tests.exe
```

The optional `XRB_TEST_ACQUISITION_HELPER` and `XRB_TEST_ACQUISITION_CHILD` test variables point to `xrb-acquisition-test.exe` and `acquisition-tests.exe` in that build. They enable the actual cross-process handoff test in `packages/control-panel/test/hand-acquisition.test.ts`. The test-only helper requires a random isolated namespace and cannot acquire the person's normal slot. Ordinary tests use fake transports and do not require hardware or installed private providers.

This is acquisition infrastructure, not a live Hands preview yet. The provider worker, authenticated frame/session transport, page Start/Stop and recorder connection remain the subsequent outcomes of the live-provider change. No device/runtime startup, physical camera release or latency result is claimed by these software tests. Other platforms need their own native loader/ABI export layer, OS-owned interprocess exclusion, child containment, monotonic clocks and device validation; they must not emulate success with Synthetic or silently enter XR.

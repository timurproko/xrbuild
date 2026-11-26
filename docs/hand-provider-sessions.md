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

## Input-only worker

The same standalone build now also produces `xrb-provider-session.exe` without CEF, display or platform initialization. It reuses the neutral DLL loader, input ABI bridge, existing Synthetic/Replay implementations and unchanged HANDS v2 serialization. It checks the selected binary identity and complete input function table. Borrowed callbacks are validated and copied into one owned newest-frame slot; invalid size/count/coordinates/confidence/signals/clocks never enter that slot. Optional native capabilities and all published hand bytes remain intact. Debug images are disabled.

Bootstrap and Stop are bounded stdin messages. The worker opens the exact parent process handle and observes stdin loss; graceful shutdown stops input, awaits callback quiescence, destroys and unloads the provider, then releases acquisition. A watchdog contains hung start/stop/destroy by ending this worker only, not any app or foreign panel. Test-only timers and mutex namespaces are compiled into a separate test executable, never the production worker. The session service supplies authenticated controls, worker transport and supervisor job containment; page controls and SDK/recorder integration consume its dedicated client. Lifecycle stdout is not used as pose input. Lifecycle stdout is never a browser frame API.

`prepareHandSession` checks current profile/registry revisions and the saved source before any acquisition, pins only the already-shown unique-real initial choice through the existing writer, snapshots selected global provider settings, and refuses unsupported sources, unsafe/missing runtime files or changed ownership. The native worker derives `xrb.dataDir` through the very same `logx::dataDir()` function as an app host, rather than overriding the provider's existing calibration/data lookup. New core state remains workspace-owned and no private source or calibration is imported. The actual private provider's data-path/runtime assumptions still require the physical-machine check; a missing prerequisite must remain the provider's visible error, not trigger fallback or migration.

Set `XRB_TEST_PROVIDER_WORKER` to `xrb-provider-session-test.exe` and `XRB_TEST_PROVIDER_DLL` to `xrb_session_test.dll` to run `hand-provider-worker.test.ts` against the test-built ABI DLL and explicitly selected Synthetic. `provider-frame-tests.exe` checks exact raw layout, borrowed-buffer lifetime, invalid output, empty detections and concurrent callback sequences.

## Authenticated session service, transport and containment

The worker's loopback WebSocket uses `/hands` with no URL credentials. Its immutable bootstrap supplies the exact panel Origin, a 64-hex observer capability and 64-hex epoch; a client must authenticate with one masked binary UTF-8 capability message before receiving data. Wrong Origin/Host, wrong capability and concurrent receivers are refused. Client control messages are bounded; sockets time out rather than accumulating indefinite work. One frame may be in flight plus one replaceable newest pending frame. The browser must acknowledge consumption, not mere receipt.

Transport layout for the page client: the existing 16-byte channel header has type 21/version 2, followed by 64 ASCII epoch bytes, little-endian u64 source sequence, and the complete unchanged HANDS v2 packet. A consumption ACK is byte 110 plus the outer header's little-endian u32 transport sequence. Clock ping is byte 111 plus f64 page-send time; reply type 22 contains echoed page-send, QPC receive and QPC send as three little-endian f64 values. `hands-session-wire.js` validates every envelope and packet before SDK admission, including raw flags before decoder normalization, all 255 possible hands, numeric fields, identities and safe increasing sequences. Four-timestamp samples map QPC to page monotonic time using bounded lowest RTT samples: uncertainty must not exceed 50 ms, capture age must not exceed 250 ms, and future tolerance is uncertainty plus 50 ms. Backwards clocks or mapping discontinuity retire the session; stale input clears without becoming an empty-detection claim.

`xrb-provider-supervisor.exe` creates the worker suspended and atomically assigns its kill-on-close job at process birth using the Windows job-list creation attribute. It inherits only the three intended pipe handles, verifies containment before first resume, and watches the exact owning panel process handle. Launcher death cannot leave a resumed or suspended uncontained worker. Both graceful completion and forced launcher loss are exercised with isolated fake/synthetic processes and actual sockets. No display host or unrelated process belongs to this job.

Set `XRB_TEST_PROVIDER_SUPERVISOR` to the supervisor executable to include actual job-containment tests in `hand-worker-transport.test.ts`. These tests also reject foreign/bad authentication, prove no frame FIFO before consumption ACK, preserve source gaps and exercise clock replies.

`/api/hands/session/bootstrap` requires the exact configured Host/Origin, same-origin fetch metadata and a non-simple header. Subsequent session status, Start, Stop, heartbeat and profile acknowledgement operations require a memory-only owning-page capability; another page cannot adopt or stop an active session. No session route joins preview CORS. Start reserves through the legacy-host guard and transfers ownership to the designated job-contained worker before input create. Stop fences the page first and waits for cleanup or verified child death; unresolved death stays busy/failed. Page heartbeat expiry is 5 seconds; socket loss, panel shutdown and actual parent-process death also stop the owned child. Tests cover delayed preparation/cancellation, owner refusal and real process/socket teardown. SDK/recorder and visible controls are the following outcomes.

### Provider data lookup: compatibility decision

The module passes app-compatible provider metadata, including the existing local-app-data `xrb.dataDir`, `exeDir`, owning `pluginDir`, 3D view and disabled debug images. There is no data-root override, copying, calibration reset or migration. Profile, recording and session core state stays workspace-owned. Test executables retain their explicit isolated configuration instead of looking up the person's app data. No device/runtime startup, physical camera release or latency result is claimed by these software tests. Other platforms need their own native loader/ABI export layer, OS-owned interprocess exclusion, child containment, monotonic clocks and device validation; they must not emulate success with Synthetic or silently enter XR.

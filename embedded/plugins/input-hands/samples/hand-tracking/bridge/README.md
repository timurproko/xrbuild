# Optional local RGB-D bridge

Authored Windows x64 C++17 acquisition/geometry source plus a Node loopback service. It is diagnostic code, not a real-hand application-input provider. No prebuilt executable or device library ships in this source tree. Default synthetic/browser use does not need the bridge.

## Explicit dependency/build setup

The bridge requires core headers/JSON, the pinned public BSD-2-Clause marker source (`marker-assets.json`), and a separately reviewed device SDK with source/build provenance and notices. All dependency files must be under core `third_party/hand-tracking`, never an implicitly discovered private workspace or machine install.

The optional SDK descriptor is `third_party/hand-tracking/sensor/dependency.json` (not a shipped private configuration). Version 1 declares:

- `upstreamVersion`, `source: {url, sha256}`, an explicitly reviewed open-source `license`;
- relative `include`, `cppHeader`, `geometryHeader`, `library`, `runtime`, and nonempty `notices` paths;
- `files`, an exact relative-path → SHA-256 inventory including every declared input.

The explicit builder verifies the descriptor and all listed files before invoking CMake; it does not fetch an unknown SDK, grant redistribution rights, copy a private binary or install globally. Upstream source/build instructions and actual artifact provenance still require review before supplying this optional input or distributing its output.

With `XRB_CORE`/`XRB_HOME` explicitly selected, run `bridge:build`; `bridge:stage` also publishes an immutable source-bound runtime in selected user `build/hand-tracking/bridge`. This performs only framing/geometry/marker self-tests; it never enumerates or opens a camera. Marker preparation fetches its pinned verified public archive into core third_party; existing foreign/changed/incomplete dependency stores are refused, not removed. Missing SDK configuration is explicit and does not prevent the generated diagnostic from loading.

The managed viewer checks an explicitly built runtime's source/inventory hashes. It never runs a compiler at startup. Missing/stale runtime blocks native acquisition only. Runtime files and accompanying notices remain user-owned generated output, not tracked source or automatically redistributable product files.

## Local service and lifecycle

The viewer's service binds loopback, exact Origin/Host, same-origin bootstrap and random in-memory pairing credentials. WebSockets authenticate before device operations. No remote origin, URL token, persistent credential, system service or environment/registry modification. Busy ports/foreign owners are never stopped or taken over.

An explicit serial/profile selection plus Start is the capture boundary. Enumeration opens no image stream; Stop/disconnect/page disposal releases owned acquisition and workers. Multiple idle authenticated tabs are permitted but only one owns a stream per service. Two-view mode uses independent authenticated services and coupled rollback/cleanup. Stalls/backpressure are bounded; unsupported profiles do not silently fall back.

Packets preserve raw RGB8/Z16, reported intrinsics/extrinsics, invalid masks and separately qualified timestamps. SDK-reported clocks do not prove hardware exposure synchronization. Aligned pixels and original depth-camera Z must not be conflated; geometry semantics are declared and checked. No assumed transforms, anatomical fitting, smoothing or application publication are introduced.

Physical capture, SDK qualification, model inference, calibration, sustained throughput and distribution remain separately authorized/manual acceptance. Synthetic/mocked tests do not count as those operations.

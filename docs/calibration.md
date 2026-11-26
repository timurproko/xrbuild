# Calibration

Open **Calibration** in the module menu, or `/calibration/`. It measures the depth-camera B → A optical-space transform, bound to both camera serials and exact profiles. Hand providers can consume the result; this page does not change app hand placement or start a hand provider.

The page uses the panel's standard loading indicator without a description subtitle. Method and Start share a control baseline and height.

The core page opens without optional tools. The optional calibration contribution supplies measurement and saved-result operations. A missing/stale checked native bridge blocks capture only. **Connect** explicitly starts authenticated local bridge services and checks camera inventory; opening the page does neither. Two distinct supported depth cameras are required. **Rebuild** refreshes the bridge for the current source when its reviewed device SDK is present; navigation never installs or builds it.

## Availability and recovery

After updating, choose **Rebuild** in the module menu (or the availability notice), let it complete, then open Calibration and **Connect**. Rebuild prepares missing/stale public service dependencies and rebuilds/stages the source-bound camera bridge using the desktop-validated CMake and generator and the same checked core native dependency root as the host. Core native libraries installed by Desktop setup may live entirely in the selected workspace cache; the bridge does not require a second product-tree header copy. A bridge built before a native source update is refreshed automatically; no separate bridge command is needed. The bridge step runs framing/geometry/marker self-tests, never device enumeration or capture. It skips an unconfigured optional device SDK rather than installing it or failing an unrelated host build.

| Notice cause | Action |
| --- | --- |
| Calibration plugin missing, disabled or conflicting | Enable/install the contribution or select one owner in Plugins. |
| Application components missing, stale or unfinished | Rebuild. Current immutable contribution generations refresh while idle. |
| Camera device SDK missing | Supply the reviewed `dependency.json` and its verified headers, library, runtime and notices under core `third_party/hand-tracking/sensor`, then Rebuild. No machine-global/private SDK discovery or automatic device download occurs. |
| Device SDK files invalid/incomplete | Restore the reviewed dependency; diagnostic details identify the validation failure. |
| Camera device runtime missing from the dependency | Restore the reviewed SDK runtime file; it is named separately from an unconfigured SDK. |
| Native bridge absent or from an older source version | Rebuild with the configured reviewed device SDK. |
| Bridge manifest/inventory/hash or component ownership/output invalid, unsafe paths or leftover locks | Inspect the preserved files/diagnostic details and resolve ownership or restore the verified generation; unsafe state is never erased or overwritten automatically. |
| Device-runtime loader or enumeration failure after Connect | Restore the reviewed device runtime or check camera connections; details retain the native failure without claiming which unobserved library is missing. |
| Fewer than two compatible cameras | Connect a second supported camera, then Connect again. |

The notice contains only the current reason and applicable action. Additional diagnostics are available on hover. A successful Rebuild from the notice, including a successful Retry after a failed attempt, reloads this route and rechecks availability without starting cameras. If an already-running panel reports a real loaded-code restart requirement, use Restart in its existing job result. Save/Import/Export remain available when only capture prerequisites are missing. Physical camera behavior and Windows device-runtime loading still require an operator check on the rig.

## Manual targets

Connect, select two distinct serials and exact profiles, choose **Manual targets**, then Start. Keep both cameras fixed. For each static target, use the same ID and role and click it once in each RGB preview. Collect at least six well-spread fit pairs and three separate held-out check pairs. Remove a target explicitly to replace a probe. Confirm the fixed setup, describe the physical reference and supply its uncertainty (mm); unknown uncertainty remains provisional. Fit shows separate fit/check quality. Stop releases both cameras and the shared acquisition lease; it does not stop another app. A busy app/tool blocks connection rather than being taken over. Connection loss or partial start rolls back both streams. Hand models are not needed.

The minimal native port validates authenticated loopback transport, serial/profile, frame planes, run/sequence and clock messages. Static point sampling shares calibrated geometry with the retained algorithms but imports no hand reconstruction engine. Native services require prepared public service dependencies and a checked staged bridge; explicit Rebuild prepares both, but neither is installed on navigation.

## Marker

Choose **Marker** before Start. **Download marker** provides the existing printable marker and **Detector license** its notice; neither needs capture. Keep the cameras fixed and show a single flat, matte, depth-visible tag36h11 marker (with its white border) to both cameras. Move the marker slowly, not the cameras. The previews outline native detections; the status shows paired groups and rejection reasons. Twelve paired groups over at least 1.8 seconds yield eight fit and four later held-out groups. Native detection selects the first actual color frame in shared 211 ms reported-clock buckets, not on independently phased process timers (or cadence locked to common slower frame periods); original frame timestamps are never rewritten. This lets independently started normal-rate cameras supply pairs to the unchanged 40 ms clock and motion gates. Slow/dropped frames or unqualified clocks can still prevent pairing; use an appropriate supported profile rather than relax the gates. Weak/missing observations do not stop capture or erase recent accepted evidence. **Cancel** stops both owned streams; no result is saved automatically. Inspect quality before saving. Native depth scale and relative-pose repeatability do not establish independent physical accuracy or synchronized exposure.

## Save, Import and Export

Existing results remain in the selected workspace's `config/plugins/input-hands/preferences.json`, key `handtracking.fusion-calibrations.v1`. **Save** is explicit and accepts only spatially qualified results, from either workflow. The inventory retains up to eight validated scalar JSON strings, newest first, deduplicated by input hash. No migration or deletion is performed. Unrelated preferences are preserved. The complete serialized preferences envelope must fit the existing 768 KiB UTF-8 byte budget; an over-budget save is refused before file replacement, leaving the original bytes readable and unchanged. Conflicting/busy/unsafe/corrupt state is refused, never reset; **Reload saved** explicitly refreshes a stale revision. Global Hands profile and projects are separate.

Saved/Open, Import and Export need no camera, native bridge, model or acquisition lease. Import accepts the scalar file or extracts its spatial result from an existing version-1 `xrbuild-two-view-setup` envelope (at most 128 KiB); timing/options from that wrapper are not imported or applied. Export always produces the unchanged scalar `hand-tracking-spatial-calibration.json`. Provisional results can be exported for review but cannot be saved as qualified. Import never confirms that the current physical rig is unchanged. Unsaved measured drafts warn before navigation/replacement; initiating a download cannot prove it was stored durably.

## Stable output contract: version 1

This is the existing on-disk contract, not a second schema or a provider implementation. A consumer can read it without the page. The normative reference validator/types are [calibration.ts](../embedded/plugins/input-hands/samples/hand-tracking/src/live/multiview/calibration.ts); [calibration-document.ts](../embedded/plugins/input-hands/samples/hand-tracking/src/live/multiview/calibration-document.ts) additionally extracts spatial results from legacy wrappers. Format changes require a new version, not reinterpretation of existing files.

| Field | Meaning |
| --- | --- |
| `format`, `version` | `xrbuild-spatial-calibration`, integer `1` |
| `privateEvaluationOnly` | `true`; retained evaluation restriction, not a distribution or accuracy approval |
| `worldFrame` | `camera-a-optical`: A RGB optical axes, +X right, +Y down, +Z forward |
| `transform` | Literal `pA = rotationRowMajor * pB + translationMeters` |
| `bToA.rotationRowMajor` | Nine finite numbers, row-major proper orthonormal 3×3 rotation; no scale, shear or reflection |
| `bToA.translationMeters` | `{x,y,z}` in metres; applies after rotation; finite norm at most 10 m |
| `input.sources.a`, `.b` | Normalized native calibration metadata for distinct camera serials; see identity below |
| `sourceHashes.a`, `.b` | SHA-256 of each normalized source calibration |
| `input.targets` | 6–64 matched IDs, `use: fit` or `check`, with A/B scalar samples |
| Each sample | Metric `point:{x,y,z}`, RGB `pixel:{x,y}`, `frameNumber`, `sourceTimeMs`, `clockDomain`, `selectedPageMs`, `pageOriginMs`; these clocks are provenance, not synchronization proof |
| `input.limits` | `rmsM`, `maximumM`, `reprojectionPx`; current measurement defaults .015 m, .030 m, 8 px |
| `input.evidence` | `staticTargetConfirmed`, description, measured `referenceUncertaintyM` or null; marker evidence additionally identifies family, ID and validation method |
| `inputSha256` | SHA-256 of the normalized complete input: sources, scalar targets, limits and evidence |
| `residuals`, `fit`, `check` | Per-target metric/A/B reprojection residuals and separate fit/held-out sample counts, RMS, maximum, reprojection RMS and invalid-projection counts |
| `spatialQualified`, `reasons` | Internal geometric/evidence qualification and explanations, recomputed rather than trusted on import |
| Marker-only fields | `validation`, `accuracy: unverified`, and (for paired relative poses) `poseRepeatabilityM`; not independent physical reference accuracy |
| Safety fields | `physicalValidation: operator-required`, `temporalAlignment: null`, `fusionEnabled: false`, always |

For `R = rotationRowMajor` and B optical point `(x,y,z)` in metres:

```text
pA.x = R[0]*x + R[1]*y + R[2]*z + translationMeters.x
pA.y = R[3]*x + R[4]*y + R[5]*z + translationMeters.y
pA.z = R[6]*x + R[7]*y + R[8]*z + translationMeters.z
```

### Identity and integrity

Each source binds its `serial`, `sdkVersion`, device name/firmware/USB metadata, exact RGB8 color and Z16 depth stream dimensions/rate, color/depth/aligned-depth intrinsics (including distortion coefficients), depth-to-color extrinsics, depth scale in metres per raw unit, alignment/pairing/native-clock provenance and geometry semantics. Geometry declares aligned pixels in color optical space but aligned values as original depth-optical Z; consumers must not substitute color Z. Depth-to-color rotation in the source metadata is **column-major**; the fitted B-to-A rotation is **row-major**.

`metadataHash` in the reference [format.ts](../embedded/plugins/input-hands/samples/hand-tracking/src/live/recording/format.ts) recursively sorts object keys, preserves array order and serializes normalized JSON numbers with IEEE signed zero retained as numeric `-0`. It hashes the resulting UTF-8 bytes using SHA-256. Do not round metadata, change units, drop signed zero or hash a differently ordered raw JSON string. Use the reference helper or reproduce its tested canonicalization, not an assumed JSON canonicalization standard.

`importSpatialCalibration` bounds scalar input to 64 KiB, normalizes schema-owned values, recomputes fit, source/input hashes, residuals and qualification, and checks the declared rigid transform/qualification against the recomputed result. Returned values discard unowned imported fields. It is integrity validation, not authentication or proof of physical correctness. `assertCurrentSources(result,currentA,currentB)` checks both current normalized source hashes; swapping A/B is not an equivalent binding.

### Consumer validity obligations

1. Validate the version/declarations, bounds, source/input hashes and recomputed fit before use; reject provisional results or limits weaker than the consuming provider's policy. Legacy valid files can encode limits up to 30 mm RMS / 60 mm maximum / 15 px, not just today's defaults.
2. Match **both** current serials and exact metadata/profiles with the stored bindings. A changed device, profile, depth scale, optics or extrinsics requires new measurement. Do not substitute a missing camera or an identity transform.
3. Obtain confirmation that neither camera moved since measurement. Hashes cannot detect rig movement; remeasure after movement. Internal held-out checks and marker repeatability do not establish independent physical accuracy.
4. Qualify temporal alignment/exposure and physical accuracy separately for the future provider's intended use. The file grants no fusion, provider activation, panel/app-coordinate conversion or global Hands-profile update.

## Acquisition integration

The core contribution receives `acquireCapture()`, backed by `Panel.acquireCapture(label)`. Acquisition tools must use this same synchronous exclusion before allocating either stream and release it only after all owned native cleanup finishes. App launch preparation checks the same exclusion; plugin/setup/cache/update jobs and restart cannot overlap it. A future live-session module must share this seam, not invent an independent lease or stop Calibration. Calibration holds its two-service lease from explicit Connect through Stop/disposal; authenticated page heartbeats renew it, and 20 seconds without renewal closes both owned services before releasing it. Neither credentials nor lease IDs are stored in preferences/exports.

## Two-camera operator checklist

Software-only tests use injected ports and generated packets. No camera, detector/runtime, physical geometry, exposure timing, sustained throughput or hardware-release behavior has been verified on a real rig here.

- Connect the checked bridge, choose two actual serials/profiles, and confirm the correct RGB previews.
- Keep cameras fixed; collect ≥6 manual fit and ≥3 held-out targets with a measured reference uncertainty, then inspect fit/check/max/reprojection quality.
- Repeat with one matte marker visible to both cameras; inspect paired progress/rejection reasons and the qualified result.
- Save, reload and Import/Export; confirm serial/profile binding and preserved unrelated preferences.
- Stop/Cancel, disconnect a camera and try a busy camera or changed profile; confirm refusal/cleanup without taking over another app. Independently measure physical accuracy and timing before any future provider uses the result.

# Camera-to-camera calibration contract

Open the independent [Calibration module](../../../../../docs/calibration.md) at `/calibration/`, not a Hands tab.
Old diagnostic pages/aliases remain removed. The linked module guide documents operation and the stable provider-consumption contract.

## Manual measurement

Use fixed cameras and matching static depth-visible target IDs, not moving hands or model poses. The retained manual
panel collects color-camera surface probes sequentially for camera A and camera B. At least six non-collinear,
well-spread fit pairs and three separate held-out pairs are required. Targets must reproject to their recorded RGB
pixels. Unknown reference uncertainty remains unknown; physical reference/rig confirmation is an operator responsibility.

The solver uses Horn absolute orientation with a bounded symmetric Jacobi eigensolve. It fits a proper rigid transform,
not scale, reflection or shear. Held-out metric and pixel residuals do not participate in fitting. Existing limits are
15 mm RMS, 30 mm maximum distance and 8 px reprojection RMS. Failing or missing evidence yields a provisional result,
never an identity fallback. Native capture, intrinsics and calibrated depth-point sampling are prerequisites; hand inference is not.

## Output and consumer obligations

`xrbuild-spatial-calibration` version 1 maps B RGB optical points into A RGB optical metres:

`pA = rotationRowMajor * pB + translationMeters`

Axes are camera optical (+X right, +Y down, +Z forward), not panel/app axes. Bind the result to both native serials,
exact profiles, intrinsics/extrinsics, depth scale and source metadata hashes. Scalar target/evidence hashes, held-out
residuals and qualification fields are part of the validated format. Import recomputes the fit and rejects forged
transforms, qualification or `fusionEnabled:true`; unowned fields are discarded and signed-zero metadata survives round trips.

The format declares `physicalValidation: operator-required`, `temporalAlignment: null`, `fusionEnabled: false`.
It is not a synchronization certificate, app-hand offset, permission to publish input or an accuracy guarantee.
A future provider must check current source bindings and physical rig validity, and separately qualify timing.
SDK apps and the global Hands profile do not currently consume this transform.

## Storage

Manual results export as `hand-tracking-spatial-calibration.json`. Saved marker results use
`handtracking.fusion-calibrations.v1` in workspace `config/plugins/input-hands/preferences.json`, up to eight
validated scalar records. Existing exports and keys remain readable and are not migrated or deleted. The injected
`CameraCalibration` controller never captures on import/construction. The module acquires the shared native capture
lease before starting either camera; explicit Stop/disposal closes both streams. Saved-result operations need no camera.

See [marker measurement](marker-calibration.md) for the alternative automatic collector.

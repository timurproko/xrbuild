# Marker camera calibration

Retained for the following independent Calibration module; no camera or fusion workflow is mounted in Hands.
The scriptless `calibration.html` fragment preserves the two-preview Close/Cancel/Done shape and manual fallback fields.
The source-only `CameraCalibration` coordinator has injected, explicitly started native ports, no hand-model workers,
and no dependency on a benchmark or fusion UI. The following module supplies its menu, route and capture lease.

## Measurement

Both fixed RGB-D cameras observe one flat, matte, depth-visible tag36h11 marker with its white quiet border, from the
same side. A tabletop or handheld marker is supported. Move the marker, not the cameras. Avoid glossy/folded targets,
duplicate copies of the same ID, severe edge-on views and motion too rapid for the measured skew. At least 20 pixels
per black-square edge is required. The native detector reports subpixel corners tied to the exact color frame.
Qualified depth surface patches support a plane; color rays intersect that plane in each optical frame.

The collector retains at most 40 scalar observations per source over eight seconds. It matches the same marker ID
within 40 ms reported color-time difference and 150 ms receipt separation, with motion/skew rejection. Twelve distinct
paired frame groups span at least 1.8 seconds: eight fit and four later held-out groups, four corners each. Camera-relative
pose repeatability uses leave-one-fit-group-out checks with a 5 mm RMS gate. Fit residual limits remain 15 mm RMS,
30 mm maximum and 8 px reprojection RMS. Unknown independent physical accuracy/exposure uncertainty stays unknown.

The result is the proper rigid B RGB optical → A RGB optical transform in metres. Evidence records
`validation: paired-relative-pose-frames`, `staticTargetConfirmed: false`, `referenceUncertaintyM: null` and
`accuracy: unverified`. Later frames are not independent physical references. This result does not start hand inference,
activate fusion, adjust app hands or establish synchronized exposure.

## Save and cancellation

Only an explicit save persists a qualified result under the unchanged `handtracking.fusion-calibrations.v1` key.
Import/export use the existing bounded scalar format and recomputation checks. Cancel/Stop fences late fit results,
stops owned cameras and never applies a provisional result. Native marker/runtime setup remains explicit; no model
weights or inference are needed merely to measure the camera transform. A moved rig or changed serial/profile requires
new measurement; profile hashes cannot detect physical camera movement.

See [output contract](camera-calibration.md). Physical acceptance must be measured separately from software tests.

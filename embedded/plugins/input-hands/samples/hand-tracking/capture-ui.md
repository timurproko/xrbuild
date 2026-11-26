# Retained native capture contract

The former capture laboratory is not a product page. Hands has no camera/fusion mode or Calibration tab.
Camera calibration is extracted next as a separate module; browser landmarks and two-view fusion remain unwired
source for a future provider. This document records their capture prerequisites, not a current startup URL.

Native sources use explicit ordered camera serials and exact matched RGB8/Z16 profiles. Missing remembered devices
or modes stay unavailable; no enumeration-order substitution, image resize or silent profile fallback is allowed.
The existing bounded intersection supports at most 1280×720, 90 Hz and 8 MiB per complete packet. Advertised FPS is
not delivered inference/render throughput. Unexpected calibration/profile/plane sizes fail closed.

Profile, intrinsics/extrinsics and depth-scale changes invalidate calibration bindings. Native pixels retain their
true dimensions/bit depth. Legacy packets without a profile field retain the baseline `640x480@30`; other supported
packets identify the exact width/height/FPS. Unknown geometry/clock qualification remains unknown, not a default transform.

Camera choices remain separately stored preferences, not capture permission, transient bridge credentials, media,
poses or rig approval. Saved calibrated transforms remain validated scalar records under their existing key.
Reload/import/discovery never starts cameras or models. Explicit native Start must acquire the shared acquisition
lease; Stop waits for callbacks/resources to quiesce before releasing it. Calibration uses marker/manual depth probes
without hand inference. The separate module must keep its capture lifetime distinct from selected-provider app input.

See [calibration output](camera-calibration.md), [marker measurement](marker-calibration.md) and
[recording compatibility](recording-format.md). No current hardware throughput/physical accuracy claim is made here.

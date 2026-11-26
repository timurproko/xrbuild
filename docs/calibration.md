# Calibration

Open **Calibration** in the module menu, or `/calibration/`. It measures the depth-camera B → A optical-space transform, bound to both camera serials and exact profiles. Hand providers can consume the result; this page does not change app hand placement or start a hand provider.

The core page opens without optional tools. The optional calibration contribution supplies measurement and saved-result operations. A missing/stale checked native bridge blocks capture only. **Connect** explicitly starts authenticated local bridge services and checks camera inventory; opening the page does neither. Two distinct supported depth cameras are required. Build/stage the optional bridge explicitly through its documented setup; navigation never installs or builds it.

## Manual targets

Connect, select two distinct serials and exact profiles, choose **Manual targets**, then Start. Keep both cameras fixed. For each static target, use the same ID and role and click it once in each RGB preview. Collect at least six well-spread fit pairs and three separate held-out check pairs. Remove a target explicitly to replace a probe. Confirm the fixed setup, describe the physical reference and supply its uncertainty (mm); unknown uncertainty remains provisional. Fit shows separate fit/check quality. Stop releases both cameras and the shared acquisition lease; it does not stop another app. A busy app/tool blocks connection rather than being taken over. Connection loss or partial start rolls back both streams. Hand models are not needed.

The minimal native port validates authenticated loopback transport, serial/profile, frame planes, run/sequence and clock messages. Static point sampling shares calibrated geometry with the retained algorithms but imports no hand reconstruction engine. Native services require explicitly prepared public service dependencies as well as an explicitly built/staged bridge; neither is installed on navigation.

## Marker

Choose **Marker** before Start. Keep the cameras fixed and show a single flat, matte, depth-visible tag36h11 marker (with its white border) to both cameras. Move the marker slowly, not the cameras. The previews outline native detections; the status shows paired groups and rejection reasons. Twelve paired groups over at least 1.8 seconds yield eight fit and four later held-out groups. Weak/missing observations do not stop capture or erase recent accepted evidence. **Cancel** stops both owned streams; no result is saved automatically. Inspect quality before saving. Native depth scale and relative-pose repeatability do not establish independent physical accuracy or synchronized exposure.

Existing results remain in the selected workspace's `config/plugins/input-hands/preferences.json`, key `handtracking.fusion-calibrations.v1`. No migration or deletion is performed. Global Hands profile and projects are separate.

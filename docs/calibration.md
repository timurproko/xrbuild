# Calibration

Open **Calibration** in the module menu, or `/calibration/`. It measures the depth-camera B → A optical-space transform, bound to both camera serials and exact profiles. Hand providers can consume the result; this page does not change app hand placement or start a hand provider.

The core page opens without optional tools. The optional calibration contribution supplies measurement and saved-result operations. A missing/stale checked native bridge blocks capture only. **Connect** explicitly starts authenticated local bridge services and checks camera inventory; opening the page does neither. Two distinct supported depth cameras are required. Build/stage the optional bridge explicitly through its documented setup; navigation never installs or builds it.

Existing results remain in the selected workspace's `config/plugins/input-hands/preferences.json`, key `handtracking.fusion-calibrations.v1`. No migration or deletion is performed. Global Hands profile and projects are separate.

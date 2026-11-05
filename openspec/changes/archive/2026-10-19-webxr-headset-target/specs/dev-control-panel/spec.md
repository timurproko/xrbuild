# Spec Delta

## ADDED Requirements

### Requirement: Build target
The Settings card SHALL hold the project's Target, Host (an `xrb-host` app on a display, the default) or WebXR headset,
saved as `target` in the manifest under the same rules as the other settings. Platform SHALL list only the packagers of
the project's target.

#### Scenario: Switch a project to the headset
- **WHEN** the developer sets hello-cube's Target to WebXR headset
- **THEN** the manifest's `target` is `webxr` and Platform lists only `webxr` packagers

#### Scenario: Manifest without a target
- **WHEN** a project's manifest has no `target`
- **THEN** the panel treats it as a Host project and behaves as before

### Requirement: Headset project view
For a WebXR headset project the panel SHALL hide the Display and Input selectors and the host's run controls, offer
opening the built app in the desktop browser, and build packages without the host.

#### Scenario: Host controls hidden
- **WHEN** the developer opens a WebXR headset project
- **THEN** Display, Input, Run on the display, 2D mode and the camera and hand views are not shown, and "Open in
  browser" is

#### Scenario: Package for the headset
- **WHEN** the developer clicks Build package on a WebXR headset project with a `webxr` packager selected
- **THEN** the package is written to the workspace's `builds/` without a host build, and the panel shows its path and size

# app-launch-return Specification

## Purpose
TBD - created by archiving change restrict-launcher-return. Update Purpose after archive.

## Requirements

### Requirement: Return only to a trusted launcher

An app opened by a launcher SHALL offer a return to the launcher only when the return address has the page's own origin, a loopback HTTP origin, or the native host's app origin. Any other return address SHALL be ignored, as for a direct launch.

#### Scenario: Same-origin launcher

- **WHEN** an app at `https://apps.example/demo/` is opened with a return address of `https://apps.example/launcher/`
- **THEN** the app shows the return control, and pressing it or Escape opens that launcher

#### Scenario: Loopback development launcher

- **WHEN** an app at `http://localhost:5173/` is opened with a return address of `http://127.0.0.1:5181/preview/launcher/`
- **THEN** the app shows the return control

#### Scenario: Native host launcher

- **WHEN** a published app is opened with a return address of `https://app.local/`
- **THEN** the app shows the return control

#### Scenario: Foreign return address

- **WHEN** an app at `https://apps.example/demo/` is opened with a return address of `https://elsewhere.example/`
- **THEN** the app shows no return control and Escape does not navigate

# Proposal

## Why

An ordinary pull can invalidate activated embedded services, leaving Run, Build and Rebuild refused before a job exists and without a recovery control. Update also rebuilds with unvalidated PATH CMake instead of the supported toolchain selected by desktop setup.

## What Changes

- Make Rebuild include changed embedded-service preparation; Run and Build automatically use that same logged preparation when needed, without a separate setup action or another page.
- End Update with the same rebuild preparation and report only truly unavoidable restart requirements with a Restart control in the job result.
- Probe desktop-validated CMake and generator inside Update's fresh native subprocess; cover competing installations without native builds.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-panel`: actionable service recovery for explicit actions, complete Update setup and consistent validated native tool selection.

## Impact

Panel admission and service lifecycle, shared failure/rebuild presentation, Update setup/runtime helpers, targeted synthetic HTTP/UI and Git fixtures, and owner documentation. No private packages, real native builds, administrative installation or changes to the person's panel/checkouts.

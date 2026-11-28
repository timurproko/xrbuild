# Implementation evidence

## Delivered

- Optional React UI Kit controls reuse the existing imperative state machines, own subscriptions/targets/resources and update once per SDK frame. Imperative imports remain React-free.
- UI Kit and Launcher have separate runnable and public component entries. Launcher imports Board, Button, Dialog and Label from the UI Kit app's public entry, not private implementations.
- The canonical template generates the same text/ring app with a pure `AppScene` export, standalone icon and retained notices. Existing user projects are not rewritten.
- Cross-app import/build/mount, instance isolation, teardown, callback/capture, frozen dependency and managed-input fingerprint fixtures cover the shared-runtime boundaries. No theme provider, exposed-settings system or control-panel UI is introduced.

## Verification

The task report retains exact commands, pushed revision, proof scripts, hashes and before/after artifacts outside the checkout. Local checks are targeted, not the root integration suite: 294 passing cases across UI Kit, React, both app packages, selected SDK/workspace contracts and a real-browser first-mount icon check, plus strict production types, name guard and strict OpenSpec validation. Fresh frozen embedded snapshots build the two apps; the generated template also installs/builds independently with a frozen lock.

The fixed-camera/clock/viewport matrix includes mono perspective, orthographic and stereo, icon mode, every control type, Mouse-disabled physical hands, off-centre stereo hands, dialog/disabled/slider/axis states, Launcher reveal/paging/swipe/tilt/launch, empty/error catalogs and PNG fallback. Eighteen event/state/timing trace pairs are byte-identical. Ninety-six primary picture pairs are byte-identical, including 63 state/keyframe pairs with a deterministic proof-only WebGL context configuration.

Repeated product-default MSAA captures exposed low-bit edge noise, not shifted/missing/recoloured content. Five unchanged baseline and five final Launcher stereo renders give 45 comparisons: at most 192 pixels in an 800 by 450 frame, maximum channel difference 2, all at edges. The approved bound is 0.1 percent of the frame and channel difference 2. Some ancillary single-frame startup/tilt comparisons reached 3; repeated unchanged tilted baselines also reproduced 3. Pinning MSAA off in both proof contexts eliminated the discrepancy: all 63 paired state/keyframe images are byte-identical. No application renderer option or product default was changed for proof. Deterministic default-rendered views still use exact byte equality.

Actual Vite HMR retains one runtime/canvas and the original target/frame registration counts for all three apps. Explicit teardown leaves zero canvases and targets. Production pages open at nested relative routes and standalone icon imports create no additional application.

## Combined CI/review repair

The delivery refusal on the original implementation head came from the authored `acceptance.md` colliding with the generated acceptance manifest. The proof record now uses `implementation-evidence.md`. Dry-run preparation with the exact shared workflow revision and pinned OpenSpec 2.1.1 reproduces the old digest refusal and verifies the renamed evidence and generated manifest without finalizing this checkout.

Accepted Launcher navigation now belongs to the scene, retaining its original URL, projection and 1150 ms deadline across card replacement, catalog errors and removal. Only scene teardown cancels it. Eight refresh regressions failed before the fix; all 17 Launcher component cases pass afterward, including accepted-navigation teardown cancellation. The complete Launcher package passes 42 cases; the seven CI-policy cases and two delivery-preparation regressions also pass. The reviewer's adapted reproduction retains the navigation timer after polling and navigates once.

## Limits

Physical display, tracker and headset acceptance is not claimed; hand/stereo checks use deterministic replay and host/browser fixtures. Native code was not changed or built. Broad CI and review run after publication and are not replaced by these local checks.

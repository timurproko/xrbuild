## Why

Escape currently quits the native presenter before an SDK app can return to its launcher, while browser apps follow a different path. The shared mouse cursor has no global Apps setting. The control showcase also needs its sliders below the round button/trackball/dial row and axis re-selection to restore unconstrained rotation.

## What Changes

- Give managed Desktop and Browser sessions one Escape policy: a valid launcher return wins; otherwise close a fullscreen session and leave a windowed session open. Launcher follows the same rule as any directly opened app.
- Do not attempt to close an ordinary browser tab that the application does not own. Without a managed window, Escape may exit browser fullscreen instead.
- Add Settings > Apps > Cursor, proposed choices System, Ring, and Ring with hover dot (default). Persist the workspace preference, resolve it at launch, and carry it through launcher navigation. Mouse-disabled sessions remain disabled in every cursor mode.
- Coordinate native pointer visibility and SDK cursor rendering so there is only one visible mouse cursor.
- Move the showcase sliders to the bottom left/right; align the round button, robot trackball, and dial in the middle row. Keep labels clear of adjacent controls.
- Allow the showcase's selected X, Y, or Z segment to return to Full when activated again, without changing the default radio behavior of other segmented controls.
- Consolidate Activity controls into one header: Jobs/Log tabs on the left, the active tab's filters centered, and its X clear action on the right. Reserve the content area for items, item details, and empty states only.

## Capabilities

### New Capabilities

None; extend existing runtime, host, panel, and UI control contracts.

### Modified Capabilities

- `web-runtime-sdk`: shared Escape resolution and configurable mouse cursor rendering.
- `web-host`: native Escape routing and graceful fullscreen session termination.
- `dev-control-panel`: global Cursor preference, bounded managed-browser close requests, and a single-row Activity header.
- `hand-ui-controls`: opt-in segmented re-selection fallback.

## Impact

Core changes touch SDK launch context/lifecycle, host presenter/channel, managed preview lifecycle, panel Settings, and the shared segmented control. The private workspace showcase receives layout and axis-selection changes through public APIs only. Templates and other apps inherit runtime behavior rather than duplicating Escape or cursor handlers.

The dependency is resolved: the maintainer merged PR #56 as `8828296b691d00290ae57bfaed05ef857e58483a` and approved implementation on that baseline. The previous worktrees remain untouched.

Also fix the existing Settings gear's missing shared tint (sidebar and favicon), and clipped selection/focus outlines at the top of navigation lists. These are visual consistency fixes, not a broader component redesign.

## Review decisions

Confirm the proposed Cursor choices. Global Settings applies to subsequent panel launches; this change does not hot-swap active native input providers or impose a local panel preference on independently deployed packages. An ordinary unowned browser tab cannot be promised to close; managed fullscreen windows can be closed by their owner.

# @xr-build/ui-kit

Basic hand-operated controls for three.js apps on 3D displays: button (pill and
round), switch, segmented control, slider and stepped slider, dial, trackball and text label.
Every control is a `THREE.Group` with a title and a status line, sized in metres (one scene unit =
one metre with the UI Kit's world mapping; any other mapping works, the SDK core converts).

```ts
import { createXrb } from '@xr-build/sdk';
import { Button, Slider } from '@xr-build/ui-kit';

const xrb = createXrb(renderer, { mapping: { mode: 'world', center: new THREE.Vector3(), scale: 1 }, pointer: false });
const button = new Button({ title: 'Button', shape: 'pill', text: 'Press' });
const slider = new Slider({ title: 'Slider', value: 0.5, length: 0.13 });
scene.add(button, slider);
for (const c of [button, slider]) c.attach(xrb.interaction);   // hands through the SDK's interaction core
xrb.bindMouse();                                               // the same controls with the mouse
scene.add(xrb.cursorObject);                                   // where the mouse points, visible on a 3D display

button.on('click', (e) => console.log(e.source));   // 'hand' | 'mouse'
slider.on('change', (e) => console.log(e.value));

function animate(now) {
  for (const c of controls) c.update(dt);
  xrb.render(scene, camera);
}
```

## React components (optional)

Import `@xr-build/ui-kit/react` inside an SDK-hosted `mountXrbApp` tree. The root entry still exports the imperative classes and does not import React.

```tsx
import { Button, Slider, Board } from '@xr-build/ui-kit/react';

export function Controls() {
  return <Board width={0.597} height={0.336}>
    <Button title="Button" shape="pill" text="Press" onClick={event => console.log(event.source)} />
    <Slider title="Slider" value={0.5} position={[0, -0.1, 0]} onChange={event => console.log(event.value)} />
  </Board>;
}
```

The optional entry exports Board, Button, Switch, Segmented, Slider, Dial, Trackball, Dialog, Label, Icon and GlassEdge. Existing control options become props; Switch uses `initialOn`, Segmented uses `initialIndex`, Label uses `text`, and Trackball requires `radius`. Construction options (including initial slider value) remain stable for a mounted instance: use a React key to deliberately construct a replacement. Transforms, visibility, enabled state, callbacks, text/icon content, Trackball `axis` and Dialog `open` update in place. `ref` exposes the existing object; `configure` is a construction-only callback. `compact` hides a control's title/status. Dialog `interactive={false}` draws a visual-only sheet with no blocker/Close registrations; `closeButtonVisible={false}` hides and disables Close.

Adapters attach existing SDK targets, never duplicate their mesh events. They update once per SDK frame with delta capped at 0.1 seconds, including stereo; Dialog alone updates its internal Close button. Callback changes retain object identity/capture. Unmount removes subscriptions/capture and disposes construction-owned geometry, materials and textures, not consumer-added children or the SDK renderer. Default visual builders remain separate from input behavior; no theme provider or settings registry is included.

For source aliases, match `@xr-build/ui-kit/react` exactly to `packages/ui-kit/src/react/index.ts` before the imperative root alias. Also alias `@xr-build/react` to `packages/react/src/index.ts` and deduplicate `three`, `react`, `react-dom`, `@react-three/fiber`. Use the React bridge's pinned versions and JSX tooling. Run `pnpm --filter @xr-build/ui-kit test:react` for the component fixtures.

Imperative callers retain chainable `on`; `off(type, handler)` selectively removes one listener, and `subscribe(type, handler)` returns an idempotent unsubscribe function. `detach()` is reversible; `dispose()` is final and idempotent. Only construction-owned resources are disposed.

## Visual theme contract

`defaultTheme` is the current authored look, unchanged. Omitting a theme preserves existing constructors, helper exports, control bounds and React-free imperative imports. `resolveUiKitTheme` accepts a built-in ID or a complete immutable `UiKitTheme` definition; unknown IDs and missing visual roles fail before retiring live graphics.

A theme supplies every `visualRoles` entry through geometry/material recipes, plus state colours, typography and icon stroke defaults. Roles include all controls, Board, text/icons, glass edges, feedback cues and dynamic Slider fill. Factories receive readonly visual dimensions and geometry-local orientation, never targets or interaction tuning. The same material class is required for each role so existing animation handles remain compatible. Reusable material handles stay live; temporary material copies and replaced geometry are disposed. Factories must not allocate textures or untracked resources, register input or start work; return only the owned geometry/material being requested.

Visuals must fit the original footprint, text allocation and contact plane. Target bounds, poke depth/travel, pinch positions, volume radius, state, animation timing, sounds and layout are not theme options. Explicit consumer options remain authoritative. Board is also available imperatively, with the same options and owned/borrowed-map rules as its React adapter.

## Controls and events

| control | hands | events (`detail`) |
|---|---|---|
| `Button` | poke (fingertip pushes the cap, click at 60 % of the travel, release below 30 %); round buttons take a Lucide icon (`icon: ArrowRight` from `lucide`, `iconStroke` for weight) | `click` `{ source }`, `release` `{ source }` |
| `Switch` | poke anywhere on it | `change` `{ on, source }` |
| `Segmented` | poke a segment | `change` `{ index, value, source }` |
| `Slider` | touch-drag the handle, pinch near it, or poke the track to jump | `grab` `{ mode: 'touch' \| 'pinch' \| 'mouse' }`, `change` `{ value, step, source }`, `release` `{ mode }` |
| `Dial` | pinch at the knob and circle | `grab` `{ mode }`, `change` `{ value, source }`, `release` |
| `Trackball` | reach into the sphere and move; mouse arcball | `grab` / `release` `{ mode: 'hand' }`, `rotate` `{ axis, total }` |
| `Dialog` | frosted-glass sheet lifted toward the viewer (`lift`, default 7 cm) with a heading, text and a Close button; `open()` / `close()` | `open` / `close` `{ source }` |
| `Label` | - | - |

`new Segmented('', ['Full', 'X', 'Y', 'Z'], 0, { latchSelected: false })` gives the showcase momentary caps:
they press under hand/mouse input and spring back after release while the selected mode stays highlighted.
Selecting the same axis again keeps that axis; only Full restores full rotation. Default controls retain latched caps.

Separately, `new Segmented('', ['Full', 'X', 'Y', 'Z'], 0, { reselectIndex: 0 })` opts into user re-selection:
activating the selected X/Y/Z goes back to Full. Full/Full is a no-op. Default controls retain radio behavior;
programmatic `select(index)` remains idempotent, and each effective user change emits once with its hand/mouse source.

`robotHead(size)` builds the Trackball's robot model alone, facing +Z, without interaction or sound (e.g. for an app's 3D icon).

`control.setEnabled(false)` greys it out (colours toward a grey, nothing turns see-through), drops any press or grab in progress (the core releases its
targets) and ignores input until enabled again. `control.mouseOver` tells whether the mouse points at it.

## How input works

A control owns interaction targets of the SDK core (`PokeTarget`, `PinchTarget`, `VolumeTarget`) in
its own frame and reads `target.state` each frame for hover, depth and held; it has no hand code.
The core gives each hand one target (the nearest that qualifies), keeps a press or grab through
sideways drift, tracking noise and short dropouts, and releases only on a deliberate retract, pinch
end or when the hand is gone past the grace period. The mouse goes through the same targets.

## Tuning

All thresholds come from the SDK's `DEFAULT_TUNING` (hover distance 5 cm, poke margin 1 cm, pinch
radius 5 cm, ...): override for the app with `createXrb(renderer, { interaction: { tuning: { ... } } })`.
Reachable sizes with the defaults: every poke area is at least 3 cm across (outline + 1 cm margin
each side), pinch handles engage within 5 cm. `TUNING.ease` in `theme.ts` is animation only.

## Tests

`node --test "test/**/*.test.ts"` drives the controls through the core with synthetic scene hands
and mouse rays (a small DOM shim stands in for canvas and audio).

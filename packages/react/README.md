# @xr-build/react (new, opt-in)

React 19.3.1 and React Three Fiber 9.8.2 components **through the SDK**. This package is optional:
vanilla SDK apps, UI Kit and the template do not import React or need migration.

## New mount API

```tsx
import { mountXrbApp } from '@xr-build/react';

const mount = mountXrbApp(document.body, <MyScene />, {
  camera: { position: [0, 0, 6] },
});
await mount.ready;
// Component-only HMR can update the existing tree:
mount.update(<MyScene />);
// Before replacing bootstrap, await the old mount's teardown:
await mount.dispose();
```

`mountXrbApp(container, children, options)` returns an `XrbAppMount`: `app` (the SDK runtime),
`ready`, `update(children)`, and `dispose(): Promise<void>`. It creates/owns the SDK renderer,
runtime and canvas by default. All normal `XrbAppOptions` except setup/frame are accepted;
`autoStart:false` lets the caller start `mount.app` after readiness. A supplied `app` is **borrowed**:
it must be stopped, alive and unattached. Detaching stops it but never disposes its renderer/context;
the owner can explicitly restart it. Do not attach twice or mount into an application component body.

`ready` waits for configuration and component commit; failures roll back. `dispose` stops frames
immediately, retires pending setup, cleans up React effects/root, then releases owned SDK resources,
renderer and canvas. Repeated disposal returns the same promise. Wait for it before replacing a
bootstrap or borrowing the same runtime again. A `StrictMode` wrapper may safely replay component
effects without creating a second SDK runtime. Components must clean up their own external controls,
subscriptions and resources. Fiber disposes declaratively created geometry/materials; external
`primitive` resources remain caller-owned. Persisted pagehide means suspension, not final teardown.

## Frame and rendering ownership

The root uses `createRoot`/`extend`, never `Canvas`. Only the SDK owns `setAnimationLoop`, the scene,
managed camera, output sizing/DPR, stereo eye views, WebXR session and final `xrb.render()` submission.
A component phase runs after fresh SDK hand sampling and before interaction and drawing. Fiber
`useFrame` runs once per SDK frame, not once per eye; its elapsed seconds and delta are SDK-derived
(first/restarted delta is zero). XR frames use the same path. The icon fast path remains SDK-owned.
Legacy SDK frame ordering is unchanged when no component phase is attached.

The bridge suppresses Fiber's default draw and guards renderer size/DPR/render/disposal, colour defaults
and XR callbacks. Fiber's `state.gl` is an observation facade around the **same** renderer, not a second
renderer. Do not use Canvas event managers, render-taking effect composers, camera replacement,
`setSize`/`setDpr`/`setFrameloop`, Fiber XR helpers or raw drawing in components. SDK managed projection
and SDK per-eye sizing are authoritative. Use the SDK context for access to the actual renderer.

## New hooks and event types

- `useXrb()` returns the SDK app, including `app.xrb`, the real `renderer`, `scene` and stable `camera`.
- `useXrbFrame(callback)` receives `XrbAppFrame` once per SDK frame, after fresh hands and before picking/drawing. Animate object refs here; React state commits are scheduled normally.
- `useXrbHands()` returns stable frame-readable getters `current` (processed SDK hands) and `scene` (scene-space hands). Read inside a frame callback; it does not rerender React per joint. Use existing `xrb.on` for discrete gesture subscriptions and clean up the returned unsubscribe function.
- `useXrbPointer(objectRef, handlers)` registers a mesh or recursive group after commit. It retains registration across handler updates and unregisters on removal. Do not register the same object twice.
- `useXrbTarget(targetOrFactory, handler)` owns one existing SDK poke/pinch/grab/volume target registration for its effect lifetime. A factory runs after refs are attached; memoize its identity with `useCallback`. Targets cannot already have another owner. Cleanup releases held capture with `removed` before unsubscribing; handler changes do not cancel capture.

All hooks require the bridge context. `ComponentPointerHandlers` supports `onPointerOver`,
`onPointerOut`, `onPointerMove`, `onPointerDown`, `onPointerUp`, `onPointerCancel`, `onClick` and
`onPointerMissed`. Nearest visible registered mesh wins; hit handlers bubble through registered
ancestors until `stopPropagation()`. A click miss calls registered miss handlers. Only SDK pointer
and click events are consumed, never compatibility mouse duplicates. Physical target capture wins;
emulated-hand echoes and cancelled/retired gestures cannot activate mesh handlers. Legacy DOM events
for OrbitControls are unchanged. Existing SDK Mouse/Hand-pointer policies apply independently.

`ComponentPointerEvent` has `type`, hit `object`, receiving `eventObject`, world `point`, SDK `ray`,
`nativeEvent`, `handId` (null for a real mouse), and `stopPropagation()`. This is **not** Fiber's full
DOM event protocol: no independent raycaster, intersection list, wheel/double-click/context-menu
handlers or Fiber pointer-capture API. Use physical targets for capture-aware spatial controls.
The corresponding new low-level SDK surface is `xrb.componentPointer.add(object, handlers)`, returning
an unregister function; `clear()` retires all registrations. Most apps should use the hooks.

```tsx
function Cube() {
  const mesh = useRef<THREE.Mesh>(null);
  const hands = useXrbHands();
  useXrbFrame(({ timeMs }) => { mesh.current!.rotation.y = timeMs / 1000; });
  useXrbPointer(mesh, { onClick: () => console.log('selected'), onPointerMissed: () => console.log('miss') });
  return <mesh ref={mesh}><boxGeometry /><meshStandardMaterial color="#f08a24" /></mesh>;
}
```

## Source aliases and dependencies

Like the SDK, the entry is TypeScript source: alias `@xr-build/react` to
`<XRB_CORE>/packages/react/src/index.ts`. An opt-in app installs the pinned React, react-dom and Fiber
versions above plus its usual Three/Vite dependencies, with a TSX transform (`@vitejs/plugin-react`).
Use `resolve.dedupe: ['three', 'react', 'react-dom', '@react-three/fiber']` so a core source alias and an
independently installed app share one runtime. Do not add these dependencies to vanilla apps.

This is a component layer, not another runtime. No themes, settings tab, editor or runtime module sharing
is included. Components can accept props and be wrapped in ordinary providers as later features arrive.

## Focused checks

```text
pnpm --filter @xr-build/react check:types
pnpm --filter @xr-build/react test
```

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

# Hello Cube

The existing three-cube sample, rebuilt under the hood as React components with identical appearance
and behavior. It still uses SDK stereo/WebXR/hands, damped OrbitControls, click/pinch selection, its
original geometry/materials/lighting/grid/camera and its standalone 3D icon. No visible UI was added.

- `src/main.tsx`: executable entry, owning one component mount and its pagehide/HMR cleanup.
- `src/index.ts`: side-effect-free public component exports (`HelloCubeScene`, `RotatingCube`, `RotatingCubeProps`).
- `src/icon.ts`: independent icon factory; production still emits `dist/icon.js` beside `dist/index.html`.

Build from the panel, or in Git Bash with an explicit core path:

```bash
XRB_CORE=/absolute/path/to/xrbuild pnpm build
```

Run focused tests with `XRB_CORE` set as well. The core and embedded workspaces install independently
with their owning frozen locks; neither requires the private workspace. Production uses relative assets
(`base: './'`) so nested previews, native app.local and packages retain their original output contract.

## Build-time component reuse

A consumer installs the same pinned React 19/Fiber 9 versions as this app and adds Vite source aliases:

```js
resolve: {
  alias: {
    '@xr-build/sdk': path.join(core, 'packages/sdk/src/index.ts'),
    '@xr-build/react': path.join(core, 'packages/react/src/index.ts'),
    '@sample/hello-cube': path.join(core, 'embedded/projects/archive/hello-cube/src/index.ts'),
  },
  dedupe: ['three', 'react', 'react-dom', '@react-three/fiber'],
}
```

Then mount content inside the consuming app's own SDK runtime:

```tsx
import { mountXrbApp } from '@xr-build/react';
import { HelloCubeScene } from '@sample/hello-cube';

const mount = mountXrbApp(document.body, <HelloCubeScene />, {
  camera: { position: [0, 0, 6], near: 0.05, far: 100, perspectiveFov: 38, orthographicHeight: 6 },
});
await mount.ready;
```

Vite bundles the components and one shared runtime at build time; this is not runtime module sharing
or a separate distributed library build. Importing `src/index.ts` does not create a renderer, app or session.
`RotatingCube` takes `index` (0, 1 or 2) and optional `selected`; `HelloCubeScene` includes the original
scene, controls and selection behavior. For only a cube, import that smaller component.

Hello Cube explicitly selects the SDK's whole-canvas camera-ray compatibility policy. Its original
click code used that policy even in stereo; this migration preserves it rather than changing selection.
New apps/controls should use the bridge's normal SDK per-eye picking. All events still pass through
SDK picking/capture; there is no app-owned second raycaster or duplicate Fiber DOM event manager.

See the [new bridge API](../../../../packages/react/README.md) for frame/hands/input hooks, resource
ownership, Strict Mode and HMR. Themes, UI Kit components and settings are later work.

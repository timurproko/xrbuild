# Apps are runnable scenes and component libraries

New projects, UI Kit, Launcher and Hello Cube have two entries:

| Entry | Responsibility |
| --- | --- |
| `src/main.tsx` | Mount the app, select its SDK options, own pagehide/HMR teardown |
| `src/index.ts` | Export components and props, with no bootstrap, timer, network or device side effects |
| `src/icon.js` or `src/icon.ts` | Preserve the existing independent 3D icon export |

A public entry must not import the run entry, global CSS/bootstrap or code that mounts on import. Construct disposable objects in committed effects or declarative scene elements, not module scope or abandoned render initializers. Each mounted instance owns its values and resources. Use ordinary props and providers for composition; this change adds no app-settings registry, persistence or control-panel tab.

## Importing another app

UI Kit's public app entry exports `UiKitScene` plus its React controls. Launcher is a real consumer:

```tsx
import { Board, Button, Dialog, Label } from '@xr-build/ui-kit-app';
```

The template exports `AppScene` and `AppSceneProps`; another app can compose it inside its own SDK root:

```tsx
import { mountXrbApp } from '@xr-build/react';
import { AppScene } from '@scene/text-app';

const mount = mountXrbApp(document.body, <AppScene title="Composed scene" />);
await mount.ready;
// On final departure, await mount.dispose().
```

Configure Vite source aliases. Retain the React plugin and `base: './'` from the template. Resolve optional subpaths before the imperative root:

```js
const source = (name) => path.join(core, 'packages', name, 'src', 'index.ts');
resolve: {
  alias: {
    '@xr-build/ui-kit/react': path.join(core, 'packages/ui-kit/src/react/index.ts'),
    '@xr-build/ui-kit-app': path.join(core, 'embedded/projects/core/ui-kit/src/index.ts'),
    '@xr-build/react': source('react'),
    '@xr-build/sdk': source('sdk'),
    '@xr-build/ui-kit': source('ui-kit'),
    '@scene/text-app': path.join(selectedApp, 'src/index.ts'),
  },
  dedupe: ['three', 'react', 'react-dom', '@react-three/fiber', 'lucide'],
}
```

`core` is selected by `XRB_CORE`; `selectedApp` is an explicitly selected source path in the consuming project. Add external source roots to Vite's development filesystem allowlist when necessary. Apps install the owning pinned React/Fiber/JSX dependencies; they do not enroll another workspace into the core package graph. When importing UI Kit's app entry, also declare `lucide` (`1.54.0`) in the consumer and dedupe it as above: source-aliasing an app does not install the producer's dependencies, and its public barrel resolves the showcase's icon imports even when only controls are selected. Use frozen locks for reproducible installed workspaces.

Vite bundles those sources into the consumer. There are no remote React components, runtime import maps, shared module servers or extra renderers. The existing runtime loading of standalone app icons remains unchanged; it is not component-module sharing. Importing a library must succeed without a DOM or device. App-specific assets and icon/theme JSON stay relative to their source modules and retain required notices.

Full exported scenes include their authored lights/background. When composing several full scenes, the consuming app should deliberately choose their environment/composition rather than treating each as a separate application. Smaller controls and card components can be reused without their app bootstrap.

## UI Kit ownership and input

`@xr-build/ui-kit` still exports imperative classes without React. `@xr-build/ui-kit/react` exports Board, Button, Switch, Segmented, Slider, Dial, Trackball, Dialog, Label, Icon and GlassEdge. See the [UI Kit props/refs guide](../packages/ui-kit/README.md#react-components-optional).

Adapters reuse the existing control state machines. The SDK remains the only target arbiter, mouse binder, hand pipeline, camera/resize owner and final renderer. Controls update once per SDK frame, not per eye; Dialog owns its Close button. Callback changes do not cancel capture. Unmount removes subscriptions and cancels held targets before disposing owned resources; borrowed maps/children and the SDK renderer survive. No compatibility mouse echo is registered as another component click.

Constructor options are stable for an instance; use a React key for intentional reconstruction. Mutable transforms, enabled/visible state, documented setters and event handlers update in place. A ref exposes the existing control, including dialog open/close and trackball axis. The Interactable showcase still disables controls immediately at the SDK boundary, while React keeps the declared state coherent.

Default geometry/material builders are separated from target and interaction behavior. A later theme can supply different mesh shapes/materials/colours at the construction boundary through React context; no selectable theme, provider, alternate shape or global mutable style is implemented here.

## Checking a migration

Preserve camera/frustum, lighting, geometry/material flags, animation timestamps/deltas, input policy, relative output and icon behavior. Check both native Mouse and replayed hands, including Mouse disabled and off-centre stereo operation. Physical capture must not also fire an emulated component click. Use the SDK's frame/input hooks, never a second Canvas event manager or animation loop.

Before/after proof uses fixed viewport, camera, clock and deterministic catalog/assets. Deterministic views require byte equality. Any renderer-noise tolerance must be measured against repeated unchanged baselines, bounded, confined to edge/antialias noise and documented; shifted, missing or recoloured elements are regressions. Actual hardware acceptance is separate from deterministic browser/host/hand fixtures.

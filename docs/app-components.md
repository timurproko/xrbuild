# Apps are runnable scenes and component libraries

New projects, UI Kit, Launcher and Hello Cube have two entries:

| Entry | Responsibility |
| --- | --- |
| `src/main.tsx` | Mount the app, select its SDK options, own pagehide/HMR teardown |
| `src/index.ts` | Export components and props, with no bootstrap, timer, network or device side effects |
| `src/icon.js` or `src/icon.ts` | Preserve the existing independent 3D icon export |

A public entry must not import the run entry, global CSS/bootstrap or code that mounts on import. Construct disposable objects in committed effects or declarative scene elements, not module scope or abandoned render initializers. Each mounted instance owns its values and resources. Use ordinary props and providers for composition. Apps can optionally declare exposed library parameters for per-project control-panel settings as described below.

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
    '@xr-build/ui-kit/theme-choices': path.join(core, 'packages/ui-kit/src/theme-choices.ts'),
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

Constructor options are stable for an instance; use a React key for intentional reconstruction, never for a theme change. Mutable transforms, enabled/visible state, documented setters and event handlers update in place. A ref exposes the existing control, including dialog open/close and trackball axis. The Interactable showcase still disables controls immediately at the SDK boundary, while React keeps the declared state coherent.

## Mesh themes and app defaults

UI Kit supplies `default` (the unchanged rounded reference) and `accent` (solid accent bodies with soft fillets and a satin finish), covering every control, variant and primitive. Their layouts, target/contact bounds, timing, sounds and interaction traces are identical. Only visuals differ. See the [theme contract and selection guide](../packages/ui-kit/README.md#visual-theme-contract).

Each UI Kit-consuming app exports a plain, side-effect-free `uiKitTheme` declaration with `defaultTheme: 'default'` from its public entry. This remains a default ID; the separate manifest declaration below identifies exposed parameters and consumers. The app's run entry uses the same scene boundary as composition:

```tsx
import { UiKitThemeProvider } from '@xr-build/ui-kit-app';
import { LauncherScene, uiKitTheme } from '@scene/launcher';

// Use the app-declared default when there is no surrounding selection.
<LauncherScene />;
// A controlled prop selects a style for this app only.
<LauncherScene theme="accent" />;
// A surrounding consumer can select all inheriting UI Kit components.
<UiKitThemeProvider theme="accent"><LauncherScene /></UiKitThemeProvider>;
```

`UiKitSceneProps` and `LauncherSceneProps` accept an optional theme ID or complete immutable definition. Resolution is explicit control override, nearest explicit scene/provider choice, inherited choice, app-declared fallback, then library Default. A scene's fallback never masks a surrounding explicit provider. Runtime updates use the existing mount's `update` with the same component type, not a new key or SDK runtime. They retain values, capture, modal/axis state and Launcher's catalog/page/accepted navigation deadline while replacing only owned visuals. The optional Settings tab drives this existing prop/provider without changing rendering ownership.

Theme-owned geometry can change, so construction-time mesh mutations are not a persistent theme override. Stable control hosts, explicit supported visual options and borrowed maps/children retain their ownership. Standalone app icons and app-specific branding/environment remain unchanged.

## Exposed component parameters

Libraries declare optional `componentLibrary.parameters` in `xrb-project.json`. Each choice has `type: 'choice'`, `label`, `options: [{ value, label }]` and `default`. The graphics-free `ComponentLibrary` / `ComponentMetadata` SDK types let authors check the same plain declaration in public code. UI Kit exports its typed `componentLibrary`; its manifest declaration is checked against registered theme metadata. That graphics-free metadata is available through the core-resolved `@xr-build/ui-kit/theme-choices` alias above, so relocated embedded app sources never traverse back into an assumed checkout layout.

Consumers explicitly declare origin-qualified library identities and parameter-to-scene-prop bindings:

```json
{
  "componentLibraries": {
    "bundled:ui-kit": {
      "props": { "theme": "theme" },
      "defaults": { "theme": "default" }
    }
  }
}
```

The per-app **Settings** tab appears as the last tab only for consumers of exposed parameters. A library app can consume its own parameters: UI Kit does, so its Settings tab chooses the theme it shows when it runs. Fields are grouped by library and autosave through the normal project settings writer/API. Choices live in the consuming manifest's `componentSettings`, keyed by library identity and parameter, including user-owned effective settings for bundled apps. Saved values override consumer defaults, which override library defaults; other consumers and installed library sources are unchanged. If a referenced library is missing or archived, its fields are omitted without extra UI. Unrelated saves preserve its unchanged reference, defaults and saved selections; new selections or changed unavailable declarations are rejected until the library resolves again.

Discovery reads data only: no app entry executes, and a `workspace:` library never silently resolves to a `bundled:` library. Another library or choice parameter needs only declarations, not library-specific panel code. Existing source aliases still determine which components are bundled.

A runnable consumer can use `connectComponentSettings(metadata)` from the SDK and pass `settings.props` to its existing scene, subscribe with `mount.update`, then dispose the connection with its mount. The metadata contains the declaration and optional saved build snapshot; it is not another render owner. Launcher compiles these fields from its manifest in Vite rather than importing the writable JSON into its module graph, so an ordinary settings save does not trigger a development reload.

Managed native built/dev runs and browser built/dev previews read current values using their existing project/run or preview token/session/route identity. A small serial read polls once per second, only while subscribed, retains the last good values during a transient disconnect and stops on retired scope or teardown. A saved Theme edit updates the same Launcher mount and scene prop. Existing bundled-project idle/lease restrictions are unchanged: if normal settings cannot save while that project runs, stop, save and start again. Unmanaged standalone/published/packages have no live panel connection and use the saved snapshot compiled by their next build/package, or their declared defaults when no snapshot exists. No query theme selector or automatic device/service startup is added.

## Checking a migration

Preserve camera/frustum, lighting, geometry/material flags, animation timestamps/deltas, input policy, relative output and icon behavior. Check both native Mouse and replayed hands, including Mouse disabled and off-centre stereo operation. Physical capture must not also fire an emulated component click. Use the SDK's frame/input hooks, never a second Canvas event manager or animation loop.

Before/after proof uses fixed viewport, camera, clock and deterministic catalog/assets. Deterministic views require byte equality. Any renderer-noise tolerance must be measured against repeated unchanged baselines, bounded, confined to edge/antialias noise and documented; shifted, missing or recoloured elements are regressions. Actual hardware acceptance is separate from deterministic browser/host/hand fixtures.

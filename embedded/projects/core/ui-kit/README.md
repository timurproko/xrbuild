# UI kit showcase

Authored spatial UI controls and icon, consuming the core SDK/UI kit directly through `XRB_CORE`. Mouse interaction works without optional hardware; compatible hand input is an explicit user choice. The product manifest defaults to desktop/no input and contains no deployment, package/signing identity or machine settings.

The run entry is `src/main.tsx`; `src/index.ts` exports `UiKitScene` and the React controls without mounting anything. The standalone icon entry remains `src/icon.ts`. Launcher aliases `@xr-build/ui-kit-app` to this public entry and bundles its controls into its own SDK runtime:

```tsx
import { Board, Button, Dialog, Label } from '@xr-build/ui-kit-app';
```

A consumer aliases the UI Kit React subpath before the imperative package root and deduplicates Three, React, React DOM and Fiber, as in this app's Vite config. Do not import `main.tsx` from another app. See the [component guide](../../../../packages/ui-kit/README.md#react-components-optional) for props, refs and ownership. Colours and mesh defaults remain unchanged; themes and exposed settings are future work.

Build through the frozen embedded lane. Ordinary panel Rebuild writes user cache, never this source tree. Copy to workspace before editing, publishing or packaging. Web manifest/icon resources are included in the build without enabling publication or requesting a headset/camera session. Optional device use and physical accuracy are separate acceptance steps.

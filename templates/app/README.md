# Component app

Run through the XR Build panel, or set `XRB_CORE` to the core checkout and run `pnpm install`, then `pnpm dev` or `pnpm build`.

- `src/main.tsx` starts the SDK-hosted React tree and owns pagehide/HMR cleanup.
- `src/index.ts` exports `AppScene` and its props without running the app.
- `src/scene.tsx` contains the reusable text/ring scene; its optional `title` prop is local to each instance.
- `src/icon.js` remains the standalone 3D icon export, emitted as `dist/icon.js`. Keep the font notice and icon-theme assets.

To reuse this app in another component app, add a Vite source alias to its public entry (an example absolute path belongs only in the consumer's local configuration):

```js
resolve: {
  alias: {
    // Retain the SDK/React/UI Kit aliases from this template too.
    '@scene/text-app': '/absolute/path/to/text-app/src/index.ts',
  },
  dedupe: ['three', 'react', 'react-dom', '@react-three/fiber'],
}
```

```tsx
import { AppScene } from '@scene/text-app';
// Inside the consumer's mountXrbApp tree:
<AppScene title="Another scene" />
```

Vite bundles these components into the consuming app; do not import `main.tsx` or share a remote React runtime. The consumer owns its renderer, camera, input and final drawing. Components release their own resources. Keep constructor assets/relative URLs portable. Ordinary props/providers allow future composition; no exposed-settings registry or UI Kit theme selector is included.

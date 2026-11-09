import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// The SDK comes straight from the XR Build core's sources: the panel sets XRB_CORE when it runs this
// app's scripts (in a plain terminal, set it to the core repo yourself).
const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is not set: run this app from the XR Build panel, or set XRB_CORE to the XR Build core repo');
const sdk = (pkg) => path.join(core, 'packages', pkg, 'src', 'index.ts');

// The app icon (icon.png, set in the panel's icon menu) ships as dist/icon.png for the web manifest; one copy.
// Without one (the panel's default icon) there is nothing to ship.
const appIcon = { name: 'app-icon', generateBundle() { if (fs.existsSync('icon.png')) this.emitFile({ type: 'asset', fileName: 'icon.png', source: fs.readFileSync('icon.png') }); } };

// base './': the build is served from https://app.local/ by xrb-host (and later from a package).
export default defineConfig({
  plugins: [appIcon],
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), core] } }, base: './', resolve: { alias: { '@xr-build/sdk': sdk('sdk'), '@xr-build/ui-kit': sdk('ui-kit') }, dedupe: ['three'] },
  build: {
    rollupOptions: {
      // The 3D icon is a second entry, emitted as dist/icon.js with its export kept, so a launcher can import it.
      input: { main: 'index.html', icon: 'src/icon.ts' },
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: (chunk) => (chunk.name === 'icon' ? 'icon.js' : 'assets/[name]-[hash].js') },
    },
  },
});

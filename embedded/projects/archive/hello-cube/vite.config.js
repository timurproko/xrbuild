import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// The SDK comes straight from the XR Build core's sources: the panel sets XRB_CORE when it runs this
// app's scripts (in a plain terminal, set it to the core repo yourself).
const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is not set: run this app from the XR Build panel, or set XRB_CORE to the XR Build core repo');
const sdk = (pkg) => path.join(core, 'packages', pkg, 'src', 'index.ts');

// base './': the build is served from https://app.local/ by xrb-host (and later from a package).
export default defineConfig({
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), core] } },
  resolve: { alias: { '@xr-build/sdk': sdk('sdk'), '@xr-build/ui-kit': sdk('ui-kit') }, dedupe: ['three'] }, base: './',
  build: {
    rollupOptions: {
      // The 3D icon is a second entry, emitted as dist/icon.js with its export kept, so a launcher can import it.
      input: { main: 'index.html', icon: 'src/icon.ts' },
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: (chunk) => (chunk.name === 'icon' ? 'icon.js' : 'assets/[name]-[hash].js') },
    },
  },
});

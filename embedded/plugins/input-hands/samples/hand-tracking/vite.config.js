import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// A recording contribution, not another page or dev camera laboratory.
export default defineConfig({
  build: {
    lib: { entry: fileURLToPath(new URL('./browser.mjs', import.meta.url)), formats: ['es'], fileName: () => 'recordings.mjs' },
    outDir: 'dist', emptyOutDir: true,
  },
});

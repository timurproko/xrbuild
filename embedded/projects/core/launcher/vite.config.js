import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is required: build through the selected XR Build core');
const source = (pkg) => path.join(core, 'packages', pkg, 'src', 'index.ts');
const PUBLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLICATION_SLUG = /^(?:|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;
function launcherPublicationIdentity() {
  const manifest = JSON.parse(fs.readFileSync('xrb-project.json', 'utf8'));
  if (!manifest.publication?.enabled) return { id: null, slug: null };
  const { id, slug } = manifest.publication;
  if (typeof id !== 'string' || !PUBLICATION_ID.test(id)) throw new Error('The launcher publication ID is invalid.');
  if (typeof slug !== 'string' || !PUBLICATION_SLUG.test(slug) || slug.includes('--')) throw new Error('The launcher publication slug is invalid.');
  return { id, slug };
}
const appIcon = { name: 'app-icon', generateBundle() {
  if (fs.existsSync('icon.png')) this.emitFile({ type: 'asset', fileName: 'icon.png', source: fs.readFileSync('icon.png') });
} };
export default defineConfig(() => {
  const publication = launcherPublicationIdentity();
  return {
    base: './', plugins: [appIcon],
    // No sibling-project traversal, private workspace lookup or implicit deployment origin.
    define: {
      'import.meta.env.VITE_XRB_LOCAL_PUBLICATIONS': JSON.stringify({}),
      'import.meta.env.VITE_XRB_PUBLICATION_ID': JSON.stringify(publication.id),
      'import.meta.env.VITE_XRB_PUBLICATION_SLUG': JSON.stringify(publication.slug),
    },
    resolve: { alias: { '@xr-build/sdk': source('sdk'), '@xr-build/ui-kit': source('ui-kit') }, dedupe: ['three'] },
    build: { rollupOptions: {
      input: { main: 'index.html', icon: 'src/icon.js' }, preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: (chunk) => chunk.name === 'icon' ? 'icon.js' : 'assets/[name]-[hash].js' },
    } },
  };
});

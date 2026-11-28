import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'vite';
import configFactory from '../vite.config.js';
const config = configFactory();

const sampleRoot = fileURLToPath(new URL('../', import.meta.url));

test('production app keeps relative assets/icon entry and import-only consumer bundles components without bootstrapping', async (t) => {
  const scratch = process.env.XRB_TEST_ROOT ?? path.join(process.env.XRB_CORE, '.artifacts');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'launcher-component-build-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  await build({ ...config, configFile: false, root: sampleRoot, logLevel: 'silent',
    build: { ...config.build, outDir: app } });
  const html = await fs.readFile(path.join(app, 'index.html'), 'utf8');
  assert.match(html, /src="\.\/assets\//);
  assert.ok((await fs.readFile(path.join(app, 'icon.js'), 'utf8')).includes('default'));
  const icon = await import(pathToFileURL(path.join(app, 'icon.js')).href);
  assert.equal(typeof icon.default, 'function');
  assert.equal(icon.default().isObject3D, true);

  const entry = path.join(root, 'consumer.ts');
  await fs.writeFile(entry, "export { LauncherScene, LauncherCard } from '@fixture/hello-components';");
  const consumer = path.join(root, 'consumer');
  await build({ configFile: false, root: sampleRoot, logLevel: 'silent', plugins: config.plugins,
    define: { ...config.define, 'process.env.NODE_ENV': '"production"' },
    resolve: { ...config.resolve, alias: { ...config.resolve.alias, '@fixture/hello-components': path.join(sampleRoot, 'src/index.ts') } },
    build: { target: 'es2022', outDir: consumer, lib: { entry, formats: ['es'], fileName: () => 'components.mjs' } } });
  // No document, canvas or XR system exists in this Node process. Importing the
  // actual bundled public entry must succeed without running app bootstrap.
  const library = await import(pathToFileURL(path.join(consumer, 'components.mjs')).href);
  assert.deepEqual(Object.keys(library).sort(), ['LauncherCard', 'LauncherScene']);
  assert.equal(typeof library.LauncherScene, 'function');
  assert.equal(typeof library.LauncherCard, 'function');
});

test('source-aliased UI Kit builds without an installed producer app', async (t) => {
  const scratch = process.env.XRB_TEST_ROOT ?? path.join(process.env.XRB_CORE, '.artifacts');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'launcher-cold-producer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const producer = path.join(root, 'producer/src');
  await fs.cp(path.join(process.env.XRB_CORE, 'embedded/projects/core/ui-kit/src'), producer, { recursive: true });
  const modules = [];
  await build({ ...config, configFile: false, root: sampleRoot, logLevel: 'silent',
    plugins: [...config.plugins, { name: 'consumer-dependency-proof', moduleParsed(module) { modules.push(module.id.replaceAll('\\', '/')); } }],
    resolve: { ...config.resolve, alias: { ...config.resolve.alias, '@xr-build/ui-kit-app': path.join(producer, 'index.ts') } },
    build: { ...config.build, outDir: path.join(root, 'output') } });
  assert.ok(modules.some(id => id.endsWith('/producer/src/scene.tsx')), 'resolve the real public barrel, not a control-only stub');
  assert.ok(modules.some(id => id.includes('/node_modules/lucide/')), 'bundle the consumer-owned icon dependency');
});

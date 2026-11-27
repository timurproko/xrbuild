import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'vite';
import config from '../vite.config.js';

const sampleRoot = fileURLToPath(new URL('../', import.meta.url));

test('production app keeps relative assets/icon entry and import-only consumer bundles components without bootstrapping', async (t) => {
  const scratch = process.env.XRB_TEST_ROOT ?? path.join(process.env.XRB_CORE, '.artifacts');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'ui-kit-component-build-'));
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

  const vanillaEntry = path.join(root, 'imperative.ts');
  await fs.writeFile(vanillaEntry, "export { Button, Slider } from '@xr-build/ui-kit';");
  const modules = [];
  await build({ configFile: false, root: sampleRoot, logLevel: 'silent', resolve: config.resolve,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'imperative-dependency-boundary', moduleParsed(module) { modules.push(module.id.replaceAll('\\', '/')); } }],
    build: { target: 'es2022', outDir: path.join(root, 'imperative'), lib: { entry: vanillaEntry, formats: ['es'], fileName: () => 'controls.mjs' } } });
  assert.ok(!modules.some(id => /\/(?:react|react-dom|@react-three\/fiber)\//.test(id) || id.includes('/packages/react/')), 'imperative imports must not enroll React');

  const entry = path.join(root, 'consumer.ts');
  await fs.writeFile(entry, "export { UiKitScene, Board, Button, Slider } from '@fixture/hello-components';");
  const consumer = path.join(root, 'consumer');
  await build({ configFile: false, root: sampleRoot, logLevel: 'silent', plugins: config.plugins,
    define: { 'process.env.NODE_ENV': '"production"' },
    resolve: { ...config.resolve, alias: { ...config.resolve.alias, '@fixture/hello-components': path.join(sampleRoot, 'src/index.ts') } },
    build: { target: 'es2022', outDir: consumer, lib: { entry, formats: ['es'], fileName: () => 'components.mjs' } } });
  // No document, canvas or XR system exists in this Node process. Importing the
  // actual bundled public entry must succeed without running app bootstrap.
  const library = await import(pathToFileURL(path.join(consumer, 'components.mjs')).href);
  assert.deepEqual(Object.keys(library).sort(), ['Board', 'Button', 'Slider', 'UiKitScene']);
  assert.equal(typeof library.UiKitScene, 'function');
  assert.equal(typeof library.Button, 'function');
});

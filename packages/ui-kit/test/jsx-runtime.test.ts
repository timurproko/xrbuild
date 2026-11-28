// The React sources are consumed as source by apps in other workspaces (plugin CI runs the embedded apps' tests
// outside this repository), where the repository's tsconfig and its "jsx": "react-jsx" setting do not apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const reactSource = fileURLToPath(new URL('../src/react/', import.meta.url));

test('every React source declares the automatic JSX runtime', async () => {
  const files = (await readdir(reactSource)).filter(name => name.endsWith('.tsx'));
  assert.ok(files.length > 0);
  for (const name of files) {
    assert.match(await readFile(join(reactSource, name), 'utf8'), /^\/\*\* @jsxRuntime automatic \*\//, name);
  }
});

test('the theme provider renders when compiled outside the repository tsconfig', async () => {
  const require = createRequire(new URL('../../react/package.json', import.meta.url));
  const tsx = join(require.resolve('tsx/package.json'), '..', 'dist', 'cli.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'xrb-jsx-'));
  try {
    await writeFile(join(dir, 'render.mjs'), [
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../../react/package.json', import.meta.url))).href)});`,
      `const React = require('react'); const { renderToString } = require('react-dom/server');`,
      `const { UiKitThemeProvider } = await import(${JSON.stringify(pathToFileURL(join(reactSource, 'theme.tsx')).href)});`,
      `process.stdout.write(renderToString(React.createElement(UiKitThemeProvider, {}, 'rendered')));`,
    ].join('\n'));
    const output = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [tsx, 'render.mjs'], { cwd: dir }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout));
    });
    assert.equal(output, 'rendered');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

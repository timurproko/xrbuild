import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer } from '../src/server.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('published host app uses Unpublish and locked destination across stale package-specific metadata', { skip: !process.env.XRB_TEST_BROWSER, timeout: 40000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../../..'), artifacts = path.join(root, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(artifacts, 'publication-ui-'));
  const project = path.join(workspace, 'projects/Apps/sample');
  await fs.mkdir(path.join(project, 'dist'), { recursive: true });
  const manifest = { name: 'Sample', kind: 'app', entry: 'dist', target: 'host', platform: 'station-fixture',
    publication: { enabled: true, publisher: 'fixture', id: '55555555-5555-4555-8555-555555555555', slug: 'sample' } };
  await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(project, 'dist/index.html'), '<title>Sample</title>');
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const panel = createServer({ repo: root, workspace, port });
  let state: 'published' | 'unpublished' | 'failed' | 'pending' = 'published', removals = 0;
  panel.panel.awaitPublicationStatus = true;
  panel.panel.publicationStatusMaxAgeMs = 0;
  panel.panel.publishers = { found: [{ dir: workspace, publisher: {
    name: 'fixture', origin: 'https://example.test', routePrefix: 'apps', validate: () => [],
    status: async () => ({ state, selectedUrl: '', deployedSlug: 'sample', ...(state === 'published' || state === 'failed' ? { deployedUrl: 'https://example.test/apps/sample/' } : {}) }),
    publish: async () => { state = 'published'; return {}; },
    unpublish: async () => { state = 'unpublished'; removals++; return {}; },
  } }], problems: [] };
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  try {
    assert.equal((await fetch(`${panel.url}preview/sample/`)).status, 200);
    await withBrowser(async ({ send, evaluate, navigate }) => {
      // Reproduce the original mismatch as well as checking the corrected backend independently.
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `const originalFetch=window.fetch;window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).endsWith('/api/projects')){const data=await response.clone().json();for(const p of data.projects)p.publication={...p.publication,available:false,status:null};return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});}if(/\\/(publish|unpublish)$/.test(String(args[0])))await new Promise(resolve=>setTimeout(resolve,150));return response;};` });
      const until = async (expression: string) => { for (let i=0;i<60;i++) { if(await evaluate(expression))return;await sleep(100); } assert.fail(expression + '\n' + await evaluate(`document.querySelector('#detail').innerText`)); };
      const show = async () => { await navigate(panel.url, `!!document.querySelector('[data-surface="publish"]') && !document.body.classList.contains('workspace-pending')`);await sleep(150);await evaluate(`document.querySelector('[data-surface="publish"]').click()`); };
      const fields = () => evaluate(`({slug:document.querySelector('[name="publication.slug"]').readOnly,publisher:document.querySelector('[name="publication.publisher"]').closest('.dropdown').querySelector('button').disabled})`);
      await show(); await until(`!!document.querySelector('#act-unpublish:not(:disabled)')`);
      assert.deepEqual(await fields(), { slug: true, publisher: false }, 'the deployed slug is read-only while another destination stays selectable');
      assert.equal(await evaluate(`document.querySelector('.publication-hero-link').href`), 'https://example.test/apps/sample/');
      await evaluate(`document.querySelector('#act-unpublish').click()`);
      await until(`document.querySelector('#ask').open`);
      assert.equal(removals, 0, 'no unpublish before confirmation');
      await evaluate(`document.querySelector('#ask-ok').click()`);
      await until(`!!document.querySelector('#act-publish:not(:disabled)')`);
      await sleep(250);
      assert.equal(await evaluate(`!!document.querySelector('#act-publish:not(:disabled)')`), true, 'late HTTP response cannot restore a running unpublish');
      assert.equal(removals, 1);
      assert.deepEqual(await fields(), { slug: false, publisher: false });
      await evaluate(`document.querySelector('#act-publish').click()`);
      await until(`!!document.querySelector('#act-unpublish:not(:disabled)')`);
      assert.deepEqual(await fields(), { slug: true, publisher: false }, 'the deployed slug is read-only while another destination stays selectable');
      await sleep(250);
      assert.equal(await evaluate(`!!document.querySelector('#act-unpublish:not(:disabled)')`), true, 'late HTTP response cannot restore a running publish');
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(project, 'xrb-project.json'), 'utf8')), manifest);
      state = 'failed'; await show(); await until(`!!document.querySelector('#act-unpublish:not(:disabled)')`);
      assert.deepEqual(await fields(), { slug: true, publisher: false }, 'failed-but-deployed keeps the slug locked and remains removable');
      state = 'pending'; await show(); await until(`!!document.querySelector('#act-publish:disabled')`);
      assert.equal(await evaluate(`document.querySelector('[name="publication.slug"]').disabled`), true);
    });
  } finally { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

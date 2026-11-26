import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { rebuildPresentation } from '../ui/rebuild-dialog.js';
import { updateRebuildChip } from '../ui/design-system.js';
import { withBrowser } from './browser-fixture.ts';

test('component refresh uses the existing Rebuild concept and truthful header state', () => {
  const chip = { className: '', textContent: '', hidden: true };
  assert.equal(updateRebuildChip(chip, { exists: true, outdated: false, componentsNeedRebuild: true }), true);
  assert.equal(chip.textContent, 'rebuild needed'); assert.equal(chip.hidden, false);
  assert.equal(rebuildPresentation({ kind: 'run', state: 'running', lines: ['Rebuild: preparing application components…'] }).message, 'Rebuild: preparing application components…');
  const restart = rebuildPresentation({ kind: 'run', state: 'failed', error: 'Restart the panel to load changed code.', result: { restart: true }, lines: [] });
  assert.equal(restart.title, 'Restart needed'); assert.equal(restart.succeeded, false);
});

test('shared progress offers Retry or Restart in place, preserving failed output', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const files = new Map(await Promise.all(['rebuild-dialog.js', 'job-log.js', 'design-system.js', 'scrollbars.js', 'workspace-layout.js'].map(async name => [name, await fs.readFile(path.resolve(import.meta.dirname, '../ui', name), 'utf8')] as const)));
  const server = createServer((req, res) => {
    const name = req.url!.slice(1);
    res.setHeader('content-type', name ? 'text/javascript' : 'text/html');
    res.end(!name ? '<html><body></body></html>' : files.get(name) ?? 'export async function desktopSetupBeforeRebuild(){return true;}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await withBrowser(async browser => {
      await browser.navigate(origin, 'document.body');
      await browser.evaluate(`(async()=>{
        const {rebuildProgressDialog}=await import('/rebuild-dialog.js');
        window.progress=rebuildProgressDialog();
        progress.setRecovery({retry:()=>document.body.dataset.retried='yes',restart:()=>document.body.dataset.restarted='yes'});
        progress.show({id:1,kind:'run',state:'failed',error:'Download failed; retry Run.',lines:['Rebuild: preparing application components…','download failed']});
      })()`);
      assert.equal(await browser.evaluate("document.querySelector('[data-xrb-rebuild-retry]').hidden"), false);
      assert.equal(await browser.evaluate("document.querySelector('[data-xrb-rebuild-restart]').hidden"), true);
      assert.match(await browser.evaluate("document.querySelector('[data-xrb-rebuild-output]').textContent"), /download failed/);
      await browser.evaluate("document.querySelector('[data-xrb-rebuild-retry]').click()");
      assert.equal(await browser.evaluate('document.body.dataset.retried'), 'yes');
      await browser.evaluate("progress.render({id:1,kind:'run',state:'failed',error:'Restart the panel to load changed code.',result:{restart:true},lines:['changed loaded code']})");
      assert.equal(await browser.evaluate("document.querySelector('[data-xrb-rebuild-retry]').hidden"), true);
      assert.equal(await browser.evaluate("document.querySelector('[data-xrb-rebuild-restart]').hidden"), false);
      await browser.evaluate("document.querySelector('[data-xrb-rebuild-restart]').click()");
      assert.equal(await browser.evaluate('document.body.dataset.restarted'), 'yes');
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

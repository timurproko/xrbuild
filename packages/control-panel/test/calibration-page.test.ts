import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { navigationItems, managedToolDestination } from '../ui/navigation.js';
import { validateToolLinks } from '../src/navigation.ts';
import { withBrowser } from './browser-fixture.ts';

const parent = process.env.XRB_TEST_ROOT ?? path.resolve(REPO, '.artifacts');
async function fixture(disabled: boolean, run: (base: string, root: string, app: ReturnType<typeof createServer>) => Promise<void>) {
  await fs.mkdir(parent, { recursive: true }); const root = await fs.mkdtemp(path.join(parent, 'calibration-')), port = await freePort();
  if (disabled) await fs.writeFile(path.join(root, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
  const app = createServer({ repo: REPO, workspace: root, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${port}`, root, app); } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
}
test('Calibration is a reserved core module, not an optional or old laboratory route', async () => {
  const items = navigationItems('http://127.0.0.1:5180', [], 'calibration');
  assert.equal(items.find(i => i.id === 'calibration')?.current, true);
  assert.equal(items.find(i => i.id === 'calibration')?.href, 'http://127.0.0.1:5180/calibration/');
  assert.throws(() => managedToolDestination('/calibration/', 'http://127.0.0.1:5180'));
  assert.throws(() => validateToolLinks({ tools: [{ id: 'calibration', label: 'Other', route: '/other/', module: 'other.mjs' }] }));
  await fixture(false, async (base, root, app) => {
    const page = await fetch(base + '/calibration/'); assert.equal(page.status, 200); assert.match(await page.text(), /Camera B → A transform/);
    const status = await fetch(base + '/api/calibration').then(r => r.json());
    assert.equal(status.available, true, status.reason); assert.equal(status.capture.available, false); assert.match(status.capture.reason, /Native bridge/);
    assert.equal((await fetch(base + status.module)).status, 200);
    for (const file of ['src/main.ts', 'src/live/estimator.ts', 'src/live/multiview/fusion.ts', '../bridge/server.mjs']) assert.equal((await fetch(base + '/calibration/tools/' + file)).status, 404);
    for (const route of ['/hands-diagnostics/', '/hand-tracking/']) assert.equal((await fetch(base + route)).status, 404);
    const prefs = await fetch(base + '/api/calibration/preferences').then(r => r.json()); assert.deepEqual(prefs.values, {});
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/); assert.equal(app.panel.jobs.list().length, 0); assert.equal(app.panel.runner.busy, false);
  });
});
test('missing calibration contribution does not remove the page or silently start setup', async () => {
  await fixture(true, async (base, root) => {
    const status = await fetch(base + '/api/calibration').then(r => r.json()); assert.equal(status.available, false); assert.match(status.reason, /not installed/);
    assert.equal((await fetch(base + '/calibration/')).status, 200); await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/);
  });
});
test('Calibration browser opens passively in existing panel styles', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  await fixture(false, async (base, root) => withBrowser(async browser => {
    await browser.navigate(base + '/calibration/', "document.querySelector('#calibration-root')?.hidden === false");
    assert.equal(await browser.evaluate("document.querySelector('#cal-connect').disabled"), true);
    assert.match(await browser.evaluate("document.querySelector('#calibration-availability').textContent"), /Native bridge/);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await browser.evaluate("document.querySelector('#calibration-menu-button').click()");
    assert.equal(await browser.evaluate("document.querySelector('[data-navigation=calibration]').getAttribute('aria-current')"), 'page');
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(parent, 'calibration-default.png'), Buffer.from(shot.data, 'base64'));
    await fs.writeFile(path.join(parent, 'calibration-default-dimensions.json'), JSON.stringify(await browser.evaluate('({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio})')));
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/);
  }));
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser } from './browser-fixture.ts';

test('Calibration uses shared loading, aligned controls and no purpose copy', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const parent = process.env.XRB_TEST_ROOT ?? path.join(REPO, '.artifacts');
  await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'calibration-polish-')), port = await freePort();
  const app = createServer({ repo: REPO, workspace, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await withBrowser(async browser => {
    const shot = async (name: string) => {
      if (!process.env.XRB_PROOF_DIR) return;
      await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { captureBeyondViewport: true });
      await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, name + '.png'), Buffer.from(data, 'base64'));
    };
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `const originalFetch=window.fetch; window.fetch=(url,...args)=>url==='/api/calibration'?new Promise(resolve=>{window.releaseCalibration=()=>resolve(originalFetch(url,...args));}):originalFetch(url,...args);` });
    await browser.navigate(`http://127.0.0.1:${port}/calibration/`, 'typeof releaseCalibration === "function"');
    assert.equal(await browser.evaluate("document.getElementById('calibration-loading').hidden"), false);
    assert.equal(await browser.evaluate("/Checking calibration plugin|Camera B → A transform/.test(document.body.innerText)"), false);
    await shot('loading');
    await browser.evaluate('releaseCalibration()');
    for (let i = 0; i < 100; i++) {
      if (await browser.evaluate("!document.getElementById('calibration-root').hidden")) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await browser.evaluate("document.getElementById('calibration-loading').hidden"), true);
    for (const width of [1280, 960]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      const sizes = await browser.evaluate(`(()=>{const a=document.querySelector('#cal-method').closest('.dropdown').querySelector('button').getBoundingClientRect(),b=document.querySelector('#cal-start').getBoundingClientRect();return {a:{bottom:a.bottom,height:a.height},b:{bottom:b.bottom,height:b.height},overflow:document.documentElement.scrollWidth>innerWidth};})()`);
      assert.ok(Math.abs(sizes.a.bottom - sizes.b.bottom) < 1, JSON.stringify(sizes));
      assert.ok(Math.abs(sizes.a.height - sizes.b.height) < 1, JSON.stringify(sizes));
      assert.equal(sizes.overflow, false);
      await shot(`loaded-${width}`);
    }
    assert.equal(await fs.stat(path.join(workspace, 'config')).then(() => true, () => false), false);
    assert.equal(app.panel.jobs.list().length, 0);
    assert.equal(app.panel.runner.busy, false);
  }); } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

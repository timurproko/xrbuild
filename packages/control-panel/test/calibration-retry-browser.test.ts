import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser } from './browser-fixture.ts';

test('Calibration refreshes after the shared progress dialog Retry succeeds', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const parent = process.env.XRB_TEST_ROOT ?? path.join(REPO, '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'cal-retry-')), port = await freePort();
  const app = createServer({ repo: REPO, workspace, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await withBrowser(async browser => {
    const until = async (expression: string) => {
      for (let i = 0; i < 100; i++) { if (await browser.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
      assert.fail(`Timed out: ${expression}`);
    };
    const shot = async (name: string) => {
      if (!process.env.XRB_PROOF_DIR) return;
      await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
      await browser.evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
      const { data } = await browser.send('Page.captureScreenshot', { captureBeyondViewport: true });
      await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, name + '.png'), Buffer.from(data, 'base64'));
    };
    // Actual shell, plugin UI and shared Retry callback; only compiler/device HTTP boundaries are simulated.
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const originalFetch=window.fetch;
      sessionStorage.views=String(Number(sessionStorage.views||0)+1);
      window.fetch=(input,options={})=>{
        const url=new URL(input,location.href),reply=value=>Promise.resolve(new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}}));
        if(url.pathname==='/api/calibration')return reply({available:true,module:'/calibration/tools/calibration-browser.mjs',capture:{available:sessionStorage.recovered==='yes',reason:sessionStorage.recovered==='yes'?'Connect to check depth cameras.':'Native bridge needs rebuilding for this version.',recovery:'rebuild'}});
        if(url.pathname==='/api/host/setup')return reply({canBuild:true});
        if(url.pathname==='/api/host/rebuild'){sessionStorage.builds=String(Number(sessionStorage.builds||0)+1);return reply({id:Number(sessionStorage.builds),kind:'host-rebuild',state:'running',lines:[]});}
        if(url.pathname==='/api/jobs'){
          const id=Number(sessionStorage.builds),failed=id===1;
          if(!failed)sessionStorage.recovered='yes';
          return reply({jobs:[{id,kind:'host-rebuild',state:failed?'failed':'done',error:failed?'Fixture transient build error':null,lines:['Fixture build result']}]});
        }
        if(url.pathname==='/api/calibration/capture')throw new Error('No device capture is allowed');
        return originalFetch(input,options);
      };` });
    await browser.navigate(`http://127.0.0.1:${port}/calibration/`, "document.getElementById('calibration-root')?.hidden === false");
    assert.equal(await browser.evaluate("document.getElementById('cal-connect').disabled"), true);
    await browser.evaluate("document.querySelector('.xrb-toast[data-toast-id=\"calibration-availability\"]:not([data-leaving])').querySelector('.xrb-toast-actions button').click()");
    await until("!!document.querySelector('[data-xrb-rebuild-retry]') && !document.querySelector('[data-xrb-rebuild-retry]').hidden");
    assert.equal(await browser.evaluate('Number(sessionStorage.views)'), 1, 'failed builds must not reload');
    await shot('retry-first-build-failed');
    await browser.evaluate("document.querySelector('[data-xrb-rebuild-retry]').click()");
    await until("Number(sessionStorage.views)===2 && document.getElementById('cal-connect')?.disabled === false && !document.querySelector('.xrb-toast[data-toast-id=\"calibration-availability\"]:not([data-leaving])') && document.getElementById('calibration-loading')?.hidden === true");
    assert.equal(await browser.evaluate('Number(sessionStorage.builds)'), 2);
    assert.equal(await browser.evaluate('sessionStorage.recovered'), 'yes');
    assert.equal(await browser.evaluate('location.pathname'), '/calibration/');
    assert.equal(await browser.evaluate("document.getElementById('cal-import-button').disabled"), false);
    assert.equal(await browser.evaluate("document.getElementById('cal-capture-status').textContent"), 'Connect to check depth cameras.');
    await shot('retry-completed-refreshed-page');
    assert.equal(app.panel.jobs.list().length, 0);
    await assert.rejects(fs.stat(path.join(workspace, 'config')), /ENOENT/);
  }); } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

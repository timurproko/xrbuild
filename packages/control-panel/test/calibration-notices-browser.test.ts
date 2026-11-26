import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser } from './browser-fixture.ts';

const cases = {
  'plugin-missing': { available: false, reason: 'Calibration plugin is not installed or is disabled; enable it in Plugins.', recovery: 'plugins' },
  'plugin-conflict': { available: false, reason: 'Calibration plugin owners conflict; select one in Plugins.', recovery: 'plugins' },
  'services-stale': { available: false, reason: 'Calibration components need rebuilding.', recovery: 'rebuild' },
  'component-unsafe': { available: false, reason: 'Installed application component output changed or is unsafe; inspect preserved files before retrying Rebuild', detail: 'Preserved fixture component output differs.' },
  'device-missing': { available: false, reason: 'Camera device SDK is missing; add the reviewed SDK under third_party/hand-tracking/sensor.' },
  'device-invalid': { available: false, reason: 'Camera device SDK files are incomplete or invalid; restore the reviewed dependency.' },
  'device-runtime-missing': { available: false, reason: 'Camera device runtime is missing; restore the reviewed SDK runtime.' },
  'bridge-missing': { available: false, reason: 'Native bridge is not built.', recovery: 'rebuild' },
  'bridge-stale': { available: false, reason: 'Native bridge needs rebuilding for this version.', recovery: 'rebuild' },
  'bridge-invalid': { available: false, reason: 'Native bridge files are invalid; inspect the preserved runtime before rebuilding.' },
  'services-missing': { available: false, reason: 'Camera service dependencies are missing.', recovery: 'rebuild' },
  ready: { available: true, reason: 'Connect to check depth cameras.' },
};

test('Calibration prerequisite notices retain result access and use shared explicit Rebuild recovery', { skip: !process.env.XRB_TEST_BROWSER, timeout: 90000 }, async () => {
  const parent = process.env.XRB_TEST_ROOT ?? path.join(REPO, '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'cal-notices-')), port = await freePort();
  const app = createServer({ repo: REPO, workspace, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await withBrowser(async browser => {
    const shot = async (name: string) => {
      if (!process.env.XRB_PROOF_DIR) return;
      await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { captureBeyondViewport: true });
      await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, name + '.png'), Buffer.from(data, 'base64'));
    };
    // Test-only responses. Real module/styles/storage reads, but no compiler, service or device starts.
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const cases=${JSON.stringify(cases)}, originalFetch=window.fetch;
      window.finishRebuild=false;window.mutations=[];
      window.fetch=(input,options={})=>{
        const url=new URL(input,location.href),name=new URL(location.href).searchParams.get('case'),reply=value=>Promise.resolve(new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}}));
        if(options.method==='POST')mutations.push(url.pathname);
        if(url.pathname==='/api/calibration'){
          const capture=sessionStorage.rebuilt==='done'?cases.ready:cases[name]||cases.ready;
          return reply(['plugin-missing','plugin-conflict','services-stale','component-unsafe'].includes(name)&&sessionStorage.rebuilt!=='done'?capture:{available:true,module:'/calibration/tools/calibration-browser.mjs',capture});
        }
        if(url.pathname==='/api/host/setup')return reply({canBuild:true});
        if(url.pathname==='/api/host/rebuild'){sessionStorage.rebuilt='running';return reply({id:999,kind:'host-rebuild',state:'running',lines:['Rebuild: compiling and staging the camera bridge…']});}
        if(url.pathname==='/api/jobs'){if(finishRebuild)sessionStorage.rebuilt='done';return reply({jobs:[{id:999,kind:'host-rebuild',state:finishRebuild?'done':'running',lines:['Rebuild: compiling and staging the camera bridge…']}]});}
        if(url.pathname==='/api/calibration/capture')return Promise.resolve(new Response(JSON.stringify({error:'Camera device runtime could not start; restore the reviewed device runtime.',detail:'Fixture loader error 3221225781.'}),{status:409,headers:{'content-type':'application/json'}}));
        return originalFetch(input,options);
      };` });
    for (const [name, value] of Object.entries(cases)) {
      await browser.navigate(`http://127.0.0.1:${port}/calibration/?case=${name}`, "document.getElementById('calibration-loading')?.hidden === true");
      const text = await browser.evaluate("document.getElementById('calibration-availability').innerText");
      if (!value.available) assert.ok(text.includes(value.reason), text);
      else assert.equal(await browser.evaluate("document.getElementById('calibration-availability').hidden"), true);
      assert.equal(await browser.evaluate("document.getElementById('calibration-availability').classList.contains('warning')"), true);
      assert.equal(await browser.evaluate("/Camera B → A transform|Checking calibration plugin/.test(document.body.innerText)"), false);
      if (!['plugin-missing', 'plugin-conflict', 'services-stale', 'component-unsafe'].includes(name)) {
        assert.equal(await browser.evaluate("document.getElementById('cal-import-button').disabled"), false);
        assert.equal(await browser.evaluate("document.getElementById('cal-connect').disabled"), !value.available);
      }
      assert.deepEqual(await browser.evaluate('mutations'), []);
      await shot(name);
    }
    await browser.evaluate("document.getElementById('cal-connect').click()");
    for (let i = 0; i < 100; i++) { if (await browser.evaluate("!document.getElementById('cal-error').hidden")) break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.match(await browser.evaluate("document.getElementById('cal-error').textContent"), /device runtime could not start/);
    assert.equal(await browser.evaluate("document.getElementById('cal-error').className"), 'xrb-error-banner');
    await shot('runtime-failed');
    await browser.navigate(`http://127.0.0.1:${port}/calibration/?case=bridge-stale`, "document.getElementById('calibration-loading')?.hidden === true");
    await browser.evaluate("document.querySelector('#calibration-availability button').click()");
    for (let i = 0; i < 100; i++) { if (await browser.evaluate("!!document.querySelector('dialog[open]')")) break; await new Promise(resolve => setTimeout(resolve, 20)); }
    await shot('rebuild-progress');
    assert.deepEqual(await browser.evaluate('mutations'), ['/api/host/rebuild']);
    await browser.evaluate('finishRebuild=true');
    for (let i = 0; i < 100; i++) { if (await browser.evaluate("sessionStorage.rebuilt==='done' && !document.getElementById('calibration-root').hidden && document.getElementById('calibration-availability').hidden")) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(await browser.evaluate("document.getElementById('cal-connect').disabled"), false);
    await shot('rebuild-recovered');
    await browser.evaluate(`(async()=>{
      const {mountCalibration}=await import('/calibration/tools/calibration-browser.mjs');
      const old=document.getElementById('calibration-root'),root=old.cloneNode(true);
      for(const select of root.querySelectorAll('select')){const wrapper=select.closest('.xrb-select');if(wrapper)wrapper.replaceWith(select);delete select.dataset.xrbSelect;select.classList.remove('xrb-native-select');select.removeAttribute('tabindex');}old.replaceWith(root);
      window.disposeMock=await mountCalibration(root,{capture:{available:true},storage:{getItem:()=>null},request:async()=>({id:'fixture',cameras:[{},{}]}),notice:value=>{const notice=document.getElementById('calibration-availability');notice.textContent=value?.reason||'';notice.hidden=value?.available!==false;},createCamera:()=>({connect:async()=>{},stop:async()=>{},disconnect(){},snapshot:()=>({devices:[]})})});
      document.getElementById('cal-connect').click();
    })()`);
    for(let i=0;i<100;i++){if(await browser.evaluate("document.getElementById('calibration-availability').textContent.includes('second supported camera')"))break;await new Promise(resolve=>setTimeout(resolve,20));}
    assert.match(await browser.evaluate("document.getElementById('calibration-availability').textContent"), /second supported camera/);
    await shot('two-cameras-required'); await browser.evaluate('disposeMock()');
    assert.equal(app.panel.jobs.list().length, 0, 'all browser maintenance was simulated');
    await assert.rejects(fs.stat(path.join(workspace, 'config')), /ENOENT/);
  }); } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,until,task} from './fixture.mjs';

test('real startup modal paints before repair; logs, retry, themes, reconnect and same-tab handoff', {skip:!process.env.XRB_TEST_BROWSER && 'set XRB_TEST_BROWSER for isolated browser acceptance'}, async t=>{
  const {withBrowser}=await import('../../../packages/control-panel/test/browser-fixture.ts');
  const f=fixture(t),reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));f.target.port=reserve.address().port;await new Promise(r=>reserve.close(r));
  let attempts=0,browserRef,visibleBeforeInstall=false,hold;
  const held=new Promise(r=>hold=r);
  const app=http.createServer((req,res)=>{
    if(req.url==='/api/ping')res.end(JSON.stringify({app:'xrb-control-panel',repo:f.root,workspace:f.target.workspace,projects:f.target.projects}));
    else{res.setHeader('content-type','text/html');res.end('<h1 id="fixture-app">XR Build fixture</h1>');}
  });
  const c=await f.coordinator({install:async(root,log)=>{
    attempts++;visibleBeforeInstall=await browserRef.evaluate('document.querySelector("dialog").open');
    log.write('<img src=x onerror="window.injected=true">');log.write('token=synthetic-secret');
    if(attempts===1){await held;throw Error('Network unavailable; retry when connected.');}
    f.install();
  },start:async()=>{await new Promise(r=>app.listen(f.target.port,'127.0.0.1',r));return {};}},{startTimeout:5000});
  f.cleanup(()=>new Promise(r=>app.close(r)));
  const message=await c.register(f.target);
  await withBrowser(async browser=>{
    browserRef=browser;
    const targetBefore=(await browser.send('Target.getTargetInfo')).targetInfo.targetId;
    await browser.navigate(message.url,'document.querySelector("dialog")?.open');
    await until(()=>browser.evaluate('document.querySelector("#startup-title").textContent'),s=>s==='Installing app dependencies');
    assert.equal(visibleBeforeInstall,true);assert.equal(attempts,1);
    assert.equal(await browser.evaluate('document.querySelector("#startup-close").disabled'),true);
    await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(await browser.evaluate('document.querySelector("dialog").open'),true);
    // Reload attaches to the same job, without a new install.
    await browser.evaluate('window.beforeReload=true');await browser.send('Page.reload',{ignoreCache:true});
    await until(()=>browser.evaluate('!window.beforeReload && !!document.querySelector("dialog")?.open'),v=>v);assert.equal(attempts,1);
    hold();await until(()=>browser.evaluate('document.querySelector("#startup-retry").hidden'),v=>v===false);
    for(const [theme,width]of [['light',1200],['dark',1200],['dark',360]]){
      await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
      const view=await browser.evaluate('({open:document.querySelector("dialog").open,width:document.querySelector("dialog").getBoundingClientRect().width,viewport:innerWidth,background:getComputedStyle(document.querySelector("dialog")).backgroundColor,output:document.querySelector("#startup-output").textContent,injected:!!window.injected,aria:document.querySelector("dialog").getAttribute("aria-labelledby")})');
      assert.equal(view.open,true);assert.ok(view.width<=view.viewport-20);assert.equal(view.injected,false);assert.equal(view.aria,'startup-title');
      assert.match(view.output,/<img/);assert.doesNotMatch(view.output,/synthetic-secret/);
      assert.equal(view.background,theme==='light'?'rgb(255, 255, 255)':'rgb(22, 28, 37)');
      const screenshot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(task,`.artifacts/startup-${theme}-${width}.png`),Buffer.from(screenshot.data,'base64'));
    }
    await browser.evaluate('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>window.copied=text},configurable:true});document.querySelector("#startup-copy").click()');
    assert.doesNotMatch(await browser.evaluate('window.copied'),/synthetic-secret/);
    await browser.evaluate('document.querySelector("#startup-retry").click()');
    await until(()=>browser.evaluate('!!document.querySelector("#fixture-app")'),v=>v,8000);
    assert.equal(await browser.evaluate('location.origin'),`http://127.0.0.1:${f.target.port}`);assert.equal(attempts,2);
    assert.equal((await browser.send('Target.getTargetInfo')).targetInfo.targetId,targetBefore);
    assert.equal((await browser.send('Target.getTargets')).targetInfos.filter(p=>p.type==='page'&&p.url.startsWith(`http://127.0.0.1:${f.target.port}/`)).length,1);
  });
});

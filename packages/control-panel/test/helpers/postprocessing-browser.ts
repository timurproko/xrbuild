import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withBrowser } from '../browser-fixture.ts';

type Browser = Parameters<Parameters<typeof withBrowser>[0]>[0];
/** Static production UI modules only: no Panel, provider, user-home discovery or SDK runtime. */
export async function withPostprocessing(run: (browser: Browser) => Promise<void>) {
  const ui = path.resolve(import.meta.dirname, '../../ui');
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, 'http://localhost').pathname;
      if (pathname === '/') {
        res.setHeader('content-type', 'text/html');
        res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/hands.css"><main style="padding:24px;width:368px;box-sizing:border-box" id="hands-postprocessing-root"></main><button id="outside">Outside</button>'); return;
      }
      const file = path.resolve(ui, '.' + pathname);
      if (!file.startsWith(ui + path.sep)) { res.writeHead(404).end(); return; }
      res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    await withBrowser(async browser => {
      await browser.navigate(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`, "!!document.querySelector('main')");
      await browser.evaluate(`(async () => {
        const {mountHandsPostprocessing} = await import('/hands-postprocessing.js');
        window.mountMesh = mountHandsPostprocessing;
        window.root = document.querySelector('main');
        window.plugin = {owner:'workspace:example',id:'surface',label:'Example surface',available:true,reason:'Available',declaration:{version:2,settingsVersion:1,settings:[
          {key:'detail',label:'Surface detail',type:'number',min:0,max:1,step:.01,default:.6,changeMode:'live'},
          {key:'mode',label:'Output mode',type:'select',default:'full',changeMode:'reprepare',options:[{value:'full',label:'Full'},{value:'simple',label:'Simple'}]},
          {key:'smooth',label:'Smooth surface',type:'boolean',default:true,changeMode:'live'}]}};
        window.snapshot = {revision:'a'.repeat(64),registryRevision:'registry',plugins:[plugin],choice:{version:1,selected:{owner:plugin.owner,id:plugin.id},settings:{}},running:false,delivery:null};
        window.requests=[]; window.retries=[]; window.loadCount=0;
        window.options={pollMs:0,load:async()=>{loadCount++;const data=structuredClone(snapshot);if(window.loadGate)await loadGate();return data},save:async body=>{
          requests.push(structuredClone(body));
          if(window.saveGate) await saveGate();
          if(window.saveError) throw saveError;
          if(body.revision!==snapshot.revision)throw Object.assign(new Error('Hands profile changed; reload before saving'),{status:409});
          snapshot={...snapshot,revision:String.fromCharCode(97+requests.length).repeat(64),choice:{...snapshot.choice,selected:body.selected,settings:{...snapshot.choice.settings,...(body.selected?{[body.selected.owner+'/'+body.selected.id]:{version:plugin.declaration.settingsVersion,values:body.values}}:{})}}};
          return structuredClone(snapshot);
        },retry:async body=>{retries.push(body);if(window.retryGate)await retryGate();return {delivery:structuredClone(snapshot.delivery)}}};
        window.component=mountMesh(root,options);
      })()`);
      await browser.evaluate('new Promise(resolve=>setTimeout(resolve,0))');
      try { await run(browser); } finally { await browser.evaluate('component.dispose()'); }
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

export async function pictures(browser: Browser, prefix: string) {
  if (!process.env.XRB_PROOF_DIR) return;
  await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
  for (const theme of ['light', 'dark']) for (const width of [368, 320]) {
    await browser.evaluate(`document.documentElement.dataset.theme='${theme}';root.style.width='${width}px'`);
    await browser.send('Emulation.setDeviceMetricsOverride', { width: width + 48, height: 1000, deviceScaleFactor: 1, mobile: false });
    const clip = await browser.evaluate(`(()=>{const r=root.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    const picture = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, `${prefix}-${theme}-${width}.png`), Buffer.from(picture.data, 'base64'));
  }
}

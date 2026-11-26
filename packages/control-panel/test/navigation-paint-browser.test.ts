import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('every module paints its correct shell before slow APIs and remote fonts', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const scratch = process.env.XRB_TEST_ROOT ?? path.join(root, '.artifacts');
  await fs.mkdir(scratch, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(scratch, 'navigation-paint-'));
  await fs.mkdir(path.join(workspace, 'plugins/settings-fixture'), {recursive:true});
  await fs.writeFile(path.join(workspace, 'plugins/settings-fixture/xrb-plugin.json'), JSON.stringify({title:'Settings fixture',type:'input',version:'0.1.0',settings:[{key:'enabled',label:'Enabled',type:'boolean',default:false}]}));
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as {port:number}).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const panel = createServer({ repo: root, workspace, port, developerMode: true });
  const listeners = panel.server.listeners('request');
  panel.server.removeAllListeners('request');
  const timers = new Set<ReturnType<typeof setTimeout>>();
  panel.server.on('request', (req, res) => {
    const serve = () => { if (!res.destroyed) for (const listener of listeners) listener.call(panel.server, req, res); };
    if (req.url?.startsWith('/api/')) { const timer = setTimeout(() => { timers.delete(timer); serve(); }, 2500); timers.add(timer); }
    else serve();
  });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(panel.server.address() as {port:number}).port}`;
  try {
    for (const [route, title, frame] of [['/', 'Apps', 'dashboard'], ['/plugins/', 'Plugins', 'plugins-manager'], ['/settings/', 'Settings', 'global-settings'], ['/hands/', 'Hands', ''], ['/calibration/', 'Calibration', ''], ['/design', 'Design', '']]) await withBrowser(async ({ send, evaluate }) => {
      await send('Network.enable');
      await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.shellPaint=null;requestAnimationFrame(function check(){const h=document.querySelector('.xrb-app-bar'),m=document.querySelector('main:not([hidden])');if(h&&m&&getComputedStyle(h).visibility==='visible'&&m.getBoundingClientRect().height){window.shellPaint={at:performance.now(),title:h.innerText,frame:m.id};}else requestAnimationFrame(check);});` });
        await evaluate('window.shellPaint=null');
        await send('Page.navigate', { url: origin + route });
        let paint: {at:number;title:string;frame:string} | null = null;
        for (let n=0;n<100;n++) { paint=await evaluate('window.shellPaint');if(paint)break;await sleep(50); }
        assert.ok(paint, `${route} has a visible frame while APIs are pending`);
        assert.ok(paint.at < 2200, `${route} does not await the 2500ms APIs: ${JSON.stringify(paint)}`);
        assert.ok(paint.title.includes(title), JSON.stringify(paint));
        if (frame) assert.equal(paint.frame, frame);
    });
    await withBrowser(async ({send,navigate,evaluate}) => {
      await send('Page.addScriptToEvaluateOnNewDocument', {source:`const originalFetch=fetch;window.fetch=async(input,options)=>{if(new URL(input,location.href).pathname==='/api/plugins/manage')await new Promise(resolve=>setTimeout(resolve,700));return originalFetch(input,options);};`});
      await navigate(origin+'/settings/?module=settings-fixture', `document.querySelector('[data-settings-filter="settings-fixture"]')?.getAttribute('aria-current')==='true'`);
      assert.equal(await evaluate(`new URLSearchParams(location.search).get('module')`),'settings-fixture','a faster provider scan cannot discard the requested module');
    });
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await panel.close();
    await fs.rm(workspace, {recursive:true,force:true});
  }
});

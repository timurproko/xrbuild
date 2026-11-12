import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createServer} from '../src/server.ts';
import {withBrowser, sleep} from './browser-fixture.ts';
import {navigationItems} from '../ui/navigation.js';

async function fixture(t: {after: (fn: () => Promise<void>) => void}, developerMode=false) {
  const repo=path.resolve(import.meta.dirname,'../../..'),artifacts=path.join(repo,'.artifacts');
  await fs.mkdir(artifacts,{recursive:true});
  const root=await fs.mkdtemp(path.join(artifacts,'design-gallery-')),workspace=path.join(root,'absent');
  const reserve=http.createServer();
  await new Promise<void>(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=(reserve.address() as {port:number}).port;
  await new Promise<void>(resolve=>reserve.close(()=>resolve()));
  const panel=createServer({repo,workspace,port,developerMode});
  await new Promise<void>(resolve=>panel.server.listen(port,'127.0.0.1',resolve));
  const apiRequests: string[]=[];
  panel.server.on('request',req=>{if(req.url?.startsWith('/api/'))apiRequests.push(`${req.method} ${req.url}`);});
  t.after(async()=>{await panel.close();await fs.rm(root,{recursive:true,force:true});});
  return {panel,workspace,url:`http://127.0.0.1:${port}/`,apiRequests,artifacts};
}
async function until(evaluate: (expression: string) => Promise<any>, expression: string) {
  for(let i=0;i<160;i++){if(await evaluate(expression))return;await sleep(50);}assert.fail(expression);
}
const frameReady=`(document.body?.dataset.case==='main' ? document.querySelector('#design-main')?.dataset.fixtureReady==='true' : document.querySelector('#preview')?.contentDocument?.documentElement?.dataset.fixtureReady==='true')`;
const palette=`(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--bg','--surface','--surface-2','--fg','--muted','--line','--accent','--test','--ok','--warn','--rebuild','--err','--scrim','--on-accent','--log-bg','--xrb-glyph-filter','--xrb-glyph-detail-filter','--c-blue','color-scheme'].map(key=>[key,s.getPropertyValue(key).trim()]));})()`;

test('core Theme overrides System immediately, persists across routes and frames without workspace/runtime writes', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000}, async t=>{
  const f=await fixture(t);
  await withBrowser(async({navigate,evaluate,send})=>{
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    const settings=`${f.url}settings?module=control-panel`;
    await navigate(settings,`!!document.querySelector('#panel-appearance [name=theme]')`);
    assert.equal(await evaluate(`document.querySelector('#panel-appearance [name=theme]').value`),'system');
    assert.equal(await evaluate(`!!document.querySelector('#panel-menu [data-navigation="design-system"]')`),false,'ordinary user menu hides the gallery');
    const light=await evaluate(palette);
    const choose=async(theme:string)=>{
      await evaluate(`document.querySelector('#panel-appearance .dropdown-btn').click()`);
      await evaluate(`[...document.querySelectorAll('[role=option]')].find(option=>option.textContent===${JSON.stringify(theme)}).click()`);
      assert.equal(await evaluate(`document.activeElement===document.querySelector('#panel-appearance .dropdown-btn')`),true);
    };
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await sleep(80);
    const dark=await evaluate(palette),darkIcon=await evaluate(`document.querySelector('link[rel=icon]').href`);
    assert.notDeepEqual(light,dark);
    await choose('Light');assert.deepEqual(await evaluate(palette),light);
    assert.notEqual(await evaluate(`document.querySelector('link[rel=icon]').href`),darkIcon);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await sleep(80);
    assert.deepEqual(await evaluate(palette),light);
    await choose('Dark');assert.deepEqual(await evaluate(palette),dark);
    assert.equal(await evaluate(`document.querySelector('link[rel=icon]').href`),darkIcon);
    await navigate(`${f.url}plugins`,`!!document.body && !document.body.classList.contains('workspace-pending')`);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');assert.deepEqual(await evaluate(palette),dark);
    await navigate(settings,`document.querySelector('#panel-appearance [name=theme]')?.value==='dark'`);
    await choose('System');assert.equal(await evaluate(`localStorage.getItem('panel.theme')`),null);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await sleep(80);
    assert.deepEqual(await evaluate(palette),dark);
    await choose('Dark');
    await navigate(`${f.url}design`,frameReady);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');
    await evaluate(`window.xrbTheme.set('light')`);
    await until(evaluate,`document.documentElement.dataset.theme==='light'`);
    await navigate(settings,`document.querySelector('#panel-appearance [name=theme]')?.value==='light'`);
    await evaluate(`localStorage.setItem('panel.theme','invalid-theme')`);
    await navigate(settings,`document.querySelector('#panel-appearance [name=theme]')?.value==='system'`);
    assert.deepEqual(await evaluate(palette),dark);
    assert.equal(await evaluate(`localStorage.getItem('panel.theme')`),'invalid-theme','loading does not rewrite invalid preferences');
    assert.equal(await evaluate(`document.querySelector('#app-preferences [name=cursor]').value`),'system');
  });
  assert.deepEqual(f.apiRequests.filter(request=>!request.startsWith('GET ')),[]);
  await assert.rejects(fs.stat(f.workspace),{code:'ENOENT'});
  assert.equal(f.panel.panel.jobs.list().length,0);
});

test('registered tool navigation discovers the full Dev menu and retains links when discovery fails', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const f=await fixture(t,true);
  await withBrowser(async({navigate,evaluate})=>{
    await navigate(`${f.url}design`,frameReady);
    await evaluate(`(async()=>{
      const {mountToolNavigation}=await import('/navigation.js');
      const button=document.createElement('button'),menu=document.createElement('div');menu.id='discovery-menu';
      document.body.append(button,menu);
      window.__disposeTool=mountToolNavigation(button,menu,{origin:location.origin,tools:[],current:'projects'});
    })()`);
    await until(evaluate,`!!document.querySelector('#discovery-menu [data-navigation="design-system"]')`);
    assert.equal(await evaluate(`document.querySelector('#discovery-menu [data-navigation="design-system"]').previousElementSibling.dataset.navigation`),'settings');
    assert.equal(await evaluate(`document.querySelector('#discovery-menu [data-navigation="design-system"]').nextElementSibling.getAttribute('role')`),'separator');
    assert.equal(await evaluate(`document.querySelector('#discovery-menu').lastElementChild.dataset.navigation`),'rebuild');
    await evaluate(`window.__disposeTool()`);
    assert.equal(await evaluate(`document.querySelector('#discovery-menu').children.length`),0);
    await evaluate(`(async()=>{
      const {mountToolNavigation}=await import('/navigation.js');
      const original=window.fetch;window.fetch=async()=>{throw new TypeError('Synthetic network error')};
      const button=document.createElement('button');document.body.append(button);
      window.__disposeTool=mountToolNavigation(button,document.querySelector('#discovery-menu'),{origin:location.origin,tools:[],current:'projects'});
      window.fetch=original;
    })()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#discovery-menu [data-navigation]')].map(item=>item.dataset.navigation)`),['projects','plugins','settings','restart','rebuild']);
    await evaluate(`window.__disposeTool()`);
  });
  assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[]);
  assert.equal(f.panel.panel.jobs.list().length,0);
});

test('separate-origin gallery maintenance follows panel links rather than sending cross-origin requests', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const f=await fixture(t,true),other='http://127.0.0.1:59999';
  await withBrowser(async({navigate,evaluate})=>{
    await navigate(`${f.url}design?xrbuildPanel=${encodeURIComponent(other)}`,frameReady);
    await evaluate(`window.__maintenanceLinks=[];window.__maintenanceRequests=[];
      window.fetch=async(...args)=>{window.__maintenanceRequests.push(String(args[0]));throw new Error('No external request authorized');};
      document.addEventListener('click',event=>{
        const item=event.target.closest('[data-navigation]');
        if(['restart','rebuild'].includes(item?.dataset.navigation)){
          event.preventDefault();window.__maintenanceLinks.push(item.href);
        }
      },{capture:true});
      document.querySelector('#panel-restart').click();document.querySelector('#host-rebuild').click();`);
    await sleep(100);
    assert.deepEqual(await evaluate(`window.__maintenanceLinks`),[`${other}/?maintenance=restart`,`${other}/?maintenance=rebuild`]);
    assert.deepEqual(await evaluate(`window.__maintenanceRequests`),[]);
    assert.equal(await evaluate(`!!document.querySelector('body > [data-xrb-restart-dialog],body > [data-xrb-rebuild-dialog]')`),false);
  });
  assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[]);
  assert.equal(f.panel.panel.jobs.list().length,0);
});

test('Design Main collects shared primitives with interactive local-only examples', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const f=await fixture(t,true);
  await withBrowser(async({navigate,evaluate,send})=>{
    await navigate(`${f.url}design`,frameReady);
    await send('Page.bringToFront');
    assert.equal(await evaluate(`document.querySelector('#case').value`),'main');
    assert.equal(await evaluate(`!!document.querySelector('.component-catalog > header')`),false,'no redundant Main title or description');
    assert.equal(await evaluate(`document.querySelector('#preview').parentElement.hidden`),true,'Main has no iframe scroll context');
    assert.equal(await evaluate(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size;})()`),true,'inline examples retain unique accessible IDs');
    const within=(body:string)=>evaluate(`(()=>{const doc=document;${body}})()`);
    assert.deepEqual(await within(`return [...doc.querySelectorAll('[data-component-section]')].map(section=>section.id)`),['typography','actions','fields','navigation','status','dialogs','layout','media']);
    for(const selector of ['.xrb-card','.xrb-help.field-error','.xrb-supporting-text','.xrb-inline-edit','.xrb-path','.xrb-glyph-detail','button.primary','button.danger','button.ghost','button:disabled','.xrb-tool-button','.xrb-icon-button','button.small','.xrb-number-control','.xrb-native-select','.dropdown[data-multi]','.dropdown[data-marks]','.xrb-switch','.xrb-toggle-pill','.xrb-range','.xrb-segmented','.xrb-swatch','.xrb-tab-toolbar','.xrb-tabs','.xrb-tab-count','.xrb-search-input','.xrb-choice-list','.state','.chip','.xrb-filter-chip','.xrb-spinner','.xrb-error-banner','.warning','.stats-dock','.metrics','.facts','.xrb-progress-status','.xrb-field-grid','.xrb-stack','.xrb-control-group','.xrb-toggle-grid','.xrb-section-divider','.xrb-key-value-list','.xrb-disclosure','.xrb-sidebar-section','.xrb-media-stage','.xrb-empty-state','.checker','.xrb-copy-block','.xrb-code-block','.console','.list','.menu','.xrb-dialog'])assert.equal(await within(`return !!doc.querySelector(${JSON.stringify(selector)})`),true,selector);
    assert.equal(await within(`const sample=getComputedStyle(doc.querySelector('#example-text'));return [...doc.querySelectorAll('#fields input:not([type=hidden]):not([type=checkbox]):not([type=range]),#fields .dropdown-btn')].every(element=>{const style=getComputedStyle(element);return ['fontFamily','fontSize','fontWeight','lineHeight'].every(key=>style[key]===sample[key]);});`),true,'normal, disabled, read-only and dropdown fields share font metrics');
    assert.deepEqual(await within(`const primary=doc.querySelector('#actions .primary'),row=primary.parentElement,tool=doc.querySelector('.xrb-tool-button'),icon=tool.querySelector('[data-xrb-icon]').getBoundingClientRect(),label=tool.lastElementChild.getBoundingClientRect(),warning=getComputedStyle(doc.querySelector('.warning')),error=getComputedStyle(doc.querySelector('.xrb-error-banner'));return {hierarchy:[...doc.querySelectorAll('#typography > h1,#typography > h3')].map(element=>element.tagName),intrinsic:primary.getBoundingClientRect().width<row.getBoundingClientRect().width/2,noCompact:!doc.querySelector('.xrb-controls-compact'),aligned:Math.abs((icon.top+icon.bottom-label.top-label.bottom)/2)<0.1,banners:['paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','lineHeight','borderRadius'].every(key=>warning[key]===error[key])};`),{hierarchy:['H3','H1'],intrinsic:true,noCompact:true,aligned:true,banners:true});
    await within(`doc.querySelector('#example-range').focus()`);
    assert.equal(await within(`return getComputedStyle(doc.querySelector('#example-range')).outlineStyle`),'none');
    await within(`doc.querySelector('#example-select').closest('.dropdown').querySelector('button').click();[...doc.querySelectorAll('[role=option]')].find(option=>option.textContent==='Second').click()`);
    assert.equal(await within(`return doc.querySelector('#example-select').value`),'Second');
    await within(`doc.querySelector('#example-number').closest('.xrb-number-control').querySelector('[data-number-step=up]').click()`);
    assert.equal(await within(`return doc.querySelector('#example-number').value`),'3');
    await within(`doc.querySelector('#example-tab-two').click()`);
    assert.equal(await within(`return doc.querySelector('#example-panel').textContent`),'Details panel');
    await within(`doc.querySelector('#example-tooltip').scrollIntoView()`);await sleep(100);
    await within(`doc.querySelector('#example-tooltip').focus({preventScroll:true})`);
    await until(evaluate,`!!document.querySelector('.xrb-tooltip')`);
    await within(`doc.querySelector('[data-demo-dialog=confirm]').click()`);
    assert.equal(await within(`return doc.querySelector('#example-dialog').open`),true);
    await within(`doc.querySelector('#example-dialog [data-close-dialog]').click();doc.querySelector('[data-demo-progress=running]').click()`);
    await until(evaluate,`document.querySelector('#design-main [data-xrb-rebuild-title]').textContent==='Setup complete'`);
    await within(`doc.querySelector('[data-xrb-rebuild-close]').click()`);
    await evaluate(`document.querySelector('[data-state=fields]').click()`);
    await until(evaluate,`${frameReady}&&document.querySelector('#example-select')&&document.querySelector('#design-main').dataset.state==='fields'`);
    assert.ok(await evaluate(`scrollY`)>0);
    for(const theme of ['light','dark'])for(const width of [1280,390]){
      await evaluate(`window.xrbTheme.set('${theme}')`);await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await until(evaluate,`document.documentElement.dataset.theme==='${theme}'`);
      assert.equal(await within(`return doc.documentElement.scrollWidth<=doc.defaultView.innerWidth+1`),true,`${theme}/${width}`);
      if(width===1280){await within(`doc.defaultView.scrollTo(0,0)`);await sleep(200);const image=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(f.artifacts,`design-main-${theme}.png`),Buffer.from(image.data,'base64'));}
    }
    assert.equal(await evaluate(`fetch('/api/navigation').then(response=>response.ok)`),true,'inline Main never replaces shell networking with a mock');
    assert.equal(await evaluate(`document.querySelector('#design-main [data-xrb-rebuild-title]').id===document.querySelector('#design-main [data-xrb-rebuild-dialog]').getAttribute('aria-labelledby')`),true,'mock progress has correctly scoped shared-dialog IDs');
  });
  assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[]);
  assert.equal(f.panel.panel.jobs.list().length,0);
});

test('field titles stay aligned with controls during validation and checkbox/color spacing is consistent', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const f=await fixture(t,true);
  await withBrowser(async({navigate,evaluate,send})=>{
    await navigate(`${f.url}design?case=main&state=fields`,frameReady);
    const within=(body:string)=>evaluate(`(()=>{const doc=document;${body}})()`);
    for(const theme of ['light','dark'])for(const width of [1280,390]){
      await evaluate(`window.xrbTheme.set('${theme}')`);
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await until(evaluate,`document.documentElement.dataset.theme==='${theme}'`);
      const geometry=()=>within(`const grid=doc.querySelector('#fields .xrb-field-grid'),input=doc.querySelector('#example-invalid'),marked=grid.querySelector('.dropdown[data-marks]'),label=marked.closest('label'),style=getComputedStyle(label),r=doc.createRange();r.selectNodeContents(label.firstChild);return {gap:marked.getBoundingClientRect().top-r.getBoundingClientRect().bottom,expectedGap:parseFloat(style.rowGap)+(parseFloat(style.lineHeight)-r.getBoundingClientRect().height)/2,offset:marked.getBoundingClientRect().top-label.getBoundingClientRect().top,inputOffset:input.getBoundingClientRect().top-input.closest('label').getBoundingClientRect().top,controlTop:marked.getBoundingClientRect().top-grid.getBoundingClientRect().top,inputTop:input.getBoundingClientRect().top-grid.getBoundingClientRect().top,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length};`);
      const before=await geometry();
      assert.ok(Math.abs(before.offset-(await within(`const style=getComputedStyle(doc.querySelector('#fields .dropdown[data-marks]').closest('label'));return parseFloat(style.lineHeight)+parseFloat(style.rowGap);`)))<0.2,`${theme}/${width}: one title line plus the standard field gap ${JSON.stringify(before)}`);
      assert.ok(Math.abs(before.offset-before.inputOffset)<0.2,'marked dropdown and validation input have matching title-to-control spacing');
      if(before.columns===2)assert.ok(Math.abs(before.controlTop-before.inputTop)<0.2,'adjacent controls start at the same top despite error help');
      await within(`doc.querySelector('#example-invalid').closest('label').querySelector('.field-error').hidden=true`);
      const without=await geometry();
      assert.ok(Math.abs(without.offset-before.offset)<0.2,'removing error help does not redistribute the dropdown title gap');
      if(before.columns===2)assert.ok(Math.abs(without.controlTop-before.controlTop)<0.2,'adjacent dropdown does not jump when help disappears');
      await within(`const error=doc.querySelector('#example-invalid').closest('label').querySelector('.field-error');error.hidden=false;error.textContent='Choose a valid value. This longer validation detail wraps onto additional lines on narrow displays.'`);
      const longer=await geometry();
      assert.ok(Math.abs(longer.offset-before.offset)<0.2,'wrapped error does not stretch title/control gap');
      if(before.columns===2)assert.ok(Math.abs(longer.controlTop-before.controlTop)<0.2,'adjacent dropdown does not jump when help wraps');
      const spacing=await within(`const grid=doc.querySelector('#fields .xrb-toggle-grid'),labels=[...grid.querySelectorAll('label')],a=labels[0].getBoundingClientRect(),next=labels.find(label=>label.getBoundingClientRect().top>a.top+1).getBoundingClientRect();return {rowGap:next.top-a.bottom,columnGap:parseFloat(getComputedStyle(grid).columnGap),swatchBorder:parseFloat(getComputedStyle(doc.querySelector('#example-swatches')).borderTopWidth)};`);
      assert.ok(spacing.rowGap>=8,'checkbox rows have breathing room');assert.ok(spacing.columnGap>=12);assert.equal(spacing.swatchBorder,0,'no divider before colors');
    }
  });
  assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[]);
});

test('Design system offers dependency cases with a clean dimmed background and simulated-only actions', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000},async t=>{
  const f=await fixture(t,true);
  const navigation=await fetch(`${f.url}api/navigation`).then(response=>response.json());
  const expectedMenu=navigationItems(f.url,navigation.tools,'design-system').map(item=>item.label??'separator');
  await withBrowser(async({navigate,evaluate,send})=>{
    await navigate(f.url,`!!document.querySelector('#panel-menu [data-navigation="design-system"]')`);
    assert.equal(await evaluate(`document.querySelector('#design-system-open').previousElementSibling.dataset.navigation`),'settings');
    assert.equal(await evaluate(`document.querySelector('#design-system-open').nextElementSibling.getAttribute('role')`),'separator');
    assert.equal(await evaluate(`document.querySelector('#panel-menu').lastElementChild.dataset.navigation`),'rebuild');
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#panel-menu [data-navigation="design-system"]').click()`);
    await until(evaluate,frameReady);
    f.apiRequests.length=0;
    assert.equal(await evaluate(`document.title`),'XR Build · Design');
    assert.equal(await evaluate(`document.querySelector('h1').textContent.trim()`),'XR Build Design');
    assert.equal(await evaluate(`location.pathname`),'/design');
    await evaluate(`document.querySelector('#case').value='install-dependencies';document.querySelector('#case').dispatchEvent(new Event('change',{bubbles:true}))`);
    await until(evaluate,`!!document.querySelector('#preview')?.contentDocument?.querySelector('[data-desktop-setup]')?.open && ${frameReady}`);
    assert.equal(await evaluate(`document.querySelector('#panel-menu-button').classList.contains('xrb-product-menu')`),true);
    assert.equal(await evaluate(`!!document.querySelector('.design-toolbar label,.design-toolbar .xrb-help')`),false,'no visible Cases label or simulation subtitle');
    assert.equal(await evaluate(`document.querySelector('#case').getAttribute('aria-label')`),'Design case');
    assert.equal(await evaluate(`(()=>{const row=document.querySelector('#states [data-state="missing"]'),s=getComputedStyle(row);return s.borderTopColor==='rgba(0, 0, 0, 0)'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none'&&row.getBoundingClientRect().height<34;})()`),true,'sidebar choices are compact plain rows');
    await evaluate(`document.querySelector('#panel-menu-button').click()`);
    await until(evaluate,`document.querySelectorAll('#panel-menu > *').length===${expectedMenu.length}`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#panel-menu > *')].map(item=>item.getAttribute('role')==='separator'?'separator':item.textContent)`),expectedMenu);
    assert.equal(await evaluate(`document.querySelectorAll('#panel-menu [data-navigation="restart"],#panel-menu [data-navigation="rebuild"]').length`),2);
    assert.equal(await evaluate(`(()=>{const fg=getComputedStyle(document.documentElement).getPropertyValue('--fg').trim(),sample=document.createElement('span');sample.style.color=fg;document.body.append(sample);const expected=getComputedStyle(sample).color;sample.remove();return ['panel-restart','host-rebuild'].every(id=>{const item=document.getElementById(id),dot=item.querySelector('.menu-dot');dot.hidden=false;return getComputedStyle(item).color===expected&&getComputedStyle(dot).backgroundColor!==expected;});})()`),true,'maintenance captions stay foreground while bulbs carry status colors');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
    assert.equal(await evaluate(`document.activeElement.dataset.navigation`),'restart');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(await evaluate(`document.querySelector('#panel-menu').hidden&&document.activeElement.id==='panel-menu-button'`),true);
    assert.equal(await evaluate(`document.querySelector('#case').value`),'install-dependencies');
    assert.equal(await evaluate(`!!document.querySelector('#case[data-xrb-select]')`),true);
    assert.equal(await evaluate(`!!document.querySelector('#view,#theme,#width,#reload')`),false);
    await evaluate(`document.querySelector('#case').closest('.dropdown').querySelector('button').click()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role=option]')].map(option=>option.textContent)`),['Main','Install dependencies']);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    const select=async(state:string)=>{
      await evaluate(`document.querySelector('[data-state="${state}"]').click()`);
      await until(evaluate,`new URL(document.querySelector('#preview').contentWindow.location.href).searchParams.get('state')==='${state}' && ${frameReady}`);
    };
    for(const state of ['missing','libraries-ready','partial','installing','ready','complete','failed','restart','blocked','connection']){
      await select(state);
      assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-setup]').open`),true,state);
      assert.equal(await evaluate(`(()=>{const doc=document.querySelector('#preview').contentDocument,dialog=doc.querySelector('[data-desktop-setup]'),message=doc.querySelector('#desktop-setup-message'),reference=doc.querySelector('[data-xrb-rebuild-message]'),icon=dialog.querySelector('.xrb-progress-status-icon'),a=getComputedStyle(message),b=getComputedStyle(reference),size=icon.querySelector('svg').getBoundingClientRect();return ['fontFamily','fontSize','fontWeight','lineHeight','color'].every(key=>a[key]===b[key])&&!message.classList.contains('xrb-help')&&icon.getAttribute('aria-hidden')==='true'&&size.width===28&&size.height===28&&dialog.getAttribute('aria-describedby')===message.id;})()`),true,'setup shares progress description typography and a decorative full-size icon');
      assert.equal(await evaluate(`[...document.querySelector('#preview').contentDocument.body.children].every(node=>node.tagName==='DIALOG'||node.id==='case-error')`),true,'background contains no sample app or header');
      if(state==='partial')assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-install=toolchain]').textContent`),'Repair');
      if(state==='blocked')assert.match(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-error]').textContent`),/access permissions/);
      if(state==='connection')await until(evaluate,`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-error]').textContent==='Connection lost. Refresh to reconnect.'`);
    }
    for(const [state,title] of [['installing','Installing desktop prerequisites'],['failed','Setup failed'],['restart','Restart required'],['complete','Rebuilt']]){
      await select(`progress-${state}`);
      assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-xrb-rebuild-title]').textContent`),title);
      if(state==='installing')assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-xrb-rebuild-message]').textContent`),'Install desktop build tools…');
    }
    await select('missing');
    await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate,`!!document.querySelector('#preview').contentDocument.querySelector('[data-desktop-step="native-deps"] .state.ok')`);
    await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-refresh]').click()`);
    assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-refresh]').textContent`),'Checking...');
    await until(evaluate,`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-refresh]').textContent==='Refresh'`);
    assert.equal(await evaluate(`new Promise(resolve=>{const frame=document.querySelector('#preview'),request=new frame.contentWindow.XMLHttpRequest();request.open('GET','/api/host/setup');request.onload=()=>resolve(false);request.onerror=()=>resolve(true);request.send();})`),true,'case CSP blocks real API requests independently of the fetch mock');
    for(const theme of ['light','dark']){
      await evaluate(`window.xrbTheme.set('${theme}')`);
      await until(evaluate,`document.querySelector('#preview').contentDocument.documentElement.dataset.theme==='${theme}'`);
      for(const width of [1280,390]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        assert.equal(await evaluate(`(()=>{const frame=document.querySelector('#preview'),doc=frame.contentDocument,dialog=doc.querySelector('[data-desktop-setup]');return document.documentElement.scrollWidth<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth+1&&getComputedStyle(dialog,'::backdrop').backgroundColor!=='rgba(0, 0, 0, 0)';})()`),true,`${theme}/${width}`);
        if(width===1280){await sleep(200);const image=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(f.artifacts,`design-system-${theme}.png`),Buffer.from(image.data,'base64'));}
      }
    }
    assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[],'only the shell reads navigation; case APIs are simulated');
    await evaluate(`window.__maintenanceCalls=[];window.__originalFetch=window.fetch;window.fetch=async(input,options={})=>{
      const route=new URL(input,location.href).pathname;window.__maintenanceCalls.push([route,options.method??'GET']);
      if(route==='/api/host/setup')return new Response(JSON.stringify({canBuild:true}),{status:200});
      return new Response(JSON.stringify({error:'Synthetic maintenance refusal'}),{status:409});
    }`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#panel-restart').click()`);
    await until(evaluate,`document.querySelector('[data-xrb-restart-dialog]')?.open&&document.querySelector('[data-xrb-restart-title]').textContent==='Restart failed'`);
    assert.equal(await evaluate(`document.querySelector('[data-xrb-restart-message]').textContent`),'Synthetic maintenance refusal');
    await evaluate(`document.querySelector('[data-xrb-restart-close]').click();document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate,`document.querySelector('body > [data-xrb-rebuild-dialog]')?.open&&document.querySelector('body > [data-xrb-rebuild-dialog] [data-xrb-rebuild-title]').textContent==='Rebuild failed'`);
    assert.deepEqual(await evaluate(`window.__maintenanceCalls`),[['/api/restart','POST'],['/api/host/setup','GET'],['/api/host/rebuild','POST']],'gallery shell uses the shared explicit maintenance flow');
    assert.equal(await evaluate(`document.querySelector('#preview').contentDocument.querySelector('[data-desktop-setup]').open`),true,'preview remains isolated from shell maintenance');
    await evaluate(`document.querySelector('body > [data-xrb-rebuild-dialog] [data-xrb-rebuild-close]').click();window.fetch=window.__originalFetch`);
    assert.deepEqual(f.apiRequests.filter(request=>request!=='GET /api/navigation'),[],'maintenance validation never reached the backend');
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#panel-home').click()`);
    await until(evaluate,`location.pathname==='/'&&!!document.querySelector('#design-system-open')`);
    assert.equal(await evaluate(`document.querySelector('#design-system-open').previousElementSibling.dataset.navigation`),'settings','Apps round-trip keeps the Dev entry directly after Settings');
  });
  assert.equal(f.panel.panel.jobs.list().length,0);
  await assert.rejects(fs.stat(f.workspace),{code:'ENOENT'});
});

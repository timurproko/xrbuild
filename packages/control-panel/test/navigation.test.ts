import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {readToolLinks,validateToolLinks,TOOLS_FILE} from '../src/navigation.ts';
import {panelOrigin,panelDestination,toolDestination,managedToolDestination,navigationItems,requestedNavigation,menuKeyboard,shouldReportNavigationError,isReplacementPanel,replaceActiveDocument} from '../ui/navigation.js';
const fixture={id:'tracker',label:'Hand Tracking',url:'http://127.0.0.1:5220/'};
test('tool links are bounded local navigation metadata, not commands or credentials',()=>{
  assert.deepEqual(validateToolLinks({tools:[{...fixture,command:'ignored'}]}),[fixture]);
  for(const url of ['https://example.test/','http://example.test:5220/','http://127.0.0.1/','http://u:p@127.0.0.1:5220/','javascript:alert(1)','http://127.0.0.1:5220/?token=secret','http://127.0.0.1:5220/#fragment'])assert.throws(()=>validateToolLinks({tools:[{...fixture,url}]}),/URL/);
  for(const tools of [[fixture,fixture],[{...fixture,id:'projects'}],[{...fixture,id:'settings'}],[{...fixture,id:'../escape'}],[{...fixture,label:'x'.repeat(61)}],[{...fixture,label:'bad\nlabel'}],Array(13).fill(fixture)])assert.throws(()=>validateToolLinks({tools}));
  assert.throws(()=>validateToolLinks({tools:{}}));assert.throws(()=>validateToolLinks({tools:[{...fixture,passPanelOrigin:'no'}]}),/passPanelOrigin/);
  assert.deepEqual(validateToolLinks({tools:[{...fixture,url:'http://127.0.0.1:5220/hand-tracking/',passPanelOrigin:false}]}),[{...fixture,url:'http://127.0.0.1:5220/hand-tracking/',passPanelOrigin:false}]);
  const managed={id:'managed',label:'Managed Tool',route:'/managed/',module:'tools/managed.mjs',endpoints:['/__managed/']};assert.deepEqual(validateToolLinks({tools:[managed]}),[managed]);
  for(const tool of [{...managed,url:fixture.url},{...managed,route:'/api/'},{...managed,module:'../escape.mjs'},{...managed,module:'tools/managed.js'},{...managed,endpoints:['/api/']},{...managed,endpoints:['/__same/','/__same/']}])assert.throws(()=>validateToolLinks({tools:[tool]}));
  assert.throws(()=>validateToolLinks({tools:[managed,{...managed,id:'other',route:'/managed/child/'}]}),/non-overlapping/);
});
test('tool configuration is optional, BOM tolerant, bounded and workspace-local',async()=>{
  const parent=path.resolve(import.meta.dirname,'../../../.artifacts');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'navigation-'));
  try{assert.deepEqual(await readToolLinks(root),[]);await fs.writeFile(path.join(root,TOOLS_FILE),'\uFEFF'+JSON.stringify({tools:[fixture]}));assert.deepEqual(await readToolLinks(root),[fixture]);await fs.writeFile(path.join(root,TOOLS_FILE),'x'.repeat(16385));await assert.rejects(readToolLinks(root),/16 KiB/);await fs.writeFile(path.join(root,TOOLS_FILE),'{');await assert.rejects(readToolLinks(root),/invalid JSON/);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('enabled plugins provision bounded managed menu tools and disabled plugins start nothing',async()=>{
  const parent=path.resolve(import.meta.dirname,'../../../.artifacts');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'plugin-navigation-')),plugin=path.join(root,'plugins','input-hand-tracking');
  try{await fs.mkdir(plugin,{recursive:true});await fs.writeFile(path.join(plugin,'tool.mjs'),'export const fixture=true;');const declaration={id:'hand-tracking',label:'Hand Tracking',route:'/hand-tracking/',module:'tool.mjs',endpoints:['/__handtracking/']};await fs.writeFile(path.join(plugin,'xrb-plugin.json'),JSON.stringify({title:'Hand Tracking',type:'input',version:'0.1.0',panel:{tools:[declaration]}}));
    assert.deepEqual(await readToolLinks(root),[{...declaration,module:'plugins/input-hand-tracking/tool.mjs',owner:{key:'workspace:input-hand-tracking',root:await fs.realpath(plugin),module:'tool.mjs'}}]);
    await fs.writeFile(path.join(root,'xrb-plugins.json'),JSON.stringify({disabled:['input-hand-tracking'],settings:{}}));assert.deepEqual(await readToolLinks(root),[]);
    await fs.writeFile(path.join(root,'xrb-plugins.json'),JSON.stringify({disabled:[],settings:{}}));await fs.writeFile(path.join(root,TOOLS_FILE),JSON.stringify({tools:[{...fixture,id:'hand-tracking'}]}));await assert.rejects(readToolLinks(root),/distinct across plugins/);
    await fs.writeFile(path.join(root,TOOLS_FILE),JSON.stringify({tools:[]}));await fs.writeFile(path.join(plugin,'xrb-plugin.json'),JSON.stringify({title:'Hand Tracking',type:'input',version:'0.1.0',panel:{tools:[{...declaration,url:fixture.url}]}}));await assert.rejects(readToolLinks(root),/managed route\/module/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('shared navigation has exact order, explicit active page and same-panel return',()=>{
  const items=navigationItems('http://127.0.0.1:5182',[fixture],'tracker');assert.deepEqual(items.map(i=>i.label??'separator'),['Apps','Hand Tracking','Plugins','Settings','separator','Restart','Rebuild']);assert.deepEqual(items.filter(i=>i.current).map(i=>i.id),['tracker']);
  const tool=new URL(items[1].href!);assert.equal(tool.origin,'http://127.0.0.1:5220');assert.equal(tool.searchParams.get('xrbuildPanel'),'http://127.0.0.1:5182');
  const cleanTool=new URL(navigationItems('http://127.0.0.1:5182',[{...fixture,url:'http://127.0.0.1:5220/hand-tracking/',passPanelOrigin:false}],'projects')[1].href!);assert.equal(cleanTool.pathname,'/hand-tracking/');assert.equal(cleanTool.search,'');assert.equal(new URL(items[2].href!).pathname,'/plugins/');assert.equal(new URL(items[3].href!).pathname,'/settings/');assert.equal(new URL(items[5].href!).searchParams.get('maintenance'),'restart');assert.equal(new URL(items[6].href!).searchParams.get('maintenance'),'rebuild');
  const managed=new URL(navigationItems('http://127.0.0.1:5182',[{id:'managed',label:'Managed',route:'/managed/'}],'managed')[1].href!);assert.equal(managed.href,'http://127.0.0.1:5182/managed/');
  assert.equal(panelOrigin('https://example.test'),null);assert.equal(panelOrigin('http://127.0.0.1:5182/path'),null);assert.equal(panelOrigin('http://u:p@127.0.0.1:5182'),null);assert.throws(()=>panelDestination('http://example.test:5182','projects'));assert.throws(()=>toolDestination('javascript:alert(1)','http://127.0.0.1:5182'));assert.throws(()=>managedToolDestination('/api/','http://127.0.0.1:5182'));assert.throws(()=>managedToolDestination('/settings/','http://127.0.0.1:5182'));
});
test('stale panel navigation errors defer to the existing restart indication',()=>{
  assert.equal(shouldReportNavigationError('invalid tool URL',{outdated:true}),false);
  assert.equal(shouldReportNavigationError('invalid tool URL',{outdated:false}),true);
  assert.equal(shouldReportNavigationError('invalid tool URL',null),true);
  assert.equal(shouldReportNavigationError('',{outdated:true}),false);
});
test('maintenance and job navigation are consumed once and only describe an action',()=>{
  const request=requestedNavigation('http://127.0.0.1:5182/?page=plugins&maintenance=rebuild&job=17&keep=1');assert.equal(request.page,'plugins');assert.equal(request.maintenance,'rebuild');assert.equal(request.job,17);assert.equal(request.cleanUrl,'http://127.0.0.1:5182/?keep=1');assert.equal(requestedNavigation(request.cleanUrl).maintenance,null);assert.equal(requestedNavigation(request.cleanUrl).job,null);assert.equal(requestedNavigation('http://127.0.0.1:5182/plugins/').page,'plugins');assert.equal(requestedNavigation('http://127.0.0.1:5182/settings/').page,'settings');assert.equal(requestedNavigation('http://127.0.0.1:5182/?maintenance=run-command&job=invalid').maintenance,null);assert.equal(requestedNavigation('http://127.0.0.1:5182/?job=0').job,null);
});
test('restart recovery recognizes a new panel identity and replaces the same document URL',()=>{
  const old={pid:41,instanceId:'old'},replacement={app:'xrb-control-panel',pid:41,instanceId:'new'};
  assert.equal(isReplacementPanel(old,replacement),true,'a reused process id does not block identity recovery');
  assert.equal(isReplacementPanel(old,{...replacement,instanceId:'old'}),false);
  assert.equal(isReplacementPanel(old,{...replacement,app:'other'}),false);
  assert.equal(isReplacementPanel({pid:41},{app:'xrb-control-panel',pid:42}),true,'older restart responses retain the pid fallback');
  let replaced='';const target={href:'http://127.0.0.1:5182/plugins/?keep=1',replace(url:string){replaced=url;}};
  replaceActiveDocument(target);assert.equal(replaced,target.href);
});
test('menu keyboard skips separators and disabled items and Escape dismisses',()=>{
  const doc:{activeElement:unknown}={activeElement:null};const items=Array.from({length:3},(_,i)=>({disabled:i===1,hidden:false,focus(){doc.activeElement=this;}}));const menu={ownerDocument:doc,querySelectorAll(){return items;}} as unknown as HTMLElement;let closed=false;
  const key=(key:string)=>menuKeyboard({key,preventDefault(){}} as KeyboardEvent,menu,()=>{closed=true;});key('ArrowDown');assert.equal(doc.activeElement,items[0]);key('ArrowDown');assert.equal(doc.activeElement,items[2]);key('ArrowDown');assert.equal(doc.activeElement,items[0]);key('End');assert.equal(doc.activeElement,items[2]);key('Home');assert.equal(doc.activeElement,items[0]);key('Escape');assert.equal(closed,true);
});
test('panel keeps navigation above maintenance and runs restart and rebuild in place',async()=>{
  const ui=path.resolve(import.meta.dirname,'../ui'),html=await fs.readFile(path.join(ui,'index.html'),'utf8'),app=await fs.readFile(path.join(ui,'app.js'),'utf8'),style=await fs.readFile(path.join(ui,'design-system.css'),'utf8'),navigation=await fs.readFile(path.join(ui,'navigation.js'),'utf8'),rebuild=await fs.readFile(path.join(ui,'rebuild-dialog.js'),'utf8'),panel=await fs.readFile(path.resolve(import.meta.dirname,'../src/panel.ts'),'utf8');
  assert.match(html,/id="panel-menu"[^>]*><\/div>/);assert.doesNotMatch(html,/id="panel-home"|id="host-rebuild"|id="panel-restarting"|id="host-rebuilding"/);assert.match(style,/dialog\.xrb-progress-dialog \{[^}]*border: 0; outline: none/);assert.match(style,/dialog\.xrb-progress-dialog:focus[^}]*outline: none/);assert.match(style,/dialog\.xrb-rebuild-dialog, dialog\.xrb-job-progress-dialog \{[^}]*width: min\(660px/);
  assert.match(app,/renderNavigationMenu\(\$\('#panel-menu'\)/);assert.match(navigation,/renderNavigationMenu\(menu/);assert.match(navigation,/\['rebuild','restart'\]/);
  assert.doesNotMatch(app,/plugin-manager-open'\)\.textContent\s*=/);assert.match(app,/restartPanelInPlace\(location\.origin\)/);assert.match(navigation,/export async function restartPanelInPlace/);assert.match(navigation,/export \{rebuildHostInPlace\}/);assert.match(navigation,/minimumUntil=Date\.now\(\)\+1500/);assert.match(navigation,/deadline=Date\.now\(\)\+30_000/);assert.match(navigation,/Close this dialog and choose Restart to try again/);assert.match(navigation,/isReplacementPanel\(result,ping\)/);assert.match(navigation,/dialog\.close\(\);try\{replaceActiveDocument\(\)/);assert.doesNotMatch(navigation,/location\.reload\(\)/);assert.match(navigation,/action==='restart'\|\|action==='rebuild'[\s\S]*?rebuildHostInPlace\(origin\)/);assert.match(app,/navigationRequest\.maintenance==='rebuild'\)\$\('#host-rebuild'\)\.click\(\)/);assert.match(app,/if\(navigationRequest\.job\)await openJobInActivity\(navigationRequest\.job\)/);assert.doesNotMatch(app,/ask\(\{title:'Rebuild\?'/);assert.doesNotMatch(app,/Restart this tool|Restart control panel\?/);assert.match(navigation,/fetch\(new URL\('\/api\/restart',safe\)/);assert.match(rebuild,/fetch\(new URL\('\/api\/host\/rebuild', safe\)/);assert.match(rebuild,/fetch\(new URL\('\/api\/jobs', safe\)/);assert.doesNotMatch(navigation,/function rebuildDialog|function renderRebuild/);assert.match(navigation,/JSON\.stringify\(\{confirm:true\}\)/);assert.match(app,/history\.replaceState\(null,'',navigationRequest\.cleanUrl\)/);
  assert.match(app,/shouldReportNavigationError\(data\.error,state\.panel\)/);assert.match(app,/else if\(data\.error\)console\.warn/);
  assert.match(panel,/hub\.send\('plugins-changed', \{ id \}\)/);
  assert.match(app,/on\('plugins-changed',[\s\S]*?loadNavigation\(\)\.catch\(report\)/);
  assert.match(app,/on\('plugins-changed',[\s\S]*?loadPlugins\(\)\.catch\(report\)/);
  assert.doesNotMatch(app,/api\('PUT', `\/api\/plugins\/manage\/[\s\S]{0,300}await loadNavigation\(\)/);
});

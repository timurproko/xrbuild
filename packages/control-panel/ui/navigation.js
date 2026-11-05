// Shared, framework-neutral navigation. Maintenance choices are explicit one-shot actions.
import {openFloating} from './design-system.js';
import {rebuildHostInPlace} from './rebuild-dialog.js';
export {rebuildHostInPlace};
export function panelOrigin(value) {
  try { const u=new URL(value);return u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null; } catch { return null; }
}
export function panelDestination(origin,page) {
  const safe=panelOrigin(origin);if(!safe)throw new Error('Invalid local panel origin');
  const u=new URL(safe);if(page==='projects')u.pathname='/';
  else if(page==='plugins')u.pathname='/plugins/';
  else if(page==='settings')u.pathname='/settings/';
  else if(['rebuild','restart'].includes(page))u.searchParams.set('maintenance',page);
  else throw new Error('Unknown panel destination');return u.href;
}
export function toolDestination(url,origin,passPanelOrigin=true) {
  const safe=panelOrigin(origin),u=new URL(url);
  if(!safe||u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||!u.port||u.username||u.password)throw new Error('Invalid local tool destination');
  if(passPanelOrigin)u.searchParams.set('xrbuildPanel',safe);return u.href;
}
export function managedToolDestination(route,origin) {
  const safe=panelOrigin(origin);
  if(!safe||typeof route!=='string'||!/^\/(?:[a-z][a-z0-9-]*\/)+$/.test(route)||['/api/','/plugins/','/settings/','/preview/','/vendor/','/sdk/'].some(prefix=>route.startsWith(prefix)))throw new Error('Invalid managed tool destination');
  return new URL(route,safe).href;
}
/** A stale panel already has one actionable state: restart to load its newer code. */
export function shouldReportNavigationError(error,panelFreshness) {
  return !!error&&panelFreshness?.outdated!==true;
}
export function requestedNavigation(url) {
  const u=new URL(url),legacyPage=u.searchParams.get('page'),maintenance=u.searchParams.get('maintenance'),jobValue=u.searchParams.get('job');
  u.searchParams.delete('page');u.searchParams.delete('maintenance');u.searchParams.delete('job');
  const routePage=u.pathname==='/plugins'||u.pathname==='/plugins/'?'plugins':u.pathname==='/settings'||u.pathname==='/settings/'?'settings':u.pathname==='/'?'projects':null;
  return {page:['projects','plugins','settings'].includes(legacyPage)?legacyPage:routePage,maintenance:['rebuild','restart'].includes(maintenance)?maintenance:null,job:/^[1-9]\d*$/.test(jobValue??'')?Number(jobValue):null,cleanUrl:u.href};
}
/** One menu model for the panel and every standalone workspace tool. */
export function navigationItems(origin,tools=[],current='projects') {
  return [{id:'projects',label:'Apps',href:panelDestination(origin,'projects')},
    ...tools.map(t=>({id:t.id,label:t.label,href:t.route?managedToolDestination(t.route,origin):toolDestination(t.url,origin,t.passPanelOrigin!==false)})),
    {id:'plugins',label:'Plugins',href:panelDestination(origin,'plugins')},
    {id:'settings',label:'Settings',href:panelDestination(origin,'settings')},
    {separator:true},
    {id:'restart',label:'Restart',href:panelDestination(origin,'restart')},
    {id:'rebuild',label:'Rebuild',href:panelDestination(origin,'rebuild')}]
    .map(item=>({...item,current:item.id===current}));
}
export function renderNavigationMenu(menu,{origin,tools=[],current='projects',indicators=false}={}) {
  menu.replaceChildren();
  const ids={projects:'panel-home',plugins:'plugin-manager-open',settings:'settings-open',rebuild:'host-rebuild',restart:'panel-restart'};
  for(const item of navigationItems(origin,tools,current)){
    const el=document.createElement(item.separator?'hr':'a');
    if(item.separator)el.setAttribute('role','separator');
    else{
      el.setAttribute('role','menuitem');el.dataset.navigation=item.id;el.href=item.href;el.textContent=item.label;
      if(ids[item.id])el.id=ids[item.id];if(item.current)el.setAttribute('aria-current','page');
      if(indicators&&['rebuild','restart'].includes(item.id)){const dot=document.createElement('span');dot.className=item.id==='rebuild'?'menu-dot rebuild':'menu-dot';dot.id=item.id==='rebuild'?'host-rebuild-dot':'panel-restart-dot';dot.hidden=true;dot.setAttribute('aria-hidden','true');el.append(dot);}
    }
    menu.append(el);
  }
}
function restartDialog(){let dialog=document.querySelector('[data-xrb-restart-dialog]');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.className='xrb-dialog xrb-progress-dialog';dialog.dataset.xrbRestartDialog='';dialog.setAttribute('aria-labelledby','xrb-restarting-title');dialog.setAttribute('aria-describedby','xrb-restarting-message');dialog.innerHTML='<div class="xrb-progress-status"><span class="xrb-progress-spinner" data-xrb-restart-spinner aria-hidden="true"></span><div><h3 id="xrb-restarting-title" data-xrb-restart-title>Restarting</h3><p id="xrb-restarting-message" class="muted" data-xrb-restart-message role="status">The page will reload when it is ready.</p></div></div><div class="row ask-buttons" data-xrb-restart-actions hidden><span class="spacer"></span><button type="button" data-xrb-restart-close>Close</button></div>';dialog.addEventListener('cancel',event=>event.preventDefault());dialog.querySelector('[data-xrb-restart-close]').addEventListener('click',()=>dialog.close());document.body.append(dialog);return dialog;}
function restartFailed(dialog,message){dialog.querySelector('[data-xrb-restart-spinner]').hidden=true;dialog.querySelector('[data-xrb-restart-title]').textContent='Restart failed';dialog.querySelector('[data-xrb-restart-message]').textContent=message;dialog.querySelector('[data-xrb-restart-actions]').hidden=false;}
export function isReplacementPanel(previous,ping){if(ping?.app!=='xrb-control-panel')return false;const before=typeof previous?.instanceId==='string'?previous.instanceId:'';if(before)return typeof ping.instanceId==='string'&&ping.instanceId!==before;return Number.isInteger(previous?.pid)&&Number.isInteger(ping.pid)&&ping.pid!==previous.pid;}
export function replaceActiveDocument(target=location){target.replace(target.href);}
export async function restartPanelInPlace(origin=location.origin){const safe=panelOrigin(origin);if(!safe)throw new Error('Invalid local panel origin');const dialog=restartDialog();dialog.querySelector('[data-xrb-restart-spinner]').hidden=false;dialog.querySelector('[data-xrb-restart-title]').textContent='Restarting';dialog.querySelector('[data-xrb-restart-message]').textContent='The page will reload when it is ready.';dialog.querySelector('[data-xrb-restart-actions]').hidden=true;if(!dialog.open)dialog.showModal();const minimumUntil=Date.now()+1500;let result;try{const response=await fetch(new URL('/api/restart',safe),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true})}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`Restart failed (${response.status})`);result=body;}catch(error){restartFailed(dialog,error instanceof Error?error.message:String(error));return;}const deadline=Date.now()+30_000;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));try{const response=await fetch(new URL('/api/ping',safe),{cache:'no-store'});if(!response.ok)continue;const ping=await response.json();if(isReplacementPanel(result,ping)){await new Promise(resolve=>setTimeout(resolve,Math.max(0,minimumUntil-Date.now())));dialog.close();try{replaceActiveDocument();}catch(error){dialog.showModal();restartFailed(dialog,error instanceof Error?error.message:String(error));}return;}}catch{/* The server is briefly unavailable between processes. */}}restartFailed(dialog,'The restart is taking longer than expected. Close this dialog and choose Restart to try again.');}

export function menuKeyboard(event,menu,close) {
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const items=[...menu.querySelectorAll('[role="menuitem"]')].filter(el=>!el.disabled&&!el.hidden),at=items.indexOf(menu.ownerDocument.activeElement);
  if(!items.length)return;event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:at<0?0:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[next].focus();
}
/** Standalone tools keep native-camera framing/CORS policy unchanged: ordinary same-tab links. */
export function mountToolNavigation(button,menu,{origin,tools,current}) {
  const events=new AbortController(),signal=events.signal;
  renderNavigationMenu(menu,{origin,tools,current,indicators:true});
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  const dismiss=()=>{close();button.focus();};
  button.addEventListener('click',()=>{if(!menu.hidden){close();return;}openFloating(menu,{anchor:button});button.setAttribute('aria-expanded','true');menu.querySelector('[aria-current="page"]')?.focus();},{signal});
  button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(menu.hidden)button.click();menu.querySelector('[role="menuitem"]')?.focus();}},{signal});
  menu.addEventListener('keydown',e=>menuKeyboard(e,menu,dismiss),{signal});
  menu.addEventListener('click',e=>{const item=e.target.closest('[data-navigation]'),action=item?.dataset.navigation;if(action==='restart'||action==='rebuild'){e.preventDefault();close();void (action==='restart'?restartPanelInPlace(origin):rebuildHostInPlace(origin));return;}if(e.target.closest('[aria-current="page"]'))e.preventDefault();close();},{signal});
  document.addEventListener('click',e=>{if(!button.contains(e.target)&&!menu.contains(e.target))close();},{signal});
  addEventListener('resize',close,{signal});return ()=>{events.abort();menu.replaceChildren();close();};
}

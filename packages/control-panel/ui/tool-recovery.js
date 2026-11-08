import {panelOrigin,managedToolDestination} from './navigation.js';

const idPattern=/^[a-z][a-z0-9-]{0,47}$/;
const pathIdentity=value=>typeof value==='string'?( /^[a-z]:[\\/]/i.test(value)?value.replaceAll('\\','/').toLowerCase():value):null;
export function samePanelIdentity(before,after){
  return before?.app==='xrb-control-panel'&&after?.app==='xrb-control-panel'
    &&['repo','workspace','projects'].every(key=>pathIdentity(before[key])!==null&&pathIdentity(before[key])===pathIdentity(after[key]));
}
const validPing=ping=>ping?.app==='xrb-control-panel'&&typeof ping.instanceId==='string'&&!!ping.instanceId
  &&['repo','workspace','projects'].every(key=>typeof ping[key]==='string'&&!!ping[key]);

/** User navigation may recover stale code, but never force work down, install tools, or follow another workspace. */
export async function recoverManagedTool({toolId,origin=location.origin,request=fetch,storage,navigate=url=>location.replace(url),onStatus=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeout=30_000}={}){
  const safe=panelOrigin(origin),finish=(state,message)=>{onStatus(message);return{state,message};};
  if(typeof window!=='undefined'&&window.top!==window)return finish('blocked','Open this tool directly from Apps to refresh it.');
  if(!safe||!idPattern.test(toolId??''))return finish('blocked','This tool link is invalid. Return to Apps.');
  const get=async route=>{const response=await request(new URL(route,safe),{cache:'no-store',signal:AbortSignal.timeout(3_000)});return response.ok?response.json():null;};
  const post=async(route,body={})=>{const response=await request(new URL(route,safe),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(3_000)});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>({}))};};
  let before=null,restarting=false,retried=false;
  const deadline=now()+timeout;
  while(now()<deadline){
    try{
      const ping=await get('/api/ping');
      if(!ping){await pause(250);continue;}
      if(!validPing(ping))return finish('blocked','This address is not the expected panel. Return to Apps.');
      if(!before)before=ping;
      if(!samePanelIdentity(before,ping))return finish('blocked','The selected workspace changed. Return to Apps.');
      if(restarting&&ping.instanceId===before.instanceId){await pause(250);continue;}
      const navigation=await get('/api/navigation'),tool=navigation?.tools?.find(item=>item.id===toolId);
      if(!tool?.route)return finish('blocked','This tool is no longer selected. Return to Apps.');
      let destination;try{destination=managedToolDestination(tool.route,safe);}catch{return finish('blocked','The updated tool route is invalid. Return to Apps.');}
      const status=await get(`/api/tools/${encodeURIComponent(toolId)}/status`);
      if(!status){await pause(250);continue;}
      if(status.state==='ready'){
        const current=await get('/api/ping');
        if(!validPing(current)||!samePanelIdentity(before,current))return finish('blocked','The selected workspace changed. Return to Apps.');
        if(current.instanceId!==ping.instanceId){await pause(250);continue;}
        navigate(destination);return{state:'ready',destination};
      }
      if(status.restartRequired===true){
        if(restarting)return finish('blocked','The tool still needs attention after refreshing. Return to Apps.');
        const run=await get('/api/run'),jobs=await get('/api/jobs');
        if(run?.state?.phase!=='idle'||!Array.isArray(jobs?.jobs)||jobs.jobs.some(job=>['queued','running'].includes(job.state))){onStatus('Waiting for current work to finish…');await pause(500);continue;}
        const key='xrb.tool-recovery:'+JSON.stringify([pathIdentity(before.repo),pathIdentity(before.workspace),pathIdentity(before.projects),toolId]);
        let attempted,store;try{store=storage??globalThis.sessionStorage;attempted=Number(store.getItem(key));if(attempted>0&&now()-attempted<60_000)return finish('blocked','Automatic refresh was already attempted. Return to Apps.');store.setItem(key,String(now()));}catch{return finish('blocked','Automatic refresh is unavailable. Return to Apps.');}
        before=ping;
        onStatus('Refreshing the panel…');
        let result;try{result=await post('/api/restart',{confirm:false,ifIdle:true,expectedInstanceId:ping.instanceId});}catch{restarting=true;await pause(250);continue;}
        if(result.status===409&&result.body.details?.retryWhenIdle===true){try{store.removeItem(key);}catch{}onStatus('Waiting for current work to finish…');await pause(500);continue;}
        if(!result.ok)return finish('blocked','The panel could not refresh safely. Return to Apps.');
        if(result.body.instanceId!==ping.instanceId||!samePanelIdentity(ping,{app:'xrb-control-panel',...result.body}))return finish('blocked','The panel identity changed. Return to Apps.');
        restarting=true;
      }else if((status.state==='error'||status.state==='idle')&&!retried){
        retried=true;onStatus('Preparing the tool…');await post(`/api/tools/${encodeURIComponent(toolId)}/retry`);
      }else if(status.state==='error')return finish('failed','The tool could not start. Return to Apps to review the update.');
      else onStatus('Preparing the tool…');
    }catch{/* The owning listener can be briefly unavailable during a normal restart. */}
    await pause(250);
  }
  return finish('timeout',restarting?'Refreshing is taking longer than expected. You can return to Apps.':'Current work is still running or the tool is unavailable. You can return to Apps.');
}

if(typeof document!=='undefined'){
  const message=document.getElementById('tool-recovery-status');
  if(message)void recoverManagedTool({toolId:new URL(location.href).searchParams.get('tool'),onStatus:text=>{message.textContent=text;}});
}

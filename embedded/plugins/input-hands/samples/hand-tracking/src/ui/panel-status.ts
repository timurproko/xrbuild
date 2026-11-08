import {updateRebuildChip,updateRestartChip} from '@xr-build/design-system';
import {toolPanelOrigin} from './navigation.ts';
interface PanelStatus {host:{exists:boolean;outdated:boolean};panel:{outdated:boolean}}
export function setupPanelStatus():()=>void{
  const events=new AbortController(),host=document.getElementById('host-chip')!,panel=document.getElementById('panel-chip')!;
  const refresh=async()=>{
    try{
      const response=await fetch(`/__xrbuild/panel-status?origin=${encodeURIComponent(toolPanelOrigin())}`,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(3000)});
      if(!response.ok)throw new Error(`Panel status ${response.status}`);const status=await response.json() as PanelStatus;
      const needsRebuild=updateRebuildChip(host,status.host),needsRestart=updateRestartChip(panel,status.panel.outdated);
      const hostDot=document.getElementById('host-rebuild-dot'),panelDot=document.getElementById('panel-restart-dot');if(hostDot)hostDot.hidden=!needsRebuild;if(panelDot)panelDot.hidden=!needsRestart;
    }catch{host.hidden=true;panel.hidden=true;}
  };
  void refresh();const timer=setInterval(()=>void refresh(),30000);addEventListener('focus',refresh,{signal:events.signal});
  return()=>{clearInterval(timer);events.abort();};
}

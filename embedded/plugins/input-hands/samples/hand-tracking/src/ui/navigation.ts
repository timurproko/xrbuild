import {panelOrigin,mountToolNavigation} from '@xr-build/panel-navigation';
/** Only a navigation/status return address, never a bridge origin/authentication override. */
export function toolPanelOrigin():string{
  const configured=document.querySelector<HTMLMetaElement>('meta[name="xrbuild-panel-url"]')?.content;
  return panelOrigin(new URL(location.href).searchParams.get('xrbuildPanel'))||panelOrigin(configured)||'http://127.0.0.1:5281';
}
export function setupNavigation():()=>void{
  const origin=toolPanelOrigin();
  return mountToolNavigation(document.getElementById('panel-menu-button')!,document.getElementById('panel-menu')!,{
    origin,current:'hand-tracking',tools:[{id:'hand-tracking',label:'Hands',url:location.origin+location.pathname}]
  });
}

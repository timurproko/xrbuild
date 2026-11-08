import {validSerial,type Device} from '../live/rgbd/protocol.ts';
import {BASELINE,captureProfile,matchingProfiles,profileLabel} from '../live/rgbd/profiles.ts';
import {legacyStorage,migratedStorage} from './legacy-storage.ts';
import {workspaceStorage} from './workspace-storage.ts';
export type CameraSlot='single'|'a'|'b';
type Choice={serial:string;profile:string};type Backend='rgbd'|'multiview'|'camera';
const KEY='handtracking.capture-preferences.v1';
const browserStorage=()=>workspaceStorage;
/** Preferences only: never media, tokens, transforms, timing, rig confirmation or camera Start. */
export class CapturePreferences {
  private choices:Partial<Record<CameraSlot,Choice>>={};private backend:Backend|null=null;private browserDevice:string|null=null;private browserProfile='640x480@30';private storage:(Pick<Storage,'getItem'|'setItem'>&Partial<Pick<Storage,'removeItem'>>)|null;
  constructor(storage=browserStorage()){this.storage=storage;try{const raw=storage?migratedStorage(storage,KEY,legacyStorage.capture):null;if(!raw||raw.length>4096)return;const p=JSON.parse(raw);if(p?.version!==1)return;if(['rgbd','multiview','camera'].includes(p.backend))this.backend=p.backend;if(typeof p.browserDevice==='string'&&p.browserDevice.length<=512&&!/[\0\r\n]/.test(p.browserDevice))this.browserDevice=p.browserDevice;if(typeof p.browserProfile==='string'&&/^\d{2,4}x\d{2,4}@\d{1,3}$/.test(p.browserProfile))this.browserProfile=p.browserProfile;for(const slot of ['single','a','b'] as const){const v=p[slot];if(v&&validSerial(v.serial)){try{captureProfile(v.profile);this.choices[slot]={serial:v.serial,profile:v.profile};}catch{}}}}catch{}}
  choice(slot:CameraSlot):Choice|undefined{const v=this.choices[slot];return v?{...v}:undefined;}
  mode():Backend|null{return this.backend;}
  setMode(value:string):void{if(!['rgbd','multiview','camera'].includes(value))return;this.backend=value as Backend;this.save();}
  browserCamera():string|null{return this.browserDevice;}
  chooseBrowserCamera(value:string):void{this.browserDevice=value&&value.length<=512&&!/[\0\r\n]/.test(value)?value:null;this.save();}
  browserCaptureProfile():string{return this.browserProfile;}
  chooseBrowserProfile(value:string):void{if(/^\d{2,4}x\d{2,4}@\d{1,3}$/.test(value)){this.browserProfile=value;this.save();}}
  choose(slot:CameraSlot,serial:string,profile=BASELINE):void{if(!validSerial(serial))return;captureProfile(profile);this.choices[slot]={serial,profile};this.save();}
  clear(slot:CameraSlot):void{delete this.choices[slot];this.save();}
  private save():void{try{this.storage?.setItem(KEY,JSON.stringify({version:1,backend:this.backend,browserDevice:this.browserDevice,browserProfile:this.browserProfile,...this.choices}));}catch{/* Storage denial leaves the current tab usable. */}}
}
export let capturePreferences=new CapturePreferences();
export function initializeCapturePreferences():void{capturePreferences=new CapturePreferences();}
/** Keep remembered missing identities visible. Never auto-substitute another physical device. */
export function syncCamera(select:HTMLSelectElement,devices:readonly Device[],slot:CameraSlot,loading=false):void {
  if(loading&&!devices.length&&[...select.options].some(option=>option.value&&!option.text.startsWith('Saved camera unavailable')))return;
  const key=JSON.stringify([devices,loading]);if(select.dataset.devices===key)return;const wanted=select.value||capturePreferences.choice(slot)?.serial||'';select.dataset.devices=key;
  const placeholder=new Option(loading?'Loading…':'Select camera','');placeholder.disabled=loading;select.replaceChildren(placeholder);for(const d of devices){const supported=matchingProfiles(d).length>0,option=new Option(`${d.name} · ${d.serial}${supported?'':' · no supported RGB-D mode'}`,d.serial);option.disabled=!supported;select.add(option);}if(wanted&&!devices.some(d=>d.serial===wanted)){const option=new Option(loading?'Loading…':`Saved camera unavailable · ${wanted}`,wanted);option.disabled=true;select.add(option);}select.value=wanted&&[...select.options].some(option=>option.value===wanted)?wanted:'';
}
export function syncProfiles(select:HTMLSelectElement,device:Device|undefined,slot:CameraSlot,active:boolean,loading=false):string[]{
  if(loading&&!device&&[...select.options].some(option=>option.value&&!option.text.startsWith('Saved mode unavailable'))){if(!select.disabled)select.disabled=true;return [];}
  const profiles=matchingProfiles(device),key=JSON.stringify([device?.serial,profiles,loading]);if(select.dataset.profiles!==key){const saved=capturePreferences.choice(slot),wanted=select.value||saved?.profile||(profiles.includes(BASELINE)?BASELINE:profiles[0])||'';if(profiles.length)select.replaceChildren(...profiles.map(p=>new Option(profileLabel(p),p)));else{const option=new Option(loading?'Loading…':wanted?`Saved mode unavailable · ${wanted}`:'No matching profiles',wanted);option.disabled=true;select.replaceChildren(option);}if(profiles.length&&wanted&&!profiles.includes(wanted)){const option=new Option(`Saved mode unavailable · ${wanted}`,wanted);option.disabled=true;select.add(option);}select.value=wanted&&[...select.options].some(option=>option.value===wanted)?wanted:profiles[0]??'';select.dataset.profiles=key;}const disabled=active||loading||!profiles.length;if(select.disabled!==disabled)select.disabled=disabled;return profiles;
}

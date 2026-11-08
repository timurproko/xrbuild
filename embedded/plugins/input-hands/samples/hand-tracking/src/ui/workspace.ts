import type { Lifetime } from '../lifecycle.ts';
import {legacyStorage,migratedStorage} from './legacy-storage.ts';
import {workspaceStorage} from './workspace-storage.ts';
const element=<T extends HTMLElement=HTMLElement>(id:string):T=>{const found=document.getElementById(id);if(!found)throw new Error(`Missing #${id}`);return found as T;};
export interface UiSnapshot {
  source:string;fps:number;trackingHz:number;hands:number;
  multiview?:{capturing:boolean;starting:boolean;stopping:boolean;replaying:boolean;mode:string;worldFrame:string;setup?:{qualified:boolean;reason:string;timingQualification?:string|null};rendered:number;error:string;recorder:{state:string};a:{backend:string;inferenceMs:number;processedHz:number;frames:number;wire:{clientBusyDrops:number}|null};b:{backend:string;inferenceMs:number;processedHz:number;frames:number;wire:{clientBusyDrops:number}|null}};
  live:{state?:string;delegate?:string;inferenceMs?:number;processedHz?:number;skipped?:number;frames?:number};
  rgbd:{state:string;pairing:string;backend:string;inferenceMs:number;processedHz:number;frames:number;wire:{clientBusyDrops:number}|null;measured:{valid:number;probe:{valid:boolean}|null;view:string}};
  recording:{sideBySide?:boolean;recorder:{state:string};images:{displayed:number};mode:string;csv?:{selected:string|null;playing:boolean;hands:number;index:number};clip?:{backend:{delegate:string|null}}|null;rerun?:{delegate:string}|null;depth?:{view:string;renderedA:number;renderedB:number}|null};
}
export function runtimeLabel(state:UiSnapshot):{label:string;kind:string}{
  if(state.source==='multiview'&&state.multiview){const m=state.multiview;return m.recorder.state==='recording'?{label:'Recording pair',kind:'err'}:m.replaying?{label:'Paired replay',kind:'none'}:m.stopping?{label:'Stopping both',kind:'busy'}:m.starting?{label:'Starting both',kind:'busy'}:m.capturing&&['best','fused'].includes(m.mode)&&m.setup&&!m.setup.qualified?{label:'Fusion needs setup',kind:'busy'}:m.capturing?{label:'Two cameras',kind:'run'}:{label:'Cameras off',kind:'none'};}
  if(state.recording.recorder.state==='recording')return {label:'Recording',kind:'err'};
  if(state.source==='recording')return {label:'Replay',kind:'none'};
  if(state.source==='synthetic')return {label:'Generated fixture',kind:'busy'};
  const value=state.source==='rgbd'?state.rgbd.state:state.live.state;
  if(value==='running')return {label:'Capturing',kind:'run'};
  if(value==='error')return {label:'Unavailable',kind:'err'};
  if(value==='connecting'||state.source==='rgbd'&&state.rgbd.pairing==='connecting')return {label:'Connecting',kind:'busy'};
  if(value&&['loading','permission','loading-model','starting-camera'].includes(value))return {label:'Starting',kind:'busy'};
  if(value==='stopping')return {label:'Stopping',kind:'busy'};
  return {label:state.source==='rgbd'&&value==='disconnected'?'Disconnected':'Camera off',kind:'none'};
}

/** Same activity-tab pattern as the control panel, with independent panel scroll and keyboard navigation. */
export class WorkspaceUi {
  private events=new AbortController();
  private previousLive='rgbd';private captureRunning=false;private replayControls=false;private replayDisabled=new Map<HTMLInputElement|HTMLSelectElement|HTMLButtonElement,boolean>();
  constructor(life:Lifetime,changeSource:(source:string)=>void){
    for(const list of document.querySelectorAll<HTMLElement>('[role="tablist"]')){
      const tabs=()=>[...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter(tab=>!tab.disabled);
      list.addEventListener('click',event=>{const tab=(event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');if(tab&&!tab.disabled)this.select(tab.id);},{signal:this.events.signal});
      list.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        const available=tabs(),index=available.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;
        event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
        this.select(available[next].id);available[next].focus();
      },{signal:this.events.signal});
    }
    for(const list of document.querySelectorAll<HTMLElement>('[role="tablist"][data-tab-state]')){try{const state=list.dataset.tabState!,id=migratedStorage(workspaceStorage,`handtracking.tab.${state}.v1`,legacyStorage.tab(state)),tab=id?document.getElementById(id) as HTMLButtonElement|null:null;if(tab&&list.contains(tab)&&!tab.disabled)this.select(tab.id);}catch{}}
    element('capture-backend').addEventListener('change',()=>{const source=element<HTMLSelectElement>('capture-backend').value;this.previousLive=source;changeSource(source);},{signal:this.events.signal});
    element('debug-synthetic').addEventListener('click',()=>{changeSource('synthetic');this.select('capture-tab');},{signal:this.events.signal});
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-output-kind]'))button.addEventListener('click',()=>{const group=button.closest<HTMLElement>('[data-output-tabs]');if(!group)return;group.dataset.kind=button.dataset.outputKind;for(const item of group.querySelectorAll<HTMLButtonElement>('[data-output-kind]'))item.setAttribute('aria-pressed',String(item===button));},{signal:this.events.signal});
    this.cameraContextMenu();
    life.own(()=>this.events.abort());
  }
  private cameraContextMenu():void{
    const menu=element('camera-context-menu'),refresh=element<HTMLButtonElement>('camera-context-refresh'),authorize=element<HTMLButtonElement>('camera-context-authorize'),recalibrate=element<HTMLButtonElement>('camera-context-recalibrate');let command:HTMLButtonElement|null=null;
    const close=()=>{menu.hidden=true;command=null;};
    document.addEventListener('contextmenu',event=>{const target=event.target as HTMLElement,owner=target.closest('.xrb-select,label'),select=owner?.querySelector<HTMLSelectElement>('select');if(!select)return;const commandId:{[id:string]:string}={'capture-camera':'capture-camera-refresh','camera-device':'camera-refresh','rgbd-device':'rgbd-refresh','rgbd-device-b':'rgbd-refresh','mv-device-a':'mv-refresh','mv-device-b':'mv-refresh'};const id=commandId[select.id];if(!id)return;event.preventDefault();command=element<HTMLButtonElement>(id);refresh.disabled=command.disabled;authorize.hidden=!['capture-camera','camera-device'].includes(select.id);recalibrate.hidden=!['mv-device-a','mv-device-b'].includes(select.id);void import('@xr-build/design-system').then(({openFloating})=>openFloating(menu,{x:event.clientX,y:event.clientY}));},{signal:this.events.signal});
    refresh.addEventListener('click',()=>{if(command&&!command.disabled)command.click();close();},{signal:this.events.signal});
    authorize.addEventListener('click',()=>{element<HTMLButtonElement>('capture-camera-authorize').click();close();},{signal:this.events.signal});
    recalibrate.addEventListener('click',()=>{element<HTMLButtonElement>('mv-calibrate').click();close();},{signal:this.events.signal});
    document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target as Node))close();},{signal:this.events.signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')close();},{signal:this.events.signal});
  }
  select(id:string):void {
    const selected=element<HTMLButtonElement>(id);if(selected.disabled)return;const list=selected.closest('[role="tablist"]');if(!list)return;
    for(const tab of list.querySelectorAll<HTMLButtonElement>('[role="tab"]')){
      const active=tab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      element(tab.getAttribute('aria-controls')!).hidden=!active;
    }
    const state=(list as HTMLElement).dataset.tabState;if(state)try{workspaceStorage.setItem(`handtracking.tab.${state}.v1`,id);}catch{}this.captureHeader(this.captureRunning);
  }
  private captureHeader(active:boolean):void{this.captureRunning=active;element('capture-header-stop').hidden=!active||element<HTMLButtonElement>('capture-tab').getAttribute('aria-selected')==='true';}
  private rates(active:boolean,renderFps:number,trackingFps:number|string):void {const dock=element('stats-dock');dock.hidden=!active;if(!active)return;const renderUnit=document.createElement('small'),trackingUnit=document.createElement('small');renderUnit.textContent='render fps';trackingUnit.textContent='hand tracking fps';element('render-stat').replaceChildren(String(Math.round(renderFps*10)/10),renderUnit);element('tracking-stat').replaceChildren(typeof trackingFps==='number'?trackingFps.toFixed(1):trackingFps,trackingUnit);}
  private captureReplay(active:boolean):void{const controls=[...document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('#capture-pane input,#capture-pane select,#capture-pane button')];if(active){if(!this.replayControls){this.replayDisabled.clear();for(const control of controls)this.replayDisabled.set(control,control.disabled);this.replayControls=true;}const multi=this.previousLive==='multiview';element('capture-camera-field').hidden=multi;element('capture-mode-field').hidden=true;element('live-actions').hidden=this.previousLive!=='camera';element('rgbd-actions').hidden=this.previousLive!=='rgbd';element('mv-actions').hidden=!multi;for(const [id,source] of [['camera-toggle','camera'],['rgbd-toggle','rgbd'],['mv-toggle','multiview']] as const)element<HTMLButtonElement>(id).hidden=this.previousLive!==source;for(const control of controls)control.disabled=true;return;}if(!this.replayControls)return;for(const [control,disabled] of this.replayDisabled)control.disabled=disabled;this.replayDisabled.clear();this.replayControls=false;}
  private output(state:UiSnapshot):void{const multiview=state.source==='multiview'&&!!state.multiview,synthetic=state.source==='synthetic',single=element('single-output');single.hidden=multiview||synthetic;if(multiview){const group=document.querySelector<HTMLElement>('[data-output-tabs="multiview"]')!,kind=group.dataset.kind==='depth'?'depth':'rgb';for(const side of ['a','b']){element(`mv-rgb-${side}`).hidden=kind!=='rgb';element(`mv-depth-${side}`).hidden=kind!=='depth';}return;}const depth=state.source==='rgbd'||state.source==='recording'&&!!state.recording.depth,tabs=element('single-output-tabs'),kind=depth&&tabs.dataset.kind==='depth'?'depth':'rgb';tabs.hidden=!depth;if(!depth)tabs.dataset.kind='rgb';for(const button of tabs.querySelectorAll<HTMLButtonElement>('[data-output-kind]'))button.setAttribute('aria-pressed',String(button.dataset.outputKind===kind));element('live-preview-section').hidden=single.hidden||kind!=='rgb';element('rgbd-depth-section').hidden=single.hidden||!depth||kind!=='depth';}
  replay():void {this.select('record-tab');this.select('preview-tab');}
  update(state:UiSnapshot):void {
    element('single-inspection').hidden=!['camera','rgbd'].includes(state.source);element('hand-view-tools').hidden=!['camera','rgbd','multiview'].includes(state.source);this.output(state);if(state.source==='multiview'&&state.multiview){const m=state.multiview;this.previousLive='multiview';this.captureReplay(m.replaying);this.captureHeader(m.capturing&&!m.replaying);element<HTMLSelectElement>('capture-backend').value='rgbd';element('record-unsupported').hidden=true;for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-rgbd-tab]')){tab.hidden=false;tab.disabled=false;}this.rates(m.capturing||m.replaying,state.fps,m.replaying?'—':(m.a.processedHz+m.b.processedHz)/2);element('viewport-empty').hidden=m.rendered>0;element('viewport-empty').firstElementChild!.textContent=m.capturing||m.replaying?(['best','fused'].includes(m.mode)&&m.setup&&!m.setup.qualified?`Fusion blocked: ${m.setup.reason}`:'No accepted output · inspect depth / pairing'):'Start both cameras';element('pipeline-backend').textContent=`A ${m.a.backend||'off'} / B ${m.b.backend||'off'}`;element('pipeline-inference').textContent=m.replaying?'—':`${m.a.inferenceMs.toFixed(1)} / ${m.b.inferenceMs.toFixed(1)} ms`;element('pipeline-skipped').textContent=m.replaying?'—':`${m.a.wire?.clientBusyDrops??0} / ${m.b.wire?.clientBusyDrops??0}`;return;}
    const native=state.source==='rgbd',replay=state.source==='recording',synthetic=state.source==='synthetic',depthReplay=replay&&!!state.recording.depth;
    if(native||state.source==='camera'){this.previousLive=state.source;element<HTMLSelectElement>('capture-backend').value=state.source;}
    this.captureReplay(replay);element('record-unsupported').hidden=native||state.source==='camera'||replay;
    for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-rgbd-tab]')){const available=native||state.source==='camera'||depthReplay;tab.hidden=!available;tab.disabled=!available;if(!available&&tab.getAttribute('aria-selected')==='true')this.select('preview-tab');}
    const capturing=native?state.rgbd.state==='running':state.source==='camera'&&state.live.state==='running';this.captureHeader(capturing);const active=synthetic||capturing||(replay?(!!state.recording.csv?.selected||state.recording.images.displayed>=0):false),trackingFps=synthetic?state.trackingHz:native?state.rgbd.processedHz:replay?'—':state.live.processedHz??0;this.rates(active,state.fps,trackingFps);
    const visible=native&&state.rgbd.measured.view==='camera-metric'?state.rgbd.measured.valid>0||!!state.rgbd.measured.probe?.valid:depthReplay&&state.recording.depth!.view!=='raw'?state.recording.depth!.renderedA+state.recording.depth!.renderedB>0:state.hands>0;
    element('viewport-empty').hidden=visible||synthetic||replay&&!!state.recording.sideBySide;
    element('viewport-empty').firstElementChild!.textContent=active?(state.hands>0?'No accepted surface points':'Waiting for hands'):replay?'No frame selected':'Start capture';
    const rgbFrame=active&&(native?state.rgbd.frames>0:replay?state.recording.images.displayed>=0:(state.live.frames??0)>0);element('preview-empty').hidden=synthetic||rgbFrame;element('rgbd-depth-empty').hidden=native?active&&state.rgbd.frames>0:depthReplay&&state.recording.images.displayed>=0;
    element('live-camera-name').hidden=element('live-hand-info').hidden=true;
    const backend=native?state.rgbd.backend:replay?(state.recording.mode==='rerun'?state.recording.rerun?.delegate:state.recording.clip?.backend.delegate):synthetic?null:state.live.delegate;
    element('pipeline-backend').textContent=backend||'—';
    element('pipeline-inference').textContent=replay||synthetic?'—':`${(native?state.rgbd.inferenceMs:state.live.inferenceMs??0).toFixed(1)} ms`;
    element('pipeline-skipped').textContent=replay||synthetic?'—':String(native?state.rgbd.wire?.clientBusyDrops??0:state.live.skipped??0);
  }
}

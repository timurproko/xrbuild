/// <reference types="vite/client" />
import * as THREE from 'three';
import assets from '../../../assets/vision-assets.json' with { type:'json' };
import { Lifetime } from '../../lifecycle.ts';
import type { LivePanel } from '../panel.ts';
import type { LiveFrame,Point } from '../contracts.ts';
import { MeasuredSkeleton,measurementOverlay } from './measured-visual.ts';
import { DEPTH_DEFAULTS,validateDepthSettings,JOINT_NAMES,ProbeWindow,type DepthSettings,type ReconstructionFrame } from './reconstruction.ts';
import type { Pixel } from './geometry.ts';
import { RelativeSkeleton,drawOverlay } from '../visual.ts';
import { RgbdSession,type DisplayFrame } from './session.ts';
import { AutomaticBridge } from './automatic.ts';
import { depthAt,cursorPixel,type Packet,type DepthSpace,type Device } from './protocol.ts';
import { type ViewSettings } from './pixels.ts';
import {BASELINE,matchingProfiles} from './profiles.ts';
import {capturePreferences,syncCamera,syncProfiles} from '../../ui/capture-preferences.ts';
import type { DepthCaptureMetadata } from '../recording/depth-format.ts';
const el=<T extends HTMLElement>(id:string):T=>{const v=document.getElementById(id);if(!v)throw new Error(`Missing #${id}`);return v as T;};
const text=(id:string,value:string)=>{el(id).textContent=value;};
export class RgbdPanel {
  readonly visual=new THREE.Group();private relative=new RelativeSkeleton();private measured=new MeasuredSkeleton();
  private reconstruction:ReconstructionFrame|null=null;private depthSettings:DepthSettings={...DEPTH_DEFAULTS};
  private probe:Pixel|null=null;private probeWindow=new ProbeWindow();private wantsFrame=true;
  private tools:{reset():void;frame(points:readonly Point[]):void};
  private presentedSequence=0;private receivePageMs:number|null=null;private receiveToRenderMs:number|null=null;
  private listeners=new Set<{frame(value:DisplayFrame):void;clear():void;presented?(sequence:number,pageMs:number):void}>();
  private enabled=false;private discovering=false;private events=new AbortController();private automatic:AutomaticBridge;private autoConnect:boolean;
  private session:RgbdSession;private frame:LiveFrame|null=null;private packet:Packet|null=null;private view:ViewSettings|null=null;
  private valid=0;private secondRequested=false;private deviceKey='';private calibrationKey='';private hover:{clientX:number;clientY:number}|null=null;private localError='';private overlay=el<HTMLCanvasElement>('camera-overlay');private depth=el<HTMLCanvasElement>('rgbd-depth');
  constructor(scene:THREE.Scene,life:Lifetime,privateSettings:Pick<LivePanel,'settings'>,tools:{reset():void;frame(points:readonly Point[]):void},private addCamera:(selection:{a:string;profileA:string;b:string})=>void=()=>{},options:{autoConnect?:boolean}={}){
    this.tools=tools;this.autoConnect=options.autoConnect!==false;this.visual.add(this.relative,this.measured);scene.add(this.visual);
    this.session=new RgbdSession({frame:value=>this.show(value),clear:()=>this.clear(),view:()=>this.options(),reconstruction:()=>({settings:this.depthSettings,probe:this.probe})});
    this.automatic=new AutomaticBridge({connect:(url,token)=>this.session.connect(url,token),error:message=>{this.localError=message;}});
    const managed=!!document.querySelector('meta[name="handtracking-managed-bridge"][content="1"]');
    el<HTMLInputElement>('rgbd-manual-mode').checked=!managed;el<HTMLDetailsElement>('rgbd-manual').open=!managed;
    el<HTMLSelectElement>('rgbd-joint').replaceChildren(...JOINT_NAMES.map((name,index)=>new Option(`${index} · ${name}`,String(index))));
    el<HTMLSelectElement>('single-joint').replaceChildren(...JOINT_NAMES.map((name,index)=>new Option(`${index} · ${name}`,String(index))));
    const on=(id:string,type:string,fn:()=>void)=>el(id).addEventListener(type,fn,{signal:this.events.signal});
    on('rgbd-connect','click',()=>{try{this.automatic.cancel();this.localError='';this.session.connect(el<HTMLInputElement>('rgbd-url').value,el<HTMLInputElement>('rgbd-token').value.trim());}catch(error){this.localError=String((error as Error).message??error);}});
    on('rgbd-manual-mode','change',()=>{this.automatic.cancel();this.session.disconnect();this.localError='';if(this.enabled&&!this.manualMode())this.connectAutomatic();});
    on('rgbd-retry','click',()=>this.connectAutomatic());
    on('rgbd-disconnect','click',()=>{this.automatic.cancel();this.session.disconnect();});on('rgbd-refresh','click',()=>this.session.refresh());
    on('rgbd-toggle','click',()=>{const state=this.session.snapshot().state;if(['running','loading-model','starting-camera'].includes(state))void this.session.stop();else void this.startCapture(privateSettings);});
    on('rgbd-add-camera','click',()=>{this.secondRequested=true;const group=el('rgbd-second-camera');group.classList.add('is-open');group.setAttribute('aria-hidden','false');el<HTMLSelectElement>('rgbd-device-b').focus();});
    on('rgbd-remove-b','click',()=>{this.secondRequested=false;el<HTMLSelectElement>('rgbd-device-b').value='';const group=el('rgbd-second-camera');group.classList.remove('is-open');group.setAttribute('aria-hidden','true');el('rgbd-add-camera').hidden=false;});
    on('rgbd-profile','change',()=>{capturePreferences.choose('single',el<HTMLSelectElement>('rgbd-device').value,el<HTMLSelectElement>('rgbd-profile').value);this.probe=null;this.probeWindow.reset();});
    on('rgbd-device','change',()=>{this.secondRequested=false;const serial=el<HTMLSelectElement>('rgbd-device').value;if(serial)capturePreferences.choose('single',serial,el<HTMLSelectElement>('rgbd-profile').value||BASELINE);else capturePreferences.clear('single');el<HTMLSelectElement>('rgbd-device-b').value='';this.probe=null;this.probeWindow.reset();el<HTMLInputElement>('rgbd-reference-z').value='';if(['running','loading-model','starting-camera'].includes(this.session.snapshot().state))void this.session.stop();});
    on('rgbd-device-b','change',()=>{const a=el<HTMLSelectElement>('rgbd-device').value,b=el<HTMLSelectElement>('rgbd-device-b').value;if(!b)return;if(!a||a===b){this.localError='Select a different second camera.';el<HTMLSelectElement>('rgbd-device-b').value='';return;}this.addCamera({a,profileA:el<HTMLSelectElement>('rgbd-profile').value||BASELINE,b});});
    on('camera-mirror','change',()=>this.mirror());
    on('rgbd-3d-view','change',()=>{this.tools.reset();this.wantsFrame=true;if(this.metricMode())this.frameMeasured();});
    on('rgbd-frame-measured','click',()=>{this.frameMeasured();});
    on('fit-view','click',()=>{if(this.enabled)this.frameMeasured();});
    on('single-joint','change',()=>this.updateSingleInspection());
    on('rgbd-probe-clear','click',()=>{this.probe=null;this.probeWindow.reset();});
    on('rgbd-probe-window','change',()=>this.probeWindow.reset());
    for(const id of ['rgbd-sample-radius','rgbd-coverage','rgbd-spread','rgbd-z-min','rgbd-z-max'])on(id,'change',()=>this.applySampling());
    this.overlay.addEventListener('click',event=>{if(!this.enabled)return;const pixel=cursorPixel(event.clientX,event.clientY,this.overlay.getBoundingClientRect(),el<HTMLInputElement>('camera-mirror').checked,this.overlay.width,this.overlay.height);if(pixel){this.probe=pixel;this.probeWindow.reset();this.wantsFrame=true;}},{signal:this.events.signal});
    this.depth.addEventListener('mousemove',event=>this.cursor(event),{signal:this.events.signal});
    this.depth.addEventListener('mouseleave',()=>{this.hover=null;text('rgbd-cursor','Hover the depth image for its unmirrored pixel and depth Z');},{signal:this.events.signal});
    life.own(()=>{this.enabled=false;this.automatic.cancel();this.events.abort();this.session.disconnect();this.clear();el<HTMLInputElement>('rgbd-token').value='';});
  }
  private async startCapture(privateSettings:Pick<LivePanel,'settings'>):Promise<void>{try{if(!this.enabled)return;this.localError='';const base=new URL(`${import.meta.env.BASE_URL}vendor/vision/`,document.baseURI).href;await this.session.start(el<HTMLSelectElement>('rgbd-device').value,base,assets.model.file,privateSettings.settings(),el<HTMLInputElement>('rgbd-infer').checked,false,el<HTMLSelectElement>('rgbd-profile').value);}catch(error){this.localError=String((error as Error).message??error);}}
  private manualMode():boolean{return el<HTMLInputElement>('rgbd-manual-mode').checked;}
  private connectAutomatic():void {if(!this.enabled||this.manualMode()||this.session.snapshot().socketOpen)return;this.localError='';void this.automatic.connect();}
  async discover():Promise<void>{if(this.manualMode()||this.session.snapshot().socketOpen||this.discovering)return;this.discovering=true;this.localError='';try{await this.automatic.connect();}catch(error){this.localError=String((error as Error).message??error);}finally{this.discovering=false;}}
  async refreshCameras():Promise<void>{if(this.session.snapshot().socketOpen)this.session.refresh();else await this.discover();}
  private options():Omit<ViewSettings,'scale'>{return {space:el<HTMLSelectElement>('rgbd-space').value as DepthSpace,mask:el<HTMLInputElement>('rgbd-mask').checked,near:Number(el<HTMLInputElement>('rgbd-near').value),far:Number(el<HTMLInputElement>('rgbd-far').value)};}
  private mirror():void {const transform=el<HTMLInputElement>('camera-mirror').checked?'scaleX(-1)':'';this.depth.style.transform=this.overlay.style.transform=transform;}
  private clear():void {this.presentedSequence=0;this.receivePageMs=this.receiveToRenderMs=null;for(const listener of this.listeners)listener.clear();this.frame=null;this.packet=null;this.view=null;this.hover=null;this.probe=null;this.valid=0;this.relative.update([]);this.measured.update(null);this.reconstruction=null;this.probeWindow.reset();this.wantsFrame=true;this.depth.getContext('2d')?.clearRect(0,0,this.depth.width,this.depth.height);this.overlay.getContext('2d')?.clearRect(0,0,this.overlay.width,this.overlay.height);text('rgbd-cursor','No depth frame');text('rgbd-depth-note','No depth frame. Magenta indicates missing/zero samples.');}
  private show(value:DisplayFrame):void {
    if(!this.enabled)return;this.receivePageMs=value.receivedPageMs;this.frame=value.observation;this.packet=value.packet;this.view=value.prepared.view;this.valid=value.prepared.valid;
    this.reconstruction=value.reconstruction;
    drawOverlay(this.overlay,value.color,el<HTMLInputElement>('single-show-sources').checked?value.observation?.hands??[]:[]);measurementOverlay(this.overlay,value.reconstruction);el('preview-stage').style.aspectRatio=`${value.packet.width} / ${value.packet.height}`;this.depth.width=value.packet.width;this.depth.height=value.packet.height;this.depth.getContext('2d')?.drawImage(value.prepared.heatmap,0,0);
    if(el<HTMLInputElement>('rgbd-probe-window').checked&&this.probe)this.probeWindow.push(`${value.packet.meta.runId}:${this.probe.x}:${this.probe.y}:${JSON.stringify(this.depthSettings)}`,value.packet.meta.depth.number,value.reconstruction.probe?.point??null);
    if(this.wantsFrame&&this.metricMode())this.frameMeasured();
    if(this.hover)this.cursor(this.hover);
    for(const listener of this.listeners)listener.frame(value);
    text('rgbd-depth-note',`${this.view.space==='aligned'?'SDK aligned to RGB':'Original depth camera'} · ${this.view.mask?'invalid mask':'heatmap'} · ${(this.valid/(value.packet.width*value.packet.height)*100).toFixed(1)}% nonzero samples · magenta = zero/missing`);
  }
  private cursor(event:{clientX:number;clientY:number}):void {
    this.hover={clientX:event.clientX,clientY:event.clientY};
    if(!this.packet||!this.view)return;const xy=cursorPixel(event.clientX,event.clientY,this.depth.getBoundingClientRect(),el<HTMLInputElement>('camera-mirror').checked,this.depth.width,this.depth.height);if(!xy)return;
    const raw=depthAt(this.packet,this.view.space,xy.x,xy.y);text('rgbd-cursor',`${this.view.space} pixel ${xy.x},${xy.y} · ${raw===null?'INVALID / zero depth':`${raw} Z16 · ${(raw*this.view.scale).toFixed(3)} m source depth-camera Z`}`);
  }
  setEnabled(enabled:boolean):void {
    const wasEnabled=this.enabled;
    if(this.enabled&&!enabled){this.automatic.cancel();this.session.disconnect();this.clear();}
    this.enabled=enabled;for(const id of ['rgbd-actions','rgbd-depth-section','rgbd-processing','rgbd-connection-settings'])el(id).hidden=!enabled;el('rgbd-view-tools').hidden=el('rgbd-reconstruction-section').hidden=true;
    if(!enabled)return;
    this.mirror();for(const id of ['synthetic-controls','synthetic-interactions','live-actions','live-metrics'])el(id).hidden=true;
    el('live-preview-section').hidden=el('live-settings').hidden=false;el('preview-stage').style.aspectRatio='4 / 3';
    if(this.autoConnect&&!wasEnabled&&!this.manualMode())this.connectAutomatic();
  }
  presented(now:number):void {const sequence=this.packet?.meta.sequence;if(!this.enabled||typeof sequence!=='number'||sequence===this.presentedSequence||this.receivePageMs===null)return;
    this.presentedSequence=sequence;this.receiveToRenderMs=Math.max(0,now-this.receivePageMs);for(const listener of this.listeners)listener.presented?.(sequence,now);
  }
  subscribe(listener:{frame(value:DisplayFrame):void;clear():void;presented?(sequence:number,pageMs:number):void}):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  cameraDevices():readonly Device[]{return this.session.snapshot().devices;}
  cameraLoading():boolean{const stats=this.session.snapshot();return this.discovering||this.automatic.pending||stats.state==='connecting'||!!stats.socketOpen&&!stats.inventoryReceived;}
  selectCamera(serial:string):void{const select=el<HTMLSelectElement>('rgbd-device');syncCamera(select,this.session.snapshot().devices,'single');if(select.value===serial)return;select.value=serial;select.dispatchEvent(new Event('change',{bubbles:true}));}
  samplingSettings():DepthSettings {return {...this.depthSettings};}
  viewSettings():Omit<ViewSettings,'scale'> {return this.options();}
  captureMetadata():DepthCaptureMetadata {
    const s=this.session.snapshot();if(!this.enabled||s.state!=='running'||!s.calibration||!s.wire||!s.settings)throw new Error('Start RGB-D capture and wait for a processed frame first');
    return {assets,settings:s.settings,backend:{delegate:s.backend==='CPU'||s.backend==='GPU'?s.backend:null,fallback:s.fallback},
      source:{kind:'native-rgbd',id:`rgbd:${s.calibration.serial}:${s.wire.runId}`,label:s.calibration.name},calibration:s.calibration,
      pageTimeOriginMs:performance.timeOrigin,mirroredPreview:el<HTMLInputElement>('camera-mirror').checked};
  }
  private metricMode():boolean{return el<HTMLSelectElement>('rgbd-3d-view').value==='metric';}
  private handView():'left'|'right'|'both'{return el<HTMLSelectElement>('hand-view').value as 'left'|'right'|'both';}
  private showsHand(id:number):boolean{const view=this.handView(),category=this.frame?.hands.find(hand=>hand.id===id)?.handedness?.categoryName.toLowerCase();return view==='both'||category===view;}
  private visibleObservations(){return (this.frame?.hands??[]).filter(hand=>this.showsHand(hand.id));}
  private visibleReconstruction():ReconstructionFrame|null{return this.reconstruction?{...this.reconstruction,hands:this.reconstruction.hands.filter(hand=>this.showsHand(hand.id))}:null;}
  private frameMeasured():void {const reconstruction=this.visibleReconstruction(),points=reconstruction?.hands.flatMap(h=>h.joints.flatMap(j=>j.valid&&j.point?[j.point]:[]))??[];if(reconstruction?.probe?.point)points.push(reconstruction.probe.point);if(points.length){this.tools.frame(points);this.wantsFrame=false;}}
  private applySampling():void {try{const settings={...DEPTH_DEFAULTS,radius:Number(el<HTMLSelectElement>('rgbd-sample-radius').value),minCoverage:Number(el<HTMLInputElement>('rgbd-coverage').value),maxSpreadM:Number(el<HTMLInputElement>('rgbd-spread').value),minDepthM:Number(el<HTMLInputElement>('rgbd-z-min').value),maxDepthM:Number(el<HTMLInputElement>('rgbd-z-max').value)};validateDepthSettings(settings);this.depthSettings=settings;this.probeWindow.reset();this.localError='';}catch(error){this.localError=String((error as Error).message??error);}}
  render(axes:boolean):void {this.relative.update(this.enabled&&!this.metricMode()?this.visibleObservations():[],axes);this.measured.update(this.enabled&&this.metricMode()?this.visibleReconstruction():null,axes);}
  snapshot(){return {...this.session.snapshot(),frameReceivedPageMs:this.receivePageMs,receiveToRenderMs:this.receiveToRenderMs,enabled:this.enabled,pairing:this.automatic.pending?'connecting':this.manualMode()?'manual':'automatic',hands:this.frame?.hands.length??0,
    topology:this.frame?.hands.map(h=>({image:h.image.length,relative:h.relative?.length??0}))??[],view:this.view?{...this.view}:null,validSamples:this.valid,
    measured:{settings:{...this.depthSettings},elapsedMs:this.reconstruction?.elapsedMs??0,view:this.metricMode()?'camera-metric':'hand-relative',frame:this.reconstruction?.frame??null,valid:this.reconstruction?.hands.reduce((n,h)=>n+h.valid,0)??0,total:(this.reconstruction?.hands.length??0)*21,
      hands:this.reconstruction?.hands.map(h=>({id:h.id,valid:h.valid,palm:h.palmValid,tips:h.tipsValid}))??[],reasons:this.reconstruction?.reasons??{},error:this.reconstruction?.error??null,pairSkewMs:this.reconstruction?.pairSkewMs??null,
      probe:this.reconstruction?.probe??null,requestedProbe:this.probe?{...this.probe}:null,window:this.probeWindow.snapshot(),renderedJoints:this.measured.joints.count,renderedBones:this.measured.bones.count},error:this.localError||this.session.snapshot().error};}
  private updateSingleInspection():void{
    const index=Number(el<HTMLSelectElement>('single-joint').value),container=el('single-joint-status'),hands=this.reconstruction?.hands??[];
    if(!hands.length){container.classList.add('is-empty','xrb-empty-state');container.textContent='No output';return;}
    container.classList.remove('is-empty','xrb-empty-state');container.replaceChildren(...hands.map(hand=>{const section=document.createElement('section'),title=document.createElement('h2'),body=document.createElement('pre'),joint=hand.joints[index],observation=this.frame?.hands.find(value=>value.id===hand.id),category=observation?.handedness?.categoryName?.toLowerCase();section.className='point-hand-block';title.textContent=category==='left'?'Left Hand':category==='right'?'Right Hand':'Unknown Hand';body.className='readout';body.textContent=`Track #${hand.id} · ${JOINT_NAMES[index]}\nMeasured optical XYZ: ${joint.point?`${joint.point.x.toFixed(4)}, ${joint.point.y.toFixed(4)}, ${joint.point.z.toFixed(4)} m`:`INVALID (${joint.reason})`}\nPatch support ${joint.sample?.support??0}/${joint.sample?.total??0}`;section.append(title,body);return section;}));
  }
  private updateReconstructionUi():void {
    this.updateSingleInspection();const r=this.reconstruction,totalValid=r?.hands.reduce((n,h)=>n+h.valid,0)??0,hasOutput=!!r?.hands.length;
    el('rgbd-points-empty').hidden=hasOutput;el('rgbd-points-content').hidden=!hasOutput;
    text('rgbd-geometry-status',r?.error?`${r.error}`:hasOutput&&totalValid===0?'No accepted surface points. Check depth coverage.':hasOutput?'Camera optical XYZ (m) · visible surfaces, not anatomical centers.':'');
    text('rgbd-coverage-status',hasOutput?r!.hands.map(h=>`#${h.id}: ${h.valid}/21 accepted · palm ${h.palmValid}/5 · tips ${h.tipsValid}/5`).join(' | '):'');
    const index=Number(el<HTMLSelectElement>('rgbd-joint').value),hand=r?.hands[0],joint=hand?.joints[index],raw=this.frame?.hands[0]?.relative?.[index];
    text('rgbd-joint-status',joint?`#${hand!.id} ${JOINT_NAMES[index]}\nMeasured optical XYZ (m): ${joint.point?`${joint.point.x.toFixed(3)}, ${joint.point.y.toFixed(3)}, ${joint.point.z.toFixed(3)}`:`INVALID: ${joint.reason}`}\nPatch support ${joint.sample?.support??0}/${joint.sample?.total??0}; spread ${joint.sample?.spreadM===null||joint.sample?.spreadM===undefined?'—':(joint.sample.spreadM*1000).toFixed(1)+' mm'}\nRaw model-relative XYZ (m): ${raw?`${raw.x.toFixed(3)}, ${raw.y.toFixed(3)}, ${raw.z.toFixed(3)}`:'unavailable'}\nDifferent origins: not an accuracy comparison.\nRejected: ${JSON.stringify(r?.reasons??{})}`:'No selected landmark');
    const probe=r?.probe,referenceText=el<HTMLInputElement>('rgbd-reference-z').value.trim(),reference=referenceText?Number(referenceText):null;
    let comparison='Reference unknown.';if(reference!==null)comparison=Number.isFinite(reference)&&reference>=0.05&&reference<=10?probe?.point?`Z − operator reference: ${((probe.point.z-reference)*1000).toFixed(1)} mm (reference/setup not independently verified).`:'Reference set; no accepted probe measurement.':'Enter a positive measured target Z or leave empty.';
    text('rgbd-probe-status',!this.probe?'No probe selected. Click RGB.':!probe?'Waiting for the next paired frame.':probe.point?`Color pixel ${this.probe.x},${this.probe.y} · optical XYZ ${probe.point.x.toFixed(3)}, ${probe.point.y.toFixed(3)}, ${probe.point.z.toFixed(3)} m. ${comparison}`:`Probe INVALID: ${probe.reason}. ${comparison}`);
    const window=this.probeWindow.snapshot();text('rgbd-probe-window-status',!el<HTMLInputElement>('rgbd-probe-window').checked?'Stationary test off. No temporal smoothing is applied.':`Processed window ${window.valid}/${window.acceptedFrames} accepted, ${window.invalid} invalid · Z standard deviation ${window.sdZ===null?'—':(window.sdZ*1000).toFixed(2)+' mm'}. Hold the target still; motion is not compensated.`);
  }
  updateUi():void {
    if(!this.enabled)return;const stats=this.session.snapshot(),active=['running','starting-camera','loading-model','stopping'].includes(stats.state),connected=!!stats.socketOpen;
    el<HTMLButtonElement>('rgbd-connect').disabled=!this.manualMode()||connected||stats.state==='connecting';
    el<HTMLButtonElement>('rgbd-retry').disabled=this.manualMode()||this.automatic.pending||connected||stats.state==='connecting';
    el<HTMLButtonElement>('rgbd-disconnect').disabled=!this.automatic.pending&&!connected&&stats.state!=='connecting';
    text('rgbd-service-status',this.manualMode()?'Manual connection':this.automatic.pending||stats.state==='connecting'?'Connecting locally…':connected?'Local service ready':'Local service offline');
    el('rgbd-retry').hidden=true;
    el<HTMLButtonElement>('rgbd-refresh').disabled=!connected;
    const toggle=el<HTMLButtonElement>('rgbd-toggle');toggle.disabled=stats.state==='stopping';el<HTMLInputElement>('rgbd-infer').disabled=active;
    el<HTMLButtonElement>('rgbd-frame-measured').disabled=!this.metricMode()||!(this.reconstruction?.hands.some(h=>h.valid>0)||this.reconstruction?.probe?.valid);
    const loadingCameras=this.automatic.pending||stats.state==='connecting',select=el<HTMLSelectElement>('rgbd-device');syncCamera(select,stats.devices,'single',loadingCameras);const selectDisabled=active||loadingCameras;if(select.disabled!==selectDisabled)select.disabled=selectDisabled;
    el('rgbd-profile-field').hidden=!select.value;const selected=stats.devices.find(d=>d.serial===select.value),profile=el<HTMLSelectElement>('rgbd-profile'),profiles=syncProfiles(profile,selected,'single',active,loadingCameras&&!selected),available=!!selected&&profiles.includes(profile.value);
    const cameraField=el('capture-camera-field');if(cameraField.firstChild)cameraField.firstChild.textContent=this.secondRequested?'Camera 1':'Camera';
    const second=el<HTMLSelectElement>('rgbd-device-b'),deviceKey=JSON.stringify([stats.devices,loadingCameras]);if(second.dataset.devices!==deviceKey){second.dataset.devices=deviceKey;const placeholder=new Option(loadingCameras?'Loading…':'Select camera','');placeholder.disabled=loadingCameras;second.replaceChildren(placeholder);for(const device of stats.devices){const option=new Option(`${device.name} · ${device.serial}`,device.serial);option.disabled=!matchingProfiles(device).length||device.serial===select.value;second.add(option);}}for(const option of second.options)if(option.value){const disabled=!matchingProfiles(stats.devices.find(device=>device.serial===option.value)).length||option.value===select.value;if(option.disabled!==disabled)option.disabled=disabled;}const secondGroup=el('rgbd-second-camera'),showSecond=!!select.value&&this.secondRequested;secondGroup.classList.toggle('is-open',showSecond);secondGroup.setAttribute('aria-hidden',String(!showSecond));const add=el<HTMLButtonElement>('rgbd-add-camera');add.hidden=!select.value||this.secondRequested;add.disabled=active;const secondDisabled=active||loadingCameras;if(second.disabled!==secondDisabled)second.disabled=secondDisabled;
    const canStart=stats.state==='connected'&&available;toggle.disabled=stats.state==='stopping'||(!active&&!canStart);toggle.classList.toggle('danger-solid',active);toggle.classList.toggle('primary',!active);text('rgbd-toggle',active?'Stop capture':'Start capture');
    const startHelp=active?'Stop before changing cameras or resolution.':!connected?'Waiting for the local camera service…':!select.value?'Select a camera.':!selected?'Saved camera is unavailable. Reconnect it or select another.':!available?'Choose an available RGB + Depth resolution and frame rate.':'';text('rgbd-start-help',startHelp);el('rgbd-start-help').hidden=true;
    text('rgbd-profiles',selected?selected.profiles.map(p=>`${p.stream} ${p.encoding} ${p.width}×${p.height} @ ${p.fps}`).join('\n'):'Choose a device. Matched RGB8/Z16 profiles up to 1280×720 / 90 Hz are supported; SDK geometry is always re-read.');
    const calibration=stats.calibration;const model=el<HTMLSelectElement>('model');model.value=stats.backend?'mediapipe':'none';model.disabled=true;
    text('mode',this.metricMode()?'RGB-D / camera-space surfaces':'RGB-D / raw relative model');text('rate',`${stats.processedHz.toFixed(1)} displayed results/s`);text('counts',`${this.frame?.hands.length??0} / model observation`);
    text('status',`Bridge ${stats.state}${stats.backend?` · actual ${stats.backend}${stats.fallback?` (${stats.fallback})`:''}`:''} · frames ${stats.frames}. No calibrated app input.`);text('error',this.localError||stats.error);
    const points=this.reconstruction?.hands.reduce((count,hand)=>count+hand.valid,0);text('single-output-label',`Camera${points===undefined?'':` · ${points} points`}`);
    text('live-camera-name',calibration?`${calibration.name} · ${calibration.serial}`:'No camera opened');
    text('live-hand-info',this.frame?.hands.map(h=>`#${h.id} ${h.handedness?.categoryName??'Unknown'}`).join(' · ')||(stats.state==='running'&&!stats.backend?'Hand tracking off':'No hands'));
    text('rgbd-calibration',calibration?`SDK ${calibration.sdkVersion}; depth scale ${(calibration.depthScaleMeters*1000).toFixed(6)} mm/unit. RGB fx/fy ${calibration.colorIntrinsics.fx.toFixed(2)}/${calibration.colorIntrinsics.fy.toFixed(2)}; aligned fx/fy ${calibration.alignedDepthIntrinsics.fx.toFixed(2)}/${calibration.alignedDepthIntrinsics.fy.toFixed(2)}. ${calibration.pairing}`:'Calibration arrives from the selected device at Start; no guessed intrinsics/scale.');
    const keyCalibration=JSON.stringify(calibration);if(keyCalibration!==this.calibrationKey){this.calibrationKey=keyCalibration;text('rgbd-calibration-json',calibration?JSON.stringify(calibration,null,2):'No native calibration');}
    this.updateReconstructionUi();
    const wire=stats.wire;
    text('rgbd-timing',wire?`RGB #${wire.color.number} ${wire.color.timestampMs.toFixed(3)} ms (${wire.color.domain})\nDepth #${wire.depth.number} ${wire.depth.timestampMs.toFixed(3)} ms (${wire.depth.domain})\nExposure-midpoint metadata RGB/depth: ${wire.color.sensorTimestampUs??'unavailable'}/${wire.depth.sensorTimestampUs??'unavailable'} µs\nSDK gaps RGB/depth ${wire.colorGaps}/${wire.depthGaps}; repeats ${wire.colorRepeats}/${wire.depthRepeats}\nTransport/consumer skips ${wire.clientBusyDrops}; pixel worker ${stats.pixelMs.toFixed(1)} ms; inference ${stats.inferenceMs.toFixed(1)} ms; receive → render submission ${this.receiveToRenderMs===null?'unknown':this.receiveToRenderMs.toFixed(1)+' ms'}`:'No sensor frames received');
    const page=stats.pageClock,native=stats.nativeClock;
    text('rgbd-transfer',`Clock offsets (not sensor latency): bridge−page ${page?`${page.offsetMs.toFixed(2)} ± ${page.uncertaintyMs.toFixed(2)} ms`:'unsampled'}; native−bridge ${native?`${native.offsetMs.toFixed(2)} ± ${native.uncertaintyMs.toFixed(2)} ms`:'unsampled'}. Bridge-send → browser ${stats.transferApproxMs===null?'unknown':`${stats.transferApproxMs.toFixed(2)} ms approximate`}. Device-to-host clock mapping and capture-to-photon remain unknown.`);
  }
}

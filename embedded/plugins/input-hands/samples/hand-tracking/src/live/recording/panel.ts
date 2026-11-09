/// <reference types="vite/client" />
import * as THREE from 'three';
import assets from '../../../assets/vision-assets.json' with { type:'json' };
import { Lifetime } from '../../lifecycle.ts';
import type { LiveFrame, Point } from '../contracts.ts';
import type { LivePanel } from '../panel.ts';
import type { RgbdPanel } from '../rgbd/panel.ts';
import { MeasuredSkeleton, measurementOverlay } from '../rgbd/measured-visual.ts';
import { RelativeSkeleton, drawOverlay } from '../visual.ts';
import { Recorder, pngEncoder } from './recorder.ts';
import { Playback, ReplayImages } from './replay.ts';
import { Reprocessor, type Rerun } from './reprocess.ts';
import { exportClip, importClip, type Clip } from './format.ts';
import { DepthRecorder } from './depth-recorder.ts';
import { DepthImages } from './depth-replay.ts';
import { DepthComparator, depthReport, type DepthComparison } from './depth-comparison.ts';
import { BenchPanel } from '../bench/panel.ts';
import { ComparisonViews } from '../bench/views.ts';
import { rgbDataset,depthDataset } from '../bench/dataset.ts';
import { DepthReprocessor } from './depth-reprocess.ts';
import { exportDepthClip, importDepthClip, isDepthClip, type DepthClip } from './depth-format.ts';
const el=<T extends HTMLElement>(id:string):T=>{const v=document.getElementById(id);if(!v)throw new Error(`Missing #${id}`);return v as T;};
const text=(id:string,value:string)=>{el(id).textContent=value;};
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export class RecordingPanel {
  readonly visual=new THREE.Group();private relative=new RelativeSkeleton();private measuredA=new MeasuredSkeleton();private measuredB=new MeasuredSkeleton('#b99aff');
  private enabled=false;private clip:Clip|null=null;private depthClip:DepthClip|null=null;private playback:Playback|null=null;private frame:LiveFrame|null=null;
  private rerun:Rerun|null=null;private depthCache:DepthComparison|null=null;private depthIndex=-1;private depthFramed=false;
  private bench:BenchPanel;private views=new ComparisonViews();private depthProcessor=new DepthReprocessor();private runGeneration=0;private benchGeneration=0;private depthRunning=false;
  private importing=false;private importGeneration=0;private error='';private exported=false;
  private events=new AbortController();private urls=new Map<string,ReturnType<typeof setTimeout>>();private encoder=pngEncoder();
  private recorder:Recorder;private depthRecorder:DepthRecorder;private processor=new Reprocessor();private comparator=new DepthComparator();
  private images:ReplayImages;private depthImages:DepthImages;private overlay=el<HTMLCanvasElement>('camera-overlay');
  private readonly live:LivePanel;private readonly rgbd:RgbdPanel;private readonly useReplay:()=>void;
  private readonly tools:{reset():void;frame(points:readonly Point[]):void};
  private foreignMedia:()=>boolean=()=>false;
  guardMedia(check:()=>boolean):void{this.foreignMedia=check;}
  hasMedia():boolean{return this.hasClip()||this.importing||this.recordState().state!=='idle'||!!this.recordState().inFlight;}
  seek(index:number):void{const f=(this.depthClip??this.clip)?.frames[index];if(f)this.playback?.seek(f.meta.relativeMs,performance.now());}
  constructor(scene:THREE.Scene,life:Lifetime,live:LivePanel,rgbd:RgbdPanel,
    useReplay:()=>void,tools:{reset():void;frame(points:readonly Point[]):void},sharedBench?:BenchPanel){
    this.live=live;this.rgbd=rgbd;this.useReplay=useReplay;this.tools=tools;
    this.bench=sharedBench??new BenchPanel(index=>{const f=(this.depthClip??this.clip)?.frames[index];if(f)this.playback?.seek(f.meta.relativeMs,performance.now());},(blob,name)=>this.downloadBlob(blob,name));
    this.visual.add(this.relative,this.measuredA,this.measuredB);scene.add(this.visual);
    this.recorder=new Recorder({now:()=>performance.now(),utc:()=>new Date().toISOString(),id:()=>crypto.randomUUID(),
      encode:bitmap=>this.encoder.encode(bitmap),timer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id),sourceBusy:()=>live.snapshot().skipped??0},
      clip=>{this.encoder.dispose();this.adopt(clip);if(!clip)this.error='No frames recorded. Delete from memory, then try again.';});
    this.depthRecorder=new DepthRecorder(clip=>{this.adoptDepth(clip);if(!clip)this.error='No RGB-D frames recorded. Delete from memory, then try again.';});
    this.images=new ReplayImages(blob=>createImageBitmap(blob),(index,bitmap)=>{
      if(!this.enabled||!this.clip)return;const frame=this.rerunMode()?this.rerun?.frames[index]:this.clip.frames[index].meta.observation;
      if(!frame){this.frame=null;this.clearView();return;}this.frame=frame;el('preview-stage').style.aspectRatio=`${bitmap.width} / ${bitmap.height}`;drawOverlay(this.overlay,bitmap,frame.hands);
      const a=this.clip.frames[index].meta.observation,b=this.rerun?.frames[index]??a;this.comparisonFrame(index,bitmap,a,b,null,null);
    },error=>this.decodeError(error));
    this.depthImages=new DepthImages(()=>rgbd.viewSettings(),(index,prepared)=>{
      if(!this.enabled||!this.depthClip||!this.depthCache)return;this.depthIndex=index;const a=this.depthClip.frames[index].meta.observation,b=this.depthCache.observationsB?.[index]??a;
      this.frame=this.depthView()==='b'?b:a;this.comparisonFrame(index,prepared.color,a,b,this.depthCache.a[index],this.depthCache.b[index]);
      drawOverlay(this.overlay,prepared.color,this.frame?.hands??[]);const mode=this.depthView();
      if(mode==='a'||mode==='overlay')measurementOverlay(this.overlay,this.depthCache.a[index]);
      if(mode==='b'||mode==='overlay')measurementOverlay(this.overlay,this.depthCache.b[index],'#b99aff');
      el<HTMLCanvasElement>('rgbd-depth').width=prepared.heatmap.width;el<HTMLCanvasElement>('rgbd-depth').height=prepared.heatmap.height;el<HTMLCanvasElement>('rgbd-depth').getContext('2d')?.drawImage(prepared.heatmap,0,0);
      text('rgbd-depth-note',`Saved ${prepared.view.space} Z16 · ${(prepared.valid/(prepared.color.width*prepared.color.height)*100).toFixed(1)}% nonzero · no camera open`);
      if(!this.depthFramed&&mode!=='raw'){
        const points=this.depthCache.a[index].hands.flatMap(h=>h.joints.flatMap(j=>j.point?[j.point]:[]));
        if(points.length){this.tools.frame(points);this.depthFramed=true;}
      }
    },error=>this.decodeError(error));
    const on=(id:string,type:string,fn:()=>void)=>el(id).addEventListener(type,fn,{signal:this.events.signal});
    const unsubscribe=live.subscribe({frame:(frame,bitmap)=>this.recorder.capture(frame,bitmap,live.snapshot().skipped??0),
      clear:()=>{void this.recorder.stop('Camera stopped, restarted or source changed',live.snapshot().skipped??0);}});
    const unsubscribeDepth=rgbd.subscribe({frame:value=>{
      const s=rgbd.snapshot();this.depthRecorder.capture(value.packet,{receivedPageMs:value.receivedPageMs,completedPageMs:performance.now(),observation:value.observation,
        sampling:rgbd.samplingSettings(),pixelMs:value.prepared.pixelMs,reconstructionMs:value.reconstruction.elapsedMs,
        transferApproxMs:s.transferApproxMs,pageClock:s.pageClock,nativeClock:s.nativeClock});
    },clear:()=>{void this.depthRecorder.stop('RGB-D stopped, restarted or source changed');},presented:(sequence,now)=>this.depthRecorder.presented(sequence,now)});
    on('record-start','click',()=>{try{
      if(this.foreignMedia())throw new Error('Delete the paired clip first');if(this.hasClip()||this.importing||this.recordState().state!=='idle')throw new Error('Delete the previous clip first');this.error='';this.exported=false;
      if(rgbd.snapshot().enabled)this.depthRecorder.start(rgbd.captureMetadata(),rgbd.snapshot().admissionSequence,rgbd.snapshot().wire?.clientBusyDrops??0);
      else this.recorder.start(live.captureMetadata(),live.snapshot().skipped??0,live.snapshot().inFlight===1);
    }catch(error){this.error=errorText(error);}});
    on('record-stop','click',()=>{void this.recorder.stop('User stopped recording',live.snapshot().skipped??0);void this.depthRecorder.stop();});
    on('record-delete','click',()=>this.clear());on('record-export','click',()=>this.download());on('record-open','click',useReplay);on('record-import','change',()=>{void this.load();});
    on('replay-play','click',()=>this.playback?.play(performance.now()));on('replay-pause','click',()=>this.playback?.pause(performance.now()));
    on('replay-prev','click',()=>this.playback?.step(-1));on('replay-next','click',()=>this.playback?.step(1));
    on('replay-seek','input',()=>{const frame=(this.depthClip??this.clip)?.frames[Number(el<HTMLInputElement>('replay-seek').value)];if(frame)this.playback?.seek(frame.meta.relativeMs,performance.now());});
    on('replay-speed','change',()=>this.playback?.setSpeed(Number(el<HTMLSelectElement>('replay-speed').value),performance.now()));
    on('replay-mode','change',()=>{this.playback?.pause(performance.now());this.frame=null;this.clearView();this.images.invalidate();this.depthImages.invalidate();this.configureReplay();});
    on('replay-run','click',()=>{void(this.depthClip?this.runDepth():this.run());this.updateUi();});
    on('replay-cancel','click',()=>{++this.runGeneration;this.depthRunning=false;void this.processor.cancel();void this.depthProcessor.cancel();this.comparator.cancel();this.updateUi();});
    on('bench-layout','change',()=>{this.views.setActive(this.enabled&&el<HTMLSelectElement>('bench-layout').value!=='single',el<HTMLSelectElement>('bench-layout').value);this.images.invalidate();this.depthImages.invalidate();});
    on('reset','click',()=>this.views.reset());
    on('depth-replay-view','change',()=>{this.depthFramed=false;if(this.depthView()==='raw')this.tools.reset();this.depthImages.invalidate();});
    for(const id of ['rgbd-space','rgbd-mask','rgbd-near','rgbd-far'])on(id,'change',()=>this.depthImages.invalidate());
    on('depth-report-export','click',()=>{try{if(this.depthClip&&this.depthCache)this.downloadBlob(new Blob([JSON.stringify(depthReport(this.depthClip,this.depthCache),null,2)],{type:'application/json'}),'hand-tracking-depth-comparison.json');}catch(error){this.error=errorText(error);}});
    addEventListener('beforeunload',(event:BeforeUnloadEvent)=>{if(this.bench.unsaved||this.hasClip()&&!this.exported||['recording','finishing'].includes(this.recordState().state)){event.preventDefault();event.returnValue='';}},{signal:this.events.signal});
    life.own(()=>{this.events.abort();unsubscribe();unsubscribeDepth();this.clear();if(!sharedBench)this.bench.dispose();this.views.dispose();this.encoder.dispose();});
  }
  comparisonVisible():boolean {return this.views.visible;}
  private comparisonFrame(index:number,bitmap:ImageBitmap,a:LiveFrame|null,b:LiveFrame|null,ma:import('../rgbd/reconstruction.ts').ReconstructionFrame|null,mb:import('../rgbd/reconstruction.ts').ReconstructionFrame|null):void {
    this.bench.presented(index);this.views.setFrames(a,b,ma,mb);
    if(this.views.visible){drawOverlay(el<HTMLCanvasElement>('bench-rgb-a'),bitmap,a?.hands??[]);drawOverlay(el<HTMLCanvasElement>('bench-rgb-b'),bitmap,b?.hands??[]);
      const ab=el<HTMLSelectElement>('bench-layout').value==='ab';if(ab&&ma)measurementOverlay(el<HTMLCanvasElement>('bench-rgb-a'),ma);if(mb)measurementOverlay(el<HTMLCanvasElement>('bench-rgb-b'),mb,'#b99aff');
      text('bench-view-label-a',ma&&ab?'A · color-camera surfaces (m)':'A · model hand-relative (m)');text('bench-view-label-b',mb?'B · color-camera surfaces (m)':'B · model hand-relative (m)');}
  }
  private async refreshBench():Promise<void>{
    const generation=++this.benchGeneration;
    if(this.depthClip&&this.depthCache){this.bench.setData(depthDataset(this.depthClip,this.depthCache));return;}
    const clip=this.clip;if(!clip){this.bench.setData(null);return;}
    try{const data=await rgbDataset(clip,this.rerun);if(generation===this.benchGeneration&&this.clip===clip)this.bench.setData(data);}catch(error){if(generation===this.benchGeneration)this.error=errorText(error);}
  }
  private progress(){const model=this.depthProcessor.snapshot(),comparison=this.comparator.snapshot();return this.depthClip?(['loading','running'].includes(model.state)?model:this.depthRunning?{...comparison,state:'running'}:comparison):this.processor.snapshot();}
  private hasClip():boolean{return !!(this.clip||this.depthClip);}
  private recordState(){const depth=this.depthRecorder.snapshot();return depth.state!=='idle'||depth.inFlight?depth:this.recorder.snapshot();}
  private rerunMode():boolean{return !this.depthClip&&el<HTMLSelectElement>('replay-mode').value==='rerun';}
  private depthView():string{return el<HTMLSelectElement>('depth-replay-view').value;}
  private decodeError(error:unknown):void{this.error=`Replay decode: ${errorText(error)}`;this.playback?.pause(performance.now());this.frame=null;this.depthIndex=-1;this.clearView();}
  private clearView():void{this.views.clear();this.overlay.getContext('2d')?.clearRect(0,0,this.overlay.width,this.overlay.height);this.relative.update([]);this.measuredA.update(null);this.measuredB.update(null);}
  private revokeUrls():void{for(const[url,timer]of this.urls){clearTimeout(timer);URL.revokeObjectURL(url);}this.urls.clear();}
  private clear():void{
    ++this.importGeneration;++this.runGeneration;++this.benchGeneration;this.depthRunning=false;this.importing=false;void this.processor.cancel();void this.depthProcessor.cancel();this.comparator.cancel();this.bench.setData(null);this.views.clear();this.recorder.clear();this.depthRecorder.clear();this.encoder.dispose();this.revokeUrls();
    this.clip=null;this.depthClip=null;this.depthCache=null;this.rerun=null;this.playback=null;this.frame=null;this.depthIndex=-1;this.depthFramed=false;
    this.images.setClip(null);this.depthImages.setClip(null);this.error='';this.exported=false;el<HTMLInputElement>('record-import').value='';if(this.enabled)this.clearView();
  }
  private timeline(times:readonly number[]|null):void{this.playback=times?new Playback(times):null;this.playback?.setSpeed(Number(el<HTMLSelectElement>('replay-speed').value),performance.now());el<HTMLSelectElement>('replay-mode').value='captured';}
  private adopt(clip:Clip|null):void{
    this.clip=clip;this.depthClip=null;this.depthCache=null;this.depthImages.setClip(null);this.comparator.cancel();this.rerun=null;this.frame=null;
    this.timeline(clip?clip.frames.map(f=>f.meta.relativeMs):null);this.images.setClip(this.enabled?clip:null);if(this.enabled)this.configureReplay();
  }
  private adoptDepth(clip:DepthClip|null):void{
    this.depthClip=clip;this.clip=null;this.rerun=null;this.frame=null;this.depthCache=null;this.depthIndex=-1;this.depthFramed=false;this.images.setClip(null);
    this.timeline(clip?clip.frames.map(f=>f.meta.relativeMs):null);this.depthImages.setClip(this.enabled?clip:null);
    if(clip){const s=clip.frames[0].meta.sampling;el<HTMLSelectElement>('depth-b-radius').value=String(s.radius);el<HTMLInputElement>('depth-b-coverage').value=String(s.minCoverage);el<HTMLInputElement>('depth-b-spread').value=String(s.maxSpreadM);}
    if(this.enabled)this.configureReplay();
  }
  private async load():Promise<void>{
    const input=el<HTMLInputElement>('record-import'),file=input.files?.[0];input.value='';if(!file)return;
    if(this.foreignMedia()||this.hasClip()||this.recordState().state!=='idle'||this.recordState().inFlight||this.importing){this.error='Delete the previous single/paired clip before importing';return;}
    const generation=++this.importGeneration;this.importing=true;this.error='';const cancelled=()=>generation!==this.importGeneration;
    try{
      if(await isDepthClip(file)){const clip=await importDepthClip(file,cancelled);if(cancelled())return;this.adoptDepth(clip);}
      else{const clip=await importClip(file,cancelled);if(cancelled())return;this.adopt(clip);}
      this.exported=true;this.useReplay();
    }catch(error){if(!cancelled())this.error=errorText(error);}finally{if(!cancelled())this.importing=false;}
  }
  downloadBlob(blob:Blob,name:string):void{
    this.revokeUrls();const url=URL.createObjectURL(blob),link=document.createElement('a');const timer=setTimeout(()=>{URL.revokeObjectURL(url);this.urls.delete(url);},30_000);this.urls.set(url,timer);
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  }
  private download():void{const clip=this.depthClip??this.clip;if(!clip)return;try{
    this.downloadBlob(this.depthClip?exportDepthClip(this.depthClip):exportClip(this.clip!),`hand-tracking-${clip.manifest.startedUtc.replace(/[:.]/g,'-')}.handtracking`);this.exported=true;
  }catch(error){this.error=errorText(error);}}
  setEnabled(enabled:boolean):void{
    if(!enabled)++this.benchGeneration;
    if(this.enabled&&!enabled){this.playback?.pause(performance.now());void this.processor.cancel();this.comparator.cancel();this.frame=null;this.depthIndex=-1;++this.runGeneration;this.depthRunning=false;void this.depthProcessor.cancel();this.images.setClip(null);this.depthImages.setClip(null);this.clearView();}
    this.enabled=enabled;if(enabled){this.images.setClip(this.clip);this.depthImages.setClip(this.depthClip);this.configureReplay();if(this.depthClip&&!this.depthCache)void this.runDepth();else void this.refreshBench();}
    this.bench.setVisible(enabled);this.views.setActive(enabled&&el<HTMLSelectElement>('bench-layout').value!=='single',el<HTMLSelectElement>('bench-layout').value);
    el('replay-controls').hidden=!enabled;el('depth-comparison-controls').hidden=!enabled||!this.depthClip;
    if(enabled)el('rgbd-depth-section').hidden=!this.depthClip;
  }
  private configureReplay():void{
    if(!this.enabled)return;for(const id of ['synthetic-controls','synthetic-interactions','live-actions','live-metrics'])el(id).hidden=true;
    el('live-preview-section').hidden=false;el('live-settings').hidden=el<HTMLSelectElement>('replay-mode').value!=='rerun';el('depth-comparison-controls').hidden=!this.depthClip;
    el<HTMLSelectElement>('replay-mode').disabled=false;const model=el<HTMLSelectElement>('model');model.value=this.rerunMode()?'mediapipe':'recorded';model.disabled=true;
  }
  private async run():Promise<void>{
    if(!this.clip||!this.enabled)return;const clip=this.clip;try{
      const settings=this.live.settings();this.error='';this.playback?.pause(performance.now());const base=new URL(`${import.meta.env.BASE_URL}vendor/vision/`,document.baseURI).href;
      const result=await this.processor.run(clip,base,assets.model.file,settings);if(!result||clip!==this.clip||!this.enabled)return;this.rerun=result;this.images.invalidate();void this.refreshBench();
    }catch(error){if(clip===this.clip)this.error=errorText(error);}
  }
  private async runDepth():Promise<void>{
    const clip=this.depthClip;if(!clip||!this.enabled||this.depthRunning)return;this.depthRunning=true;const generation=++this.runGeneration;this.error='';this.playback?.pause(performance.now());
    try{
      const settings={...clip.frames[0].meta.sampling,radius:Number(el<HTMLSelectElement>('depth-b-radius').value),minCoverage:Number(el<HTMLInputElement>('depth-b-coverage').value),maxSpreadM:Number(el<HTMLInputElement>('depth-b-spread').value)};
      let model: {rerun:Rerun;assets:typeof assets}|undefined;
      if(el<HTMLSelectElement>('replay-mode').value==='rerun'){
        const base=new URL(`${import.meta.env.BASE_URL}vendor/vision/`,document.baseURI).href;
        const rerun=await this.depthProcessor.run(clip,base,assets.model.file,this.live.settings());if(!rerun||generation!==this.runGeneration||clip!==this.depthClip||!this.enabled)return;model={rerun,assets};
      }else await this.depthProcessor.cancel();
      if(generation!==this.runGeneration)return;
      const result=await this.comparator.run(clip,settings,model);if(!result||generation!==this.runGeneration||clip!==this.depthClip||!this.enabled)return;
      this.depthCache=result;this.depthImages.invalidate();void this.refreshBench();
    }catch(error){if(generation===this.runGeneration&&clip===this.depthClip)this.error=errorText(error);}
    finally{if(generation===this.runGeneration)this.depthRunning=false;}
  }
  render(now:number,axes:boolean):void{
    if(this.enabled&&this.playback){
      if(this.depthClip&&this.depthCache){this.playback.tick(now);this.depthImages.request(this.playback.index);}
      else if(this.clip&&(!this.rerunMode()||this.rerun)){this.playback.tick(now);this.images.request(this.playback.index);}
    }
    this.views.render(axes);
    const depth=this.enabled&&!!this.depthClip,mode=this.depthView(),index=this.depthIndex;
    this.relative.update(this.enabled&&(!depth||mode==='raw')?this.frame?.hands??[]:[],axes);
    this.measuredA.update(depth&&index>=0&&(mode==='a'||mode==='overlay')?this.depthCache?.a[index]??null:null,axes);
    this.measuredB.update(depth&&index>=0&&(mode==='b'||mode==='overlay')?this.depthCache?.b[index]??null:null,axes);
  }
  snapshot(){
    const clip=this.depthClip??this.clip;
    return {enabled:this.enabled,recorder:this.recordState(),clip:clip?{version:clip.manifest.version,frames:clip.frames.length,durationMs:clip.manifest.durationMs,backend:clip.manifest.backend,drops:clip.manifest.drops,settings:clip.manifest.settings,
      firstPngSha256:this.clip?.frames[0].meta.pngSha256,firstPacketSha256:this.depthClip?.frames[0].meta.packetSha256}:null,
      importing:this.importing,playback:this.playback?{index:this.playback.index,positionMs:this.playback.positionMs,playing:this.playback.playing,speed:this.playback.speed}:null,
      images:this.depthClip?this.depthImages.snapshot():this.images.snapshot(),rerun:this.rerun?{frames:this.rerun.frames.length,delegate:this.rerun.delegate,fallback:this.rerun.fallback,settings:this.rerun.settings}:null,
      benchmark:this.bench.snapshot(),comparisonViews:this.views.snapshot(),sideBySide:this.views.visible,depthModel:this.depthProcessor.snapshot(),processor:this.progress(),mode:this.depthClip?'depth-comparison':this.rerunMode()?'rerun':'captured',hands:this.frame?.hands.length??0,
      depth:this.depthCache?{frames:this.depthCache.a.length,view:this.depthView(),renderedA:this.measuredA.joints.count,renderedB:this.measuredB.joints.count,contentSha256:this.depthCache.contentSha256,modelB:this.depthCache.modelB?{delegate:this.depthCache.modelB.delegate,settings:this.depthCache.modelB.settings}:null}:null,error:this.error};
  }
  updateUi():void{
    const rec=this.recordState(),camera=this.live.snapshot(),native=this.rgbd.snapshot(),running=rec.state==='recording',finishing=rec.state==='finishing',clip=this.depthClip??this.clip;
    el<HTMLButtonElement>('record-start').disabled=!(native.enabled?native.state==='running':camera.state==='running'&&camera.enabled)||rec.state!=='idle'||!!rec.inFlight||this.hasClip()||this.importing||this.foreignMedia();
    text('record-start',native.enabled?'Record RGB-D':'Record RGB');el<HTMLButtonElement>('record-stop').disabled=!running;
    for(const id of ['record-export','record-open'])el<HTMLButtonElement>(id).disabled=!this.hasClip();
    el<HTMLButtonElement>('record-delete').disabled=!this.hasClip()&&rec.state==='idle'&&!rec.inFlight&&!this.importing;
    el<HTMLInputElement>('record-import').disabled=this.hasClip()||rec.state!=='idle'||!!rec.inFlight||this.importing||this.foreignMedia();
    const payloadBytes=this.depthClip?this.depthClip.frames.reduce((n,f)=>n+f.data.size,0):this.clip?.frames.reduce((n,f)=>n+f.png.size,0)??0;
    text('record-status',this.importing?'Validating clip…':running||finishing?`${finishing?'Finishing':'Recording'} · ${rec.frames} frames · ${(rec.bytes/1048576).toFixed(1)} MiB`:clip?`${clip.manifest.version===2?'RGB-D v2':'RGB v1'} · ${clip.frames.length} frames · ${(clip.manifest.durationMs/1000).toFixed(2)} s · ${(payloadBytes/1048576).toFixed(1)} MiB media · local memory`:rec.reason||'No clip · local memory only');
    text('record-error',this.error);if(!this.enabled)return;
    const progress=this.progress(),processing=['loading','running'].includes(progress.state),playable=!!clip&&(this.depthClip?!!this.depthCache:!this.rerunMode()||!!this.rerun);
    for(const id of ['replay-play','replay-pause','replay-prev','replay-next','replay-seek'])(el(id) as HTMLInputElement|HTMLButtonElement).disabled=!playable;
    el<HTMLButtonElement>('replay-run').disabled=!clip||processing;el<HTMLButtonElement>('replay-cancel').disabled=!processing;
    el<HTMLButtonElement>('depth-report-export').disabled=!this.depthCache;
    const seek=el<HTMLInputElement>('replay-seek');seek.max=String(Math.max(0,(clip?.frames.length??1)-1));seek.value=String(this.playback?.index??0);
    text('replay-progress',`${this.playback?.playing?'Playing':'Paused'} · frame ${this.playback?this.playback.index+1:0}/${clip?.frames.length??0} · displayed ${this.snapshot().images.displayed+1} · ${(this.playback?.positionMs??0).toFixed(1)} ms · ${progress.state} ${progress.completed}/${progress.total}`);
    const captured=clip?.manifest;
    text('replay-provenance',captured?`Captured: ${captured.assets.runtime.version} / ${captured.assets.model.id} / ${captured.backend.delegate??'no model'}${captured.backend.fallback?` (${captured.backend.fallback})`:''}; thresholds ${captured.settings.detection}/${captured.settings.presence}/${captured.settings.tracking}. ${this.depthClip?`RGB8 + original/aligned Z16 and calibration preserved. ${this.depthCache?.modelB?`B fresh ${this.depthCache.modelB.delegate}${this.depthCache.modelB.fallback?' ('+this.depthCache.modelB.fallback+')':''} model; thresholds ${this.depthCache.modelB.settings.detection}/${this.depthCache.modelB.settings.presence}/${this.depthCache.modelB.settings.tracking}.`:'B uses stored observations.'} Fresh reconstruction histories; Run comparison applies edits.`:this.rerun?`Cached rerun: ${assets.runtime.version} / ${this.rerun.delegate}; thresholds ${this.rerun.settings.detection}/${this.rerun.settings.presence}/${this.rerun.settings.tracking}. Run again to apply edits.`:'No completed rerun.'}${captured.assets.model.sha256!==assets.model.sha256||captured.assets.runtime.version!==assets.runtime.version?' WARNING: captured model/runtime differs from installed assets.':''}`:'Record a clip or import a local .handtracking file.');
    if(this.depthCache&&this.depthClip){const index=this.depthIndex,a=this.depthCache.a[index],b=this.depthCache.b[index];text('depth-comparison-status',`A gold · recorded settings; B purple · last completed comparison. ${a?`Frame: A ${a.hands.reduce((n,h)=>n+h.valid,0)}, B ${b.hands.reduce((n,h)=>n+h.valid,0)} accepted / ${(this.frame?.hands.length??0)*21} landmarks.`:'Preparing frame.'} Depth acceptance is not tracking availability or accuracy.`);}
    text('mode',this.depthClip?'Replay / depth A/B':this.rerunMode()?'Replay / rerun cache':'Replay / captured poses');text('rate',`${this.playback?.speed??1}× playback`);text('counts',`${this.frame?.hands.length??0} / model observation`);
    text('status',clip?'Local replay. Original clocks retained; no live latency measurement or application input.':'No local clip. Import or record one first.');text('error',this.error);
    const points=this.depthCache?.a[this.depthIndex]?.hands.reduce((count,hand)=>count+hand.valid,0)??this.frame?.hands.reduce((count,hand)=>count+hand.image.length,0);text('single-output-label',`Camera${points===undefined?'':` · ${points} points`}`);
    text('live-camera-name',captured?`Saved ${captured.source.label} · no camera open`:'No saved input');text('live-hand-info',this.frame?.hands.map(h=>`#${h.id} ${h.handedness?.categoryName??'Unknown'}`).join(' · ')||'No hands / no frame displayed');
  }
}

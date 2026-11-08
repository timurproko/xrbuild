import type { Lifetime } from '../../lifecycle.ts';
import type { RgbdPanel } from '../rgbd/panel.ts';
import type { Calibration } from '../rgbd/protocol.ts';
import { metadataHash } from '../recording/format.ts';
import { calibrationMetadata,fitSpatialCalibration,exportSpatialCalibration,importSpatialCalibration,FIT_LIMITS,
  type TargetSample,type TargetPair,type SpatialCalibration } from './calibration.ts';
const el=<T extends HTMLElement>(id:string):T=>{const v=document.getElementById(id);if(!v)throw new Error(`Missing #${id}`);return v as T;};
const text=(id:string,value:string)=>{el(id).textContent=value;};
type Entry={id:string;use:'fit'|'check';a?:TargetSample;b?:TargetSample};
/** Explicit scalar target selection only. This module never starts capture, loads a model or persists images. */
export class SpatialCalibrationPanel {
  private targets=new Map<string,Entry>();private sources:{a:Calibration|null;b:Calibration|null}={a:null,b:null};
  private limits={...FIT_LIMITS};private result:SpatialCalibration|null=null;private busy=false;private generation=0;private dirty=false;private external=false;
  private events=new AbortController();private urls=new Map<string,ReturnType<typeof setTimeout>>();private readonly rgbd:RgbdPanel;
  constructor(life:Lifetime,rgbd:RgbdPanel){
    this.rgbd=rgbd;const on=(id:string,type:string,fn:()=>void)=>el(id).addEventListener(type,fn,{signal:this.events.signal});
    on('cal-add','click',()=>{void this.add();});on('cal-fit','click',()=>{void this.fit();});on('cal-export','click',()=>this.download());on('cal-import','change',()=>{void this.load();});
    on('cal-remove','click',()=>{if(this.busy)return;this.targets.delete(el<HTMLSelectElement>('cal-targets').value);this.external=false;this.result=null;this.dirty=true;this.list();});
    on('cal-clear','click',()=>this.clear());
    on('cal-targets','change',()=>{const t=this.targets.get(el<HTMLSelectElement>('cal-targets').value);if(t){el<HTMLInputElement>('cal-id').value=t.id;el<HTMLSelectElement>('cal-use').value=t.use;}});
    for(const id of ['cal-description','cal-static','cal-uncertainty'])on(id,'change',()=>{++this.generation;this.busy=false;this.external=false;this.result=null;this.dirty=this.targets.size>0;});
    addEventListener('beforeunload',(event:BeforeUnloadEvent)=>{if(this.dirty){event.preventDefault();event.returnValue='';}},{signal:this.events.signal});
    life.own(()=>{this.events.abort();this.clear();});this.list();
  }
  /** Share the validated applied result with the manual fallback without losing an unsaved manual draft. */
  adopt(result:SpatialCalibration,dirty=true):void{if(this.busy||this.dirty&&this.targets.size>0&&!this.external)throw new Error('Export or clear the existing manual spatial draft before replacing it');++this.generation;this.result=result;this.external=true;this.limits={...result.input.limits};this.sources={...result.input.sources};this.targets=new Map(result.input.targets.map(t=>[t.id,{...t}]));el<HTMLInputElement>('cal-description').value=result.input.evidence.description;el<HTMLInputElement>('cal-uncertainty').value=String(result.input.evidence.referenceUncertaintyM??'');el<HTMLInputElement>('cal-static').checked=false;this.dirty=dirty;this.list();}
  exported(hash:string):void{if(this.result?.inputSha256===hash)this.dirty=false;}
  private revoke():void{for(const [url,timer]of this.urls){clearTimeout(timer);URL.revokeObjectURL(url);}this.urls.clear();}
  private clear():void{++this.generation;this.busy=false;this.targets.clear();this.sources={a:null,b:null};this.limits={...FIT_LIMITS};this.result=null;this.external=false;this.dirty=false;this.revoke();el<HTMLInputElement>('cal-static').checked=false;el<HTMLInputElement>('cal-description').value='';el<HTMLInputElement>('cal-uncertainty').value='';el<HTMLInputElement>('cal-id').value='p1';el<HTMLSelectElement>('cal-role').value='a';el<HTMLSelectElement>('cal-use').value='fit';text('cal-error','');this.list();}
  private list():void{
    el<HTMLSelectElement>('cal-targets').replaceChildren(...[...this.targets.values()].map(t=>new Option(`${t.id} · ${t.use} · A ${t.a?'✓':'—'} / B ${t.b?'✓':'—'}`,t.id)));
    text('cal-sources',`A: ${this.sources.a?.serial??'not bound'} · B: ${this.sources.b?.serial??'not bound'}. Keep cameras fixed; matching targets must be static within each paired observation.`);
  }
  private async add():Promise<void>{
    if(this.busy)return;this.busy=true;const generation=this.generation;text('cal-error','');
    try{
      const s=this.rgbd.snapshot(),probe=s.measured.probe,pixel=s.measured.requestedProbe;
      if(!s.enabled||s.state!=='running'||s.frameReceivedPageMs===null||performance.now()-s.frameReceivedPageMs>500||!s.calibration||!s.wire||!probe?.valid||!probe.point||!probe.pixel||!pixel||probe.pixel.x!==pixel.x||probe.pixel.y!==pixel.y)throw new Error('Start a native camera, click its static target in RGB, and wait for a current accepted surface probe');
      const id=el<HTMLInputElement>('cal-id').value.trim(),role=el<HTMLSelectElement>('cal-role').value as 'a'|'b',use=el<HTMLSelectElement>('cal-use').value as 'fit'|'check';
      if(!/^[a-zA-Z0-9_-]{1,32}$/.test(id)||!['a','b'].includes(role)||!['fit','check'].includes(use))throw new Error('Use a short unique target ID and an A/B role');
      const existing=this.targets.get(id);if(existing?.[role])throw new Error('That target/role already exists; remove the target explicitly to replace it');
      if(existing&&existing.use!==use)throw new Error('The same target must have the same fit/check role in A and B');if(!existing&&this.targets.size>=64)throw new Error('At most 64 target IDs');
      const calibration=calibrationMetadata(s.calibration),other=this.sources[role==='a'?'b':'a'];if(other?.serial===calibration.serial)throw new Error('A and B must be different native serials');
      const bound=this.sources[role];if(bound&&await metadataHash(bound)!==await metadataHash(calibration))throw new Error('This role is bound to another serial/profile; clear and recalibrate');
      const measurement:TargetSample={point:{x:probe.point.x,y:probe.point.y,z:probe.point.z},pixel:{x:probe.pixel.x,y:probe.pixel.y},frameNumber:s.wire.color.number,
        sourceTimeMs:s.wire.color.timestampMs,clockDomain:s.wire.color.domain,selectedPageMs:performance.now(),pageOriginMs:performance.timeOrigin};
      if(generation!==this.generation)return;
      this.external=false;this.sources[role]=calibration;this.targets.set(id,{id,use,...existing,[role]:measurement});this.result=null;this.dirty=true;this.list();
    }catch(error){if(generation===this.generation)text('cal-error',(error as Error).message);}finally{if(generation===this.generation)this.busy=false;}
  }
  private async fit():Promise<void>{
    if(this.busy)return;this.busy=true;const generation=this.generation;text('cal-error','');
    try{
      const {a,b}=this.sources;if(!a||!b)throw new Error('Collect the same fixed target IDs from both native camera serials');
      const values=[...this.targets.values()];if(values.some(t=>!t.a||!t.b))throw new Error('Complete or remove unmatched target pairs first');
      const description=el<HTMLInputElement>('cal-description').value.trim(),uncertainty=el<HTMLInputElement>('cal-uncertainty').value.trim();
      if(!el<HTMLInputElement>('cal-static').checked)throw new Error('Confirm fixed camera poses and matching static physical targets; hand/model poses are not calibration targets');
      const targets:TargetPair[]=values.map(t=>({id:t.id,use:t.use,a:t.a!,b:t.b!}));
      const result=await fitSpatialCalibration({sources:{a,b},targets,limits:{...this.limits},evidence:{staticTargetConfirmed:true,description,referenceUncertaintyM:uncertainty?Number(uncertainty):null}});
      if(generation===this.generation){this.result=result;this.dirty=true;}
    }catch(error){if(generation===this.generation)text('cal-error',(error as Error).message);}finally{if(generation===this.generation)this.busy=false;}
  }
  private download():void{
    if(!this.result)return;try{
      const blob=exportSpatialCalibration(this.result);this.revoke();const url=URL.createObjectURL(blob),link=document.createElement('a');
      this.urls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);this.urls.delete(url);},30000));link.href=url;link.download='hand-tracking-spatial-calibration.json';document.body.append(link);link.click();link.remove();this.dirty=false;
    }catch(error){text('cal-error',(error as Error).message);}
  }
  private async load():Promise<void>{
    const input=el<HTMLInputElement>('cal-import'),file=input.files?.[0];input.value='';if(!file)return;
    if(this.targets.size||this.busy){text('cal-error','Clear the current calibration explicitly before importing another');return;}
    const generation=++this.generation;this.busy=true;text('cal-error','');
    try{
      const result=await importSpatialCalibration(file);if(generation!==this.generation)return;
      this.result=result;this.limits={...result.input.limits};this.sources={a:result.input.sources.a,b:result.input.sources.b};this.targets=new Map(result.input.targets.map(t=>[t.id,{...t}]));
      el<HTMLInputElement>('cal-description').value=result.input.evidence.description;el<HTMLInputElement>('cal-uncertainty').value=result.input.evidence.referenceUncertaintyM===null?'':String(result.input.evidence.referenceUncertaintyM);
      // Import never substitutes for the operator's current physical-setup confirmation.
      el<HTMLInputElement>('cal-static').checked=false;this.dirty=false;this.list();
    }catch(error){if(generation===this.generation)text('cal-error',(error as Error).message);}finally{if(generation===this.generation)this.busy=false;}
  }
  updateUi():void{
    const s=this.rgbd.snapshot(),probe=s.measured.probe,pixel=s.measured.requestedProbe;
    el<HTMLButtonElement>('cal-add').disabled=this.busy||!s.enabled||s.state!=='running'||s.frameReceivedPageMs===null||performance.now()-s.frameReceivedPageMs>500||!probe?.valid||!probe.pixel||!pixel||pixel.x!==probe.pixel.x||pixel.y!==probe.pixel.y;
    el<HTMLButtonElement>('cal-fit').disabled=this.busy||!this.sources.a||!this.sources.b||[...this.targets.values()].filter(t=>t.a&&t.b&&t.use==='fit').length<6;
    el<HTMLButtonElement>('cal-remove').disabled=this.busy||!this.targets.size;
    el<HTMLButtonElement>('cal-export').disabled=this.busy||!this.result;el<HTMLInputElement>('cal-import').disabled=this.busy||this.targets.size>0;
    const r=this.result;text('cal-status',this.busy?'Working…':!r?`${this.targets.size}/64 targets · need ≥6 fit pairs and ≥3 held-out checks. No transform applied.`:r.spatialQualified?'Internal spatial checks passed; physical acceptance and temporal alignment are still unverified. Spatial file alone cannot enable fusion.':`PROVISIONAL: ${r.reasons.join('; ')}. Fusion is disabled.`);
    text('cal-result',r?JSON.stringify({worldFrame:r.worldFrame,limits:r.input.limits,bToA:r.bToA,fit:r.fit,heldOut:r.check,spatialQualified:r.spatialQualified,reasons:r.reasons,
      physicalValidation:r.physicalValidation,temporalAlignment:r.temporalAlignment,fusionEnabled:r.fusionEnabled,residuals:r.residuals},null,2):'No measured inter-camera transform. No identity transform is assumed for B.');
  }
  calibration():SpatialCalibration|null{return this.result;}
  snapshot(){return {targets:this.targets.size,complete:[...this.targets.values()].filter(t=>t.a&&t.b).length,serials:{a:this.sources.a?.serial??null,b:this.sources.b?.serial??null},busy:this.busy,
    result:this.result?{spatialQualified:this.result.spatialQualified,bToA:this.result.bToA,fit:this.result.fit,check:this.result.check,reasons:this.result.reasons,fusionEnabled:false}:null};}
}

import { METRIC_DEFAULTS,validateIntervals,validateOptions,type Interval,type MetricOptions } from './metrics.ts';
import { benchmarkReport,exportAnnotations,importAnnotations,type Dataset } from './dataset.ts';
import { JOINT_NAMES } from '../rgbd/reconstruction.ts';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string,value:string)=>{el(id).textContent=value;};
export class BenchPanel {
  private dirty=false;private data:Dataset|null=null;private intervals:Interval[]=[];private options:MetricOptions={...METRIC_DEFAULTS};
  private report:ReturnType<typeof benchmarkReport>|null=null;private events=new AbortController();private generation=0;private displayed=-1;private desired=-1;
  private readonly seek:(index:number)=>void;private readonly download:(blob:Blob,name:string)=>void;
  constructor(seek:(index:number)=>void,download:(blob:Blob,name:string)=>void){
    this.seek=seek;this.download=download;el<HTMLSelectElement>('bench-joint').replaceChildren(...JOINT_NAMES.map((name,i)=>new Option(`${i} · ${name}`,String(i))));
    const on=(id:string,event:string,fn:()=>void)=>el(id).addEventListener(event,fn,{signal:this.events.signal});
    const safe=(fn:()=>void)=>()=>{try{fn();text('bench-error','');}catch(error){text('bench-error',(error as Error).message);}};
    on('bench-add','click',safe(()=>{if(!this.data)return;const a:Interval={id:crypto.randomUUID(),start:Number(el<HTMLInputElement>('bench-start').value),end:Number(el<HTMLInputElement>('bench-end').value),
      visibility:el<HTMLSelectElement>('bench-visibility').value as Interval['visibility'],expectedHands:Number(el<HTMLSelectElement>('bench-expected').value) as 1|2,stationary:el<HTMLInputElement>('bench-stationary').checked,note:el<HTMLInputElement>('bench-note').value};
      const next=[...this.intervals,a].sort((a,b)=>a.start-b.start);validateIntervals(next,this.data.a.length);this.intervals=next;this.dirty=true;this.recompute();}));
    on('bench-start-here','click',()=>{el<HTMLInputElement>('bench-start').value=String(Math.max(0,this.displayed));});on('bench-end-here','click',()=>{el<HTMLInputElement>('bench-end').value=String(Math.max(0,this.displayed));});
    on('bench-remove','click',()=>{this.dirty=true;this.intervals=this.intervals.filter(a=>a.id!==el<HTMLSelectElement>('bench-intervals').value);this.recompute();});
    on('bench-clear','click',()=>{this.dirty=true;this.intervals=[];this.recompute();});
    on('bench-apply','click',safe(()=>{const options={...this.options,maxGapMs:Number(el<HTMLInputElement>('bench-gap').value),minValidJoints:Number(el<HTMLInputElement>('bench-valid').value),joint:Number(el<HTMLSelectElement>('bench-joint').value)};validateOptions(options);this.options=options;this.dirty=true;this.recompute();}));
    on('bench-report-export','click',safe(()=>{if(this.report)this.download(new Blob([JSON.stringify(this.report,null,2)],{type:'application/json'}),'hand-tracking-benchmark.json');}));
    on('bench-annotations-export','click',safe(()=>{if(this.data){this.download(exportAnnotations(this.data,this.intervals,this.options),'hand-tracking-annotations.json');this.dirty=false;}}));
    on('bench-annotations-import','change',()=>{void this.loadAnnotations();});on('bench-show-metrics','click',()=>el<HTMLButtonElement>('stats-tab').click());
    const canvas=el<HTMLCanvasElement>('bench-timeline');canvas.addEventListener('click',event=>{if(!this.data)return;const rect=canvas.getBoundingClientRect(),t=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*this.data.a.at(-1)!.timeMs;
      let index=0;this.data.a.forEach((f,i)=>{if(Math.abs(f.timeMs-t)<Math.abs(this.data!.a[index].timeMs-t))index=i;});this.desired=index;this.seek(index);},{signal:this.events.signal});
    canvas.addEventListener('keydown',event=>{if(!this.data||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=event.key==='Home'?0:event.key==='End'?this.data.a.length-1:Math.max(0,Math.min(this.data.a.length-1,Math.max(0,this.desired)+(event.key==='ArrowRight'?1:-1)));this.desired=i;this.seek(i);},{signal:this.events.signal});
  }
  setVisible(visible:boolean):void {for(const id of ['bench-controls','bench-dashboard','bench-timeline-wrap'])el(id).hidden=!visible;}
  setData(data:Dataset|null):void {
    if(this.data?.contentSha256!==data?.contentSha256){this.dirty=false;this.intervals=[];this.options={...METRIC_DEFAULTS};this.displayed=this.desired=-1;el<HTMLInputElement>('bench-start').value='0';el<HTMLInputElement>('bench-end').value=String(Math.max(0,(data?.a.length??1)-1));text('bench-error','');}
    ++this.generation;this.data=data;el('bench-timeline').setAttribute('aria-valuemax',String(Math.max(0,(data?.a.length??1)-1)));el<HTMLInputElement>('bench-gap').value=String(this.options.maxGapMs);el<HTMLInputElement>('bench-valid').value=String(this.options.minValidJoints);el<HTMLSelectElement>('bench-joint').value=String(this.options.joint);this.recompute();
  }
  private async loadAnnotations():Promise<void>{
    const input=el<HTMLInputElement>('bench-annotations-import'),file=input.files?.[0],data=this.data,generation=++this.generation;input.value='';if(!file||!data)return;
    try{const v=await importAnnotations(file,data);if(generation!==this.generation||this.data!==data)return;
      this.intervals=v.annotations;this.options=v.options;this.dirty=false;el<HTMLInputElement>('bench-gap').value=String(v.options.maxGapMs);el<HTMLInputElement>('bench-valid').value=String(v.options.minValidJoints);el<HTMLSelectElement>('bench-joint').value=String(v.options.joint);this.recompute();text('bench-error','');
    }catch(error){if(generation===this.generation)text('bench-error',(error as Error).message);}
  }
  private recompute():void {
    this.report=this.data?benchmarkReport(this.data,this.intervals,this.options):null;
    el<HTMLSelectElement>('bench-intervals').replaceChildren(...this.intervals.map(a=>new Option(`${a.start}–${a.end} · ${a.visibility} · ${a.expectedHands} hand(s)${a.stationary?' · stationary':''}${a.note?' · '+a.note:''}`,a.id)));
    for(const id of ['bench-add','bench-apply','bench-report-export','bench-annotations-export'])(el(id) as HTMLButtonElement).disabled=!this.data;
    el<HTMLInputElement>('bench-annotations-import').disabled=!this.data;text('bench-annotation-status',`${this.intervals.length}/128 intervals · inclusive zero-based frame indices · unannotated visibility stays unknown`);
    const body=el<HTMLTableSectionElement>('bench-summary');body.replaceChildren();const r=this.report;
    const fmt=(v:number|null,unit='',scale=1)=>v===null?'unknown':`${(v*scale).toFixed(2)}${unit}`;
    const reacqMean=(v:{latencyMs:number;rightCensored:boolean}[])=>{const known=v.filter(e=>!e.rightCensored);return known.length?known.reduce((n,e)=>n+e.latencyMs,0)/known.length:null;};
    if(r){const rows:[string,string,string][]=[['Coordinate frame',r.coordinateFrames.a,r.coordinateFrames.b],['Visible frames (evaluable / annotated)',`${r.a.visibleFrames} / ${r.a.annotatedVisibleFrames}`,`${r.b.visibleFrames} / ${r.b.annotatedVisibleFrames}`],
      ['Tracked-frame fraction',fmt(r.a.trackedFrameFraction,'%',100),fmt(r.b.trackedFrameFraction,'%',100)],['Time availability',fmt(r.a.timeWeightedAvailability,'%',100),fmt(r.b.timeWeightedAvailability,'%',100)],
      ['Visible / covered time',`${r.a.visibleMs.toFixed(1)} / ${r.a.coveredVisibleMs.toFixed(1)} ms`,`${r.b.visibleMs.toFixed(1)} / ${r.b.coveredVisibleMs.toFixed(1)} ms`],
      ['Unavailable pipeline time',fmt(r.a.unknownUnavailableMs,' ms'),fmt(r.b.unknownUnavailableMs,' ms')],['Unknown gap time',fmt(r.a.unknownGapMs,' ms'),fmt(r.b.unknownGapMs,' ms')],['Losses / visible minute',fmt(r.a.lossesPerMinute),fmt(r.b.lossesPerMinute)],
      ['Longest interruption',fmt(r.a.longestInterruptionMs,' ms'),fmt(r.b.longestInterruptionMs,' ms')],
      ['Reacquisition events (censored)',`${r.a.reacquisition.length} (${r.a.reacquisition.filter(e=>e.rightCensored).length})`,`${r.b.reacquisition.length} (${r.b.reacquisition.filter(e=>e.rightCensored).length})`],
      ['Max stationary RMS',fmt(r.a.stationary.some(s=>s.rmsM!==null)?Math.max(...r.a.stationary.flatMap(s=>s.rmsM===null?[]:[s.rmsM])):null,' mm',1000),fmt(r.b.stationary.some(s=>s.rmsM!==null)?Math.max(...r.b.stationary.flatMap(s=>s.rmsM===null?[]:[s.rmsM])):null,' mm',1000)],
      ['Reacquire mean (complete)',fmt(reacqMean(r.a.reacquisition),' ms'),fmt(reacqMean(r.b.reacquisition),' ms')],
      ['Max segment-length SD',fmt(r.a.segments.some(s=>s.sdM!==null)?Math.max(...r.a.segments.flatMap(s=>s.sdM===null?[]:[s.sdM])):null,' mm',1000),fmt(r.b.segments.some(s=>s.sdM!==null)?Math.max(...r.b.segments.flatMap(s=>s.sdM===null?[]:[s.sdM])):null,' mm',1000)],
      ['Rejected joint constraints',String(Object.values(r.a.jointConstraintRejections).reduce((n,v)=>n+v,0)),String(Object.values(r.b.jointConstraintRejections).reduce((n,v)=>n+v,0))],['Segment threshold events',String(r.a.segmentConstraintEvents),String(r.b.segmentConstraintEvents)],['Accuracy','unmeasured','unmeasured']];
      for(const values of rows){const row=document.createElement('tr');values.forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});body.append(row);}
      text('bench-detail',JSON.stringify({a:{interruptions:r.a.interruptions,initialAcquisition:r.a.initialAcquisition,reacquisition:r.a.reacquisition,stationary:r.a.stationary,rejections:r.a.rejections},
        b:{interruptions:r.b.interruptions,initialAcquisition:r.b.initialAcquisition,reacquisition:r.b.reacquisition,stationary:r.b.stationary,rejections:r.b.rejections}},null,2));
      text('bench-timing',JSON.stringify({components:r.timing,sensorToHostMs:null,captureToPhotonMs:null,filtering:'disabled'},null,2));
    }else{text('bench-detail','Load a clip to benchmark.');text('bench-timing','No comparable timing samples.');}
    this.drawTimeline();
  }
  presented(index:number):void {this.displayed=this.desired=index;el('bench-timeline').setAttribute('aria-valuenow',String(Math.max(0,index)));this.drawTimeline();}
  private drawTimeline():void{
    const c=el<HTMLCanvasElement>('bench-timeline'),ctx=c.getContext('2d');if(!ctx)return;c.width=Math.max(320,Math.round(c.clientWidth));c.height=64;ctx.clearRect(0,0,c.width,c.height);if(!this.report||!this.data)return;
    const duration=Math.max(1,this.data.a.at(-1)!.timeMs),colors:Record<string,string>={tracked:'#36a67c',lost:'#d75b56',occluded:'#64799f',unannotated:'#888888',unavailable:'#ac88ad'};
    [this.report.a,this.report.b].forEach((r,row)=>r.timeline.forEach((f,i)=>{const next=r.timeline[i+1]?.timeMs??duration,x=f.timeMs/duration*c.width,w=Math.max(1,(next-f.timeMs)/duration*c.width);ctx.fillStyle=colors[f.state];ctx.fillRect(x,row*22,w,18);}));
    const index=this.displayed;if(index>=0&&this.data.a[index]){ctx.fillStyle='#ffc45b';ctx.fillRect(this.data.a[index].timeMs/duration*c.width,0,2,46);}
    const a=this.report.a.timeline[index],b=this.report.b.timeline[index];text('bench-timeline-status',`A / B · green tracked, red lost, blue occluded, grey unknown, purple unavailable · displayed ${index<0?'none':`#${index} · A ${a?.state} / B ${b?.state}`}. Click or arrow keys to seek.`);
  }
  get unsaved(){return this.dirty;}
  snapshot(){return {unsavedAnnotations:this.dirty,ready:!!this.report,annotations:this.intervals.map(a=>({...a})),options:{...this.options},a:this.report?{availability:this.report.a.timeWeightedAvailability,visibleFrames:this.report.a.visibleFrames,losses:this.report.a.losses,jitterGroups:this.report.a.stationary.length}:null,
    b:this.report?{availability:this.report.b.timeWeightedAvailability,visibleFrames:this.report.b.visibleFrames,losses:this.report.b.losses,jitterGroups:this.report.b.stationary.length}:null,displayed:this.displayed};}
  dispose():void {++this.generation;this.events.abort();this.setData(null);this.setVisible(false);}
}

import { BONES, type Point } from '../contracts.ts';
export interface Interval { id:string; start:number; end:number; visibility:'visible'|'occluded'; expectedHands:1|2; stationary:boolean; note:string }
export interface MetricHand { id:number; points:readonly (Point|null)[] }
export interface MetricFrame { available?:boolean;timeMs:number; hands:readonly MetricHand[]; rejections?:Readonly<Record<string,number>> }
export interface MetricOptions { maxGapMs:number; minValidJoints:number; joint:number; maxSegmentM:number }
export const METRIC_DEFAULTS:Readonly<MetricOptions>=Object.freeze({maxGapMs:100,minValidJoints:15,joint:0,maxSegmentM:0.18});
export function validateOptions(o:MetricOptions):void {
  if(!o||Object.keys(o).some(k=>!['maxGapMs','minValidJoints','joint','maxSegmentM'].includes(k))||!Number.isFinite(o.maxGapMs)||o.maxGapMs<1||o.maxGapMs>1000||!Number.isInteger(o.minValidJoints)||o.minValidJoints<1||o.minValidJoints>21||!Number.isInteger(o.joint)||o.joint<0||o.joint>20||!Number.isFinite(o.maxSegmentM)||o.maxSegmentM<=0||o.maxSegmentM>1)throw new Error('Invalid benchmark metric options');
}
export function validateIntervals(value:unknown,count:number):asserts value is Interval[]{
  if(!Array.isArray(value)||value.length>128)throw new Error('At most 128 annotation intervals');
  const ids=new Set<string>();let end=-1;
  for(const a of value){
    if(!a||typeof a!=='object'||Object.keys(a).some(k=>!['id','start','end','visibility','expectedHands','stationary','note'].includes(k))||typeof a.id!=='string'||!a.id.length||a.id.length>128||ids.has(a.id)||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end<a.start||a.end>=count||a.start<=end||!['visible','occluded'].includes(a.visibility)||![1,2].includes(a.expectedHands)||typeof a.stationary!=='boolean'||a.stationary&&a.visibility!=='visible'||typeof a.note!=='string'||a.note.length>256)throw new Error('Invalid, overlapping or unsorted annotation intervals');
    ids.add(a.id);end=a.end;
  }
}
const valid=(p:Point|null):p is Point=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
export const acceptedHands=(frame:MetricFrame,o:MetricOptions)=>frame.available===false?0:frame.hands.filter(h=>h.points.filter(valid).length>=o.minValidJoints).length;
function stats(values:readonly number[]){
  if(!values.length)return {samples:0,mean:null as number|null,sd:null as number|null,min:null as number|null,max:null as number|null};
  let mean=0,m2=0,n=0;for(const v of values){const d=v-mean;mean+=d/++n;m2+=d*(v-mean);}
  return {samples:n,mean,sd:Math.sqrt(Math.max(0,m2/n)),min:Math.min(...values),max:Math.max(...values)};
}
export interface Interruption { startMs:number; endMs:number; durationMs:number; rightCensored:boolean; cause:'recovered'|'interval-end'|'source-gap'|'unavailable' }
/** No visibility inference, interpolation, motion compensation, cross-ID joining or accuracy claims. */
export function analyze(frames:readonly MetricFrame[],annotations:readonly Interval[],options:MetricOptions=METRIC_DEFAULTS){
  validateOptions(options);validateIntervals(annotations,frames.length);
  if(!frames.length||frames[0].timeMs!==0||frames.some((f,i)=>!Number.isFinite(f.timeMs)||i>0&&f.timeMs<=frames[i-1].timeMs))throw new Error('Invalid benchmark timeline');
  const accepted=frames.map(f=>acceptedHands(f,options)),durationMs=frames.at(-1)!.timeMs;
  let visibleFrames=0,annotatedVisibleFrames=0,unavailableFrames=0,trackedFrames=0,visibleMs=0,trackedMs=0,coveredMs=0,unknownGapMs=0,unavailableMs=0,losses=0;
  const interruptions:Interruption[]=[],initialAcquisition:{annotation:string;latencyMs:number;rightCensored:boolean}[]=[],reacquisition:typeof initialAcquisition=[];
  const stationary:{annotation:string;trackId:number;joint:number;samples:number;missingFrames:number;sdXM:number|null;sdYM:number|null;sdZM:number|null;rmsM:number|null}[]=[];
  for(let k=0;k<annotations.length;k++){
    const a=annotations[k];if(a.visibility!=='visible')continue;
    const endTime=frames[Math.min(frames.length-1,a.end+1)].timeMs,startTime=frames[a.start].timeMs;
    visibleMs+=endTime-startTime;
    const first=frames.findIndex((_,i)=>i>=a.start&&i<=a.end&&accepted[i]>=a.expectedHands);
    const acquisition={annotation:a.id,latencyMs:(first<0?endTime:frames[first].timeMs)-startTime,rightCensored:first<0};
    const previous=annotations[k-1];(previous?.visibility==='occluded'&&previous.end+1===a.start&&previous.expectedHands===a.expectedHands?reacquisition:initialAcquisition).push(acquisition);
    let episode:number|null=null;
    const finish=(end:number,cause:Interruption['cause'])=>{if(episode!==null){interruptions.push({startMs:episode,endMs:end,durationMs:Math.max(0,end-episode),rightCensored:cause!=='recovered',cause});episode=null;}};
    for(let i=a.start;i<=a.end;i++){
      const t=frames[i].timeMs,available=frames[i].available!==false,tracked=available&&accepted[i]>=a.expectedHands;annotatedVisibleFrames++;if(available)visibleFrames++;else unavailableFrames++;if(tracked)trackedFrames++;
      const span=Math.max(0,Math.min(endTime,frames[i+1]?.timeMs??endTime)-t),bounded=Math.min(span,options.maxGapMs),covered=available?bounded:0;coveredMs+=covered;unknownGapMs+=span-bounded;if(!available)unavailableMs+=bounded;if(tracked)trackedMs+=covered;
      if(i>a.start){
        if(t-frames[i-1].timeMs>options.maxGapMs||!available||frames[i-1].available===false)finish(Math.min(t,frames[i-1].timeMs+options.maxGapMs),t-frames[i-1].timeMs>options.maxGapMs?'source-gap':'unavailable');
        else if(accepted[i-1]>=a.expectedHands&&!tracked){losses++;episode=t;}
      }
      if(tracked)finish(t,'recovered');
    }
    finish(Math.min(endTime,frames[a.end].timeMs+options.maxGapMs),'interval-end');
    if(a.stationary){
      const ids=new Set(frames.slice(a.start,a.end+1).flatMap(f=>f.hands.map(h=>h.id)));
      for(const id of ids){
        const points=frames.slice(a.start,a.end+1).flatMap(f=>{const p=f.available===false?null:f.hands.find(h=>h.id===id)?.points[options.joint]??null;return valid(p)?[p]:[];});
        const x=stats(points.map(p=>p.x)),y=stats(points.map(p=>p.y)),z=stats(points.map(p=>p.z)),enough=points.length>=2;
        stationary.push({annotation:a.id,trackId:id,joint:options.joint,samples:points.length,missingFrames:a.end-a.start+1-points.length,
          sdXM:enough?x.sd:null,sdYM:enough?y.sd:null,sdZM:enough?z.sd:null,rmsM:enough?Math.hypot(x.sd!,y.sd!,z.sd!):null});
      }
    }
  }
  const tracks=new Map<number,MetricHand[]>();for(const f of frames)if(f.available!==false)for(const hand of f.hands){const values=tracks.get(hand.id)??[];values.push(hand);tracks.set(hand.id,values);}const segments:{trackId:number;from:number;to:number;samples:number;meanM:number|null;sdM:number|null;varianceM2:number|null;cv:number|null;overLimitSamples:number}[]=[];
  let segmentConstraintEvents=0;for(const [id,hands]of tracks)for(const [from,to]of BONES){
    const lengths=hands.flatMap(h=>{const a=h.points[from]??null,b=h.points[to]??null;return valid(a)&&valid(b)?[Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)]:[];});
    const s=stats(lengths),overLimitSamples=lengths.filter(n=>n>options.maxSegmentM).length;segmentConstraintEvents+=overLimitSamples;
    segments.push({trackId:id,from,to,samples:s.samples,meanM:s.mean,sdM:s.samples>=2?s.sd:null,varianceM2:s.samples>=2?s.sd!**2:null,cv:s.samples>=2&&s.mean!>0?s.sd!/s.mean!:null,overLimitSamples});
  }
  const rejections:Record<string,number>={};for(const f of frames)for(const [reason,n]of Object.entries(f.rejections??{}))rejections[reason]=(rejections[reason]??0)+n;
  return {coordinateUnits:'m',processedFrames:frames.length,durationMs,visibleFrames,annotatedVisibleFrames,unavailableFrames,trackedFrames,
    trackedFrameFraction:visibleFrames?trackedFrames/visibleFrames:null,visibleMs,coveredVisibleMs:coveredMs,unknownGapMs,unknownUnavailableMs:unavailableMs,trackedMs,
    timeWeightedAvailability:visibleMs>0&&coveredMs>0?trackedMs/visibleMs:null,observedAvailability:coveredMs>0?trackedMs/coveredMs:null,
    losses,lossesPerMinute:visibleMs>0&&coveredMs>0?losses*60000/visibleMs:null,interruptions,longestInterruptionMs:interruptions.length?Math.max(...interruptions.map(e=>e.durationMs)):null,
    initialAcquisition,reacquisition,stationary,segments,segmentConstraintEvents,
    jointConstraintRejections:Object.fromEntries(['long-bone','motion-jump','palm-depth-mismatch'].map(reason=>[reason,rejections[reason]??0])),
    jointSampleDenominator:frames.reduce((n,f)=>n+f.hands.length*21,0),rejections,impossibleAngleEvents:null,accuracy:null,
    timeline:frames.map((f,index)=>{const a=annotations.find(a=>index>=a.start&&index<=a.end);return {index,timeMs:f.timeMs,acceptedHands:accepted[index],validPoints:f.hands.reduce((n,h)=>n+h.points.filter(valid).length,0),
      visibility:a?.visibility??'unknown',expectedHands:a?.expectedHands??null,state:!a?'unannotated':a.visibility==='occluded'?'occluded':f.available===false?'unavailable':accepted[index]>=a.expectedHands?'tracked':'lost'};}),
  };
}
export function timingStats(values:readonly number[]){const v=values.filter(Number.isFinite).sort((a,b)=>a-b),s=stats(v);return {...s,p50:v.length?v[Math.floor((v.length-1)*0.5)]:null,p95:v.length?v[Math.floor((v.length-1)*0.95)]:null,units:'ms'};}

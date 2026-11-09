import type {Point} from '../contracts.ts';
import type {Packet,WireFrame,Calibration} from '../rgbd/protocol.ts';
import {prepareGeometry} from '../rgbd/geometry.ts';
import {samplePoint,pairing,DEPTH_DEFAULTS} from '../rgbd/reconstruction.ts';
import {markerPlane} from './marker.ts';
import {calibrationMetadata,fitSpatialCalibration,FIT_LIMITS,type TargetSample,type TargetPair,type SpatialCalibration} from './calibration.ts';
export type CameraSide='a'|'b';
export interface AutomaticMarkerObservation {id:number;calibration:Calibration;corners:readonly TargetSample[];receivedPageMs:number;sdkEstimatedSideM:number;planeResidualM:number;intraSkewMs?:number}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const center=(o:AutomaticMarkerObservation):Point=>({x:o.corners.reduce((s,c)=>s+c.point.x,0)/4,y:o.corners.reduce((s,c)=>s+c.point.y,0)/4,z:o.corners.reduce((s,c)=>s+c.point.z,0)/4});
/** Observed SDK scale/geometry, never an entered or fabricated physical-reference accuracy. */
export function automaticMarkerObservation(packet:Packet&{meta:WireFrame},cal:Calibration,receivedPageMs:number,pageOriginMs:number):AutomaticMarkerObservation {
  const m=packet.meta.marker;if(!m||m.family!=='tag36h11'||m.colorFrame!==packet.meta.color.number)throw new Error('Waiting for marker');
  if(!m.detections.length)throw new Error('Place marker in view');if(m.detections.length!==1)throw new Error('Show only one marker');
  const d=m.detections[0];
  // Public decoder already limits correction to one bit. Accept usable smaller tags;
  // require persistent matching IDs, metric/reprojection and relative-pose checks later.
  if(d.hamming>1||d.margin<10)throw new Error('Marker unclear—move closer');
  const pair=pairing(packet.meta,50);if(pair.reason)throw new Error('Waiting for paired RGB and depth');
  if(d.corners.length!==4||d.corners.some((p,i)=>Math.hypot(p.x-d.corners[(i+1)%4].x,p.y-d.corners[(i+1)%4].y)<20))throw new Error('Marker too small—move closer');
  const g=prepareGeometry(cal),middle={x:d.corners.reduce((s,p)=>s+p.x,0)/4,y:d.corners.reduce((s,p)=>s+p.y,0)/4},points:Point[]=[];
  for(const c of d.corners)for(const scale of [{x:1.1,y:1.1},{x:1.1,y:1},{x:1,y:1.1}]){const sample=samplePoint(packet,cal,g,{x:middle.x+(c.x-middle.x)*scale.x,y:middle.y+(c.y-middle.y)*scale.y},DEPTH_DEFAULTS);if(sample.valid&&sample.point)points.push(sample.point);}
  let plane:ReturnType<typeof markerPlane>;try{plane=markerPlane(points);}catch{throw new Error('No reliable depth at marker—use a flat matte target');}
  const i=g.intrinsics,corners=d.corners.map((pixel):TargetSample=>{const ray={x:(pixel.x-i.cx)/i.fx,y:(pixel.y-i.cy)/i.fy,z:1},den=plane.normal.x*ray.x+plane.normal.y*ray.y+plane.normal.z;if(Math.abs(den)<.1)throw new Error('Face marker toward both cameras');const z=plane.d/den;if(z<.15||z>3)throw new Error('Move marker into depth range');return {point:{x:ray.x*z,y:ray.y*z,z},pixel:{...pixel},frameNumber:packet.meta.color.number,sourceTimeMs:packet.meta.color.timestampMs,clockDomain:packet.meta.color.domain,selectedPageMs:receivedPageMs,pageOriginMs};});
  const edges=corners.map((c,n)=>distance(c.point,corners[(n+1)%4].point)),side=edges.reduce((s,v)=>s+v,0)/4;
  if(side<.015||side>.75||edges.some(v=>Math.abs(v-side)>Math.max(.003,side*.15))||[0,1].some(n=>Math.abs(distance(corners[n].point,corners[n+2].point)-side*Math.SQRT2)>Math.max(.005,side*.2)))throw new Error('Marker depth is inconsistent—keep target flat');
  return {id:d.id,calibration:calibrationMetadata(cal),corners,receivedPageMs,sdkEstimatedSideM:side,planeResidualM:plane.residual,intraSkewMs:pair.skew??0};
}
export const AUTOMATIC_SAMPLES=12;
interface Pair {a:AutomaticMarkerObservation;b:AutomaticMarkerObservation}
/** Bounded scalar observations. Movement is permitted: the relative CAMERA transform must stay stable. */
export class AutomaticMarkerCalibration {
  private samples:{a:AutomaticMarkerObservation[];b:AutomaticMarkerObservation[]}={a:[],b:[]};private reasons={a:'Place marker',b:'Place marker'};
  reset():void{this.samples={a:[],b:[]};this.reasons={a:'Place marker',b:'Place marker'};}
  missing(side:CameraSide,reason:string):void{this.reasons[side]=reason;/* A single weak/lost frame must not erase valid recent evidence. */}
  push(side:CameraSide,o:AutomaticMarkerObservation):void {
    const w=this.samples[side],last=w.at(-1),first=w[0];
    if(last&&(o.corners[0].frameNumber<last.corners[0].frameNumber||o.corners[0].sourceTimeMs<last.corners[0].sourceTimeMs)){this.samples[side]=[];this.reasons[side]='Waiting for fresh frames';return;}
    if(last&&o.corners[0].frameNumber===last.corners[0].frameNumber)return;
    if(first&&(o.id!==first.id||JSON.stringify(o.calibration)!==JSON.stringify(first.calibration)))w.length=0;
    w.push(o);while(w.length>40||w.length>1&&o.receivedPageMs-w[0].receivedPageMs>8000)w.shift();this.reasons[side]='Marker detected';
  }
  private pairs():{pairs:Pair[];motionRejected:number}{
    const pairs:Pair[]=[];let previous=-1,motionRejected=0;
    const speed=(values:AutomaticMarkerObservation[],index:number)=>{if(index<1)return 0;const a=values[index-1],b=values[index],dt=b.corners[0].sourceTimeMs-a.corners[0].sourceTimeMs;return dt>0?distance(center(a),center(b))/(dt/1000):0;};
    for(let ai=0;ai<this.samples.a.length;ai++){const a=this.samples.a[ai];let best=-1,error=41;
      for(let bi=previous+1;bi<this.samples.b.length;bi++){const b=this.samples.b[bi],ta=a.corners[0],tb=b.corners[0],delta=Math.abs(ta.sourceTimeMs-tb.sourceTimeMs);if(a.id===b.id&&ta.clockDomain===tb.clockDomain&&['System Time','Global Time'].includes(ta.clockDomain)&&Math.abs(a.receivedPageMs-b.receivedPageMs)<=150&&delta<=40&&delta<error){best=bi;error=delta;}}
      if(best<0)continue;const b=this.samples.b[best],skew=Math.max(error,Math.abs(a.receivedPageMs-b.receivedPageMs))+(a.intraSkewMs??0)+(b.intraSkewMs??0),risk=Math.max(speed(this.samples.a,ai),speed(this.samples.b,best))*skew/1000;
      previous=best;if(risk>.015){motionRejected++;continue;}pairs.push({a,b});
    }
    return {pairs:pairs.slice(-AUTOMATIC_SAMPLES),motionRejected};
  }
  snapshot(now:number){const state=(side:CameraSide)=>{const w=this.samples[side],last=w.at(-1),fresh=!!last&&now-last.receivedPageMs<=1250;return {count:fresh?w.length:0,id:fresh?last!.id:null,reason:!last?this.reasons[side]:!fresh?'Place marker':this.reasons[side]};};const a=state('a'),b=state('b'),same=a.id!==null&&a.id===b.id,{pairs,motionRejected}=this.pairs(),spans=pairs.length?(['a','b'] as const).map(s=>pairs.at(-1)![s].receivedPageMs-pairs[0][s].receivedPageMs):[0,0],ready=same&&pairs.length===AUTOMATIC_SAMPLES&&spans.every(v=>v>=1800);return {a,b,ready,paired:pairs.length,motionRejected,progress:same?pairs.length/AUTOMATIC_SAMPLES:0,reason:!same&&a.id!==null&&b.id!==null?'Show the same marker to both cameras':motionRejected&&pairs.length<AUTOMATIC_SAMPLES?'Move marker more slowly':same&&pairs.length<AUTOMATIC_SAMPLES&&a.count>=12&&b.count>=12?'Waiting for matching camera frames':a.reason===b.reason?a.reason:`A: ${a.reason} · B: ${b.reason}`};}
  async fit(now:number):Promise<SpatialCalibration>{if(!this.snapshot(now).ready)throw new Error('Keep marker visible');const pairs=this.pairs().pairs,a=pairs.map(p=>p.a),b=pairs.map(p=>p.b);if(a[0].calibration.serial===b[0].calibration.serial)throw new Error('Choose two different cameras');const targets:TargetPair[]=a.flatMap((o,n)=>o.corners.map((p,i)=>({id:`auto_${n}_${i}`,use:n<8?'fit':'check',a:p,b:b[n].corners[i]})));return fitSpatialCalibration({sources:{a:a[0].calibration,b:b[0].calibration},targets,limits:{...FIT_LIMITS},evidence:{staticTargetConfirmed:false,description:`Automatic tag36h11 #${a[0].id}; native SDK scale; bounded reported-clock/receipt pairs; stable CAMERA-relative pose, target may move; disjoint fit/check frames. Accuracy and exposure sync unverified.`,referenceUncertaintyM:null,automaticMarker:{family:'tag36h11',id:a[0].id,validation:'paired-relative-poses'}}});}
}

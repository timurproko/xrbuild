import type { Point } from '../contracts.ts';
import { prepareGeometry,projectPoint,type Pixel } from '../rgbd/geometry.ts';
import { validateCalibration,validSerial,type Calibration,type Intrinsics,type Profile } from '../rgbd/protocol.ts';
import { metadataHash,json } from '../recording/format.ts';
import { immutable } from '../recording/depth-format.ts';
export interface TargetSample { point:Point;pixel:Pixel;frameNumber:number;sourceTimeMs:number;clockDomain:string;selectedPageMs:number;pageOriginMs:number }
export interface TargetPair { id:string;use:'fit'|'check';a:TargetSample;b:TargetSample }
export interface FitLimits { rmsM:number;maximumM:number;reprojectionPx:number }
export const FIT_LIMITS:Readonly<FitLimits>=Object.freeze({rmsM:0.015,maximumM:0.03,reprojectionPx:8});
export interface CalibrationInput {
  sources:{a:Calibration;b:Calibration};targets:readonly TargetPair[];limits:FitLimits;
  evidence:{staticTargetConfirmed:boolean;description:string;referenceUncertaintyM:number|null;automaticMarker?:{family:'tag36h11';id:number;validation:'disjoint-static-frames'|'paired-relative-poses'}};
}
export interface RigidTransform { rotationRowMajor:readonly number[];translationMeters:Point }
export interface Residual {id:string;use:'fit'|'check';distanceM:number;pixelA:number|null;pixelB:number|null}
export interface ResidualSummary {samples:number;rmsM:number|null;maximumM:number|null;reprojectionRmsPx:number|null;invalidProjections:number}
export interface SpatialCalibration {
  format:'xrbuild-spatial-calibration';version:1;privateEvaluationOnly:true;input:CalibrationInput;inputSha256:string;
  worldFrame:'camera-a-optical';transform:'pA = rotationRowMajor * pB + translationMeters';bToA:RigidTransform;
  sourceHashes:{a:string;b:string};residuals:readonly Residual[];fit:ResidualSummary;check:ResidualSummary;
  spatialQualified:boolean;reasons:readonly string[];validation?:'temporal-held-out-only'|'paired-relative-pose-frames';poseRepeatabilityM?:number;accuracy?:'unverified';physicalValidation:'operator-required';temporalAlignment:null;fusionEnabled:false;
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const vec=(p:unknown):p is Point=>!!p&&typeof p==='object'&&[Reflect.get(p,'x'),Reflect.get(p,'y'),Reflect.get(p,'z')].every(v=>finite(v)&&Math.abs(v)<=30);
const minus=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const profile=(p:Profile):Profile=>({stream:p.stream,encoding:p.encoding,width:p.width,height:p.height,fps:p.fps});
const intrinsics=(p:Intrinsics):Intrinsics=>({width:p.width,height:p.height,fx:p.fx,fy:p.fy,cx:p.cx,cy:p.cy,distortion:p.distortion,coefficients:[...p.coefficients]});
/** Retain only schema-owned SDK metadata; never copy arbitrary imported media/credentials/extensions. */
export function calibrationMetadata(value:Calibration):Calibration {
  validateCalibration(value);prepareGeometry(value);
  return {type:'hello',sdkVersion:value.sdkVersion,serial:value.serial,name:value.name,firmware:value.firmware,usb:value.usb,depthScaleMeters:value.depthScaleMeters,
    color:profile(value.color),depth:profile(value.depth),colorIntrinsics:intrinsics(value.colorIntrinsics),depthIntrinsics:intrinsics(value.depthIntrinsics),alignedDepthIntrinsics:intrinsics(value.alignedDepthIntrinsics),
    depthToColor:{rotationColumnMajor:[...value.depthToColor.rotationColumnMajor],translationMeters:[...value.depthToColor.translationMeters]},alignment:value.alignment,pairing:value.pairing,nativeClock:value.nativeClock,
    geometry:{version:1,alignedPixelFrame:'color-optical',alignedValue:'original-depth-optical-z'}};
}
function sample(value:TargetSample,calibration:Calibration):TargetSample {
  if(!value||!vec(value.point)||value.point.z<0.05||value.point.z>10||!value.pixel||!finite(value.pixel.x)||!finite(value.pixel.y)||value.pixel.x<0||value.pixel.x>=calibration.color.width||value.pixel.y<0||value.pixel.y>=calibration.color.height||
    !Number.isSafeInteger(value.frameNumber)||value.frameNumber<0||!finite(value.sourceTimeMs)||typeof value.clockDomain!=='string'||!value.clockDomain.length||value.clockDomain.length>64||
    !finite(value.selectedPageMs)||value.selectedPageMs<0||!finite(value.pageOriginMs)||value.pageOriginMs<0)throw new Error('Invalid calibration target measurement');
  const projected=projectPoint(prepareGeometry(calibration),value.point);
  if(!projected||Math.hypot(projected.x-value.pixel.x,projected.y-value.pixel.y)>0.1)throw new Error('Target XYZ/pixel provenance mismatch');
  return {point:{x:value.point.x,y:value.point.y,z:value.point.z},pixel:{x:value.pixel.x,y:value.pixel.y},frameNumber:value.frameNumber,sourceTimeMs:value.sourceTimeMs,clockDomain:value.clockDomain,selectedPageMs:value.selectedPageMs,pageOriginMs:value.pageOriginMs};
}
function normalize(input:CalibrationInput):CalibrationInput {
  if(!input||!input.sources||!input.evidence||(input.evidence.automaticMarker?.validation==='paired-relative-poses'?input.evidence.staticTargetConfirmed!==false:input.evidence.staticTargetConfirmed!==true)||typeof input.evidence.description!=='string'||!input.evidence.description.trim()||input.evidence.description.length>256)throw new Error('Confirm fixed cameras/static matching targets and describe the physical setup');
  const a=calibrationMetadata(input.sources.a),b=calibrationMetadata(input.sources.b);
  if(!validSerial(a.serial)||!validSerial(b.serial)||a.serial===b.serial)throw new Error('Two distinct native camera serials are required');
  const l=input.limits,u=input.evidence.referenceUncertaintyM;
  if(!l||!finite(l.rmsM)||l.rmsM<=0||l.rmsM>0.03||!finite(l.maximumM)||l.maximumM<l.rmsM||l.maximumM>0.06||!finite(l.reprojectionPx)||l.reprojectionPx<=0||l.reprojectionPx>15)throw new Error('Invalid spatial residual limits');
  if(u!==null&&(!finite(u)||u<=0||u>0.1))throw new Error('Reference/setup uncertainty must be measured positive metres or unknown');
  if(!Array.isArray(input.targets)||input.targets.length<6||input.targets.length>64)throw new Error('Provide 6–64 complete matched target pairs');
  const ids=new Set<string>();const targets=input.targets.map(t=>{
    if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(t.id)||ids.has(t.id)||!['fit','check'].includes(t.use))throw new Error('Invalid or duplicate target ID/use');ids.add(t.id);
    return {id:t.id,use:t.use,a:sample(t.a,a),b:sample(t.b,b)};
  });
  const automatic=input.evidence.automaticMarker;if(automatic!==undefined){if(!automatic||automatic.family!=='tag36h11'||!Number.isInteger(automatic.id)||automatic.id<0||automatic.id>586||!['disjoint-static-frames','paired-relative-poses'].includes(automatic.validation)||u!==null)throw new Error('Invalid automatic marker evidence');validateAutomaticFrames(targets,automatic.validation==='paired-relative-poses');}
  return {sources:{a,b},targets,limits:{rmsM:l.rmsM,maximumM:l.maximumM,reprojectionPx:l.reprojectionPx},
    evidence:{staticTargetConfirmed:input.evidence.staticTargetConfirmed,description:input.evidence.description,referenceUncertaintyM:u,...(automatic?{automaticMarker:{family:'tag36h11' as const,id:automatic.id,validation:automatic.validation}}:{})}};
}
/** Repeated observations of ONE placement, not invented extra target placements or independent accuracy. */
function validateAutomaticFrames(targets:readonly TargetPair[],moving=false):void {
  if(targets.length!==48)throw new Error('Automatic marker requires 12 complete four-corner frame groups');
  for(let n=0;n<12;n++){const group=targets.slice(n*4,n*4+4);for(let i=0;i<4;i++)if(group[i].id!==`auto_${n}_${i}`||group[i].use!==(n<8?'fit':'check'))throw new Error('Automatic fit/check frame partition mismatch');
    for(const side of ['a','b'] as const){const first=targets[0][side],sample=group[0][side];if(group.some(t=>t[side].frameNumber!==sample.frameNumber||t[side].sourceTimeMs!==sample.sourceTimeMs||t[side].clockDomain!==first.clockDomain||t[side].selectedPageMs!==sample.selectedPageMs||t[side].pageOriginMs!==first.pageOriginMs))throw new Error('Automatic corner/frame provenance mismatch');
      if(n){const previous=targets[(n-1)*4][side];if(sample.frameNumber<=previous.frameNumber||sample.sourceTimeMs<=previous.sourceTimeMs||sample.selectedPageMs<=previous.selectedPageMs)throw new Error('Automatic frame order / held-out reuse');}
      if(!moving&&group.some((t,i)=>distance(t[side].point,targets[i][side].point)>.008||Math.hypot(t[side].pixel.x-targets[i][side].pixel.x,t[side].pixel.y-targets[i][side].pixel.y)>2))throw new Error('Automatic marker moved during capture');
      const edges=group.map((t,i)=>distance(t[side].point,group[(i+1)%4][side].point)),mean=edges.reduce((s,v)=>s+v,0)/4;if(mean<(moving?.015:.025)||mean>.75||edges.some(v=>Math.abs(v-mean)>Math.max(.003,mean*.15)))throw new Error('Automatic marker surface is not a supported square');
    }
    if(group[0].a.pageOriginMs!==group[0].b.pageOriginMs||Math.abs(group[0].a.selectedPageMs-group[0].b.selectedPageMs)>(moving?150:500))throw new Error('Automatic source receipt/static-pair mismatch');
    if(moving&&(group[0].a.clockDomain!==group[0].b.clockDomain||!['System Time','Global Time'].includes(group[0].a.clockDomain)||Math.abs(group[0].a.sourceTimeMs-group[0].b.sourceTimeMs)>40))throw new Error('Automatic reported-frame clocks are not matched');
  }
  for(const side of ['a','b'] as const)if(targets[44][side].selectedPageMs-targets[0][side].selectedPageMs<1800)throw new Error('Automatic marker stability window too short');
}
function adequateSpread(points:readonly Point[],minimumSpan=.05):boolean {
  if(points.length<3)return false;let span=0,start=points[0],end=points[1];
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const d=distance(points[i],points[j]);if(d>span){span=d;start=points[i];end=points[j];}}
  if(span<minimumSpan)return false;const axis=minus(end,start);let width=0;
  for(const p of points){const d=minus(p,start),cross={x:axis.y*d.z-axis.z*d.y,y:axis.z*d.x-axis.x*d.z,z:axis.x*d.y-axis.y*d.x};width=Math.max(width,Math.hypot(cross.x,cross.y,cross.z)/span);}
  return width>=0.01&&width/span>=0.05;
}
/** Symmetric 4x4 Jacobi eigensolve. Bounded rotations, no power-iteration failure on planar targets. */
function largestEigenvector(matrix:number[]):number[]{
  const m=[...matrix],v:number[]=Array.from({length:16},(_,i)=>Math.floor(i/4)===i%4?1:0);
  for(let iteration=0;iteration<80;iteration++){
    let p=0,q=1,magnitude=0;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(m[i*4+j])>magnitude){p=i;q=j;magnitude=Math.abs(m[i*4+j]);}
    if(magnitude<1e-14)break;
    const pp=m[p*4+p],qq=m[q*4+q],pq=m[p*4+q],tau=(qq-pp)/(2*pq),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.sqrt(1+tau*tau)),c=1/Math.sqrt(1+t*t),s=t*c;
    for(let k=0;k<4;k++)if(k!==p&&k!==q){const kp=m[k*4+p],kq=m[k*4+q];m[k*4+p]=m[p*4+k]=c*kp-s*kq;m[k*4+q]=m[q*4+k]=s*kp+c*kq;}
    m[p*4+p]=pp-t*pq;m[q*4+q]=qq+t*pq;m[p*4+q]=m[q*4+p]=0;
    for(let k=0;k<4;k++){const kp=v[k*4+p],kq=v[k*4+q];v[k*4+p]=c*kp-s*kq;v[k*4+q]=s*kp+c*kq;}
  }
  let index=0;for(let i=1;i<4;i++)if(m[i*4+i]>m[index*4+index])index=i;
  const result=Array.from({length:4},(_,i)=>v[i*4+index]),length=Math.hypot(...result);return result.map(n=>n/length);
}
function rotate(r:readonly number[],p:Point):Point{return {x:r[0]*p.x+r[1]*p.y+r[2]*p.z,y:r[3]*p.x+r[4]*p.y+r[5]*p.z,z:r[6]*p.x+r[7]*p.y+r[8]*p.z};}
export function transformPoint(transform:RigidTransform,point:Point):Point {const p=rotate(transform.rotationRowMajor,point),t=transform.translationMeters;return {x:p.x+t.x,y:p.y+t.y,z:p.z+t.z};}
export function inversePoint(transform:RigidTransform,point:Point):Point {const r=transform.rotationRowMajor,p=minus(point,transform.translationMeters);return rotate([r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]],p);}
export function validateRigid(t:RigidTransform):void {
  const r=t?.rotationRowMajor;if(!Array.isArray(r)||r.length!==9||!r.every(finite)||!vec(t.translationMeters)||Math.hypot(t.translationMeters.x,t.translationMeters.y,t.translationMeters.z)>10)throw new Error('Invalid rigid camera transform');
  for(let i=0;i<3;i++)for(let j=i;j<3;j++){const dot=r[i*3]*r[j*3]+r[i*3+1]*r[j*3+1]+r[i*3+2]*r[j*3+2];if(Math.abs(dot-(i===j?1:0))>1e-7)throw new Error('Camera rotation is not orthonormal');}
  const det=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);if(Math.abs(det-1)>1e-7)throw new Error('Camera rotation must be proper, not reflected');
}
/** Horn absolute orientation: proper rigid B→A, never scale/shear or guessed identity for camera B. */
export function fitRigid(a:readonly Point[],b:readonly Point[],minimumSpan=.05):RigidTransform {
  if(a.length!==b.length||a.length<6||a.length>64||!a.every(vec)||!b.every(vec)||!adequateSpread(a,minimumSpan)||!adequateSpread(b,minimumSpan))throw new Error('Need at least 6 non-collinear, well-spread matched targets in both cameras');
  const centroid=(p:readonly Point[])=>({x:p.reduce((n,p)=>n+p.x,0)/p.length,y:p.reduce((n,p)=>n+p.y,0)/p.length,z:p.reduce((n,p)=>n+p.z,0)/p.length}),ca=centroid(a),cb=centroid(b),h=Array(9).fill(0);
  for(let i=0;i<a.length;i++){const x=minus(b[i],cb),y=minus(a[i],ca),source=[x.x,x.y,x.z],target=[y.x,y.y,y.z];for(let j=0;j<3;j++)for(let k=0;k<3;k++)h[j*3+k]+=source[j]*target[k];}
  const [xx,xy,xz,yx,yy,yz,zx,zy,zz]=h,[w,x,y,z]=largestEigenvector([xx+yy+zz,yz-zy,zx-xz,xy-yx,yz-zy,xx-yy-zz,xy+yx,zx+xz,zx-xz,xy+yx,-xx+yy-zz,yz+zy,xy-yx,zx+xz,yz+zy,-xx-yy+zz]);
  const r=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)],t=minus(ca,rotate(r,cb));
  const result={rotationRowMajor:r,translationMeters:t};validateRigid(result);return immutable(result);
}
function summarize(values:readonly Residual[]):ResidualSummary {
  const errors=values.flatMap(v=>v.pixelA===null||v.pixelB===null?[]:[v.pixelA,v.pixelB]);return {samples:values.length,rmsM:values.length?Math.sqrt(values.reduce((n,v)=>n+v.distanceM*v.distanceM,0)/values.length):null,
    maximumM:values.length?Math.max(...values.map(v=>v.distanceM)):null,reprojectionRmsPx:errors.length?Math.sqrt(errors.reduce((n,e)=>n+e*e,0)/errors.length):null,invalidProjections:values.filter(v=>v.pixelA===null||v.pixelB===null).length};
}
export async function fitSpatialCalibration(value:CalibrationInput):Promise<SpatialCalibration>{
  const input=normalize(value),fit=input.targets.filter(t=>t.use==='fit'),checks=input.targets.filter(t=>t.use==='check');
  const moving=input.evidence.automaticMarker?.validation==='paired-relative-poses',minimumSpan=moving?.02:.05;
  const bToA=fitRigid(fit.map(t=>t.a.point),fit.map(t=>t.b.point),minimumSpan),ga=prepareGeometry(input.sources.a),gb=prepareGeometry(input.sources.b);
  const residuals=input.targets.map(t=>{const a=transformPoint(bToA,t.b.point),b=inversePoint(bToA,t.a.point),pa=projectPoint(ga,a),pb=projectPoint(gb,b);return {id:t.id,use:t.use,distanceM:distance(a,t.a.point),
    pixelA:pa?Math.hypot(pa.x-t.a.pixel.x,pa.y-t.a.pixel.y):null,pixelB:pb?Math.hypot(pb.x-t.b.pixel.x,pb.y-t.b.pixel.y):null};});
  const fitSummary=summarize(residuals.filter(r=>r.use==='fit')),checkSummary=summarize(residuals.filter(r=>r.use==='check')),reasons:string[]=[];
  const accept=(s:ResidualSummary,role:string)=>{if(s.rmsM===null||s.rmsM>input.limits.rmsM)reasons.push(`${role} RMS exceeds limit`);if(s.maximumM===null||s.maximumM>input.limits.maximumM)reasons.push(`${role} maximum residual exceeds limit`);
    if(s.invalidProjections||s.reprojectionRmsPx===null||s.reprojectionRmsPx>input.limits.reprojectionPx)reasons.push(`${role} reprojection is unavailable or exceeds limit`);};
  accept(fitSummary,'Fit');if(checks.length>=3&&adequateSpread(checks.map(t=>t.a.point),minimumSpan)&&adequateSpread(checks.map(t=>t.b.point),minimumSpan))accept(checkSummary,'Held-out');else reasons.push('Need at least 3 well-spread held-out checks');
  if(input.evidence.referenceUncertaintyM===null&&!input.evidence.automaticMarker)reasons.push('Reference/setup uncertainty is unknown');
  else if(input.evidence.referenceUncertaintyM!==null&&input.evidence.referenceUncertaintyM>input.limits.rmsM)reasons.push('Reference/setup uncertainty exceeds RMS acceptance limit');
  let poseRepeatabilityM:number|undefined;if(moving){const probes:Point[]=[{x:0,y:0,z:1},{x:.2,y:0,z:1},{x:0,y:.2,z:1}],errors:number[]=[];for(let skip=0;skip<8;skip++){const part=fit.filter((_,i)=>Math.floor(i/4)!==skip),t=fitRigid(part.map(p=>p.a.point),part.map(p=>p.b.point),minimumSpan);for(const p of probes)errors.push(distance(transformPoint(t,p),transformPoint(bToA,p)));}poseRepeatabilityM=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length);if(poseRepeatabilityM>.005)reasons.push('Camera-relative pose is not repeatable yet');}
  const [a,b,inputSha256]=await Promise.all([metadataHash(input.sources.a),metadataHash(input.sources.b),metadataHash(input)]);
  return immutable({format:'xrbuild-spatial-calibration',version:1,privateEvaluationOnly:true,input,inputSha256,worldFrame:'camera-a-optical',transform:'pA = rotationRowMajor * pB + translationMeters',bToA,sourceHashes:{a,b},
    ...(input.evidence.automaticMarker?{validation:moving?'paired-relative-pose-frames' as const:'temporal-held-out-only' as const,accuracy:'unverified' as const,...(poseRepeatabilityM!==undefined?{poseRepeatabilityM}:{})}:{}),residuals,fit:fitSummary,check:checkSummary,spatialQualified:reasons.length===0,reasons,physicalValidation:'operator-required',temporalAlignment:null,fusionEnabled:false});
}
export async function assertCurrentSources(result:SpatialCalibration,a:Calibration,b:Calibration):Promise<void>{
  if(await metadataHash(calibrationMetadata(a))!==result.sourceHashes.a||await metadataHash(calibrationMetadata(b))!==result.sourceHashes.b)throw new Error('Camera serial/profile/calibration changed; clear and recalibrate');
}
export function exportSpatialCalibration(value:SpatialCalibration):Blob {
  const file=json(value);if(file.size>65536)throw new Error('Calibration exceeds 64 KiB; reduce target count/description');return file;
}
export async function importSpatialCalibration(file:Blob):Promise<SpatialCalibration>{
  if(file.size<=0||file.size>65536)throw new Error('Calibration must be nonempty and at most 64 KiB');const value=JSON.parse(await file.text());
  if(!value||value.format!=='xrbuild-spatial-calibration'||value.version!==1||value.privateEvaluationOnly!==true||value.worldFrame!=='camera-a-optical'||value.temporalAlignment!==null||value.fusionEnabled!==false||value.physicalValidation!=='operator-required')throw new Error('Unsupported calibration declarations; spatial-only setup cannot enable fusion');
  validateRigid(value.bToA);const computed=await fitSpatialCalibration(value.input);
  if(computed.inputSha256!==value.inputSha256||computed.sourceHashes.a!==value.sourceHashes?.a||computed.sourceHashes.b!==value.sourceHashes?.b||computed.spatialQualified!==value.spatialQualified||
    computed.bToA.rotationRowMajor.some((n,i)=>Math.abs(n-value.bToA.rotationRowMajor[i])>1e-7)||distance(computed.bToA.translationMeters,value.bToA.translationMeters)>1e-7)throw new Error('Calibration integrity/derived transform mismatch');
  return computed; // All residuals and qualification are recomputed, never trusted from the file.
}

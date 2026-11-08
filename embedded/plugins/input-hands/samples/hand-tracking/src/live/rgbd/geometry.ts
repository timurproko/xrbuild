import type { Point } from '../contracts.ts';
import type { Calibration, Intrinsics } from './protocol.ts';
export interface Pixel { readonly x:number; readonly y:number }
export interface CameraGeometry { readonly intrinsics:Intrinsics; readonly rotation:readonly number[]; readonly translation:readonly number[] }
function check(v:unknown,message:string):asserts v {if(!v)throw new Error(message);}
/** Only explicitly qualified rectilinear, zero-coefficient optics. Never ignore nonzero distortion. */
function qualified(i:Intrinsics):void {
  check(['None','Inverse Brown Conrady','Brown Conrady'].includes(i.distortion),'Unsupported distortion model');
  check(Number.isInteger(i.width)&&i.width>=160&&i.width<=1280&&Number.isInteger(i.height)&&i.height>=120&&i.height<=720&&[i.fx,i.fy,i.cx,i.cy,...i.coefficients].every(Number.isFinite)&&i.fx>0&&i.fy>0&&i.coefficients.length===5,'Invalid intrinsics');
  check(i.coefficients.every(c=>c===0),'Nonzero distortion is not qualified; no metric points generated');
}
export function prepareGeometry(c:Calibration):CameraGeometry {
  check(c.geometry?.version===1&&c.geometry.alignedPixelFrame==='color-optical'&&c.geometry.alignedValue==='original-depth-optical-z','Bridge lacks qualified geometry metadata; stop/rebuild/restart the bridge');
  qualified(c.colorIntrinsics);qualified(c.alignedDepthIntrinsics);
  check(['fx','fy','cx','cy','width','height'].every(k=>Math.abs(c.colorIntrinsics[k as keyof Intrinsics] as number-(c.alignedDepthIntrinsics[k as keyof Intrinsics] as number))<1e-5)&&c.colorIntrinsics.distortion===c.alignedDepthIntrinsics.distortion,'Aligned/color calibration mismatch');
  check(Number.isFinite(c.depthScaleMeters)&&c.depthScaleMeters>0&&c.depthScaleMeters<=0.1,'Invalid depth scale');
  const r=c.depthToColor.rotationColumnMajor,t=c.depthToColor.translationMeters;
  check(r.length===9&&t.length===3&&[...r,...t].every(Number.isFinite),'Invalid extrinsics');
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)check(Math.abs(r[a*3]*r[b*3]+r[a*3+1]*r[b*3+1]+r[a*3+2]*r[b*3+2]-(a===b?1:0))<1e-3,'Extrinsic rotation is not orthonormal');
  const det=r[0]*(r[4]*r[8]-r[7]*r[5])-r[3]*(r[1]*r[8]-r[7]*r[2])+r[6]*(r[1]*r[5]-r[4]*r[2]);check(Math.abs(det-1)<1e-3,'Extrinsic rotation is not proper');
  return Object.freeze({intrinsics:Object.freeze({...c.colorIntrinsics,coefficients:[...c.colorIntrinsics.coefficients]}),rotation:Object.freeze([...r]),translation:Object.freeze([...t])});
}
export function imagePixel(p:Point,width=640,height=480):Pixel|null {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=1||p.y>=1)return null;
  return Object.freeze({x:p.x*width,y:p.y*height});
}
/**
 * SDK align retains depth-camera Z16, NOT color-camera Z. Along the color ray r,
 * p_depth = R^T (lambda*r - t). Solve its Z component for lambda before deprojection.
 * No inferred hand center, guessed transform, or model z enters this calculation.
 */
export function alignedPoint(g:CameraGeometry,pixel:Pixel,depthCameraZ:number):Point|null {
  if(![pixel.x,pixel.y,depthCameraZ].every(Number.isFinite)||pixel.x<0||pixel.x>=g.intrinsics.width||pixel.y<0||pixel.y>=g.intrinsics.height||depthCameraZ<=0)return null;
  const i=g.intrinsics,r=g.rotation,t=g.translation,x=(pixel.x-i.cx)/i.fx,y=(pixel.y-i.cy)/i.fy;
  const denominator=r[6]*x+r[7]*y+r[8];if(denominator<=1e-8)return null;
  const z=(depthCameraZ+r[6]*t[0]+r[7]*t[1]+r[8]*t[2])/denominator;
  const point={x:x*z,y:y*z,z};
  return z>0&&[point.x,point.y,point.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)?Object.freeze(point):null;
}
export function projectPoint(g:CameraGeometry,p:Point):Pixel|null {
  if(![p.x,p.y,p.z].every(Number.isFinite)||p.z<=0)return null;
  return {x:p.x/p.z*g.intrinsics.fx+g.intrinsics.cx,y:p.y/p.z*g.intrinsics.fy+g.intrinsics.cy};
}
/** Optical x-right/y-down/z-forward to Three.js VIEW basis only; no translation/calibration. */
export function metricViewPoint(p:Point):Point {return {x:p.x,y:-p.y,z:-p.z};}

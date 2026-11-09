import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';
import{prepareGeometry,alignedPoint,projectPoint,imagePixel,metricViewPoint}from'../src/live/rgbd/geometry.ts';import{metricCalibration}from'./reconstruction-helpers.ts';
test('pinhole axes/units and projection round trip preserve camera coordinates without view translation',()=>{
 const g=prepareGeometry(metricCalibration());for(const pixel of[{x:0,y:0},{x:320,y:240},{x:639,y:479},{x:91.25,y:77.5}])for(const z of[0.25,0.5,1,2.5]){const p=alignedPoint(g,pixel,z)!;assert.ok(p);assert.ok(Math.hypot(projectPoint(g,p)!.x-pixel.x,projectPoint(g,p)!.y-pixel.y)<1e-10);assert.equal(p.z,z);}
 const center=alignedPoint(g,{x:320,y:240},1)!;assert.deepEqual(center,{x:0,y:0,z:1});assert.ok(alignedPoint(g,{x:0,y:0},1)!.x<0);assert.ok(alignedPoint(g,{x:0,y:0},1)!.y<0);assert.deepEqual(metricViewPoint({x:1,y:2,z:3}),{x:1,y:-2,z:-3});
});
test('aligned source Z is corrected to color-camera Z, never blindly relabeled',()=>{
 const c=metricCalibration();c.depthToColor.translationMeters=[0.015,0.001,0.006];const g=prepareGeometry(c);assert.equal(alignedPoint(g,{x:320,y:240},1)!.z,1.006);
 const angle=0.13;c.depthToColor.rotationColumnMajor=[Math.cos(angle),0,-Math.sin(angle),0,1,0,Math.sin(angle),0,Math.cos(angle)];const tilted=prepareGeometry(c),p=alignedPoint(tilted,{x:600,y:100},1)!;
 const r=c.depthToColor.rotationColumnMajor,t=c.depthToColor.translationMeters;assert.ok(Math.abs(r[6]*(p.x-t[0])+r[7]*(p.y-t[1])+r[8]*(p.z-t[2])-1)<1e-12);assert.ok(Math.abs(p.z-1)>0.01);
});
test('unknown/nonzero optics, missing semantics and malformed calibration never produce fake metric points',()=>{
 for(const change of[(c:any)=>delete c.geometry,(c:any)=>c.colorIntrinsics.coefficients[0]=0.01,(c:any)=>c.colorIntrinsics.distortion='F-Theta',(c:any)=>c.depthToColor.rotationColumnMajor.fill(0),(c:any)=>c.alignedDepthIntrinsics.fx+=1,(c:any)=>c.depthToColor.rotationColumnMajor=[-1,0,0,0,1,0,0,0,1]]){const c=metricCalibration();change(c);assert.throws(()=>prepareGeometry(c));}
 const g=prepareGeometry(metricCalibration());for(const p of[{x:-1,y:240},{x:640,y:240},{x:320,y:NaN}])assert.equal(alignedPoint(g,p,1),null);assert.equal(alignedPoint(g,{x:1,y:1},0),null);assert.equal(projectPoint(g,{x:1,y:1,z:0}),null);
 assert.equal(imagePixel({x:1,y:0.5,z:0}),null);assert.equal(imagePixel({x:-0.01,y:0.5,z:0}),null);assert.deepEqual(imagePixel({x:0.5,y:0.5,z:999}),{x:320,y:240});
});
const executable=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bridge/build/Release/hand-tracking-rgbd.exe');
test('TypeScript camera reconstruction matches independent native SDK deprojection/transform/project vectors',{skip:!fs.existsSync(executable)},()=>{
 const reference=JSON.parse(execFileSync(executable,['--geometry-vectors'],{encoding:'utf8',windowsHide:true}));let compared=0,maxMeters=0,maxPixels=0;
 for(const item of reference.cases){const c=metricCalibration();c.colorIntrinsics=reference.intrinsics;c.alignedDepthIntrinsics=structuredClone(reference.intrinsics);c.depthToColor={rotationColumnMajor:item.rotationColumnMajor,translationMeters:item.translationMeters};const g=prepareGeometry(c);
 for(const v of item.vectors){const p=alignedPoint(g,{x:v.pixel[0],y:v.pixel[1]},v.depthCameraZ)!;assert.ok(p);const error=Math.hypot(p.x-v.colorPoint[0],p.y-v.colorPoint[1],p.z-v.colorPoint[2]);maxMeters=Math.max(maxMeters,error);const pixel=projectPoint(g,p)!;maxPixels=Math.max(maxPixels,Math.hypot(pixel.x-v.projected[0],pixel.y-v.projected[1]));assert.ok(error<3e-6);assert.ok(Math.hypot(pixel.x-v.projected[0],pixel.y-v.projected[1])<0.001);compared++;}}
 assert.equal(compared,40);assert.ok(maxMeters<3e-6&&maxPixels<0.001);
});

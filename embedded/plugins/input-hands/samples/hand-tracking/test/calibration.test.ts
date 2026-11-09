import test from 'node:test';import assert from 'node:assert/strict';
import { fitRigid,transformPoint,inversePoint,validateRigid,fitSpatialCalibration,exportSpatialCalibration,importSpatialCalibration,assertCurrentSources } from '../src/live/multiview/calibration.ts';
import { inputFixture,knownTransform,sample } from './calibration-helpers.ts';
const near=(a:number,b:number,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);
test('spatial calibration recovers a proper B→A rigid transform with metric/pixel held-out residuals, never enables fusion',async()=>{
 const input=inputFixture(),expected=knownTransform(),r=await fitSpatialCalibration(input);r.bToA.rotationRowMajor.forEach((v,i)=>near(v,expected.rotationRowMajor[i]));
 for(const k of ['x','y','z']as const)near(r.bToA.translationMeters[k],expected.translationMeters[k]);assert.equal(r.fit.samples,6);assert.equal(r.check.samples,3);assert.equal(r.spatialQualified,true);
 near(r.fit.rmsM!,0);near(r.check.reprojectionRmsPx!,0,1e-6);assert.equal(r.fusionEnabled,false);assert.equal(r.temporalAlignment,null);assert.equal(r.physicalValidation,'operator-required');assert.ok(Object.isFrozen(r.bToA.rotationRowMajor));
 for(const p of input.targets){const a=transformPoint(r.bToA,p.b.point),b=inversePoint(r.bToA,a);for(const k of ['x','y','z']as const){near(a[k],p.a.point[k]);near(b[k],p.b.point[k]);}}
});
test('planar static targets are solvable without a power-iteration eigenvalue ambiguity or fitted scale',async()=>{
 const f=inputFixture({rotationRowMajor:[0,-1,0,1,0,0,0,0,1],translationMeters:{x:0.01,y:0.02,z:0.03}});
 const points=[[-0.12,-0.08],[0,-0.08],[0.12,-0.08],[-0.12,0.08],[0,0.08],[0.12,0.08],[-0.06,-0.03],[0.06,-0.03],[0,0.05]].map(([x,y])=>({x,y,z:1}));
 const t={rotationRowMajor:[0,-1,0,1,0,0,0,0,1],translationMeters:{x:0.01,y:0.02,z:0.03}};
 f.targets=points.map((p,i)=>({id:`p${i}`,use:i<6?'fit':'check',a:sample(p,f.sources.a),b:sample(inversePoint(t,p),f.sources.b)}));
 const r=await fitSpatialCalibration(f);assert.equal(r.spatialQualified,true);r.bToA.rotationRowMajor.forEach((n,i)=>near(n,t.rotationRowMajor[i]));near(r.check.rmsM!,0);
});
test('six or more well-spread fit points are mandatory; duplicates/collinear/tiny baselines never become identity fallback',async()=>{
 const f=inputFixture();f.targets=f.targets.slice(0,5);await assert.rejects(fitSpatialCalibration(f),/6/);
 const line=Array.from({length:6},(_,i)=>({x:i*0.03,y:0,z:1}));assert.throws(()=>fitRigid(line,line),/non-collinear/);assert.throws(()=>fitRigid(Array(6).fill(line[0]),Array(6).fill(line[0])),/spread/);
 const bad=inputFixture();bad.targets[1].id=bad.targets[0].id;await assert.rejects(fitSpatialCalibration(bad),/duplicate/);
});
test('improper reflections, shear, nonfinite rotations and excessive translation are rejected',()=>{
 for(const rotation of [[-1,0,0,0,1,0,0,0,1],[1,0.1,0,0,1,0,0,0,1],[NaN,0,0,0,1,0,0,0,1]])assert.throws(()=>validateRigid({rotationRowMajor:rotation,translationMeters:{x:0,y:0,z:0}}));
 assert.throws(()=>validateRigid({...knownTransform(),translationMeters:{x:11,y:0,z:0}}));
});
test('held-out checks do not participate in fitting; bad checks remain unqualified with visible residuals',async()=>{
 const good=await fitSpatialCalibration(inputFixture()),bad=inputFixture();const target=bad.targets[8];target.b=sample({...target.b.point,x:target.b.point.x+0.08},bad.sources.b);
 const r=await fitSpatialCalibration(bad);assert.equal(r.spatialQualified,false);assert.ok(r.reasons.some(s=>s.includes('Held-out')));r.bToA.rotationRowMajor.forEach((n,i)=>near(n,good.bToA.rotationRowMajor[i]));near(r.fit.rmsM!,good.fit.rmsM!);assert.ok(r.check.maximumM!>0.07);
});
test('missing held-out checks or unknown reference uncertainty stay provisional, never fabricated physical acceptance',async()=>{
 const f=inputFixture();f.targets=f.targets.filter(t=>t.use==='fit');f.evidence.referenceUncertaintyM=null;const r=await fitSpatialCalibration(f);
 assert.equal(r.spatialQualified,false);assert.equal(r.check.rmsM,null);assert.ok(r.reasons.some(s=>s.includes('held-out')));assert.ok(r.reasons.some(s=>s.includes('uncertainty')));assert.equal(r.fusionEnabled,false);
});
test('known reference uncertainty above the acceptance budget cannot qualify an otherwise exact fit',async()=>{
 const f=inputFixture();f.evidence.referenceUncertaintyM=0.02;const r=await fitSpatialCalibration(f);assert.equal(r.spatialQualified,false);assert.ok(r.reasons.some(s=>s.includes('uncertainty exceeds')));assert.equal(r.fusionEnabled,false);
});
test('source serial, qualified optics, pixel/XYZ provenance and operator fixed-target confirmation are required',async()=>{
 const same=inputFixture();same.sources.b.serial=same.sources.a.serial;await assert.rejects(fitSpatialCalibration(same),/distinct/);
 const optics=inputFixture();optics.sources.b.colorIntrinsics.coefficients[0]=0.01;await assert.rejects(fitSpatialCalibration(optics));
 const pixel=inputFixture();pixel.targets[0].a.pixel.x+=1;await assert.rejects(fitSpatialCalibration(pixel),/provenance/);
 const behind=inputFixture();behind.targets[0].a.point={x:0,y:0,z:-1};await assert.rejects(fitSpatialCalibration(behind),/measurement/);
 const noAck=inputFixture();noAck.evidence.staticTargetConfirmed=false as true;await assert.rejects(fitSpatialCalibration(noAck),/Confirm/);
 const noDescription=inputFixture();noDescription.evidence.description='';await assert.rejects(fitSpatialCalibration(noDescription),/describe/);
});
test('calibration file round trips through recomputation, binds both serial/profiles, and rejects forged transform/qualification/fusion',async()=>{
 const input=inputFixture(),r=await fitSpatialCalibration(input),file=exportSpatialCalibration(r),parsed=await importSpatialCalibration(file);assert.deepEqual(parsed,r);await assertCurrentSources(parsed,input.sources.a,input.sources.b);
 const changed=structuredClone(input.sources.b);changed.firmware='different';await assert.rejects(assertCurrentSources(parsed,input.sources.a,changed),/changed/);
 const forged=JSON.parse(await file.text());forged.bToA.translationMeters.x+=0.1;await assert.rejects(importSpatialCalibration(new Blob([JSON.stringify(forged)])),/mismatch/);
 forged.bToA=r.bToA;forged.fusionEnabled=true;await assert.rejects(importSpatialCalibration(new Blob([JSON.stringify(forged)])),/spatial-only/);
 await assert.rejects(importSpatialCalibration(new Blob([new Uint8Array(65537)])),/64 KiB/);await assert.rejects(importSpatialCalibration(new Blob(['{broken'])));
});
test('calibration fingerprints and export/import preserve signed-zero SDK metadata',async()=>{
 const f=inputFixture();f.sources.a.depthToColor.translationMeters[1]=-0;const r=await fitSpatialCalibration(f),parsed=await importSpatialCalibration(exportSpatialCalibration(r));
 assert.ok(Object.is(parsed.input.sources.a.depthToColor.translationMeters[1],-0));assert.equal(parsed.inputSha256,r.inputSha256);await assertCurrentSources(parsed,f.sources.a,f.sources.b);
});
test('calibration export contains only target/calibration scalar schema, not arbitrary imported media fields',async()=>{
 const f=inputFixture();Object.assign(f.sources.a,{image:'data:image/png,forged',token:'forged-secret'});Object.assign(f.targets[0].a.point,{pixels:'forged-image'});
 const r=await fitSpatialCalibration(f),text=await exportSpatialCalibration(r).text();assert.ok(!text.includes('data:image'));assert.ok(!text.includes('forged'));assert.ok(!text.includes('token'));assert.ok(!text.includes('pixels'));
});

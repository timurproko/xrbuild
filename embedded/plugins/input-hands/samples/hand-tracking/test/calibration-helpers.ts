import { metricCalibration } from './reconstruction-helpers.ts';
import { prepareGeometry,projectPoint } from '../src/live/rgbd/geometry.ts';
import { inversePoint,FIT_LIMITS,type CalibrationInput,type RigidTransform,type TargetSample } from '../src/live/multiview/calibration.ts';
import type { Point } from '../src/live/contracts.ts';import type { Calibration } from '../src/live/rgbd/protocol.ts';
export const knownTransform=():RigidTransform=>{const angle=0.12,c=Math.cos(angle),s=Math.sin(angle);return {rotationRowMajor:[c,0,s,0,1,0,-s,0,c],translationMeters:{x:0.12,y:0.01,z:-0.02}};};
export function sample(point:Point,calibration:Calibration,frameNumber=1):TargetSample {
 const pixel=projectPoint(prepareGeometry(calibration),point);if(!pixel)throw new Error('Invalid fixture projection');
 return {point,pixel,frameNumber,sourceTimeMs:1000+frameNumber*33,clockDomain:'GENERATED TEST CLOCK',selectedPageMs:100+frameNumber,pageOriginMs:100000};
}
export function inputFixture(transform=knownTransform()):CalibrationInput{
 const a={...metricCalibration(),serial:'fixture-camera-a'},b={...metricCalibration(),serial:'fixture-camera-b'};
 const points:Point[]=[{x:-0.14,y:-0.09,z:1},{x:0.1,y:-0.09,z:1.05},{x:-0.12,y:0.11,z:0.9},{x:0.13,y:0.12,z:1.1},{x:-0.03,y:0.01,z:1.2},{x:0.06,y:-0.04,z:0.85},
 {x:-0.1,y:-0.04,z:1.06},{x:0.09,y:0.08,z:0.95},{x:0.01,y:-0.08,z:1.15}];
 return {sources:{a,b},targets:points.map((p,i)=>({id:`p${i+1}`,use:i<6?'fit':'check',a:sample(p,a,i+1),b:sample(inversePoint(transform,p),b,i+1)})),limits:{...FIT_LIMITS},
 evidence:{staticTargetConfirmed:true,description:'GENERATED UNIT GEOMETRY; NOT PHYSICAL CALIBRATION',referenceUncertaintyM:0.005}};
}

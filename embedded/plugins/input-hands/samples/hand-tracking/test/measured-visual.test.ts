import test from'node:test';import assert from'node:assert/strict';import*as THREE from'three';
import{MeasuredSkeleton}from'../src/live/rgbd/measured-visual.ts';import{Reconstructor}from'../src/live/rgbd/reconstruction.ts';import{model,plane,metricCalibration}from'./reconstruction-helpers.ts';import{disposeScene}from'../src/lifecycle.ts';
test('measured renderer preserves Object3D transforms and uses camera-basis points without layout/hand offsets',()=>{
 const visual=new MeasuredSkeleton(),scene=new THREE.Scene();scene.add(visual);try{assert.ok(visual.quaternion instanceof THREE.Quaternion);const frame=new Reconstructor().frame(model(),plane(),metricCalibration());visual.update(frame);assert.equal(visual.joints.count,21);assert.ok(visual.bones.count>0);
 const matrix=new THREE.Matrix4(),p=new THREE.Vector3();visual.joints.getMatrixAt(0,matrix);p.setFromMatrixPosition(matrix);assert.ok(Math.abs(p.x+0.32)<1e-6);assert.ok(Math.abs(p.y-0.16)<1e-6);assert.equal(p.z,-1);
 }finally{disposeScene(scene);}
});
test('invalid points have no 3D sphere or bridging bone, and an empty frame clears all rendering',()=>{
 const visual=new MeasuredSkeleton(),scene=new THREE.Scene();scene.add(visual);try{const frame=new Reconstructor().frame(model(),plane(1,0),metricCalibration());visual.update(frame);assert.equal(visual.joints.count,0);assert.equal(visual.bones.count,0);assert.equal(visual.visible,false);
 visual.update(new Reconstructor().frame(model(),plane(),metricCalibration()));assert.equal(visual.joints.count,21);visual.update(null);assert.equal(visual.joints.count,0);assert.equal(visual.bones.count,0);
 }finally{disposeScene(scene);}
});
test('surface probe renders independently without inventing a hand or a model-relative origin',()=>{
 const visual=new MeasuredSkeleton(),scene=new THREE.Scene();scene.add(visual);try{visual.update(new Reconstructor().frame(null,plane(),metricCalibration(),undefined,{x:320,y:240}));assert.equal(visual.joints.count,1);assert.equal(visual.bones.count,0);}finally{disposeScene(scene);}
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObservationTracker } from '../src/live/observations.ts';
import { DEFAULT_SETTINGS, validateSettings } from '../src/live/contracts.ts';
import { relativeViewPoint, RelativeSkeleton } from '../src/live/visual.ts';
import { disposeScene } from '../src/lifecycle.ts';
import { raw } from './live-helpers.ts';
const timing={frameReadyPageMs:100,mediaTimeMs:50,inferenceStartWorkerMs:1,inferenceEndWorkerMs:3,workerTimeOriginMs:100000,receivedPageMs:110};

test('raw outputs are independent immutable observations with explicit frames and no invented confidence', () => {
  const result=raw(), tracker=new ObservationTracker(),frame=tracker.frame(result,timing);
  assert.equal(frame.hands[0].imageFrame,'image-normalized');assert.equal(frame.hands[0].relativeFrame,'hand-relative');
  assert.ok(Object.isFrozen(frame.raw.landmarks[0][0]));assert.ok(Object.isFrozen(frame.hands));assert.ok(Object.isFrozen(frame.timing));
  const original=frame.hands[0].image[0].x;(result.landmarks[0][0] as {x:number}).x=0.99;
  assert.equal(frame.hands[0].image[0].x,original);assert.equal(Object.hasOwn(frame.hands[0],'confidence'),false);
  assert.equal(frame.hands[0].handedness?.score,0.9);
});
test('hand association survives provider array reordering; empty observations emit lost immediately', () => {
  const events: {type:string;id:number}[]=[];const tracker=new ObservationTracker(event=>events.push(event));
  const a=raw(0.1),b=raw(0.7);
  const first=tracker.frame({landmarks:[a.landmarks[0],b.landmarks[0]],worldLandmarks:[a.worldLandmarks[0],b.worldLandmarks[0]],handedness:[a.handedness[0],b.handedness[0]]},timing);
  const second=tracker.frame({landmarks:[b.landmarks[0],a.landmarks[0]],worldLandmarks:[b.worldLandmarks[0],a.worldLandmarks[0]],handedness:[b.handedness[0],a.handedness[0]]},timing);
  assert.deepEqual(second.hands.map(hand=>hand.id),first.hands.map(hand=>hand.id).reverse());
  tracker.frame({landmarks:[],worldLandmarks:[],handedness:[]},timing);
  assert.deepEqual(events.map(event=>event.type),['found','found','lost','lost']);
});
test('missing/invalid model-relative joints are not replaced with zeros or camera-metric positions', () => {
  const result=raw();const tracker=new ObservationTracker();
  const frame=tracker.frame({...result,worldLandmarks:[]},timing);assert.equal(frame.hands[0].relative,null);assert.equal(frame.hands[0].image.length,21);
  const invalid=raw();(invalid.landmarks[0][0] as {x:number}).x=NaN;
  assert.equal(tracker.frame(invalid,timing).hands.length,0);
});
test('relative rendering changes only display basis/layout, not raw points', () => {
  const frame=new ObservationTracker().frame(raw(),timing);const point=frame.hands[0].relative![0];
  assert.deepEqual(relativeViewPoint(point,0,1).toArray(),[point.x,-point.y,-point.z+0.06]);
  const visual=new RelativeSkeleton();visual.update(frame.hands);assert.equal(visual.joints.count,21);assert.equal(visual.bones.count,21);
  visual.update([]);assert.equal(visual.visible,false);disposeScene(visual);
});
test('threshold and delegate validation rejects unsupported settings', () => {
  validateSettings({...DEFAULT_SETTINGS});
  for(const value of [-0.1,1.1,NaN,Infinity])assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,presence:value}));
});

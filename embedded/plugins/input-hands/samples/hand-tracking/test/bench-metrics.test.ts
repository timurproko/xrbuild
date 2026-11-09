import test from 'node:test';import assert from 'node:assert/strict';
import { analyze,validateIntervals,validateOptions,METRIC_DEFAULTS,timingStats,type MetricFrame,type Interval } from '../src/live/bench/metrics.ts';
const interval=(start=0,end=4,extra:Partial<Interval>={}):Interval=>({id:`${start}-${end}`,start,end,visibility:'visible',expectedHands:1,stationary:false,note:'GENERATED UNIT INPUT',...extra});
function frames(times=[0,100,200,300,400],tracked=[true,false,false,true,true]):MetricFrame[]{return times.map((timeMs,i)=>({timeMs,hands:tracked[i]?[{id:1,points:Array.from({length:21},(_,j)=>({x:j*0.002,y:0,z:0}))}]:[]}));}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`);
test('bench frame fraction, time availability, losses and interruption duration have explicit different denominators',()=>{
 const r=analyze(frames(),[interval()]);assert.equal(r.visibleFrames,5);assert.equal(r.trackedFrames,3);assert.equal(r.trackedFrameFraction,0.6);assert.equal(r.visibleMs,400);assert.equal(r.trackedMs,200);assert.equal(r.timeWeightedAvailability,0.5);assert.equal(r.losses,1);assert.equal(r.lossesPerMinute,150);
 assert.deepEqual(r.interruptions,[{startMs:100,endMs:300,durationMs:200,rightCensored:false,cause:'recovered'}]);assert.equal(r.longestInterruptionMs,200);assert.equal(r.accuracy,null);
});
test('unknown visibility never becomes a 0% or 100% availability claim',()=>{
 const r=analyze(frames(),[]);assert.equal(r.visibleFrames,0);assert.equal(r.trackedFrameFraction,null);assert.equal(r.timeWeightedAvailability,null);assert.equal(r.lossesPerMinute,null);assert.equal(r.timeline[0].state,'unannotated');assert.deepEqual(r.stationary,[]);
});
test('source gaps cap pose holding and censor losses rather than fabricating track continuity',()=>{
 const r=analyze(frames([0,1000],[true,true]),[interval(0,1)]);assert.equal(r.visibleMs,1000);assert.equal(r.trackedMs,100);assert.equal(r.unknownGapMs,900);assert.equal(r.timeWeightedAvailability,0.1);assert.equal(r.observedAvailability,1);assert.equal(r.losses,0);
 const gap=analyze(frames([0,50,1000,1100],[true,false,false,true]),[interval(0,3)]);assert.equal(gap.losses,1);assert.deepEqual(gap.interruptions,[{startMs:50,endMs:150,durationMs:100,rightCensored:true,cause:'source-gap'}]);
});
test('expected two-hand availability loses the annotated set when one hand is absent, not one made-up physical ID',()=>{
 const f=frames([0,100,200],[true,true,true]);f[0].hands=[...f[0].hands,{...f[0].hands[0],id:2}];f[2].hands=f[0].hands;
 const r=analyze(f,[interval(0,2,{expectedHands:2})]);assert.equal(r.trackedFrames,2);assert.equal(r.losses,1);assert.equal(r.timeWeightedAvailability,0.5);
});
test('reacquisition requires annotated occlusion-to-visible boundary and reports censoring separately from initial acquisition',()=>{
 const f=frames(),r=analyze(f,[interval(0,1,{visibility:'occluded'}),interval(2,4)]);
 assert.equal(r.initialAcquisition.length,0);assert.deepEqual(r.reacquisition,[{annotation:'2-4',latencyMs:100,rightCensored:false}]);
 const never=analyze(frames([0,100,200],[false,false,false]),[interval(0,0,{visibility:'occluded'}),interval(1,2)]);
 assert.deepEqual(never.reacquisition,[{annotation:'1-2',latencyMs:100,rightCensored:true}]);
 const initial=analyze(f,[interval()]);assert.deepEqual(initial.initialAcquisition,[{annotation:'0-4',latencyMs:0,rightCensored:false}]);assert.equal(initial.reacquisition.length,0);
});
test('trailing interruption is right-censored; boundaries and unannotated intervals do not create false transitions',()=>{
 const r=analyze(frames([0,100,200],[true,false,false]),[interval(0,2)]);assert.deepEqual(r.interruptions,[{startMs:100,endMs:200,durationMs:100,rightCensored:true,cause:'interval-end'}]);
 assert.equal(analyze(frames(),[interval(0,0),interval(1,4)]).losses,0);
});
test('stationary RMS uses selected joint, metres, population variance, sample/missing counts and per-track IDs',()=>{
 const f=frames([0,100,200],[true,true,false]);f[0].hands[0].points=Array(21).fill({x:0,y:0,z:0});f[1].hands[0].points=Array(21).fill({x:0.002,y:0,z:0});
 const r=analyze(f,[interval(0,2,{stationary:true})]);assert.equal(r.stationary.length,1);const s=r.stationary[0];assert.equal(s.samples,2);assert.equal(s.missingFrames,1);near(s.sdXM!,0.001);near(s.rmsM!,0.001);
 f[1].hands[0].id=2;const split=analyze(f,[interval(0,2,{stationary:true})]);assert.equal(split.stationary.length,2);assert.ok(split.stationary.every(s=>s.rmsM===null));
});
test('segment variation and threshold events use only actual finite observed endpoints, not invented missing points',()=>{
 const f=frames([0,100],[true,true]);f[0].hands[0].points=[{x:0,y:0,z:0},{x:0.01,y:0,z:0},...Array(19).fill(null)];f[1].hands[0].points=[{x:0,y:0,z:0},{x:0.03,y:0,z:0},...Array(19).fill(null)];
 const r=analyze(f,[interval(0,1)],{...METRIC_DEFAULTS,maxSegmentM:0.02,minValidJoints:2}),s=r.segments.find(s=>s.from===0&&s.to===1)!;
 near(s.meanM!,0.02);near(s.sdM!,0.01);near(s.cv!,0.5);assert.equal(s.overLimitSamples,1);assert.equal(r.segmentConstraintEvents,1);assert.equal(r.impossibleAngleEvents,null);
});
test('annotation bounds, overlap, stationary/visibility contradictions and hard count limits are rejected',()=>{
 for(const v of [[interval(-1,1)],[interval(0,5)],[interval(0,2),interval(2,4)],[interval(0,1,{visibility:'occluded',stationary:true})],[interval(0,1,{expectedHands:0 as 1})],Array(129).fill(interval())])assert.throws(()=>validateIntervals(v,5));
 assert.throws(()=>validateOptions({...METRIC_DEFAULTS,joint:21}));assert.throws(()=>validateOptions({...METRIC_DEFAULTS,maxGapMs:Infinity}));assert.throws(()=>analyze(frames([0,0]),[]));
});
test('single-frame clips have frame denominators but no fabricated elapsed time or jitter',()=>{
 const r=analyze(frames([0],[true]),[interval(0,0,{stationary:true})]);assert.equal(r.trackedFrameFraction,1);assert.equal(r.timeWeightedAvailability,null);assert.equal(r.lossesPerMinute,null);assert.equal(r.stationary[0].rmsM,null);
});
test('timing summaries expose units, sample count, mean, population SD, median/p95 and absent data',()=>{
 assert.deepEqual(timingStats([]),{samples:0,mean:null,sd:null,min:null,max:null,p50:null,p95:null,units:'ms'});const s=timingStats([1,2,3,4,5]);assert.equal(s.samples,5);assert.equal(s.mean,3);assert.equal(s.p50,3);assert.equal(s.p95,4);
});

import test from'node:test';import assert from'node:assert/strict';
import{Reconstructor,DEPTH_DEFAULTS,samplePoint,pairing,validateDepthSettings,ProbeWindow}from'../src/live/rgbd/reconstruction.ts';import{prepareGeometry}from'../src/live/rgbd/geometry.ts';import{plane,model,metricCalibration,patch}from'./reconstruction-helpers.ts';
const pixel={x:128,y:144};
test('flat measured surfaces reconstruct all 21 points while raw normalized/relative observations stay untouched',()=>{
 const tracker=new Reconstructor(),raw=model(),before=JSON.stringify(raw),r=tracker.frame(raw,plane(),metricCalibration());assert.equal(r.hands[0].valid,21);assert.equal(r.hands[0].palmValid,5);assert.equal(r.hands[0].tipsValid,5);assert.equal(r.frame,'color-camera-metric');assert.equal(r.exposureSyncVerified,false);
 assert.ok(r.hands[0].joints.every(j=>j.valid&&j.point?.z===1&&j.provenance==='sdk-aligned-surface'&&j.reprojectionPx!<1e-10));assert.equal(JSON.stringify(raw),before);assert.ok(Object.isFrozen(r.hands[0].joints[0].point));assert.equal('confidence'in r.hands[0].joints[0],false);
});
test('missing center remains absent even with surrounding good depth; no hole filling or zero-position fallback',()=>{
 const c=metricCalibration(),g=prepareGeometry(c),p=plane(1,1000,{patch:d=>d.setUint16((144*640+128)*2,0,true)}),j=samplePoint(p,c,g,pixel);assert.equal(j.valid,false);assert.equal(j.reason,'missing-depth');assert.equal(j.point,null);
 assert.equal(samplePoint(plane(),c,g,{x:-1,y:240}).reason,'off-image');assert.equal(samplePoint(plane(),c,g,{x:640,y:240}).point,null);
});
test('coverage, mixed foreground/background edges, noisy patches and isolated center disagreement are rejected separately',()=>{
 const c=metricCalibration(),g=prepareGeometry(c);
 const sparse=plane(1,0,{patch:d=>d.setUint16((144*640+128)*2,1000,true)});assert.equal(samplePoint(sparse,c,g,pixel).reason,'insufficient-support');
 const edge=plane(1,1000,{patch:d=>patch(d,128,144,2,dx=>dx>0?2000:1000)});assert.equal(samplePoint(edge,c,g,pixel).reason,'depth-edge');
 const noisy=plane(1,1000,{patch:d=>patch(d,128,144,2,(dx,dy)=>990+(dy+2)*5+dx+2)});assert.equal(samplePoint(noisy,c,g,pixel,{...DEPTH_DEFAULTS,maxMadM:0.001}).reason,'depth-noise');
 const spike=plane(1,1000,{patch:d=>d.setUint16((144*640+128)*2,1100,true)});assert.equal(samplePoint(spike,c,g,pixel).reason,'center-disagreement');assert.equal(samplePoint(plane(1,4000),c,g,pixel).reason,'depth-range');
});
test('reported skew, noncomparable clocks and mismatched aligned stamps fail closed without relabeling capture time',()=>{
 const p=plane(),m=structuredClone(p.meta);m.depth.timestampMs+=75;m.alignedDepth.timestampMs=m.depth.timestampMs;assert.equal(pairing(m,50).reason,'pair-skew');m.alignedDepth.number++;assert.equal(pairing(m,50).reason,'aligned-stamp-mismatch');
 const q=plane();q.meta.color.domain=q.meta.depth.domain=q.meta.alignedDepth.domain='Hardware Clock';const r=new Reconstructor().frame(model(),q,metricCalibration());assert.equal(r.hands[0].valid,0);assert.equal(r.hands[0].joints[0].reason,'pair-clock-unverified');assert.equal(r.hands[0].joints[0].point,null);
});
test('legacy bridge remains raw-inspectable but cannot manufacture a missing geometry contract',()=>{
 const c=metricCalibration();delete c.geometry;const r=new Reconstructor().frame(model(),plane(),c);assert.equal(r.hands[0].valid,0);assert.match(r.error!,/geometry metadata/);assert.equal(r.hands[0].joints[0].point,null);
});
test('no coherent palm anchor rejects otherwise sampled fingers; off-image points never clamp to image borders',()=>{
 const raw=structuredClone(model());for(const i of[0,5,9])raw.hands[0].image[i]={x:1.5,y:0.3,z:0};
 const r=new Reconstructor().frame(raw,plane(),metricCalibration());assert.equal(r.hands[0].valid,0);assert.equal(r.hands[0].joints[0].reason,'off-image');assert.equal(r.hands[0].joints[8].reason,'no-palm-anchor');
});
test('background-consistent fingertip patches are rejected against palm depth, not accepted as hand confidence',()=>{
 const p=plane(1,1000,{patch:d=>{for(let y=50;y<90;y++)for(let x=500;x<540;x++)d.setUint16((y*640+x)*2,2000,true);}}),raw=structuredClone(model());raw.hands[0].image[8]={x:520/640,y:70/480,z:0};
 const r=new Reconstructor().frame(raw,p,metricCalibration());assert.equal(r.hands[0].joints[8].reason,'palm-depth-mismatch');assert.equal(r.hands[0].joints[8].point,null);
});
test('long measured bones are rejected, never fitted or forced to match the model',()=>{
 const raw=structuredClone(model());raw.hands[0].image[1]={x:0.9,y:0.3,z:0};const r=new Reconstructor().frame(raw,plane(),metricCalibration());assert.equal(r.hands[0].joints[1].reason,'long-bone');assert.equal(r.hands[0].joints[1].point,null);
});
test('motion outliers are rejected for a bounded history; no smoothing, stale pose hold or permanent lockout',()=>{
 const t=new Reconstructor(),c=metricCalibration(),first=t.frame(model(),plane(1),c);assert.equal(first.hands[0].valid,21);const moved=structuredClone(model());moved.hands[0].image=moved.hands[0].image.map(p=>({...p,x:p.x+0.25}));
 const rejected=t.frame(moved,plane(2),c);assert.equal(rejected.hands[0].valid,0);assert.equal(rejected.hands[0].joints[0].reason,'motion-jump');assert.equal(rejected.hands[0].joints[0].point,null);
 const recovered=t.frame(moved,plane(12),c);assert.equal(recovered.hands[0].valid,21);assert.notDeepEqual(recovered.hands[0].joints[0].point,first.hands[0].joints[0].point);
});
test('empty observations, run/config changes and explicit reset clear motion history',()=>{
 const t=new Reconstructor(),c=metricCalibration();t.frame(model(),plane(1),c);t.frame(null,plane(2),c);assert.equal(t.frame(model(),plane(3),c).hands[0].valid,21);
 const far=structuredClone(model());far.hands[0].image=far.hands[0].image.map(p=>({...p,x:p.x+0.25}));assert.equal(t.frame(far,plane(4,1000,{meta:{runId:'new-run'}}),c).hands[0].valid,21);
 t.reset();assert.equal(t.frame(model(),plane(1),c).hands[0].valid,21);assert.equal(t.frame(far,plane(2),c,{...DEPTH_DEFAULTS,radius:1}).hands[0].valid,21);
});
test('out-of-order processed frames are invalid and probe sampling does not require any model hand',()=>{
 const t=new Reconstructor(),c=metricCalibration();t.frame(model(),plane(2),c);const repeated=t.frame(model(),plane(2),c);assert.equal(repeated.hands[0].joints[0].reason,'frame-order');
 const probe=new Reconstructor().frame(null,plane(),c,DEPTH_DEFAULTS,{x:320,y:240});assert.equal(probe.hands.length,0);assert.deepEqual(probe.probe?.point,{x:0,y:0,z:1});
});
test('invalid setting edits are refused rather than substituting unsafe defaults',()=>{for(const change of[{radius:20},{minCoverage:0},{minDepthM:3,maxDepthM:1},{maxPairSkewMs:Infinity},{historyMs:10000},{maxBoneM:0}])assert.throws(()=>validateDepthSettings({...DEPTH_DEFAULTS,...change}));});
test('stationary probe statistics are bounded, count missing samples and ignore repeated native depth frames',()=>{
 const w=new ProbeWindow();for(let i=0;i<100;i++)w.push('run/pixel',i,i%2?{x:0,y:0,z:1.002}:null);const s=w.snapshot();assert.equal(s.acceptedFrames,60);assert.equal(s.valid,30);assert.equal(s.invalid,30);assert.ok(s.sdZ!<1e-12);
 w.push('run/pixel',99,{x:0,y:0,z:100});assert.equal(w.snapshot().acceptedFrames,60);w.push('new-pixel',1,{x:1,y:2,z:3});assert.equal(w.snapshot().acceptedFrames,1);w.reset();assert.equal(w.snapshot().mean,null);
});

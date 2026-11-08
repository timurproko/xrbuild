import test from'node:test';import assert from'node:assert/strict';import{Preparer,activePreparers}from'../src/live/rgbd/preparer.ts';import{bitmap}from'./live-helpers.ts';
class WorkerPort{onmessage:any=null;onerror:any=null;sent:any[]=[];terminations=0;postMessage(v:any,transfer:any[]){this.sent.push({v,transfer});}terminate(){this.terminations++;}}
const view={space:'aligned' as const,mask:false,near:0.15,far:2,scale:0.001};
test('pixel worker is single-flight and transfers the original binary packet',async()=>{
 const port=new WorkerPort(),before=activePreparers(),preparer=new Preparer(()=>port as unknown as Worker);try{const buffer=new ArrayBuffer(24),pending=preparer.prepare(buffer,view);await assert.rejects(preparer.prepare(new ArrayBuffer(24),view),/busy/);assert.equal(port.sent[0].transfer[0],buffer);
 const color=bitmap(),heatmap=bitmap();port.onmessage({data:{type:'prepared',buffer,color:color.value,heatmap:heatmap.value,valid:1,pixelMs:1,view}});const result=await pending;assert.equal(result.color,color.value);assert.equal(color.state.closes,0,'receiver owns successful bitmap until displayed');result.color.close();result.heatmap.close();}finally{preparer.dispose();}assert.equal(activePreparers(),before);assert.equal(port.terminations,1);
});
test('disposal rejects pending preparation and closes a late result without publishing it',async()=>{
 const port=new WorkerPort(),preparer=new Preparer(()=>port as unknown as Worker),pending=preparer.prepare(new ArrayBuffer(24),view),lateHandler=port.onmessage;preparer.dispose();await assert.rejects(pending,{name:'AbortError'});
 const color=bitmap(),heatmap=bitmap();lateHandler({data:{type:'prepared',color:color.value,heatmap:heatmap.value}});assert.equal(color.state.closes,1);assert.equal(heatmap.state.closes,1);preparer.dispose();assert.equal(port.terminations,1);
});
test('pixel-worker error becomes an explicit rejected result, never a fake depth image',async()=>{
 const port=new WorkerPort(),preparer=new Preparer(()=>port as unknown as Worker);try{const pending=preparer.prepare(new ArrayBuffer(24),view);port.onmessage({data:{type:'error',message:'fixture decode failure'}});await assert.rejects(pending,/fixture decode failure/);}finally{preparer.dispose();}
});

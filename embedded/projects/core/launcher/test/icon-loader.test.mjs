import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {loadIconModel} from '../src/icon-loader.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {componentApp}=await import(pathToFileURL(path.join(process.env.XRB_CORE,'packages/react/test/component-app.fixture.mjs')));
test('model imports deduplicate but objects stay local; failed URLs retry with a bounded revision',async()=>{
 let calls=0,objects=0;const urls=[];
 const importer=async url=>{urls.push(url);if(++calls<2)throw Error('temporary');return {default:()=>({id:++objects})};};
 const [a,b]=await Promise.all([1,2].map(()=>loadIconModel('http://localhost/preview/app/@r-icon/icon.js',2,(o,d)=>({o,d}),importer,async()=>{})));
 assert.equal(calls,2);assert.notEqual(a.o,b.o);assert.equal(a.d,2);assert.equal(new URL(urls[1]).searchParams.get('xrb-icon-retry'),'1');
 let failures=0;assert.equal(await loadIconModel('http://localhost/missing/icon.js',1,o=>o,async()=>{failures++;throw Error();},async()=>{}),null);assert.equal(failures,3);
});
test('mounted cards retain synchronous default geometry and release late authored icons',async()=>{
 let complete;class Loader{setCrossOrigin(){}load(){}}
 const state=await componentApp(root,{href:'http://127.0.0.1:5398/preview/launcher/',dependencies:{three:{...THREE,TextureLoader:Loader},'./icon-loader.js':{loadIconModel:()=>new Promise(resolve=>{complete=resolve;})}},fetch:async()=>Response.json({projects:[
  {id:'default',entryExists:true,manifest:{kind:'app',name:'Default',iconColor:'amber'}},
  {id:'authored',entryExists:true,icon:{model:'/preview/authored/@r-icon/icon.js',authored:true},manifest:{kind:'app',name:'Authored',icon:'icon.png'}},
 ]})});
 try{
  const spheres=[];state.app.scene.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.parent?.name==='xrb-icon')spheres.push(o);});assert.equal(spheres.length,1);assert.equal(spheres[0].material.color.getHexString(),'d58a20');assert.ok(complete);
  await state.exports.dispose();
  const late=new THREE.Group(),geometry=new THREE.BoxGeometry();let disposed=0;geometry.addEventListener('dispose',()=>disposed++);late.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));complete(late);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(disposed,1);assert.equal(late.parent,null);
 }finally{await state.dispose();}
});

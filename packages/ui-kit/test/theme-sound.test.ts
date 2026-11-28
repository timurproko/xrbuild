import './dom-shim.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Interactor} from '@xr-build/sdk';
import * as K from '../src/index.ts';

test('both mesh styles retain feedback scheduling; a held theme swap emits no sound',()=>{
 let clock=1000;let voices:unknown[]=[];
 const Audio=globalThis.AudioContext,now=Object.getOwnPropertyDescriptor(performance,'now');
 const gain=()=>({gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},connect(next:unknown){return next;}});
 class Context {
  state='running';sampleRate=1;destination={};get currentTime(){return clock/1000;}
  createGain(){return gain();}
  createBuffer(){return{getChannelData:()=>new Float32Array(2)};}
  createBufferSource(){return{connect(){},start(){}};}
  createOscillator(){
   const voice:{type?:string;frequency?:number;end?:number}={};
   return{get type(){return voice.type;},set type(value:string|undefined){voice.type=value;},frequency:{setValueAtTime(value:number){voice.frequency=value;},exponentialRampToValueAtTime(){}},connect:(next:unknown)=>next,start(){voices.push(voice);},stop(end:number){voice.end=Number((end-clock/1000).toFixed(6));}};
  }
 }
 Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});globalThis.AudioContext=Context as any;K.setMuted(false);
 const make=[()=>new K.Button({title:'b',shape:'pill',text:'Press'}),()=>new K.Switch('s'),()=>new K.Segmented('s',['A','B'],1),()=>new K.Slider({title:'s',value:.5}),()=>new K.Slider({title:'s',steps:5,value:.5}),()=>new K.Dial('d'),()=>new K.Dialog({title:'d',text:'Body'})];
 const replay=(theme:K.UiKitThemeId)=>make.map(factory=>{
  voices=[];const object=factory(),ix=new Interactor();object.setTheme(theme);object.attach(ix);
  if(object instanceof K.Dialog)object.open('mouse');object.update(1/60);object.updateMatrixWorld(true);
  const frame=()=>{clock+=100;object.update(1/60);object.updateMatrixWorld(true);ix.update([],1);};
  const centre=(object as any).targets[0].centre?.x??0;
  const ray=(x=0)=>new THREE.Ray(new THREE.Vector3(x+centre,0,1),new THREE.Vector3(0,0,-1));
  frame();assert.ok(ix.pointerDown(ray()),`mouse capture for ${object.constructor.name}`);frame();const count=voices.length;object.setTheme(theme==='default'?'accent':'default');assert.equal(voices.length,count);
  ix.pointerMove(ray(.045));frame();ix.pointerUp();frame();if(object instanceof K.Dialog)object.close('mouse');
  const result=structuredClone(voices);object.dispose();return result;
 });
 try{const expected=replay('default'),actual=replay('accent');assert.deepEqual(actual,expected);assert.ok(expected.every(trace=>trace.length>0),`positive scheduled feedback for every sound-producing control: ${JSON.stringify(expected)}`);}
 finally{K.setMuted(true);globalThis.AudioContext=Audio;if(now)Object.defineProperty(performance,'now',now);else delete (performance as any).now;}
});

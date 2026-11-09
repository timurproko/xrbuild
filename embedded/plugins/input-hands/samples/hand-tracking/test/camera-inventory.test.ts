import assert from 'node:assert/strict';
import test from 'node:test';
import {captureCameraItems} from '../src/ui/camera-inventory.ts';
import type {Device} from '../src/live/rgbd/protocol.ts';
const native=(serial:string,name='Depth Camera M100'):Device=>({serial,name,firmware:'',usb:'',supportsBaseline:true,profiles:[]});
test('inventory keeps actual runtime labels and fixture serials, excluding anonymous/default duplicates',()=>{
  const items=captureCameraItems([{deviceId:'default',label:''},{deviceId:'anonymous',label:''},{deviceId:'depth-rgb',label:'Depth Camera M100 RGB'},{deviceId:'webcam-a',label:'Studio Camera'},{deviceId:'webcam-b',label:'USB Camera'}],[native('fixture-a'),native('fixture-b')]);
  assert.deepEqual(items.map(item=>[item.value,item.label]),[['rgbd:fixture-a','Depth Camera M100 · fixture-a'],['rgbd:fixture-b','Depth Camera M100 · fixture-b'],['camera:webcam-a','Studio Camera'],['camera:webcam-b','USB Camera']]);
});
test('a named depth-device RGB endpoint remains available without a native device',()=>{assert.deepEqual(captureCameraItems([{deviceId:'depth-rgb',label:'Depth Camera M100 RGB'}],[]).map(item=>item.value),['camera:depth-rgb']);});
test('browser depth-device endpoints stay hidden while native discovery resolves',()=>{assert.deepEqual(captureCameraItems([{deviceId:'depth-rgb',label:'Depth Camera M100 with RGB Module RGB (abcd:0123)'},{deviceId:'webcam',label:'UVC Camera'}],[],true).map(item=>item.value),['camera:webcam']);});

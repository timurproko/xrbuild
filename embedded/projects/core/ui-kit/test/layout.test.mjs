import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const { componentApp }=await import(pathToFileURL(path.join(process.env.XRB_CORE,'packages/react/test/component-app.fixture.mjs')));
const all=state=>{const controls=[];state.app.scene.updateMatrixWorld(true);state.app.scene.traverse(o=>{if(o.userData.control===o)controls.push(o);});return controls;};

test('public entry exports scene and controls without running the showcase',async()=>{
 const state=await componentApp(root,{entry:'index.ts'});assert.equal(typeof state.exports.UiKitScene,'function');
 for(const name of ['Board','Button','Slider','Switch','Segmented','Dial','Trackball','Dialog','Label','Icon','GlassEdge'])assert.equal(typeof state.exports[name],'function',name);
 assert.equal(state.app,undefined);assert.equal(state.pending.size,0);assert.deepEqual(state.calls,[]);
});
test('component composition retains authored layout, axes, dialog and Interactable policy',async()=>{
 const state=await componentApp(root);try{
 const controls=all(state),find=title=>controls.find(c=>c.title.text===title);
 assert.equal(controls.length,12); // eleven top-level controls plus Dialog's owned Close
 for(const [name,position]of [['Button (pill)',[-0.215,0.105,0]],['Dialog',[-0.075,0.105,0]],['Switch',[0.075,0.105,0]],['Interactable',[0.215,0.105,0]],['Stepped slider',[-0.19,-0.105,0]],['Slider',[0.19,-0.105,0]],['Trackball',[0,-0.01,0.02]],['Button (round)',[-0.215,-0.01,0]],['Dial',[0.215,-0.01,0]]])assert.deepEqual(find(name).getWorldPosition(state.app.camera.position.clone()).toArray(),position,name);
 const mode=controls.find(c=>Array.isArray(c.options));assert.equal(mode.latchSelected,false);assert.equal(mode.title.visible,false);assert.equal(mode.status.visible,false);
 mode.select(2,'hand');assert.equal(find('Trackball').axis,'y');mode.select(2,'hand');assert.equal(find('Trackball').axis,'y');mode.select(0,'mouse');assert.equal(find('Trackball').axis,'free');
 find('Dialog').emit('click',{source:'hand'});assert.equal(find('Glass dialog').isOpen,true);
 find('Interactable').set(false,'hand');assert.equal(find('Slider').enabled,false);assert.equal(find('Glass dialog').enabled,true);assert.equal(find('Interactable').status.text,'Off: other controls ignore input');
 find('Interactable').set(true,'mouse');assert.equal(find('Slider').enabled,true);assert.equal(find('Interactable').status.text,'On');
 state.tick(1000);state.tick(1016);state.tick(1032);assert.ok(state.classes.has('ready'));assert.equal(state.app.camera.near,0.01);assert.equal(state.app.camera.far,5);
 const targets=controls.flatMap(c=>c.targets);await state.exports.dispose();for(const target of targets)assert.equal(state.app.xrb.interaction.has(target),false);
 }finally{await state.dispose();}
});

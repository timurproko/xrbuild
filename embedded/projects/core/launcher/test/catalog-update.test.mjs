import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {componentApp}=await import(pathToFileURL(path.join(process.env.XRB_CORE,'packages/react/test/component-app.fixture.mjs')));
const cards=state=>{const result=[];state.app.scene.traverse(object=>{if(object.userData.launcherCard)result.push(object);});return result;};
export const href='http://127.0.0.1:5398/?xrb-panel=http%3A%2F%2F127.0.0.1%3A5191%2F&xrb-project=bundled%3Alauncher';
test('mounted catalog recovers identical local inventory after failure without a published fallback',async()=>{
 let available=true;const requests=[];
 const state=await componentApp(root,{href,fetch:async input=>{requests.push(String(input));return available?Response.json({projects:[{id:'bundled:launcher',entryExists:true,manifest:{kind:'app',name:'Launcher'}},{id:'custom',entryExists:true,manifest:{kind:'app',name:'Custom'}}]}):new Response('',{status:503});}});
 try{
  assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.projectId),['custom']);
  const original=cards(state)[0];await state.fire(1000);assert.equal(cards(state)[0],original,'unchanged successful polling retains the card and capture');
  available=false;await state.fire(1000);assert.equal(cards(state).length,0);
  const labels=[];state.app.scene.traverse(o=>{if(o.text)labels.push(o.text);});assert.ok(labels.includes('The app library could not be loaded. Reload to try again.'));
  available=true;await state.fire(1000);assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.projectId),['custom']);
  assert.ok(requests.every(url=>url==='http://127.0.0.1:5191/api/projects'));
  await state.exports.dispose();assert.equal(state.pending.size,0);await state.fire(1000);assert.equal(requests.length,4);
 }finally{await state.dispose();}
});

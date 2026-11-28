import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
const require=createRequire(import.meta.url);
import {build} from 'vite';
import configFactory from '../vite.config.js';
const core=process.env.XRB_CORE,scratch=process.env.XRB_TEST_ROOT??path.join(core,'.artifacts');
const {createProject}=await import(pathToFileURL(path.join(core,'packages/control-panel/src/workspace.ts')));
const {componentApp}=await import(pathToFileURL(path.join(core,'packages/react/test/component-app.fixture.mjs')));
async function generated(t){await fs.mkdir(scratch,{recursive:true});const home=await fs.mkdtemp(path.join(scratch,'template-components-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));await createProject(core,home,'fresh-components','Fresh Components','combined');return {home,root:path.join(home,'projects/unsorted/fresh-components')};}
test('new project has pure public exports, exact text/ring animation and owned teardown',async t=>{
 const {root}=await generated(t),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.exports['.'],'./src/index.ts');assert.equal(pkg.dependencies.react,'19.3.1');assert.equal(pkg.dependencies['@react-three/fiber'],'9.8.2');assert.ok((await fs.readFile(path.join(root,'public/font-LICENSE.txt'),'utf8')).length);
 const imported=await componentApp(root,{entry:'index.ts'});assert.equal(imported.app,undefined);assert.equal(typeof imported.exports.AppScene,'function');assert.deepEqual(imported.calls,[]);
 const state=await componentApp(root);try{
  const text=state.app.scene.getObjectByName('app-title'),ring=state.app.scene.getObjectByName('app-ring');assert.ok(text&&ring);
  assert.ok((await fs.readFile(path.join(root,'src/scene.tsx'),'utf8')).includes('"Fresh Components"'));const options=text.geometry.parameters.options;
  const font=new FontLoader().parse(JSON.parse(await fs.readFile(require.resolve('three/examples/fonts/helvetiker_bold.typeface.json'),'utf8')));
  const expected=new TextGeometry('Fresh Components',{...options,font});expected.center();assert.deepEqual(Array.from(text.geometry.attributes.position.array),Array.from(expected.attributes.position.array));expected.dispose();
  for(const [key,value]of Object.entries({size:Math.min(0.85,7/'Fresh Components'.length),depth:0.22,curveSegments:12,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.018,bevelSegments:5}))assert.equal(options[key],value,key);
  assert.equal(text.scale.x,0.7);assert.equal(text.material.metalness,0.35);assert.equal(text.material.roughness,0.22);assert.equal(ring.geometry.parameters.radius,1.35);assert.equal(ring.position.z,-0.8);assert.equal(ring.material.opacity,0.55);
  state.tick(1000);assert.equal(text.rotation.x,Math.sin(0.7)*0.16);assert.equal(text.rotation.y,0.45);assert.equal(text.position.y,Math.sin(1.2)*0.08);assert.equal(ring.rotation.z,-0.08);
  state.app.setProjection('orthographic');state.tick(1016);assert.equal(state.app.camera.isOrthographicCamera,true);state.app.xrb.setStereo(true);state.tick(1032);
  let disposed=0;text.geometry.addEventListener('dispose',()=>disposed++);await state.exports.dispose();await state.exports.dispose();assert.equal(disposed,1);
 }finally{await state.dispose();}
});
test('generated production/icon and import-only consumer builds retain relative assets without bootstrap',async t=>{
 const {root}=await generated(t),config=configFactory();
 // Use the installed consumer toolchain/dedupe root; all scene, HTML, icon and manifest inputs are generated files.
 const tools=path.resolve('..','launcher');const output=path.join(root,'output');
 const installed=createRequire(path.join(tools,'package.json'));
 const dependencies={name:'fixture-installed-dependencies',enforce:'pre',resolveId(id){if(['three','react','react-dom','@react-three/fiber'].some(name=>id===name||id.startsWith(name+'/')))return installed.resolve(id);}};
 await build({configFile:false,root,plugins:[dependencies,...config.plugins],resolve:{...config.resolve,dedupe:[]},define:config.define,logLevel:'silent',build:{target:'es2022',outDir:output,rollupOptions:{input:{main:path.join(root,'index.html'),icon:path.join(root,'src/icon.js')},preserveEntrySignatures:'exports-only',output:{entryFileNames:chunk=>chunk.name==='icon'?'icon.js':'assets/[name]-[hash].js'}}}});
 const icon=await import(pathToFileURL(path.join(output,'icon.js')));assert.equal(icon.default().isObject3D,true);
 const entry=path.join(root,'consumer.ts');await fs.writeFile(entry,`export { AppScene } from ${JSON.stringify(path.join(root,'src/index.ts').replaceAll('\\','/'))};`);
 const library=path.join(root,'library');await build({configFile:false,root:tools,plugins:config.plugins,resolve:config.resolve,define:{...config.define,'process.env.NODE_ENV':'"production"'},logLevel:'silent',build:{target:'es2022',outDir:library,lib:{entry,formats:['es'],fileName:()=> 'component.mjs'}}});
 const exported=await import(pathToFileURL(path.join(library,'component.mjs')));assert.equal(typeof exported.AppScene,'function');assert.deepEqual(Object.keys(exported),['AppScene']);
});

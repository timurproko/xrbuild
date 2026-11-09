import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createPackager,launcherRoute,serveIcon} from '../src/packager.mjs';
import {contextPaths,read} from '../src/ownership.mjs';
import {identityErrors,versionCode} from '../src/identity.mjs';
import {buildApk,twaManifestData} from '../src/mobile-build.mjs';
import {toolchainDescriptor} from '../src/toolchain.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const scratch=process.env.XRB_TEST_ROOT??path.join(process.env.XRB_CORE??process.cwd(),'.artifacts');await fs.mkdir(scratch,{recursive:true});const root=await fs.mkdtemp(path.join(scratch,'headset-'));
 const core=path.join(root,'core'),workspace=path.join(root,'user'),sourceRoot=path.join(core,'embedded/plugins/platform-headset'),config=path.join(workspace,'config/plugins/platform-headset');
 await fs.mkdir(sourceRoot,{recursive:true});await fs.mkdir(config,{recursive:true});
 const context={core,workspace,plugin:{id:'platform-headset',origin:'bundled',sourceRoot},config:{file:path.join(config,'config.json'),values:{toolchainConfigured:false,toolchainFile:'toolchain.json'}}};
 await fs.writeFile(context.config.file,JSON.stringify({unknown:'preserve',...context.config.values}));
 const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);return file;};
 const keyDir=path.join(config,'signing/com.example.app'),secret=Buffer.from(JSON.stringify({alias:'mobile',password:'private-test-password'})),key=Buffer.from('synthetic-key-not-real');
 await write(path.join(keyDir,'secret.json'),secret);await write(path.join(keyDir,'android.keystore'),key);
 const app=path.join(workspace,'input'),out=path.join(workspace,'packages'),icon=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(icon);await write(path.join(app,'index.html'),'<title>test</title>');const iconFile=await write(path.join(workspace,'icon.png'),icon);
 const options={app,out,icon:iconFile,identity:{id:'com.example.app',title:'Test',version:'0.1.0'},launchUrl:'https://example.test/apps/test/',log(){}};
 const fake=async o=>{await fs.mkdir(o.projectDir);const file=path.join(o.projectDir,'signed.apk');await fs.writeFile(file,'synthetic-package');return file;};
 t.after(()=>fs.rm(root,{recursive:true,force:true}));return{root,core,workspace,context,config,keyDir,key,secret,write,options,fake};
}
test('canonical routes require clean HTTPS and do not adopt another site',()=>{
 assert.deepEqual(launcherRoute('https://example.test/apps/test'),{url:'https://example.test/apps/test/',host:'example.test',scopePath:'/apps/test/'});
 for(const url of [undefined,'http://example.test/','https://name:secret@example.test/','https://example.test/?x=1','https://example.test/#x','https://example.test/%2e/'])assert.throws(()=>launcherRoute(url));
});
test('stable identity rejects traversal and ambiguous or overflowing versions',()=>{
 assert.deepEqual(identityErrors({id:'com.example.app',title:'Test',version:'0.1.0'}),[]);assert.equal(versionCode('1.2.3'),10203);
 for(const id of ['../app','App','app','com.example/other'])assert.ok(identityErrors({id,title:'Test'}).some(e=>e.field==='id'));
 for(const version of ['1.2.3.4','1.100.0','999999999.0.0','0.0.0','1.2'])assert.throws(()=>versionCode(version));
});
test('discovery/setup is safe and unconfigured, preserving global environment and user bytes',async t=>{
 const f=await fixture(t),before=JSON.stringify(process.env),config=await fs.readFile(f.context.config.file),p=await createPackager(f.context);
 assert.equal(p.name,'headset');assert.equal(p.target,'webxr');assert.equal(p.label,'Headset');assert.equal((await p.setupStatus()).state,'setup-required');await assert.rejects(p.setup({acceptTerms:true,log(){}}),/unconfigured/);await assert.rejects(p.build(f.options),/unconfigured/);
 assert.equal(JSON.stringify(process.env),before);assert.deepEqual(await fs.readFile(f.context.config.file),config);assert.deepEqual(await fs.readFile(path.join(f.keyDir,'android.keystore')),f.key);
});
test('context/config/source aliases fail closed',async t=>{
 const f=await fixture(t);await assert.rejects(createPackager({...f.context,config:{...f.context.config,file:path.join(f.root,'foreign.json')}}),/context/);
 await assert.rejects(createPackager({...f.context,workspace:f.core}),/context/);
 const p=await createPackager(f.context,{loadToolchain:async()=>({}),buildApk:f.fake});await assert.rejects(p.build({...f.options,out:f.context.plugin.sourceRoot}),/source/);
});
test('synthetic explicit packaging preserves keys, version output and the canonical URL',async t=>{
 const f=await fixture(t),p=await createPackager(f.context,{loadToolchain:async()=>({}),buildApk:f.fake}),result=await p.build(f.options);
 assert.equal(result.sizeBytes,17);assert.equal(await fs.readFile(result.file,'utf8'),'synthetic-package');await assert.rejects(p.build(f.options),/exist/);
 assert.deepEqual(await fs.readFile(path.join(f.keyDir,'android.keystore')),f.key);assert.deepEqual(await fs.readFile(path.join(f.keyDir,'secret.json')),f.secret);
 const generations=await fs.readdir(path.join(f.workspace,'build/headset/com.example.app'));assert.equal(generations.length,2);const states=await Promise.all(generations.map(async g=>JSON.parse(await fs.readFile(path.join(f.workspace,'build/headset/com.example.app',g,'receipt.json'))).state));assert.deepEqual(states.sort(),['complete','failed']);
});
test('missing, malformed, shared or busy signing state is preserved without replacement',async t=>{
 const f=await fixture(t),p=await createPackager(f.context,{loadToolchain:async()=>({}),buildApk:f.fake});
 const file=path.join(f.keyDir,'secret.json');await fs.writeFile(file,'{invalid');await assert.rejects(p.build(f.options),/secret/);assert.equal(await fs.readFile(file,'utf8'),'{invalid');
 await fs.writeFile(file,f.secret);await fs.rename(file,file+'.original');await fs.link(file+'.original',file);await assert.rejects(p.build(f.options),/secret/);await fs.unlink(file);await fs.rename(file+'.original',file);
 await fs.writeFile(path.join(f.keyDir,'operation.lock'),'foreign');await assert.rejects(p.build(f.options),/exist/);assert.equal(await fs.readFile(path.join(f.keyDir,'operation.lock'),'utf8'),'foreign');
});
test('toolchain output escape and secret-bearing failures are refused/redacted',async t=>{
 const f=await fixture(t);let p=await createPackager(f.context,{loadToolchain:async()=>({}),buildApk:async()=>f.options.icon});await assert.rejects(p.build(f.options),/escaped/);
 p=await createPackager(f.context,{loadToolchain:async()=>({}),buildApk:async()=>{throw Error('failure private-test-password');}});await assert.rejects(p.build(f.options),e=>e.message.includes('***')&&!e.message.includes('private-test-password'));
});
test('temporary loopback serves the icon only, not source or user files',async()=>{
 const server=await serveIcon(Buffer.from('icon'));try{assert.equal(await fetch(server.url).then(r=>r.text()),'icon');for(const route of ['../config.json','/%2e%2e/secret.json','/','/icon.png?x=1'])assert.equal((await fetch(new URL(route,server.url))).status,404);}finally{await server.close();}
});
test('reviewed complete toolchain inventories reject changed/additional files and identity overrides',async t=>{
 const f=await fixture(t),runtime=path.join(f.config,'toolchain'),module=Buffer.from('export default {};'),notice=Buffer.from('Synthetic test notice');await f.write(path.join(runtime,'index.mjs'),module);await f.write(path.join(runtime,'LICENSE'),notice);
 const native=await f.write(path.join(f.root,'gradle'),'fake');const d={version:1,reviewed:true,source:{url:'https://example.test/source.tgz',version:'1.0.0',sha256:'a'.repeat(64),license:'Test-only',notice:'LICENSE'},module:'index.mjs',files:[{path:'index.mjs',sha256:hash(module)},{path:'LICENSE',sha256:hash(notice)}],jdkPath:f.root,sdkPath:f.root,gradleCommand:native,manifestOptions:{immersive:true}};
 const file=path.join(f.config,'toolchain.json');await fs.writeFile(file,JSON.stringify(d));f.context.config.values.toolchainConfigured=true;assert.equal((await toolchainDescriptor(f.context)).source.version,'1.0.0');
 await fs.writeFile(path.join(runtime,'index.mjs'),'changed');await assert.rejects(toolchainDescriptor(f.context),/digest/);await fs.writeFile(path.join(runtime,'index.mjs'),module);
 await fs.writeFile(path.join(runtime,'extra'),'unknown');await assert.rejects(toolchainDescriptor(f.context),/Uninventoried/);await fs.unlink(path.join(runtime,'extra'));
 d.manifestOptions.host='foreign.example';await fs.writeFile(file,JSON.stringify(d));await assert.rejects(toolchainDescriptor(f.context),/Unsafe/);assert.equal(JSON.parse(await fs.readFile(file)).manifestOptions.host,'foreign.example');
});
test('the library build uses offline child configuration, no global PATH changes or implicit installation',async t=>{
 const f=await fixture(t),before=process.env.PATH,calls=[];const library={JdkHelper:class{constructor(proc){assert.notEqual(proc.env,process.env);assert.ok(proc.env.PATH.includes('bin'));}},AndroidSdkTools:{async create(){return{checkBuildTools:async()=>true,zipalign:async()=>{},apksigner:async(a,b,c,d,e,out)=>{await fs.writeFile(out,'synthetic');calls.push('signed');}};}},TwaManifest:class{constructor(data){this.data=data;}toJson(){return this.data;}},TwaGenerator:class{async createTwaProject(dir){await f.write(path.join(dir,'app/build/outputs/apk/release/app-release-unsigned.apk'),'unsigned');}}};
 const work=path.join(f.workspace,'mobile');const result=await buildApk({projectDir:work,packageId:'com.example.app',title:'Test',host:'example.test',scopePath:'/apps/test/',iconUrl:'http://127.0.0.1:1/icon.png',version:'0.1.0',versionCode:100,keystore:'existing',alias:'mobile',password:'secret',log(){}},{library,jdkPath:f.root,sdkPath:f.root,paths:{workspace:f.workspace},gradleCommand:'configured',manifestOptions:{}},async(command,dir,env)=>{assert.equal(command,'configured');assert.equal(dir,work);assert.equal(env.GRADLE_USER_HOME,path.join(f.workspace,'build/headset/gradle'));calls.push('offline');});
 assert.equal(await fs.readFile(result,'utf8'),'synthetic');assert.deepEqual(calls,['offline','signed']);assert.equal(process.env.PATH,before);
 const m=twaManifestData({packageId:'com.example.app',host:'example.test',scopePath:'/apps/test/',title:'Test',version:'0.1.0',versionCode:100,keystore:'existing',alias:'mobile',iconUrl:'http://127.0.0.1:1/icon.png'},{immersive:true});assert.equal(m.fullScopeUrl,'https://example.test/apps/test/');assert.equal(m.immersive,true);assert.equal(m.startUrl,'/apps/test/?xrb-xr=enter');
});

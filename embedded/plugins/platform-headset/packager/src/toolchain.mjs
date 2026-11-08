import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {contextPaths,inside,plain,read,relative} from './ownership.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex'),loaded=new Map();
export async function toolchainDescriptor(context){
 const paths=await contextPaths(context);
 if(context.config.values.toolchainConfigured!==true)throw Error('Headset toolchain is unconfigured; explicitly provision and review user toolchain.json first');
 const bytes=await read(path.join(paths.config,relative(context.config.values.toolchainFile))),d=JSON.parse(bytes);
 let url;try{url=new URL(d.source?.url);}catch{throw Error('Headset toolchain requires public source provenance');}
 if(d.version!==1||d.reviewed!==true||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||typeof d.source.version!=='string'||!d.source.version||!d.source.license||!d.source.license.trim()||!/^([a-f0-9]{64})$/.test(d.source.sha256))throw Error('Headset toolchain requires reviewed version/hash/license provenance');
 const root=path.join(paths.config,'toolchain'),module=relative(d.module),notice=relative(d.source.notice);
 if(!Array.isArray(d.files)||!d.files.length||d.files.length>30000)throw Error('Headset toolchain needs a bounded complete file inventory');
 const expected=new Map();for(const f of d.files){const file=relative(f.path);if(expected.has(file)||!/^([a-f0-9]{64})$/.test(f.sha256)||file.split('/').some(p=>['.git','.env'].includes(p)))throw Error('Invalid headset toolchain inventory');expected.set(file,f.sha256);}
 if(!expected.has(module)||!expected.has(notice))throw Error('Toolchain entry and retained license notice must be inventoried');
 const actual=[];async function walk(dir,prefix=''){await plain(dir);for(const e of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+e.name,full=path.join(dir,e.name);await plain(full);if(e.isDirectory())await walk(full,rel+'/');else{if(!expected.has(rel))throw Error('Uninventoried headset toolchain file');actual.push(rel);if(actual.length>30000||digest(await read(full,64*1024*1024))!==expected.get(rel))throw Error('Headset toolchain file digest changed');}}}
 await walk(root);if(actual.length!==expected.size)throw Error('Headset toolchain inventory is incomplete');
 if(!(await read(path.join(root,notice),1024*1024)).length)throw Error('Headset toolchain license notice is empty');
 for(const key of ['jdkPath','sdkPath','gradleCommand'])if(typeof d[key]!=='string'||!path.isAbsolute(d[key])||!inside(path.parse(d[key]).root,d[key]))throw Error('Headset native tools must have explicit absolute paths');
 await plain(d.jdkPath);await plain(d.sdkPath);await plain(d.gradleCommand);
 if(/[&|<>^%!"\r\n]/.test(d.gradleCommand))throw Error('Headset build command contains shell metacharacters');
 if(!d.manifestOptions||Array.isArray(d.manifestOptions)||typeof d.manifestOptions!=='object')throw Error('Explicit headset runtime manifest options are required');
 const reserved=new Set(['__proto__','prototype','constructor','packageId','host','name','launcherName','startUrl','fullScopeUrl','iconUrl','signingKey','appVersion','appVersionCode','generatorApp','features','shortcuts','fingerprints']);
 if(Object.keys(d.manifestOptions).length>32||Object.entries(d.manifestOptions).some(([k,v])=>reserved.has(k)||!/^\w{1,80}$/.test(k)||!['boolean','string','number'].includes(typeof v)||typeof v==='string'&&v.length>256||typeof v==='number'&&!Number.isFinite(v)))throw Error('Unsafe headset manifest option');
 return{...d,root,module:path.join(root,module),fingerprint:digest(bytes),paths};
}
export async function loadToolchain(context){
 const d=await toolchainDescriptor(context),previous=loaded.get(d.module);if(previous&&previous!==d.fingerprint)throw Error('Headset toolchain changed after execution; restart the panel');
 const module=await import(pathToFileURL(d.module).href),library=module.default??module;
 if(!['JdkHelper','AndroidSdkTools','TwaManifest','TwaGenerator','KeyTool'].every(k=>typeof library[k]==='function'||typeof library[k]==='object'))throw Error('Configured headset library has an incompatible build API');
 loaded.set(d.module,d.fingerprint);return{...d,library};
}

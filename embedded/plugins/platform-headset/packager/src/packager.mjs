import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {contextPaths,inside,locked,plain,read,writable} from './ownership.mjs';
import {identityErrors,versionCode} from './identity.mjs';
import {signingDir,signingKey,redacting} from './signing.mjs';
import {loadToolchain,toolchainDescriptor} from './toolchain.mjs';
import {buildApk} from './mobile-build.mjs';
export function launcherRoute(value){
 if(typeof value!=='string'||!value)throw Error('Publish the WebXR app or select a publisher before building its headset package');
 if(/[%\\\s]/.test(value))throw Error('The WebXR launch URL must be a clean HTTPS route');
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname.includes('%'))throw Error('The WebXR launch URL must be a clean HTTPS route');
 if(!u.pathname.endsWith('/'))u.pathname+='/';return{url:u.href,host:u.host,scopePath:u.pathname};
}
export async function serveIcon(icon){
 const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/icon.png'){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'}).end(icon);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return{url:`http://127.0.0.1:${server.address().port}/icon.png`,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();})};
}
export async function createPackager(context,dependencies={}){
 const paths=await contextPaths(context),load=dependencies.loadToolchain??loadToolchain,build=dependencies.buildApk??buildApk;
 return{
  name:'headset',label:'Headset',target:'webxr',
  identityFields:[{key:'id',label:'Package ID',kind:'text',required:true,fixed:true,hidden:true,deriveStyle:'package',prefix:'com.xrbuild.',hint:'Updates require the same package ID and signing key'},{key:'title',label:'Title',kind:'text',required:true},{key:'version',label:'Version',kind:'version',required:true}],
  validate:identityErrors,
  async setupStatus(){try{await toolchainDescriptor(context);return{state:'ready'};}catch{return{state:'setup-required',reason:'Explicitly provision and review the user-owned headset toolchain. Existing signing identity is also required for each app.'};}},
  async setup(o){if(!o.acceptTerms)throw Error('Review the external toolchain licenses before setup');await toolchainDescriptor(context);o.log('Configured headset toolchain verified; no tools or keys installed');},
  async build(o){
   const errors=identityErrors(o.identity);if(errors.length)throw Error(errors.map(e=>e.message).join('; '));
   const launch=launcherRoute(o.launchUrl),toolchain=await load(context),id=o.identity.id,version=o.identity.version??'0.1.0';
   const out=await writable(paths,o.out);await plain(o.app);await read(path.join(o.app,'index.html'),8*1024*1024);
   if(inside(o.app,out)||inside(out,o.app))throw Error('Headset output aliases its app input');
   return locked(path.join(signingDir(paths,id),'operation.lock'),async()=>{
    const key=await signingKey(paths,id),keyBefore=await read(key.keystore,8*1024*1024),secretFile=path.join(signingDir(paths,id),'secret.json'),secretBefore=await read(secretFile);
    return redacting(key.password,async()=>{
     const work=await writable(paths,path.join(paths.work,id,'g-'+randomUUID()));await fs.mkdir(path.dirname(work),{recursive:true});await fs.mkdir(work);
     const receipt=path.join(work,'receipt.json');await fs.writeFile(receipt,JSON.stringify({state:'building',id,version}));
     try{
      const icon=o.icon?await read(o.icon,8*1024*1024):(await import(pathToFileURL(path.join(paths.core,'packages/app-icon/src/icon.ts')).href)).defaultIcon(512,o.iconColor);
      if(icon.length<24||icon.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Headset icon must be PNG');
      const local=await serveIcon(icon);let apk;try{apk=await build({projectDir:path.join(work,'mobile'),packageId:id,title:o.identity.title,host:launch.host,scopePath:launch.scopePath,iconUrl:local.url,version,versionCode:versionCode(version),...key,log:m=>o.log(String(m).split(key.password).join('***'))},toolchain);}finally{await local.close();}
      if(!inside(work,path.resolve(apk)))throw Error('Headset toolchain output escaped its generation');
      const bytes=await read(apk,256*1024*1024);if(!bytes.length)throw Error('Headset toolchain produced an empty package');
      if(!(await read(key.keystore,8*1024*1024)).equals(keyBefore)||!(await read(secretFile)).equals(secretBefore))throw Error('Headset signing identity changed during build');
      await writable(paths,out);await fs.mkdir(out,{recursive:true});const file=path.join(out,`${id}-${version}.apk`);await fs.writeFile(file,bytes,{flag:'wx'});
      await fs.writeFile(receipt,JSON.stringify({state:'complete',id,version,file,sizeBytes:bytes.length}));o.log(`Headset package ready; canonical route: ${launch.url}`);return{file,sizeBytes:bytes.length};
     }catch(e){await fs.writeFile(receipt,JSON.stringify({state:'failed',id,version}));throw e;}
    });
   });
  },
 };
}

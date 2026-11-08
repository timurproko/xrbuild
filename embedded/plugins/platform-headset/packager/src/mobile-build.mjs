import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {redacting} from './signing.mjs';
import {plain,read} from './ownership.mjs';
export function jobLog(log,secret){const scrub=m=>String(m).split(secret).join('***');return{verbose:false,debug(){},info:m=>log(scrub(m)),warn:m=>log('warning: '+scrub(m)),error:m=>log('error: '+scrub(m)),setVerbose(){}};}
export function twaManifestData(o,options={}){return{
 ...options,packageId:o.packageId,host:o.host,name:o.title,launcherName:o.title.slice(0,12).trim(),display:'standalone',themeColor:'#000000',navigationColor:'#000000',backgroundColor:'#000000',enableNotifications:false,
 startUrl:o.scopePath+'?xrb-xr=enter',iconUrl:o.iconUrl,splashScreenFadeOutDuration:300,signingKey:{path:o.keystore,alias:o.alias},appVersion:o.version,appVersionCode:o.versionCode,shortcuts:[],generatorApp:'xr-build',fallbackType:'customtabs',features:{},fullScopeUrl:'https://'+o.host+o.scopePath,orientation:'landscape',fingerprints:[],
};}
async function gradle(command,dir,env,log){
 const args=['assembleRelease','--offline','--no-daemon','--stacktrace'];
 return new Promise((resolve,reject)=>{
  const bat=/\.(bat|cmd)$/i.test(command),p=spawn(bat?'cmd.exe':command,bat?['/d','/s','/c',`"${command}" ${args.join(' ')}`]:args,{cwd:dir,env,windowsHide:true,...(bat?{windowsVerbatimArguments:true}:{})});
  const tail=[];for(const stream of[p.stdout,p.stderr])stream.on('data',bytes=>{const text=String(bytes).slice(-8192);tail.push(text);if(tail.length>10)tail.shift();log(text);});
  p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Headset offline build failed ('+code+'):\n'+tail.join(''))));
 });
}
export async function buildApk(o,toolchain,runGradle=gradle){
 const c=toolchain.library,env={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','ComSpec'])if(process.env[key])env[key]=process.env[key];
 env.PATH=[path.join(toolchain.jdkPath,'bin'),path.join(env.SystemRoot??env.SYSTEMROOT??env.WINDIR??'C:/Windows','System32')].join(path.delimiter);
 env.JAVA_HOME=toolchain.jdkPath;env.ANDROID_HOME=toolchain.sdkPath;env.GRADLE_USER_HOME=path.join(toolchain.paths.workspace,'build','headset','gradle');
 const proc=Object.create(process);Object.defineProperty(proc,'env',{value:env});
 const config={jdkPath:toolchain.jdkPath,androidSdkPath:toolchain.sdkPath},log=jobLog(o.log,o.password);
 return redacting(o.password,async()=>{
  const jdk=new c.JdkHelper(proc,config),sdk=await c.AndroidSdkTools.create(proc,config,jdk,log);
  if(!await sdk.checkBuildTools())throw Error('Required mobile build tools are missing; provision them explicitly (no automatic downloads)');
  await plain(o.projectDir,true);await fs.mkdir(o.projectDir); // exclusive generation, never rm/reset a caller directory
  const manifest=new c.TwaManifest(twaManifestData(o,toolchain.manifestOptions));
  await fs.writeFile(path.join(o.projectDir,'twa-manifest.json'),JSON.stringify(manifest.toJson(),null,2)+'\n',{flag:'wx'});
  await new c.TwaGenerator().createTwaProject(o.projectDir,manifest,log);
  await runGradle(toolchain.gradleCommand,o.projectDir,env,m=>log.info(m));
  const unsigned=path.join(o.projectDir,'app/build/outputs/apk/release/app-release-unsigned.apk'),aligned=path.join(o.projectDir,'app-release-unsigned-aligned.apk'),signed=path.join(o.projectDir,'app-release-signed.apk');
  await read(unsigned,256*1024*1024);await sdk.zipalign(`"${unsigned}"`,`"${aligned}"`);
  await sdk.apksigner(o.keystore,o.password,o.alias,o.password,aligned,signed);await plain(signed);return signed;
 });
}

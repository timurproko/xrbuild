// Explicit setup of reviewed runtime bytes only. Never fetches a model or writes product/sample source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {dependencyPath,userPath,plainPath,sameOrigin,statePaths} from './state-paths.mjs';
const file=fileURLToPath(import.meta.url),root=path.dirname(file);
const digest=b=>createHash('sha256').update(b).digest('hex');
export async function visionManifest(){return JSON.parse(await fs.readFile(path.join(root,'assets/vision-assets.json'),'utf8'));}
async function checked(file,hash,maximum=32*1024*1024){plainPath(file);const stat=await fs.stat(file);if(!stat.isFile()||stat.nlink!==1||stat.size>maximum)throw new Error('Unsafe/oversized vision asset');const bytes=await fs.readFile(file);if(bytes.length!==stat.size||digest(bytes)!==hash)throw new Error('Vision asset checksum mismatch; original data preserved');return bytes;}
export async function prepareAssets(options={}){
  statePaths(options);const manifest=await visionManifest(),packageRoot=path.dirname(createRequire(import.meta.url).resolve(manifest.runtime.package)),pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'));
  if(pkg.version!==manifest.runtime.version||pkg.license!=='Apache-2.0')throw new Error('Installed vision runtime version/license differs from its reviewed descriptor');
  const target=dependencyPath(options,`vision-${manifest.runtime.version}`),receipt=path.join(target,'manifest.json');
  try{await fs.access(receipt);await runtimeAssets(options);return target;}catch(error){if(error.code!=='ENOENT')throw error;}
  // Fresh generations only; invalid/partial existing stores are never overwritten or silently repaired.
  try{await fs.lstat(target);throw new Error('Existing vision asset store is incomplete; review it before setup');}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=dependencyPath(options,`vision-${manifest.runtime.version}-${randomUUID()}.preparing`,true);await fs.mkdir(path.join(temporary,'wasm'),{recursive:true});
  const files={};for(const entry of manifest.wasm){const bytes=await checked(path.join(packageRoot,'wasm',entry.file),entry.sha256);await fs.writeFile(path.join(temporary,'wasm',entry.file),bytes,{flag:'wx'});files['wasm/'+entry.file]=entry.sha256;}
  const license=await fs.readFile(path.join(root,'licenses/mediapipe-LICENSE.txt'));await fs.writeFile(path.join(temporary,'LICENSE.txt'),license,{flag:'wx'});files['LICENSE.txt']=digest(license);
  await fs.writeFile(path.join(temporary,'manifest.json'),JSON.stringify({version:1,runtime:manifest.runtime,files},null,2)+'\n',{flag:'wx'});plainPath(target);await fs.rename(temporary,target);await runtimeAssets(options);return target;
}
export async function runtimeAssets(options={}){
  const manifest=await visionManifest(),target=dependencyPath(options,`vision-${manifest.runtime.version}`);let receipt;
  try{receipt=JSON.parse(await fs.readFile(plainPath(path.join(target,'manifest.json')),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(receipt?.version!==1||JSON.stringify(receipt.runtime)!==JSON.stringify(manifest.runtime))throw new Error('Foreign vision runtime receipt');
  const expected=[...manifest.wasm.map(e=>'wasm/'+e.file),'LICENSE.txt'].sort();if(JSON.stringify(Object.keys(receipt.files||{}).sort())!==JSON.stringify(expected))throw new Error('Unexpected vision runtime inventory');
  const files=new Map();for(const name of expected){const entry=manifest.wasm.find(e=>'wasm/'+e.file===name);files.set(name,await checked(path.join(target,name),entry?.sha256||digest(await fs.readFile(path.join(root,'licenses/mediapipe-LICENSE.txt')))));}return files;
}
export function visionAssetsPlugin(options={}){
  statePaths(options);
  return{name:'hand-tracking-vision-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{const pathname=new URL(req.url||'/','http://127.0.0.1').pathname;if(pathname!=='/__handtracking/assets'&&!pathname.includes('/vendor/vision/'))return next();if(!sameOrigin(req)||req.method!=='GET'){res.writeHead(403).end();return;}
    try{const manifest=await visionManifest(),files=await runtimeAssets(options),model=userPath(options,'configRoot',manifest.model.file);if(pathname==='/__handtracking/assets'){let present=false;try{present=(await fs.stat(model)).isFile();}catch(error){if(error.code!=='ENOENT')throw error;}res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({runtime:!!files,model:present,modelRedistributed:false}));return;}
      const relative=pathname.slice(pathname.lastIndexOf('/vendor/vision/')+'/vendor/vision/'.length);let bytes;
      if(relative===manifest.model.file)bytes=await checked(model,manifest.model.sha256,manifest.model.bytes);
      else bytes=files?.get(relative);if(!bytes){res.writeHead(503,{'Content-Type':'text/plain'}).end('Optional vision assets are not configured. Run explicit asset setup and supply a licensed model in user configuration.');return;}
      res.writeHead(200,{'Content-Type':relative.endsWith('.wasm')?'application/wasm':relative.endsWith('.js')?'application/javascript':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
    }catch{res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'}).end('Optional vision asset verification failed; existing files were preserved.');}});},
    async generateBundle(){const files=await runtimeAssets(options);if(!files)return;for(const [name,source]of files)this.emitFile({type:'asset',fileName:'vendor/vision/'+name,source});}
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===file)console.log(await prepareAssets());

import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {contextPaths,directory,plain,readJson,writeJson,exclusive,within} from './ownership.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,RELEASE=/^[a-z0-9]+-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const instances=new Map(),scopes=new Map();
const stable=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)&&value.split('.').every(v=>Number.isSafeInteger(Number(v)));
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;};
function identity(p){if(!UUID.test(p?.id??'')||!SLUG.test(p?.slug??'')||['assets','archive','root'].includes(p.slug))throw Error('Local publication identity or route is invalid');}
export function inventory(value){
  if(!value||value.version!==1||!Array.isArray(value.publications))throw Error('Local publication inventory is corrupt; preserve it');
  for(const p of value.publications){identity(p);if(!HASH.test(p.digest??'')||!Number.isFinite(p.publishedMs)||p.releaseId!==undefined&&!RELEASE.test(p.releaseId))throw Error('Local publication inventory is corrupt; preserve it');}
  if(new Set(value.publications.map(p=>p.id)).size!==value.publications.length||new Set(value.publications.map(p=>p.slug)).size!==value.publications.length)throw Error('Local inventory has duplicate owners or routes');
  return value;
}
export function catalog(value,id){
  if(!value||value.version!==1||value.publicationId!==id||!Array.isArray(value.releases)||!('requested' in value))throw Error('Local release catalog is corrupt; preserve it');
  for(const r of value.releases)if(!RELEASE.test(r.releaseId??'')||r.version!==null&&!stable(r.version)||!HASH.test(r.digest??'')||!Number.isFinite(r.createdMs))throw Error('Local release catalog is corrupt; preserve it');
  const ids=value.releases.map(r=>r.releaseId),versions=value.releases.filter(r=>r.version!==null).map(r=>r.version);
  if(new Set(ids).size!==ids.length||new Set(versions).size!==versions.length||value.requested!==null&&(!ids.includes(value.requested?.releaseId)||!Number.isFinite(value.requested?.at)))throw Error('Local release decisions are corrupt; preserve them');
  return value;
}
const revision=c=>createHash('sha256').update(JSON.stringify([c.releases.map(r=>[r.releaseId,r.version,r.digest]),c.requested])).digest('hex').slice(0,24);
const privateName=name=>/^\.env(?:\.|$)/i.test(name)||['.git','.github','.npmrc','.gitconfig','.xrbuild','.xrb','node_modules','xrb-project.json','package.json','pnpm-lock.yaml'].includes(name.toLowerCase())||/\.(?:pem|key|pfx|p12|jks|keystore|map)$/i.test(name);
export async function tree(root){
  if(!(await plain(root))?.isDirectory())throw Error('Local publication output is missing');
  const files=[];let bytes=0;const hash=createHash('sha256');
  async function walk(dir,prefix=''){for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(privateName(entry.name))throw Error('Local publication output contains private or excluded files');
    const relative=prefix+entry.name,file=path.join(dir,entry.name),stat=await plain(file);
    if(stat.isDirectory())await walk(file,relative+'/');else{if(!stat.isFile())throw Error('Invalid publication file');bytes+=stat.size;if(bytes>500*1024*1024||files.length>=20000)throw Error('Local publication output exceeds limits');files.push(relative);}
  }}
  await walk(root);files.sort();for(const relative of files){hash.update(relative);hash.update('\0');hash.update(await fs.readFile(path.join(root,relative)));hash.update('\0');}
  if(!files.includes('index.html'))throw Error('Local publication output has no index.html');return{files,digest:hash.digest('hex')};
}
export async function copy(source,destination,digest){
  const before=await tree(source);if(before.digest!==digest)throw Error('Local publication bytes changed or are corrupt');
  await directory(path.dirname(destination));await fs.mkdir(destination);
  for(const relative of before.files){const output=path.join(destination,relative);await directory(path.dirname(output));await fs.copyFile(path.join(source,relative),output,1);}
  if((await tree(destination)).digest!==digest||(await tree(source)).digest!==digest)throw Error('Local publication bytes changed while copying');
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};

export async function createPublisher(context,dependencies={}){
  const paths=await contextPaths(context),port=paths.values.localPort;
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Local publisher port must be 1024–65535');
  const root=path.join(paths.stateRoot,'local'),configRoot=paths.configRoot,origin=`https://127.0.0.1:${port}`;
  const key=JSON.stringify([root,paths.source,port,configRoot]);
  if(!Object.keys(dependencies).length&&instances.has(key))return instances.get(key);
  if(scopes.has(root)&&scopes.get(root).key!==key&&scopes.get(root).serving())throw Error('Local publisher configuration changed; restart the panel');
  const site=path.join(root,'site'),releases=path.join(root,'releases'),inventoryFile=path.join(root,'inventory.json'),receipt=path.join(root,'transaction.json');
  const url=slug=>`${origin}/apps/${slug}/`,route=slug=>path.join(site,'apps',slug),snapshot=(id,release)=>path.join(releases,id,release),catalogFile=id=>path.join(releases,id,'catalog.json');
  const getInventory=async()=>inventory(await readJson(inventoryFile,{version:1,publications:[]}));
  const getCatalog=async id=>{if(!UUID.test(id))throw Error('Local publication ID is invalid');return catalog(await readJson(catalogFile(id),{version:1,publicationId:id,releases:[],requested:null}),id);};
  async function healthy(){await plain(root);const state=await readJson(receipt,null);if(state&&(state.version!==1||state.owner!=='publisher:local'||state.state!=='complete'))throw Error('Local publisher transaction is incomplete or failed; preserve state for recovery');}
  async function readable(){await healthy();if(await plain(path.join(root,'operation.lock')))throw Error('Local publisher is busy or has a stale writer lock');}
  let server=null,starting=null;
  async function ensureServer(){
    if(server)return;starting??=(async()=>{
      const input=async name=>{const file=path.join(configRoot,name),stat=await plain(file);if(!stat?.isFile()||stat.size>65536)throw Error('Set up user-owned local publisher certificate and key before publishing');return fs.readFile(file);};
      const [key,cert]=await Promise.all([input('localhost-key.pem'),input('localhost-cert.pem')]);
      if(dependencies.startServer){server=await dependencies.startServer({key,cert,port,handle});return;}
      const candidate=https.createServer({key,cert},handle);
      await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(port,'127.0.0.1',resolve);}).catch(error=>{candidate.close();throw error;});
      candidate.unref();server=candidate;
    })().catch(error=>{starting=null;throw error;});return starting;
  }
  async function handle(req,res){try{
    await readable();const pathname=decodeURIComponent((req.url??'/').split('?')[0]);
    if(pathname==='/.xrb-publications.json'){const data=await getInventory();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({version:1,publications:data.publications.map(p=>({id:p.id,slug:p.slug,publishedMs:p.publishedMs,...cardOf(p.card)}))}));return;}
    if(pathname==='/'){const data=await getInventory();res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><title>Local publications</title><ul>'+data.publications.map(p=>`<li><a href="/apps/${p.slug}/">${p.slug}</a></li>`).join('')+'</ul>');return;}
    const segments=pathname.replace(/^\//,'').split('/');if(segments.some(s=>s==='.'||s==='..'||s.includes('\\')||s.includes(':')||s.includes('\0')))throw Error('Invalid local route');
    let base,relative;
    if(segments[0]==='apps'&&SLUG.test(segments[1]??'')){const data=await getInventory();if(!data.publications.some(p=>p.slug===segments[1]))throw Error('Unknown publication');base=route(segments[1]);relative=segments.slice(2).join('/');}
    else if(segments[0]==='releases'&&UUID.test(segments[1]??'')&&RELEASE.test(segments[2]??'')){const c=await getCatalog(segments[1]);if(!c.releases.some(r=>r.releaseId===segments[2]))throw Error('Unknown release');base=snapshot(segments[1],segments[2]);relative=segments.slice(3).join('/');}else throw Error('Unknown local route');
    let file=path.resolve(base,relative||'index.html');if(!within(base,file))throw Error('Invalid local route');const stat=await plain(file);if(stat?.isDirectory())file=path.join(file,'index.html');
    const leaf=await plain(file);if(!leaf?.isFile())throw Error('Missing local file');res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');}}
  let tail=Promise.resolve();
  function mutate(work){const result=tail.then(()=>exclusive(root,async()=>{await healthy();let begun=false;
    const begin=async()=>{if(!begun){await writeJson(receipt,{version:1,owner:'publisher:local',state:'writing'});begun=true;}};
    try{const result=await work(begin);if(begun)await writeJson(receipt,{version:1,owner:'publisher:local',state:'complete'});return result;}
    catch(error){if(begun)await writeJson(receipt,{version:1,owner:'publisher:local',state:'failed'}).catch(()=>{});throw error;}
  }));tail=result.catch(()=>{});return result;}
  async function prior(data,p){const current=data.publications.find(item=>item.id===p.id);if(data.publications.some(item=>item.slug===p.slug&&item.id!==p.id))throw Error('Local route belongs to another publication');
    const dest=await plain(route(p.slug));if(dest&&current?.slug!==p.slug)throw Error('Local route exists without an ownership record');
    if(current&&(await tree(route(current.slug))).digest!==current.digest)throw Error('Local route changed outside its ownership record');return current;}
  async function place(p,source,digest,current){
    const staged=path.join(root,'staging-'+randomUUID());await copy(source,staged,digest);await directory(path.dirname(route(p.slug)));
    if(current?.slug===p.slug)await fs.rm(route(p.slug),{recursive:true});await fs.rename(staged,route(p.slug));
    if(current&&current.slug!==p.slug)await fs.rm(route(current.slug),{recursive:true});
  }
  const checkRevision=(c,expected)=>{if(expected!==null&&expected!==undefined&&expected!==revision(c))throw Error('Local release history changed; reload before deciding');};
  function cardOf(card){return card&&typeof card.name==='string'&&card.name.trim()&&card.name.length<=120&&typeof card.description==='string'&&card.description.length<=400&&typeof card.icon?.default==='boolean'&&typeof card.icon?.model==='boolean'&&/^[a-z][a-z0-9-]{0,31}$/.test(card.icon.color??'')&&/^[a-z][a-z0-9-]{0,31}$/.test(card.icon.shape??'')?{card:{name:card.name,description:card.description,icon:{default:card.icon.default,model:card.icon.model,color:card.icon.color,shape:card.icon.shape}}}:{};}
  async function deploy(p,r,c,data,current,card,log){
    await place(p,snapshot(p.id,r.releaseId),r.digest,current);const at=Date.now();
    await writeJson(inventoryFile,{version:1,publications:[...data.publications.filter(item=>item.id!==p.id),{id:p.id,slug:p.slug,digest:r.digest,publishedMs:at,releaseId:r.releaseId,version:r.version,...cardOf(card)}]});
    await writeJson(catalogFile(p.id),{...c,requested:{releaseId:r.releaseId,at}});log?.(`Local release ${r.version??'legacy'} published`);return{url:url(p.slug),releaseId:r.releaseId,version:r.version};
  }
  const result={name:'local-test',label:'Localhost',origin,routePrefix:'apps',
    validate(p){try{identity(p);return [];}catch{return[{field:'slug',message:'Local publication requires a valid ID and a non-reserved named route'}];}},
    async status(p){identity(p);try{await readable();const data=await getInventory(),current=data.publications.find(item=>item.id===p.id);if(!current)return{state:'unpublished',selectedUrl:url(p.slug)};
      if((await tree(route(current.slug))).digest!==current.digest)throw Error('Local publication output changed');return{state:server?'published':'pending',selectedUrl:url(p.slug),deployedUrl:url(current.slug),deployedSlug:current.slug,publishedMs:current.publishedMs,...(!server?{error:'Retained locally; publish or activate explicitly to start local serving'}:{})};
    }catch(error){return{state:'unavailable',selectedUrl:url(p.slug),error:error.message};}},
    async publish({app,publication:p,card,log}){identity(p);return mutate(async begin=>{const data=await getInventory(),c=await getCatalog(p.id);if(c.releases.length||c.requested)throw Error('Publication has versioned release history; publish a version');const current=await prior(data,p),source=await tree(app);await ensureServer();await begin();await place(p,app,source.digest,current);
      await writeJson(inventoryFile,{version:1,publications:[...data.publications.filter(item=>item.id!==p.id),{id:p.id,slug:p.slug,digest:source.digest,publishedMs:Date.now(),...cardOf(card)}]});log?.('Local publication updated');return{url:url(p.slug)};});},
    async unpublish({publication:p,log}){identity(p);return mutate(async begin=>{const data=await getInventory(),c=await getCatalog(p.id),current=await prior(data,p);if(!current&&!c.requested)return{};await begin();if(current)await fs.rm(route(current.slug),{recursive:true});await writeJson(inventoryFile,{version:1,publications:data.publications.filter(item=>item.id!==p.id)});await writeJson(catalogFile(p.id),{...c,requested:null});log?.('Local publication withdrawn; releases retained');return{};});},
    releases:{
      async catalog(p){identity(p);await readable();const c=await getCatalog(p.id),data=await getInventory(),current=data.publications.find(item=>item.id===p.id),valid=!!server&&!!current&&(await tree(route(current.slug))).digest===current.digest;
        return{revision:revision(c),releases:c.releases.map(r=>({releaseId:r.releaseId,version:r.version,digest:r.digest,createdMs:r.createdMs,url:`${origin}/releases/${p.id}/${r.releaseId}/`})),requestedReleaseId:c.requested?.releaseId??null,liveReleaseId:valid&&current.releaseId&&c.releases.some(r=>r.releaseId===current.releaseId)?current.releaseId:null,legacyLive:valid&&!current.releaseId};},
      async publish({app,publication:p,version,expectedRevision,card,log}){identity(p);if(!stable(version))throw Error('Publication version must be stable three-part');return mutate(async begin=>{
        let c=await getCatalog(p.id);checkRevision(c,expectedRevision);const data=await getInventory(),current=await prior(data,p),source=await tree(app);let r=c.releases.find(r=>r.version===version);
        if(r&&r.digest!==source.digest)throw Error('Version already retained with different output');const top=c.releases.map(r=>r.version).filter(stable).sort(compare).at(-1);if(!r&&top&&compare(version,top)<=0)throw Error('Version does not exceed highest retained version');
        if(r&&(await tree(snapshot(p.id,r.releaseId))).digest!==r.digest)throw Error('Retained local release is corrupt');await ensureServer();await begin();
        if(current&&!current.releaseId&&!c.releases.some(r=>r.digest===current.digest)){const legacy={releaseId:Date.now().toString(36)+randomUUID().replaceAll('-','').slice(0,8)+'-'+current.digest.slice(0,12),version:null,digest:current.digest,createdMs:current.publishedMs};await copy(route(current.slug),snapshot(p.id,legacy.releaseId),legacy.digest);c={...c,releases:[...c.releases,legacy]};}
        if(!r){r={releaseId:Date.now().toString(36)+randomUUID().replaceAll('-','').slice(0,8)+'-'+source.digest.slice(0,12),version,digest:source.digest,createdMs:Date.now()};await copy(app,snapshot(p.id,r.releaseId),r.digest);c={...c,releases:[...c.releases,r]};}
        return deploy(p,r,c,data,current,card,log);
      });},
      async activate({publication:p,releaseId,expectedRevision,card,log}){identity(p);return mutate(async begin=>{const c=await getCatalog(p.id);checkRevision(c,expectedRevision);const r=c.releases.find(r=>r.releaseId===releaseId);if(!r)throw Error('Release is not retained for this publication');if((await tree(snapshot(p.id,r.releaseId))).digest!==r.digest)throw Error('Retained local release is corrupt');const data=await getInventory(),current=await prior(data,p);await ensureServer();if(current?.releaseId===releaseId&&current.slug===p.slug)return{url:url(p.slug),releaseId,version:r.version};await begin();return deploy(p,r,c,data,current,card,log);});},
      async delete({publication:p,releaseId,expectedRevision,log}){identity(p);return mutate(async begin=>{const c=await getCatalog(p.id);checkRevision(c,expectedRevision);const r=c.releases.find(r=>r.releaseId===releaseId);if(!r)throw Error('Release is not retained');const data=await getInventory();if(data.publications.some(item=>item.id===p.id&&item.releaseId===releaseId)||c.requested?.releaseId===releaseId)throw Error('Release is live or requested; activate another or unpublish');if((await tree(snapshot(p.id,releaseId))).digest!==r.digest)throw Error('Retained local release is corrupt');await begin();await writeJson(catalogFile(p.id),{...c,releases:c.releases.filter(r=>r.releaseId!==releaseId)});await fs.rm(snapshot(p.id,releaseId),{recursive:true});log?.('Retained local release deleted');return{};});},
    },
    async close(){if(starting)await starting;if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));server=null;starting=null;},
  };
  if(!Object.keys(dependencies).length)instances.set(key,result);
  scopes.set(root,{key,serving:()=>!!server});return result;
}

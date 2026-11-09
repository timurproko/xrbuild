// Explicit copy-only import. The legacy store is read-only and never retired by this operation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {contextPaths,plain,readJson,writeJson,exclusive} from './ownership.mjs';
import {tree,copy,inventory,catalog} from './local-service.mjs';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function card(value){if(value===undefined)return{};if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||typeof value.description!=='string'||value.description.length>400||typeof value.icon?.default!=='boolean'||typeof value.icon?.model!=='boolean'||!/^[a-z][a-z0-9-]{0,31}$/.test(value.icon.color??'')||!/^[a-z][a-z0-9-]{0,31}$/.test(value.icon.shape??''))throw Error('Legacy publication card is invalid; preserve it');return{card:{name:value.name,description:value.description,icon:{default:value.icon.default,model:value.icon.model,color:value.icon.color,shape:value.icon.shape}}};}
async function inspect(context){
  const paths=await contextPaths(context),source=path.join(paths.workspace,'.xrb/local-publication'),target=path.join(paths.stateRoot,'local');await plain(source);
  const facts=[],metadata=async file=>{const result=await readJson(file,null);const raw=await fs.readFile(file);facts.push([path.relative(source,file),createHash('sha256').update(raw).digest('hex'),JSON.stringify(result)]);return result;};
  const original=await metadata(path.join(source,'inventory.json'));
  if(!original||!Array.isArray(original.publications)||original.version!==undefined&&original.version!==1)throw Error('Legacy inventory is invalid; preserve it');
  const publications=[],catalogs=[],routes=[],snapshots=[];
  for(const entry of original.publications){
    if(!ID.test(entry?.id??'')||!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(entry?.slug??'')||['assets','archive','root'].includes(entry.slug)||!Number.isFinite(entry.publishedMs))throw Error('Legacy publication identity or route is invalid');const folder=path.join(source,'site/apps',entry.slug??''),content=await tree(folder);facts.push(['route',entry.id,entry.slug,content.digest]);
    publications.push({id:entry.id,slug:entry.slug,publishedMs:entry.publishedMs,digest:content.digest,...(entry.releaseId?{releaseId:entry.releaseId,version:entry.version}:{}),...card(entry.card)});routes.push({folder,slug:entry.slug,digest:content.digest});
  }
  const data=inventory({version:1,publications}),releaseRoot=path.join(source,'releases'),releaseStat=await plain(releaseRoot);
  const ids=new Set(publications.map(p=>p.id));if(releaseStat){if(!releaseStat.isDirectory())throw Error('Legacy release root is invalid');for(const entry of await fs.readdir(releaseRoot,{withFileTypes:true})){if(!ID.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())throw Error('Unclassified legacy release storage requires manual review');ids.add(entry.name);}}
  for(const id of [...ids].sort()){
    const folder=path.join(releaseRoot,id),file=path.join(folder,'catalog.json'),present=await plain(file);let current={releases:[],requested:null};
    if(present)current=await metadata(file);else if(await plain(folder))throw Error('Legacy release folder lacks its catalog; preserve it');
    if(!current||current.version!==undefined&&(current.version!==1||current.publicationId!==id))throw Error('Legacy release catalog belongs to another version or identity');
    const c=catalog({version:1,publicationId:id,releases:current.releases,requested:current.requested},id);
    if(await plain(folder)){const expected=new Set(['catalog.json',...c.releases.map(r=>r.releaseId)]);for(const name of await fs.readdir(folder))if(!expected.has(name))throw Error('Uncatalogued legacy release requires manual review');}
    for(const r of c.releases){const from=path.join(folder,r.releaseId),content=await tree(from);if(content.digest!==r.digest)throw Error('Legacy retained release is corrupt; preserve it');facts.push(['release',id,r.releaseId,content.digest]);snapshots.push({folder:from,id,releaseId:r.releaseId,digest:r.digest});}
    const live=publications.find(p=>p.id===id);if(live?.releaseId){const r=c.releases.find(r=>r.releaseId===live.releaseId);if(!r||r.digest!==live.digest)throw Error('Legacy live route does not match its retained release');}
    catalogs.push(c);
  }
  return{source,target,data,catalogs,routes,snapshots,revision:createHash('sha256').update(JSON.stringify(facts)).digest('hex')};
}
export async function reviewLegacyLocal(context){const plan=await inspect(context);return{revision:plan.revision,publications:plan.data.publications.length,releases:plan.snapshots.length,requiresExplicitConfirmation:true,sourcePreserved:true};}
export async function importLegacyLocal(context,{revision,confirm}={}){
  if(confirm!=='import-reviewed-local-publications'||typeof revision!=='string')throw Error('Explicit reviewed local-publication import confirmation is required');
  const plan=await inspect(context);if(plan.revision!==revision)throw Error('Legacy publications changed; review again');
  return exclusive(plan.target,async()=>{
    if((await fs.readdir(plan.target)).some(name=>name!=='operation.lock'))throw Error('New publisher state already exists; never overwrite it');
    const receipt=path.join(plan.target,'transaction.json');await writeJson(receipt,{version:1,owner:'publisher:local',state:'writing'});
    try{
      for(const route of plan.routes)await copy(route.folder,path.join(plan.target,'site/apps',route.slug),route.digest);
      for(const snapshot of plan.snapshots)await copy(snapshot.folder,path.join(plan.target,'releases',snapshot.id,snapshot.releaseId),snapshot.digest);
      for(const c of plan.catalogs)await writeJson(path.join(plan.target,'releases',c.publicationId,'catalog.json'),c);
      await writeJson(path.join(plan.target,'inventory.json'),plan.data);
      if((await inspect(context)).revision!==revision)throw Error('Legacy publications changed during import; preserve both stores for review');
      await writeJson(receipt,{version:1,owner:'publisher:local',state:'complete'});return{publications:plan.routes.length,releases:plan.snapshots.length,sourcePreserved:true};
    }catch(error){await writeJson(receipt,{version:1,owner:'publisher:local',state:'failed'}).catch(()=>{});throw error;}
  });
}

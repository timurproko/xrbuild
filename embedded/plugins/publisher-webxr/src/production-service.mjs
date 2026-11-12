import path from 'node:path';
import {createHash} from 'node:crypto';
import {createProductionPublisher} from './production.mjs';
import {contextPaths,plain} from './ownership.mjs';
const instances=new Map();
function unavailable(message){
  const reject=async()=>{throw Error(message);};
  // The reserved origin only satisfies the contract shape; configured:false keeps it from being shown as a destination.
  return{name:'production-web',label:'Production',origin:'https://unconfigured.invalid',routePrefix:'apps',configured:false,configurationProblem:message,validate:()=>[{field:'publisher',message}],status:async()=>({state:'unavailable',selectedUrl:'https://unconfigured.invalid/apps/',error:message}),publish:reject,unpublish:reject,releases:{catalog:reject,publish:reject,activate:reject,delete:reject}};
}
export async function createPublisher(context,dependencies={}){
  const paths=await contextPaths(context),v=paths.values;
  if(v.productionConfigured!==true)return unavailable('Configure production in Settings: fill in the HTTPS origin, output repository and branches, turn on "Production configured explicitly" and save.');
  const config={origin:v.productionOrigin,repository:v.productionRepository,branch:v.productionBranch,seedBranch:v.productionSeedBranch,routePrefix:v.productionRoutePrefix,sitePath:v.productionSitePath,verifyTimeoutMs:v.productionTimeoutMs};
  let origin;try{origin=new URL(config.origin);}catch{return unavailable('Configure production in Settings: the HTTPS origin is missing or invalid.');}
  if(origin.pathname!=='/'||origin.search||origin.hash)return unavailable('Configure production in Settings: the HTTPS origin must be a plain origin such as https://apps.example.');
  const storageRoot=path.join(paths.workRoot,'production'),associationsFile=path.join(paths.configRoot,'associations.json');
  const key=createHash('sha256').update(JSON.stringify([paths.workspace,paths.source,context.plugin.key,config])).digest('hex');
  if(!Object.keys(dependencies).length&&instances.has(key))return instances.get(key);
  const raw=createProductionPublisher(config,{...dependencies,storageRoot,associationsFile});
  const checked=async(fn,...args)=>{await plain(storageRoot);await plain(associationsFile);return fn(...args);};
  const result={...raw,status:(...args)=>checked(raw.status,...args),publish:(...args)=>checked(raw.publish,...args),unpublish:(...args)=>checked(raw.unpublish,...args),releases:Object.fromEntries(Object.entries(raw.releases).map(([name,fn])=>[name,(...args)=>checked(fn,...args)]))};
  if(!Object.keys(dependencies).length)instances.set(key,result);return result;
}

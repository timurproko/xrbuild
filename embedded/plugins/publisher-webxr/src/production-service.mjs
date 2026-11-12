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
  // Turning Production on and saving complete fields is the explicit configuration; nothing is assumed from defaults.
  const text=key=>typeof v[key]==='string'?v[key].trim():'';
  const missing=[['productionOrigin','HTTPS origin'],['productionRepository','output repository'],['productionBranch','output branch']].filter(([key])=>!text(key)).map(([,label])=>label);
  if(missing.length)return unavailable(`Configure production in Settings: fill in the ${missing.length>1?`${missing.slice(0,-1).join(', ')} and ${missing.at(-1)}`:missing[0]}, then save.`);
  const config={origin:text('productionOrigin'),repository:text('productionRepository'),branch:text('productionBranch'),seedBranch:text('productionSeedBranch')||text('productionBranch'),routePrefix:v.productionRoutePrefix,sitePath:v.productionSitePath,verifyTimeoutMs:v.productionTimeoutMs};
  let origin;try{origin=new URL(config.origin);}catch{return unavailable('Configure production in Settings: the HTTPS origin is missing or invalid.');}
  if(origin.pathname!=='/'||origin.search||origin.hash)return unavailable('Configure production in Settings: the HTTPS origin must be a plain origin such as https://apps.example.');
  const storageRoot=path.join(paths.workRoot,'production'),associationsFile=path.join(paths.configRoot,'associations.json');
  const key=createHash('sha256').update(JSON.stringify([paths.workspace,paths.source,context.plugin.key,config])).digest('hex');
  if(!Object.keys(dependencies).length&&instances.has(key))return instances.get(key);
  let raw;
  // A malformed value (for example a repository that is not owner/name) is a configuration problem, not a broken plugin.
  try{raw=createProductionPublisher(config,{...dependencies,storageRoot,associationsFile});}catch(error){return unavailable(`Configure production in Settings: ${error.message}.`);}
  const checked=async(fn,...args)=>{await plain(storageRoot);await plain(associationsFile);return fn(...args);};
  const result={...raw,status:(...args)=>checked(raw.status,...args),publish:(...args)=>checked(raw.publish,...args),unpublish:(...args)=>checked(raw.unpublish,...args),releases:Object.fromEntries(Object.entries(raw.releases).map(([name,fn])=>[name,(...args)=>checked(fn,...args)]))};
  if(!Object.keys(dependencies).length)instances.set(key,result);return result;
}

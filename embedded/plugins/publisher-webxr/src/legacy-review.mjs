// Explicit review only: never edits preferences, adopts deployment identity or deletes legacy state.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {plain,readJson} from './ownership.mjs';
export async function reviewLegacy(workspace){
  if(!path.isAbsolute(workspace))throw Error('Select an absolute user workspace');
  const file=path.join(workspace,'xrb-plugins.json');await plain(file);
  const prefs=await readJson(file,{disabled:[],settings:{},panelSettings:{}});
  if(!Array.isArray(prefs.disabled)||!prefs.disabled.every(v=>typeof v==='string')||!prefs.settings||typeof prefs.settings!=='object'||Array.isArray(prefs.settings))throw Error('Legacy preferences are invalid; preserve them');
  if(prefs.origins!==undefined&&(!prefs.origins||typeof prefs.origins!=='object'||Array.isArray(prefs.origins)||Object.values(prefs.origins).some(value=>!['bundled','workspace'].includes(value))))throw Error('Legacy origin preferences are invalid; preserve them');
  const settings=prefs.settings['workspace:publisher-webxr']??prefs.settings['publisher-webxr']??{};
  for(const key of ['localhost','production'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw Error('Legacy publisher setting is invalid; preserve preferences');
  const bytes=await fs.readFile(file).catch(error=>{if(error.code==='ENOENT')return Buffer.alloc(0);throw error;});
  return{revision:createHash('sha256').update(bytes).digest('hex'),requiresExplicitConfirmation:true,
    proposedDisabled:[...new Set([...prefs.disabled,'workspace:publisher-webxr'])],
    proposedOrigins:{...prefs.origins,'publisher-webxr':'bundled'},
    proposedSettings:{localhost:settings.localhost??true,production:settings.production??false},productionConfigured:false,
    preserve:['legacy plugin folders','existing publication history','deployment and association configuration','TLS keys and certificates','unrelated preferences'],
    note:'Do not apply blindly: confirm the current revision and use the core preference writer after public availability. Production requires separate user configuration; no identities are imported.'};
}

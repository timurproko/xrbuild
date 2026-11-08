import path from 'node:path';
import {read} from './ownership.mjs';
export function signingDir(paths,packageId){return path.join(paths.config,'signing',packageId);}
export async function signingKey(paths,packageId){
 const dir=signingDir(paths,packageId),keystore=path.join(dir,'android.keystore');
 // Never generate/adopt a different identity when a key/secret is missing, partial or foreign.
 const bytes=await read(keystore,8*1024*1024);if(!bytes.length)throw Error('Existing headset signing keystore is empty');
 let secret;try{secret=JSON.parse(await read(path.join(dir,'secret.json')));}catch{throw Error('Existing headset signing secret is missing or invalid; preserve/restore the original identity');}
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(secret.alias)||typeof secret.password!=='string'||!secret.password||secret.password.length>256)throw Error('Existing headset signing secret is invalid');
 return{keystore,alias:secret.alias,password:secret.password};
}
export async function redacting(secret,fn){try{return await fn();}catch(e){const scrub=s=>String(s??'').split(secret).join('***');throw Error(scrub(e?.message)+(e?.stderr?'\n'+scrub(e.stderr):''));}}

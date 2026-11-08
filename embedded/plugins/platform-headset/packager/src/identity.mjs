// Stable per-application identity; never derived from the current source/catalog folder.
const ID=/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export function versionCode(version){
 if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Version must have three dotted numeric parts');
 const [a,b,c]=version.split('.').map(Number),value=a*10000+b*100+c;
 if(!Number.isSafeInteger(value)||value<1||value>2147483647||b>99||c>99)throw Error('Version parts must fit the mobile version code (minor/patch below 100)');return value;
}
export function identityErrors(i){const errors=[];if(typeof i?.id!=='string'||i.id.length>200||!ID.test(i.id))errors.push({field:'id',message:'A lowercase dot-separated package ID is required'});if(typeof i?.title!=='string'||!i.title.trim()||i.title.length>120)errors.push({field:'title',message:'A title of 1–120 characters is required'});try{versionCode(i?.version??'0.1.0');}catch(e){errors.push({field:'version',message:e.message});}return errors;}

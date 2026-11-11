import {rebuildHostInPlace, rebuildProgressDialog} from '/rebuild-dialog.js';
import {enhanceHelpText} from '/design-system.js';
const selected = new URLSearchParams(location.search).get('state') ?? 'ready';
const view = selected.startsWith('progress-') ? 'progress' : 'checklist';
const scenario = view === 'progress' ? selected.slice('progress-'.length) : selected;
const steps = [
  {id:'cmake',label:'CMake 3.21+',state:'missing',detail:'Included in the desktop build-tools workload.',action:'toolchain'},
  {id:'compiler',label:'C++ build tools',state:'missing',detail:'Included in the desktop build-tools workload.',action:'toolchain'},
  {id:'sdk',label:'Desktop SDK',state:'missing',detail:'Included in the desktop build-tools workload.',action:'toolchain'},
  {id:'native-deps',label:'Core native libraries',state:'missing',detail:'Pinned native libraries are not installed.',action:'native-deps'},
  {id:'runtime',label:'Host runtime',state:'missing',detail:'Created by Rebuild.',action:null},
];
const tools=steps.slice(0,3),libraries=steps[3],runtime=steps[4];
const jobs=[];let nextId=1,busy=false,revision=1,setupReads=0;
const ready=step=>{step.state='ready';step.detail=step.id==='native-deps'?'Pinned native libraries are ready.':'Installed and checked.';};
const makeJob=(action,state='done')=>({id:nextId++,kind:'desktop-setup',setupAction:action,projectId:null,title:action==='toolchain'?'install desktop build tools':'install core native libraries',state,startedMs:Date.now(),endedMs:state==='running'?null:Date.now(),result:state==='done'?{restartRequired:false}:null,error:null,lines:['[DESIGN SYSTEM — SIMULATED OUTPUT]','No installer, download or build is executed.',action==='toolchain'?'Official installer signature and download hash verified (simulation).':'Pinned native libraries verified (simulation).',state==='running'?'Installing components… (simulation)':'Readiness checks passed (simulation).']});
if(scenario!=='missing'){ready(libraries);jobs.push(makeJob('native-deps'));}
if(['ready','complete','restart'].includes(scenario)){tools.forEach(ready);jobs.push(makeJob('toolchain'));}
if(scenario==='complete')ready(runtime);
if(scenario==='partial')ready(tools[0]);
if(scenario==='failed'){
  const job=makeJob('toolchain','failed');job.error='The simulated installer could not complete. Review its output and retry.';job.lines.push('Synthetic installer exited with code 1.');jobs.push(job);
}
if(scenario==='restart'){
  tools.forEach(step=>{step.state='restart-required';step.action=null;step.detail='Restart Windows, then Refresh.';});
  jobs.at(-1).result={restartRequired:true};jobs.at(-1).lines.push('Restart required. No automatic reboot.');
}
if(scenario==='installing'){busy=true;tools.forEach(step=>{step.state='installing';step.action=null;});}
if(scenario==='blocked'){
  libraries.state='blocked';libraries.action=null;libraries.detail='Dependency state needs review. Existing files were preserved.';
  tools.forEach(step=>{step.state='blocked';step.action=null;step.detail='Cannot inspect the build-tools state. Review access permissions.';});
}
if(scenario==='connection')busy=true;
const status=()=>({revision:String(revision),supported:true,busy,canBuild:!busy&&steps.slice(0,4).every(step=>step.state==='ready'),steps:structuredClone(steps)});
const json=(value,code=200)=>new Response(JSON.stringify(value),{status:code,headers:{'content-type':'application/json'}});
// Never delegate to real fetch. The document CSP independently blocks real API connections.
window.fetch=async(input,options={})=>{
  const route=new URL(input,location.href).pathname,method=options.method??'GET';
  if(method==='GET'&&route==='/api/host/setup'){
    if(setupReads>0)await new Promise(resolve=>setTimeout(resolve,650));
    const data=status();if(setupReads++===0&&view==='checklist')data.canBuild=false;return json(data);
  }
  if(method==='GET'&&route==='/api/jobs'){
    if(scenario==='connection')throw new TypeError('Simulated status connection interruption');
    return json({jobs:structuredClone(jobs)});
  }
  if(method==='POST'&&route==='/api/host/setup'){
    const body=JSON.parse(options.body??'{}');
    if(body.confirm!==true||!['toolchain','native-deps'].includes(body.action)||body.revision!==String(revision))return json({error:'Simulated action refused: refresh.'},409);
    if(busy)return json({error:'A simulated job is active.'},409);
    busy=true;revision++;
    const targets=body.action==='toolchain'?tools:[libraries];targets.forEach(step=>{step.state='installing';});
    const job=makeJob(body.action,'running');jobs.push(job);
    setTimeout(()=>{targets.forEach(ready);busy=false;revision++;job.state='done';job.endedMs=Date.now();job.result={restartRequired:false,status:status()};job.lines.push('Simulated installation complete. Readiness checks passed.');},2500);
    return json(structuredClone(job),202);
  }
  if(method==='POST'&&route==='/api/host/rebuild'){
    const job={id:nextId++,kind:'host-rebuild',title:'rebuild desktop host',state:'running',lines:['[DESIGN SYSTEM — SIMULATED OUTPUT]','Building host… (simulation)'],error:null,result:null};jobs.push(job);
    setTimeout(()=>{ready(runtime);job.state='done';job.lines.push('Host rebuild complete (simulation).');},2500);
    return json(structuredClone(job),202);
  }
  throw new TypeError('Design system safety: no simulated route. No network request was sent.');
};
const onViewJob=job=>progress.show(job);
const progress=rebuildProgressDialog({storage:null,onViewJob});
enhanceHelpText(document);
function showProgress(){
  let job=jobs.at(-1)??makeJob('toolchain','running');
  if(scenario==='installing')job=makeJob('toolchain','running');
  if(scenario==='complete')job={id:42,kind:'host-rebuild',title:'rebuild desktop host',state:'done',lines:['[DESIGN SYSTEM — SIMULATED OUTPUT]','Host runtime built successfully (simulation).'],error:null};
  progress.show(job);
}
async function open(){
  if(view==='progress'){showProgress();document.documentElement.dataset.fixtureReady='true';return;}
  const opening=rebuildHostInPlace(location.origin,{onViewJob});
  for(let i=0;i<100&&!document.querySelector('[data-desktop-setup]')?.open;i++)await new Promise(resolve=>setTimeout(resolve,20));
  if(status().canBuild&&document.querySelector('[data-desktop-refresh]')){
    document.querySelector('[data-desktop-refresh]').click();
    for(let i=0;i<100&&document.querySelector('[data-desktop-refresh]')?.disabled;i++)await new Promise(resolve=>setTimeout(resolve,20));
  }
  document.documentElement.dataset.fixtureReady='true';
  void opening.catch(error=>{const note=document.querySelector('#case-error');note.textContent=error.message;note.hidden=false;});
}
void open();

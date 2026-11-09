const loopback=new Set(['127.0.0.1','localhost']);
export function validPanelOrigin(value){try{const url=new URL(value);return url.protocol==='http:'&&loopback.has(url.hostname)&&url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash?url.origin:null;}catch{return null;}}
export async function readPanelStatus(origin,request=fetch){
  const safe=validPanelOrigin(origin);if(!safe)throw new Error('Invalid local panel origin');
  const get=async path=>{const response=await request(new URL(path,safe),{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error(`Panel status ${response.status}`);return response.json();};
  const[host,panel]=await Promise.all([get('/api/host'),get('/api/panel')]);
  return{host:{exists:!!host.exists,outdated:!!host.outdated},panel:{outdated:!!panel.outdated}};
}
export function panelStatusPlugin(defaultOrigin){
  const fallback=validPanelOrigin(defaultOrigin);if(!fallback)throw new Error('XRB_PANEL_URL must be an HTTP loopback origin with an explicit port');
  return{name:'hand-tracking-panel-status',configureServer(server){server.middlewares.use('/__xrbuild/panel-status',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'GET required'}));}
    const query=new URL(req.url||'/', 'http://127.0.0.1').searchParams,origin=validPanelOrigin(query.get('origin'))||fallback;
    try{res.end(JSON.stringify(await readPanelStatus(origin)));}catch(error){res.statusCode=502;res.end(JSON.stringify({error:error instanceof Error?error.message:'Panel status unavailable'}));}
  });}};
}

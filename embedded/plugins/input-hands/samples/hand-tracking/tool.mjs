// Panel serves the completed, source-bound production build. No dev/HMR server, install or asset setup on navigation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {managedBridgePlugin} from './bridge/managed.mjs';
import {panelStatusPlugin} from './panel-status.mjs';
import {recordingStorePlugin} from './recording-store.mjs';
import {visionAssetsPlugin} from './prepare-assets.mjs';
import {plainPath,statePaths} from './state-paths.mjs';
import {managedPanelDocument} from './panel-document.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.wasm':'application/wasm'};
export async function createWorkspaceTool(context){
  if(context.plugin?.origin==='bundled'&&!context.runtimeRoot)throw new Error('The current Hands browser view requires checked public output. Set up public services explicitly; installed source output is not a fallback.');
  statePaths(context);const dist=plainPath(path.join(root,'dist')),index=plainPath(path.join(dist,'index.html'));
  const ready=await fs.stat(index).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!ready?.isFile())throw new Error('The current Hands browser view is not built. Set up public services explicitly to prepare it; no camera or model is started.');
  const handlers=[],plugins=[managedBridgePlugin({context,httpServer:context.server}),panelStatusPlugin(context.panelOrigin),recordingStorePlugin(context),visionAssetsPlugin(context)];
  const server={httpServer:context.server,config:{server:{https:false}},middlewares:{use(prefix,handler){
    handlers.push(typeof prefix==='string'?(req,res,next)=>{const pathname=new URL(req.url||'/','http://127.0.0.1').pathname;return pathname===prefix||pathname.startsWith(prefix+'/')?handler(req,res,next):next();}:prefix);
  }}};
  for(const plugin of plugins)plugin.configureServer?.(server);
  const html=()=>fs.readFile(index,'utf8').then(source=>managedPanelDocument(source,context.panelOrigin));
  const content=async(req,res,next)=>{
    const url=new URL(req.url||'/','http://127.0.0.1');if(url.pathname===context.route.replace(/\/$/,'')){res.writeHead(302,{Location:context.route+url.search}).end();return;}if(!url.pathname.startsWith(context.route))return next();
    if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405).end();return;}
    const relative=decodeURIComponent(url.pathname.slice(context.route.length))||'index.html';
    if(!/^[a-zA-Z0-9_./-]+$/.test(relative)||relative.split('/').some(part=>!part||part==='..'||part==='.')||path.isAbsolute(relative)){res.writeHead(400).end();return;}
    const file=plainPath(path.join(dist,relative)),stat=await fs.stat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat?.isFile()||stat.nlink!==1||stat.size>16*1024*1024){res.writeHead(404).end();return;}
    const bytes=relative==='index.html'?await html():await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
  };
  return{handle(req,res,next){let index=0;const dispatch=error=>{if(error)return next(error);try{const work=index<handlers.length?handlers[index++](req,res,dispatch):content(req,res,next);if(work?.then)void work.catch(next);}catch(error){next(error);}};dispatch();},async close(){for(const plugin of plugins)await plugin.closeBundle?.();}};
}

import { createBridge } from './server.mjs';
import {assertRuntimeSync} from './runtime.mjs';

export const bootstrapPath='/__handtracking/bridge';
export const bootstrapPathB='/__handtracking/bridge-b';
const loopback=new Set(['127.0.0.1','::ffff:127.0.0.1','::1']);

/** Verify an explicitly built user runtime; never compile or access a device during navigation. */
export function prepareNative(context={}){assertRuntimeSync(context);}

/** One viewer-owned, authenticated service. Pairing credentials live only in server/page memory. */
export function managedBridge({context={},prepare=()=>prepareNative(context),bridgeFactory=createBridge,logger=console,route=bootstrapPath}={}){
  let prepared=false,preparationError='',service=null,pending=null,closed=false,closeWork=null;
  const prepareOnce=()=>{
    if(prepared)return;prepared=true;
    try{prepare();}catch(error){preparationError='The optional Hand Tracking native runtime is unavailable. Configure/build it explicitly in the user workspace; synthetic/browser diagnostics remain available.';logger.error('[hand-tracking] Native runtime validation failed:',error);}
  };
  const connect=async(server)=>{
    if(closed)throw new Error('The Hand Tracking server is shutting down.');
    if(!prepared)throw new Error('Local RGB-D support has not been prepared by the Hand Tracking server.');
    if(preparationError)throw new Error(preparationError);
    if(service)return service;
    if(!pending){
      const address=server.httpServer?.address();
      if(!address||typeof address==='string'||!loopback.has(address.address))throw new Error('The managed Hand Tracking server must listen on loopback only.');
      const scheme=server.config.server.https?'https':'http';
      pending=Promise.resolve().then(()=>bridgeFactory({port:0,maxPeers:4,runtimeOptions:context,origins:[`${scheme}://127.0.0.1:${address.port}`,`${scheme}://localhost:${address.port}`]})).then(async bridge=>{
        if(closed){await bridge.close();throw new Error('The Hand Tracking server is shutting down.');}
        service=bridge;return bridge;
      }).finally(()=>{pending=null;});
    }
    return pending;
  };
  const close=()=>closeWork??= (async()=>{
    closed=true;
    if(pending)await pending.catch(()=>{});
    if(service){await service.close();service=null;}
  })();
  return {prepare:prepareOnce,close,
    middleware(server){return async(req,res,next)=>{
      // Do not permit another website to frame this explicit native-camera consent UI.
      res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");
      res.setHeader('X-Frame-Options','SAMEORIGIN');
      if(req.url!==route){if(req.url?.startsWith(route+'?')){res.writeHead(400);res.end();return;}next();return;}
      res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin');
      const address=server.httpServer?.address(),port=address&&typeof address!=='string'?address.port:0;
      const scheme=server.config.server.https?'https':'http';
      const host=req.headers.host,origin=req.headers.origin;
      const validHost=host===`127.0.0.1:${port}`||host===`localhost:${port}`;
      const validFetch=!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin';
      if(closed||!address||typeof address==='string'||!loopback.has(address.address)||!loopback.has(req.socket.remoteAddress)||!validHost||
        origin!==`${scheme}://${host}`||req.method!=='POST'||req.headers['x-handtracking-local']!=='1'||!validFetch||
        req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0')){
        res.writeHead(403,{'Connection':'close'});res.end();return;
      }
      try{
        prepareOnce();
        const bridge=await connect(server);
        if(res.destroyed||res.writableEnded)return;
        // No CORS, cookies, URL credentials, storage or credential logging. Browser SOP gates this POST.
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({version:1,url:`ws://127.0.0.1:${bridge.port}/bridge`,token:bridge.token}));
      }catch(error){if(!res.destroyed&&!res.writableEnded){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof Error?error.message:'Local RGB-D support is unavailable.'}));}}
    };}
  };
}

/** Integration works for direct Vite launches as well as the package dev script. Build/preview are static only. */
export function managedBridgePlugin({httpServer=null,context={},prepare=()=>prepareNative(context)}={}){
  const managed=managedBridge({context,prepare}),secondary=managedBridge({context,route:bootstrapPathB,prepare});
  return {name:'hand-tracking-managed-bridge',apply:'serve',
    configureServer(server){
      // Verify/start optional native support only on an explicit authenticated bootstrap POST.
      const runtime=httpServer?{httpServer,config:{server:{https:false}}}:server;
      server.middlewares.use(managed.middleware(runtime));server.middlewares.use(secondary.middleware(runtime));
      (httpServer||server.httpServer)?.once('close',()=>{void Promise.all([managed.close(),secondary.close()]);});
    },
    transformIndexHtml(){return [{tag:'meta',attrs:{name:'handtracking-managed-bridge',content:'1'},injectTo:'head'}];},
    async closeBundle(){await Promise.all([managed.close(),secondary.close()]);}
  };
}

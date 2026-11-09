import { endpoint } from './session.ts';
const path='/__handtracking/bridge';
const unavailable='Automatic local service is unavailable. Open this Hand Tracking diagnostic through its local dev server, then retry; there is no browser-camera fallback.';

/** A same-origin, non-simple POST; no credentials in URLs, persistent storage, UI fields or diagnostic snapshots. */
export async function pairLocal(signal:AbortSignal,request:typeof fetch=fetch,route:'/__handtracking/bridge'|'/__handtracking/bridge-b'=path):Promise<{url:string;token:string}>{
  const response=await request(route,{method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',redirect:'error',headers:{'X-HandTracking-Local':'1'},signal});
  if(!response.headers.get('content-type')?.startsWith('application/json')||!response.body)throw new Error(unavailable);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048)throw new Error('Invalid local service reply size.');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('Invalid local service reply.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid local service reply.');
  const data=value as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof data.error==='string'&&data.error.length<=512?data.error:unavailable);
  if(data.version!==1||typeof data.url!=='string'||data.url.length>128||typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))throw new Error('Invalid local service pairing.');
  return {url:endpoint(data.url),token:data.token};
}

/** Source/dispose generations fence even a fetch implementation that resolves after abort. Never starts capture. */
export class AutomaticBridge {
  private generation=0;private controller:AbortController|null=null;
  pending=false;
  private callbacks:{connect(url:string,token:string):void;error(message:string):void};private request:typeof fetch;
  private route:'/__handtracking/bridge'|'/__handtracking/bridge-b';
  constructor(callbacks:AutomaticBridge['callbacks'],request:typeof fetch=fetch,route:'/__handtracking/bridge'|'/__handtracking/bridge-b'=path){this.callbacks=callbacks;this.request=request;this.route=route;}
  cancel():void {++this.generation;this.controller?.abort();this.controller=null;this.pending=false;}
  async connect():Promise<void>{
    this.cancel();const generation=this.generation,controller=new AbortController();this.controller=controller;this.pending=true;let timeout=false;
    const timer=setTimeout(()=>{timeout=true;controller.abort();},10000);
    try{
      const result=await pairLocal(controller.signal,this.request,this.route);
      if(generation!==this.generation)return;
      if(controller.signal.aborted)throw new Error('Local service pairing timed out. Retry local service.');
      this.callbacks.connect(result.url,result.token);
    }catch(error){if(generation===this.generation)this.callbacks.error(timeout?'Local service pairing timed out. Retry local service.':error instanceof Error?error.message:unavailable);}
    finally{clearTimeout(timer);if(generation===this.generation){this.controller=null;this.pending=false;}}
  }
}

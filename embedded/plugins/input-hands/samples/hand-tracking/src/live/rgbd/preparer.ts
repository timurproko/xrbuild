import type { ViewSettings } from './pixels.ts';
export interface Prepared { buffer:ArrayBuffer; color:ImageBitmap; heatmap:ImageBitmap; valid:number; pixelMs:number; view:ViewSettings }
let count=0;export const activePreparers=()=>count;
export class Preparer {
  private worker:Worker;
  private pending:{resolve(value:Prepared):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}|null=null;
  private closed=false;
  constructor(factory=()=>new Worker(new URL('./pixels.worker.ts',import.meta.url),{type:'module'})){
    this.worker=factory();++count;
    this.worker.onmessage=event=>{const data=event.data;
      if(this.closed||!this.pending){data.color?.close();data.heatmap?.close();return;}
      const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
      if(data.type==='prepared')pending.resolve(data as Prepared);else pending.reject(new Error(data.message||'Pixel worker failed'));
    };
    this.worker.onerror=event=>{event.preventDefault();this.reject(new Error(event.message||'Pixel worker failed'));};
  }
  private reject(error:Error):void {if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}}
  prepare(buffer:ArrayBuffer,view:ViewSettings):Promise<Prepared>{
    if(this.closed||this.pending)return Promise.reject(new Error('Pixel worker closed/busy'));
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.reject(new Error('RGB-D preparation timed out')),5000);this.pending={resolve,reject,timer};
      try{this.worker.postMessage({buffer,view},[buffer]);}catch(error){this.reject(error as Error);}
    });
  }
  dispose():void {if(this.closed)return;this.closed=true;this.reject(new DOMException('RGB-D preparation stopped','AbortError'));this.worker.onmessage=this.worker.onerror=null;this.worker.terminate();--count;}
}

import { type Packet, type DepthSpace, requireValue } from './protocol.ts';
export interface ViewSettings { space:DepthSpace; mask:boolean; near:number; far:number; scale:number }
export function validateViewOptions(v:Omit<ViewSettings,'scale'>):void {requireValue(['aligned','native'].includes(v.space)&&typeof v.mask==='boolean'&&[v.near,v.far].every(Number.isFinite)&&v.near>=0&&v.far>v.near&&v.far<=20,'depth view settings');}
export function validateView(v:ViewSettings):void {validateViewOptions(v);requireValue(Number.isFinite(v.scale)&&v.scale>0&&v.scale<=0.1,'depth scale');}
export function rgbPixels(packet:Packet,target:Uint8ClampedArray):void {
  requireValue(target.length===packet.width*packet.height*4,'RGBA dimensions');const source=new Uint8Array(packet.buffer,packet.rgbOffset,packet.rgbBytes);
  for(let pixel=0,src=0,dst=0;pixel<packet.width*packet.height;pixel++,src+=3,dst+=4){target[dst]=source[src];target[dst+1]=source[src+1];target[dst+2]=source[src+2];target[dst+3]=255;}
}
const lut=Array.from({length:256},(_,i)=>{const t=i/255;return [Math.round(255*Math.max(0,1-Math.abs(4*t-3))),Math.round(255*Math.max(0,1-Math.abs(4*t-2))),Math.round(255*Math.max(0,1-Math.abs(4*t-1)))];});
export function depthPixels(packet:Packet,v:ViewSettings,target:Uint8ClampedArray):number {
  validateView(v);requireValue(target.length===packet.width*packet.height*4,'depth RGBA dimensions');const view=new DataView(packet.buffer),offset=v.space==='aligned'?packet.alignedOffset:packet.depthOffset;let valid=0;
  for(let i=0;i<packet.width*packet.height;i++){const raw=view.getUint16(offset+i*2,true),dst=i*4;target[dst+3]=255;
    if(!raw){target[dst]=255;target[dst+1]=0;target[dst+2]=255;continue;}valid++;
    if(v.mask){target[dst]=target[dst+1]=target[dst+2]=24;continue;}
    const distance=raw*v.scale,t=Math.max(0,Math.min(255,Math.round((distance-v.near)/(v.far-v.near)*255))),color=lut[t];target[dst]=color[0];target[dst+1]=color[1];target[dst+2]=color[2];
  }return valid;
}

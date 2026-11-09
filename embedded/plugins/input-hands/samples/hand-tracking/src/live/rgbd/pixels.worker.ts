/// <reference lib="webworker" />
import { framePacket } from './protocol.ts';
import { rgbPixels, depthPixels, type ViewSettings } from './pixels.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
const rgbCanvas=new OffscreenCanvas(640,480),depthCanvas=new OffscreenCanvas(640,480);
const rgb=rgbCanvas.getContext('2d'),depth=depthCanvas.getContext('2d');
let rgbData=new ImageData(640,480),depthData=new ImageData(640,480);
scope.onmessage=event=>{
  let color:ImageBitmap|null=null,heatmap:ImageBitmap|null=null;
  try {
    if(!rgb||!depth)throw new Error('Offscreen 2D canvas unavailable');
    const input=event.data as {buffer:ArrayBuffer;view:ViewSettings},packet=framePacket(input.buffer),start=performance.now();
    if(rgbCanvas.width!==packet.width||rgbCanvas.height!==packet.height){rgbCanvas.width=depthCanvas.width=packet.width;rgbCanvas.height=depthCanvas.height=packet.height;rgbData=new ImageData(packet.width,packet.height);depthData=new ImageData(packet.width,packet.height);}
    rgbPixels(packet,rgbData.data);const valid=depthPixels(packet,input.view,depthData.data);
    rgb.putImageData(rgbData,0,0);depth.putImageData(depthData,0,0);color=rgbCanvas.transferToImageBitmap();heatmap=depthCanvas.transferToImageBitmap();
    scope.postMessage({type:'prepared',buffer:input.buffer,color,heatmap,valid,view:input.view,pixelMs:performance.now()-start},[input.buffer,color,heatmap]);
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{color?.close();heatmap?.close();}
};

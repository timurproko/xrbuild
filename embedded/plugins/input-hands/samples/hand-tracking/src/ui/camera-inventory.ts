import type {Device} from '../live/rgbd/protocol.ts';
export type CaptureCameraItem={value:string;label:string;browserId:string|null;serial:string|null;rgb:boolean;depth:boolean};
type BrowserCamera=Pick<MediaDeviceInfo,'deviceId'|'label'>;
/** Runtime-reported names only; no product-specific device preference or relabelling. */
export function captureCameraItems(browser:readonly BrowserCamera[],native:readonly Device[],nativePending=false):CaptureCameraItem[]{
  const depth:CaptureCameraItem[]=native.map(device=>({value:`rgbd:${device.serial}`,label:`${device.name.trim()||'RGB-D camera'} · ${device.serial}`,browserId:null,serial:device.serial,rgb:false,depth:true}));
  const standard:CaptureCameraItem[]=browser.filter(device=>{const label=device.label.trim();return !!device.deviceId&&device.deviceId!=='default'&&!!label&&(!/\bdepth\s+camera\b.*\brgb\b/i.test(label)||!native.length&&!nativePending);}).map(device=>({value:`camera:${device.deviceId}`,label:device.label.trim(),browserId:device.deviceId,serial:null,rgb:true,depth:false}));
  return [...depth,...standard];
}

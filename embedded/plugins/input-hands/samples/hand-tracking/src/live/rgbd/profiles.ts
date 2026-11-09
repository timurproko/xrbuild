/** Matched RGB8/Z16 profiles only. No scaling or guessed/silently substituted sensor mode. */
export interface CaptureProfile {width:number;height:number;fps:number}
export const BASELINE='640x480@30';
export const MAX_PIXELS=1280*720;
export function captureProfile(value:unknown):CaptureProfile {
  if(typeof value!=='string'||value.length>24)throw new Error('Invalid RGB-D profile');const m=/^([1-9]\d{1,3})x([1-9]\d{1,3})@([1-9]\d?)$/.exec(value);if(!m)throw new Error('Invalid RGB-D profile');const [width,height,fps]=m.slice(1).map(Number);
  if(width<160||width>1280||height<120||height>720||width*height>MAX_PIXELS||fps>90)throw new Error('RGB-D profile exceeds bounded 1280×720 / 90 Hz support');return {width,height,fps};
}
export function profileKey(p:CaptureProfile):string{return `${p.width}x${p.height}@${p.fps}`;}
export function matchingProfiles(device:{profiles:readonly {stream:string;encoding:string;width:number;height:number;fps:number}[]}|undefined):string[]{
  if(!device)return [];const colors=new Set<string>(),depths=new Set<string>();for(const p of device.profiles){const key=profileKey(p);try{captureProfile(key);}catch{continue;}if(p.stream.toLowerCase()==='color'&&p.encoding==='RGB8')colors.add(key);if(p.stream.toLowerCase()==='depth'&&p.encoding==='Z16')depths.add(key);}
  return [...colors].filter(k=>depths.has(k)).sort((a,b)=>{if(a===BASELINE)return -1;if(b===BASELINE)return 1;const x=captureProfile(a),y=captureProfile(b);return x.width*x.height-y.width*y.height||x.fps-y.fps||a.localeCompare(b);});
}
export function profileLabel(key:string):string{const p=captureProfile(key);return `${p.width} × ${p.height} · ${p.fps} FPS`;}

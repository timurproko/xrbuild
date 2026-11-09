export type CameraDevices = Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;
export function preferredRgb(devices: readonly MediaDeviceInfo[]): MediaDeviceInfo | undefined {
  const all = devices.filter(device => device.kind === 'videoinput');
  // Windows RGB endpoint names can contain "Depth Camera" in the product prefix.
  const rgb = all.find(device => /rgb(?:\s*\([^)]*\))?\s*$/i.test(device.label));
  const cameras = all.filter(device => !/\b(ir|infrared|depth)\b/i.test(device.label));
  return rgb ?? cameras.find(device => !!device.label);
}
export function incompatibleRgbLabel(label: string): boolean {
  const plain = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return /\b(ir|infrared)\b/i.test(plain) || /\bdepth\s*$/i.test(plain);
}
export function virtualRgbLabel(label:string):boolean{return /\b(?:virtual|emulated|headset|loopback|broadcast)\b/i.test(label);}
export interface RgbCaptureProfile {width:number;height:number;frameRate:number}
/** Explicit authorization action: open one temporary stream, release it, then return named browser devices. */
export async function authorizeCameraDiscovery(media:CameraDevices):Promise<MediaDeviceInfo[]>{
  const stream=await media.getUserMedia({audio:false,video:true});
  try{return await media.enumerateDevices();}finally{stream.getTracks().forEach(track=>track.stop());}
}
export function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'AbortError') return 'Camera start cancelled.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission denied. Allow camera access for this localhost page in the browser and start again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Selected camera/profile is unavailable. Refresh the list and explicitly select another RGB camera.';
  if (name === 'NotReadableError') return 'Camera could not be opened. Close other camera/tracker applications, or explicitly select another RGB camera.';
  return error instanceof Error ? error.message : String(error);
}
const cancelled = () => new DOMException('Stale camera session', 'AbortError');
export class CameraSource {
  private generation = 0;
  private stream: MediaStream | null = null;
  private unbind: (() => void) | null = null;
  readonly video: HTMLVideoElement;
  private readonly media: CameraDevices;
  private readonly ended: () => void;
  constructor(video: HTMLVideoElement, media: CameraDevices, ended: () => void) { this.video = video; this.media = media; this.ended = ended; }
  get activeTracks(): number { return this.stream?.getTracks().filter(track => track.readyState === 'live').length ?? 0; }
  private release(): void {
    this.unbind?.(); this.unbind = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
  }
  stop(): void { ++this.generation; this.release(); }
  async start(deviceId: string,profile?:RgbCaptureProfile): Promise<{ label: string; deviceId: string; width: number; height: number; frameRate: number | null }> {
    this.stop();
    const generation = this.generation;
    const open = async (id: string) => {
      const stream = await this.media.getUserMedia({ audio: false, video: { ...(id ? { deviceId: { exact: id } } : {}), ...(profile?{width:{exact:profile.width},height:{exact:profile.height},frameRate:{exact:profile.frameRate}}:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:60}}) } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw cancelled(); }
      this.stream = stream;
      return stream;
    };
    try {
      let initialId = deviceId;
      if (!initialId) {
        const known = await this.media.enumerateDevices();
        if (generation !== this.generation) throw cancelled();
        initialId = preferredRgb(known)?.deviceId ?? '';
      }
      let stream = await open(initialId);
      if (!deviceId) {
        // Auto is explicitly labeled: acquire permission, then prefer an RGB endpoint, not a depth/IR interface.
        const devices = await this.media.enumerateDevices();
        if (generation !== this.generation) throw cancelled();
        const preferred = preferredRgb(devices);
        if (preferred && preferred.deviceId !== stream.getVideoTracks()[0]?.getSettings().deviceId) {
          this.release(); stream = await open(preferred.deviceId);
        }
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Camera returned no video track');
      const onEnded = () => { if (generation === this.generation) this.ended(); };
      track.addEventListener('ended', onEnded);
      this.unbind = () => track.removeEventListener('ended', onEnded);
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) throw cancelled();
      const settings = track.getSettings(),width=this.video.videoWidth||settings.width||640,height=this.video.videoHeight||settings.height||480,frameRate=Number.isFinite(settings.frameRate)&&settings.frameRate!>0?settings.frameRate!:null;
      if(profile&&(width!==profile.width||height!==profile.height||frameRate===null||Math.abs(frameRate-profile.frameRate)>.5))throw new Error(`Camera opened ${width}×${height} @ ${frameRate??'unknown'} instead of requested ${profile.width}×${profile.height} @ ${profile.frameRate}`);
      return { label: track.label || 'Selected RGB camera', deviceId: settings.deviceId ?? '',width,height,frameRate };
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }
}

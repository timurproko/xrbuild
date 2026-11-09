/// <reference types="vite/client" />
import type * as THREE from 'three';
import manifest from '../../assets/vision-assets.json' with { type: 'json' };
import { Lifetime } from '../lifecycle.ts';
import { DEFAULT_SETTINGS, validateSettings, type LiveFrame, type Settings } from './contracts.ts';
import { activeWorkers } from './estimator.ts';
import { LiveSession } from './session.ts';
import { authorizeCameraDiscovery,cameraError, incompatibleRgbLabel,virtualRgbLabel } from './camera.ts';
import { RelativeSkeleton, drawOverlay } from './visual.ts';
import type { CaptureMetadata } from './recording/format.ts';
import {capturePreferences} from '../ui/capture-preferences.ts';
import {JOINT_NAMES} from './rgbd/reconstruction.ts';
interface Observer { frame(frame: LiveFrame, bitmap: ImageBitmap): void; clear(): void }
const el = <T extends HTMLElement>(id: string) => {
  const value = document.getElementById(id); if (!value) throw new Error(`Missing #${id}`); return value as T;
};
const text = (id: string, value: string) => { el(id).textContent = value; };
export class LivePanel {
  readonly visual = new RelativeSkeleton();
  private enabled = false;
  private observers = new Set<Observer>();
  subscribe(observer: Observer): () => void { this.observers.add(observer); return () => this.observers.delete(observer); }
  captureMetadata(): CaptureMetadata {
    const stats = this.session?.snapshot();
    if (!this.enabled || stats?.state !== 'running' || !stats.settings || !['CPU','GPU'].includes(stats.delegate)) throw new Error('Start an RGB camera first');
    return { assets: { runtime: manifest.runtime, model: { id: manifest.model.id, file: manifest.model.file, sha256: manifest.model.sha256 }, wasm: manifest.wasm },
      settings: stats.settings, backend: { delegate: stats.delegate as Settings['delegate'], fallback: stats.fallback },
      source: { kind: 'browser-rgb', id: stats.deviceId, label: stats.label, width: stats.width, height: stats.height, frameRate: stats.frameRate },
      pageTimeOriginMs: performance.timeOrigin, mirroredPreview: el<HTMLInputElement>('camera-mirror').checked };
  }
  private session: LiveSession | null = null;
  private frame: LiveFrame | null = null;
  private statusText = 'Choose an RGB camera and press Start camera. Permission is requested only on Start.';
  private errorText = '';
  private events: string[] = [];
  private refreshGeneration = 0;
  private devices:MediaDeviceInfo[]=[];
  private presentedFrame = -1;
  private readyToRenderMs: number | null = null;
  private overlay = el<HTMLCanvasElement>('camera-overlay');
  private video = el<HTMLVideoElement>('camera-video');
  private cameraSelect = el<HTMLSelectElement>('camera-device');
  private profileSelect=el<HTMLSelectElement>('camera-profile');
  private buttons = new AbortController();
  constructor(scene: THREE.Scene, life: Lifetime) {
    scene.add(this.visual);
    const on = (id: string, type: string, callback: () => void) => el(id).addEventListener(type, callback, { signal: this.buttons.signal });
    on('camera-toggle', 'click', () => { const state=this.session?.snapshot().state;if(state&&['running','loading','permission'].includes(state))this.stop();else void this.start(); });
    on('camera-refresh', 'click', () => { void this.refresh(); });
    const savedProfile=capturePreferences.browserCaptureProfile();if([...this.profileSelect.options].some(option=>option.value===savedProfile))this.profileSelect.value=savedProfile;
    on('camera-device', 'change', () => { capturePreferences.chooseBrowserCamera(this.cameraSelect.value);++this.refreshGeneration; if (this.session?.snapshot().state === 'running') void this.start(); });
    on('camera-profile','change',()=>{capturePreferences.chooseBrowserProfile(this.profileSelect.value);if(this.session?.snapshot().state==='running')void this.start();});
    on('camera-mirror', 'change', () => this.mirror());
    navigator.mediaDevices?.addEventListener('devicechange', () => { void this.refresh(); }, { signal: this.buttons.signal });
    life.own(() => { this.buttons.abort(); this.stop(); });
    void this.refresh(); this.mirror();
  }
  private mirror(): void { this.overlay.style.transform = el<HTMLInputElement>('camera-mirror').checked ? 'scaleX(-1)' : ''; }
  private adoptDevices(devices:readonly MediaDeviceInfo[],selected:string):void{
    this.devices=devices.filter(device=>device.kind==='videoinput'&&!incompatibleRgbLabel(device.label)&&!virtualRgbLabel(device.label));this.cameraSelect.replaceChildren(new Option('Select camera',''));
    this.devices.forEach((device,index)=>{this.cameraSelect.add(new Option(`${device.label||'Camera (permission reveals name)'} [${index+1}]`,device.deviceId));});
    if([...this.cameraSelect.options].some(option=>option.value===selected))this.cameraSelect.value=selected;else if(selected){const missing=new Option('Saved camera unavailable',selected);missing.disabled=true;this.cameraSelect.add(missing);this.cameraSelect.value=selected;}
  }
  async refresh(selected = this.cameraSelect.value||capturePreferences.browserCamera()||''): Promise<void> {
    const generation = ++this.refreshGeneration;
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices=await navigator.mediaDevices.enumerateDevices();
      if (this.buttons.signal.aborted || generation !== this.refreshGeneration) return;
      this.adoptDevices(devices,selected);
    } catch (error) { this.errorText = cameraError(error); }
  }
  async authorizeDiscovery():Promise<void>{
    const generation=++this.refreshGeneration,selected=this.cameraSelect.value||capturePreferences.browserCamera()||'';
    try{
      if(!navigator.mediaDevices?.getUserMedia||!navigator.mediaDevices?.enumerateDevices)throw new Error('Camera API unavailable.');
      const devices=await authorizeCameraDiscovery(navigator.mediaDevices);
      if(this.buttons.signal.aborted||generation!==this.refreshGeneration)return;
      this.adoptDevices(devices,selected);
    }catch(error){if(generation===this.refreshGeneration)this.errorText=cameraError(error);}
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
    for (const id of ['live-actions', 'live-settings', 'live-preview-section', 'live-metrics']) el(id).hidden = !enabled;
    const model = el<HTMLSelectElement>('model');
    model.value = enabled ? 'mediapipe' : 'none';
    for (const option of model.options) option.disabled = option.value !== (enabled ? 'mediapipe' : 'none');
    model.disabled = !enabled;
    el('synthetic-controls').hidden = enabled;
    el('synthetic-interactions').hidden = enabled;
    if (enabled) {
      this.errorText = '';
    }
  }
  cameraDevices():readonly MediaDeviceInfo[]{return this.devices;}
  selectCamera(deviceId:string):void{if(this.cameraSelect.value===deviceId)return;this.cameraSelect.value=deviceId;this.cameraSelect.dispatchEvent(new Event('change',{bubbles:true}));}
  settings(): Settings {
    const settings: Settings = { delegate: el<HTMLSelectElement>('delegate').value as Settings['delegate'],
      detection: Number(el<HTMLInputElement>('threshold-detection').value), presence: Number(el<HTMLInputElement>('threshold-presence').value),
      tracking: Number(el<HTMLInputElement>('threshold-tracking').value) };
    validateSettings(settings); return settings;
  }
  private async start(): Promise<void> {
    if (!this.enabled) return;
    this.errorText = '';
    if(!this.cameraSelect.value){this.errorText='Select a camera before starting capture.';return;}
    try {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable. Open this diagnostic in Chrome on localhost/HTTPS, not a file URL or a host without camera permissions.');
      if (!('Worker' in window) || !('OffscreenCanvas' in window) || !('createImageBitmap' in window)) throw new Error('Worker/OffscreenCanvas/ImageBitmap support is required; use a current desktop Chrome browser.');
      if (!this.session) this.session = new LiveSession(this.video, {
        status: message => { this.statusText = message; },
        error: message => { this.errorText = message; this.statusText = 'Capture stopped; no fallback or synthetic data substituted.'; },
        clear: () => { for (const observer of this.observers) observer.clear(); this.frame = null; this.visual.update([]); this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height); this.readyToRenderMs = null; },
        event: event => { this.events.push(`${event.type} #${event.id} @ ${event.pageMs.toFixed(0)} page ms`); this.events = this.events.slice(-20); },
        camera: info => { el('preview-stage').style.aspectRatio = `${info.width} / ${info.height}`; void this.refresh(info.deviceId); },
        frame: (frame, bitmap) => { this.frame = frame; drawOverlay(this.overlay, bitmap, el<HTMLInputElement>('single-show-sources').checked?frame.hands:[]); for (const observer of this.observers) observer.frame(frame,bitmap); },
      });
      this.events = [];
      const assetsBase = new URL(`${import.meta.env.BASE_URL}vendor/vision/`, document.baseURI).href;
      const match=/^(\d+)x(\d+)@(\d+)$/.exec(this.profileSelect.value);if(!match)throw new Error('Select a valid RGB resolution and frame rate');
      await this.session.start(this.cameraSelect.value, assetsBase, manifest.model.file, this.settings(),{width:Number(match[1]),height:Number(match[2]),frameRate:Number(match[3])});
    } catch (error) { this.stop(); this.errorText = cameraError(error); }
  }
  stop(): void {
    if (this.session) void this.session.stop();
    this.frame = null; this.visual.update([]);
    this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.statusText = 'Camera stopped. Start to request capture again.';
  }
  private visibleHands(){const view=el<HTMLSelectElement>('hand-view').value;return (this.frame?.hands??[]).filter(hand=>view==='both'||hand.handedness?.categoryName.toLowerCase()===view);}
  render(showAxes: boolean): void { this.visual.update(this.enabled ? this.visibleHands() : [], showAxes); }
  presented(pageMs: number): void {
    if (this.enabled && this.frame && this.presentedFrame !== this.frame.timing.frameReadyPageMs) {
      this.presentedFrame = this.frame.timing.frameReadyPageMs;
      this.readyToRenderMs = pageMs - this.frame.timing.frameReadyPageMs;
    }
  }
  snapshot() {
    return { enabled: this.enabled, ...this.session?.snapshot(), hands: this.frame?.hands.length ?? 0,
      topology: this.frame?.hands.map(hand => ({ id: hand.id, image: hand.image.length, relative: hand.relative?.length ?? 0 })) ?? [],
      activeWorkers: activeWorkers(), readyToRenderMs: this.readyToRenderMs, error: this.errorText, events: [...this.events],
      runtime: manifest.runtime.version, model: manifest.model.id, mode: 'hand-relative (not application input)' };
  }
  private updateInspection():void{
    const index=Number(el<HTMLSelectElement>('single-joint').value),container=el('single-joint-status'),hands=this.frame?.hands??[];
    if(!hands.length){container.classList.add('is-empty','xrb-empty-state');container.textContent='No output';return;}
    container.classList.remove('is-empty','xrb-empty-state');container.replaceChildren(...hands.map(hand=>{const section=document.createElement('section'),title=document.createElement('h2'),body=document.createElement('pre'),image=hand.image[index],relative=hand.relative?.[index],category=hand.handedness?.categoryName?.toLowerCase();section.className='point-hand-block';title.textContent=category==='left'?'Left Hand':category==='right'?'Right Hand':'Unknown Hand';body.className='readout';body.textContent=`Track #${hand.id} · ${JOINT_NAMES[index]}\nImage normalized XYZ: ${image?`${image.x.toFixed(4)}, ${image.y.toFixed(4)}, ${image.z.toFixed(4)}`:'unavailable'}\nHand-relative XYZ: ${relative?`${relative.x.toFixed(4)}, ${relative.y.toFixed(4)}, ${relative.z.toFixed(4)}`:'unavailable'} (model space)`;section.append(title,body);return section;}));
  }
  updateUi(): void {
    if (!this.enabled) return;this.updateInspection();
    const stats = this.session?.snapshot();
    const active = !!stats&&['running','loading','permission'].includes(stats.state??'');
    const selected=this.cameraSelect.selectedOptions[0],available=!!this.cameraSelect.value&&!selected?.disabled;el('camera-profile-field').hidden=!this.cameraSelect.value;this.cameraSelect.disabled=active;this.profileSelect.disabled=active;
    const toggle=el<HTMLButtonElement>('camera-toggle');toggle.disabled=!active&&!available;toggle.classList.toggle('danger-solid',active);toggle.classList.toggle('primary',!active);text('camera-toggle',active?'Stop capture':'Start capture');
    text('mode', 'Live RGB / relative 3D');
    text('rate', `${(stats?.processedHz ?? 0).toFixed(1)} results/s`);
    text('counts', `${this.frame?.hands.length ?? 0} / model observation`);
    text('status', this.statusText); text('error', this.errorText);
    text('live-backend', stats?.delegate ? `${stats.delegate}${stats.delegate === 'GPU' ? ' (WebGL)' : ' (WASM)'}${stats.state === 'running' ? ' / worker' : ' / stopped'}` : `Not running (${DEFAULT_SETTINGS.delegate} default)`);
    text('live-inference', `${(stats?.inferenceMs ?? 0).toFixed(1)} ms`);
    text('live-ready', this.readyToRenderMs === null ? '—' : `${this.readyToRenderMs.toFixed(1)} ms (software)`);
    text('live-skipped', String(stats?.skipped ?? 0));
    const points=this.frame?.hands.reduce((count,hand)=>count+hand.image.length,0);text('single-output-label',`Camera${points===undefined?'':` · ${points} points`}`);
    text('live-camera-name', stats?.label || 'No camera opened');
    text('live-hand-info', this.frame?.hands.map(hand => `#${hand.id} ${hand.handedness?.categoryName ?? 'Unknown'} ${hand.handedness ? hand.handedness.score.toFixed(2) : ''} (handedness only)`).join(' · ') || 'No hands detected');
    text('live-events', this.events.slice(-5).join('\n') || 'No hand events yet. IDs are best-effort spatial association.');
  }
}

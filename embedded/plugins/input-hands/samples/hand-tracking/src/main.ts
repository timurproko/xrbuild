/// <reference types="vite/client" />
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getHostInfo, HostChannel, HandInput, HandVisual, PanelFrame, Interactor, PinchTarget, toSceneHand,
  MSG_HANDS, PROTOCOL_VERSION, type Hand, type HandsMessage, type WireHand } from '@xr-build/sdk';
import { generate, valid, renderable, type Scenario } from './synthetic.ts';
import { Lifetime, disposeScene } from './lifecycle.ts';
import { LivePanel } from './live/panel.ts';
import { RecordingPanel } from './live/recording/panel.ts';
import { CsvRecordingPanel } from './live/recording/csv-panel.ts';
import { RgbdPanel } from './live/rgbd/panel.ts';
import { FusionPanel } from './live/multiview/viewer.ts';
import { BenchPanel } from './live/bench/panel.ts';
import { metricViewPoint } from './live/rgbd/geometry.ts';
import { SpatialCalibrationPanel } from './live/multiview/panel.ts';
import { WorkspaceUi } from './ui/workspace.ts';
import {capturePreferences,initializeCapturePreferences} from './ui/capture-preferences.ts';
import {workspaceStorage} from './ui/workspace-storage.ts';
import {revealWorkspace,failWorkspace} from './ui/boot.ts';
import {setupNavigation} from './ui/navigation.ts';
import {setupDesignSystem} from './ui/design-system.ts';
import {setupPanelStatus} from './ui/panel-status.ts';
import {captureCameraItems} from './ui/camera-inventory.ts';
import {iconSvg} from '@xr-build/design-system';

const life = new Lifetime();
const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
};
const text = (id: string, value: string) => { element(id).textContent = value; };
const rawOptions = { smoothing: false as const, prediction: false, graceMs: 0 };
const globalPreferenceDefaults = { delegate: 'CPU', detection: 0.5, presence: 0.5, tracking: 0.5, recordingLimit: 120, recordingAutoCapture: true } as const;

async function applyGlobalPreferences(): Promise<void> {
  let values: Record<string, unknown> = { ...globalPreferenceDefaults };
  try {
    const response = await fetch('/api/plugins/manage/input-hands/settings', { cache: 'no-store' });
    if (response.ok) values = { ...globalPreferenceDefaults, ...(await response.json()).panel };
  } catch { /* Direct Vite development keeps bounded defaults. */ }
  const delegate = values.delegate === 'GPU' ? 'GPU' : 'CPU';
  const bounded = (key: 'detection' | 'presence' | 'tracking', fallback: number) => typeof values[key] === 'number' && values[key] >= 0 && values[key] <= 1 ? values[key] : fallback;
  element<HTMLSelectElement>('delegate').value = delegate;
  element<HTMLInputElement>('threshold-detection').value = String(bounded('detection', globalPreferenceDefaults.detection));
  element<HTMLInputElement>('threshold-presence').value = String(bounded('presence', globalPreferenceDefaults.presence));
  element<HTMLInputElement>('threshold-tracking').value = String(bounded('tracking', globalPreferenceDefaults.tracking));
  element<HTMLInputElement>('csv-recording-limit').value = String(typeof values.recordingLimit === 'number' && values.recordingLimit >= 1 && values.recordingLimit <= 120 ? Math.round(values.recordingLimit) : globalPreferenceDefaults.recordingLimit);
  element<HTMLInputElement>('csv-recording-autostart').checked = typeof values.recordingAutoCapture === 'boolean' ? values.recordingAutoCapture : globalPreferenceDefaults.recordingAutoCapture;
}

function boot(): void {
  life.own(setupNavigation());
  life.own(setupDesignSystem());
  life.own(setupPanelStatus());
  const bootEvents=new AbortController();life.own(()=>bootEvents.abort());
  window.addEventListener('handtracking-storage-error',event=>text('error',(event as CustomEvent<string>).detail),{signal:bootEvents.signal});
  const canvas = element<HTMLCanvasElement>('view'),viewport=element('viewport'),fullscreen=element<HTMLButtonElement>('viewport-fullscreen');
  const enterFullscreen=iconSvg('fullscreen'),exitFullscreen=iconSvg('exit-fullscreen');
  const syncFullscreen=()=>{const active=document.fullscreenElement===viewport,label=active?'Exit fullscreen':'Enter fullscreen';fullscreen.innerHTML=active?exitFullscreen:enterFullscreen;fullscreen.dataset.tooltip=label;fullscreen.setAttribute('aria-label',label);};
  fullscreen.addEventListener('click',()=>{const work=document.fullscreenElement===viewport?document.exitFullscreen():viewport.requestFullscreen();void work.catch(error=>text('error',error instanceof Error?error.message:String(error)));},{signal:bootEvents.signal});document.addEventListener('fullscreenchange',syncFullscreen,{signal:bootEvents.signal});syncFullscreen();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  life.own(() => { renderer.renderLists.dispose(); renderer.dispose(); });
  const scene = new THREE.Scene();
  const applyTheme = () => { scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--log-bg').trim()); };
  applyTheme();
  const theme = matchMedia('(prefers-color-scheme: dark)');
  theme.addEventListener('change', applyTheme); life.own(() => theme.removeEventListener('change', applyTheme));
  life.own(() => disposeScene(scene));
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.005, 10);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 0.3; controls.maxDistance = 2;
  controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  life.own(() => controls.dispose());
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#162338', 2.8));
  const light = new THREE.DirectionalLight('#ffffff', 3);
  light.position.set(0.2, 0.4, 0.6); scene.add(light);
  const panel = new PanelFrame();
  panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, camera);
  const grid = new THREE.GridHelper(0.6, 12, '#345575', '#1d344d');
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) { material.transparent = true; material.opacity = 0.22; }
  grid.rotation.x = Math.PI / 2; grid.position.z = -0.02; scene.add(grid);
  const axes = new THREE.Group(); axes.add(new THREE.AxesHelper(0.09)); scene.add(axes);
  const wristAxes = [new THREE.AxesHelper(0.04), new THREE.AxesHelper(0.04)];
  axes.add(...wristAxes);
  const skeleton = new HandVisual({ jointDiameterM: 0.006, boneDiameterM: 0.004, opacity: 0.85 });
  const rejectedSkeleton = new HandVisual({ jointDiameterM: 0.006, boneDiameterM: 0.003, jointColor: '#ff6055', boneColor: '#ff6055', opacity: 0.65, pinchDiameterM: 0 });
  scene.add(skeleton, rejectedSkeleton);
  const interactor = new Interactor();
  const raycaster = new THREE.Raycaster();
  life.own(interactor.bindMouse(canvas, (u, v) => {
    raycaster.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), camera);
    return raycaster.ray;
  }));
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.012), new THREE.MeshStandardMaterial({ color: '#d8ab48' }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: '#65c0c8' }));
  scene.add(button, cube);
  const pressTarget = interactor.add(new PinchTarget(button, { radius: 0.055 }));
  const dragTarget = interactor.add(new PinchTarget(cube, { radius: 0.065 }));
  life.own(() => { interactor.remove(pressTarget); interactor.remove(dragTarget); });
  let presses = 0, drags = 0;
  const offset = new THREE.Vector3();
  life.own(pressTarget.on(event => { if (event.type === 'start') presses++; }));
  life.own(dragTarget.on(event => {
    if (event.type === 'start') { drags++; offset.copy(cube.position).sub(event.world); }
    if (event.type === 'move') cube.position.copy(event.world).add(offset);
  }));
  function reset(): void {
    camera.position.set(0, 0.02, 0.72); controls.target.set(0, 0, 0.04); controls.update();
    interactor.pointerUp();
    for (const target of [pressTarget, dragTarget]) { target.enabled = false; }
    interactor.update([], 1);
    button.position.set(-0.085, 0.042, 0.07); cube.position.set(0.085, 0.042, 0.07);
  }
  reset();
  let input = new HandInput(rawOptions);
  let current: Hand[] = [], rejected: Hand[] = [];
  let rejectedCount = 0;
  let delivery: 'host' | 'local' = 'local';
  let running = true, sequenceStart = performance.now(), latestTick = -1, lastReceived = 0;
  let received = 0, trackingHz = 0, fps = 0, frames = 0, frameStart = performance.now(), lastUi = 0;
  let providerStatus = 'Waiting for hand-tracking input. Build/enable the plugin and restart Run if unavailable.';
  const intervals: number[] = [];
  let previousFrame = performance.now();
  const host = getHostInfo();
  const channel = host ? new HostChannel(host) : null;
  if (channel) life.own(() => channel.close());
  const sourceSelect = element<HTMLSelectElement>('input');
  const requestedSource = new URL(location.href).searchParams.get('source');
  const managedBridge = !!document.querySelector('meta[name="handtracking-managed-bridge"][content="1"]');
  const panelManaged = !!document.querySelector('meta[name="handtracking-panel-managed"][content="1"]');
  sourceSelect.value = host ? 'synthetic' : requestedSource && ['camera','synthetic','rgbd','recording','multiview'].includes(requestedSource)
    ? requestedSource : capturePreferences.mode() ?? 'synthetic';
  const isLive = () => sourceSelect.value === 'camera';
  const isSynthetic = () => sourceSelect.value === 'synthetic';
  let workspaceUi: WorkspaceUi | null = null;
  const live = new LivePanel(scene, life);
  const viewTools = { reset,
    frame(points:readonly {x:number;y:number;z:number}[]) {
      const bounds=new THREE.Box3();for(const p of points){const view=metricViewPoint(p);bounds.expandByPoint(new THREE.Vector3(view.x,view.y,view.z));}
      if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const distance=Math.max(0.35,Math.max(size.x/Math.min(camera.aspect,1),size.y,size.z,0.15)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.5);
      controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,0.02,Math.min(distance,1.8)));controls.update();
    },
  };
  let discoverFusion=()=>{};
  const rgbd = new RgbdPanel(scene,life,live,viewTools,selection=>{capturePreferences.choose('a',selection.a,selection.profileA);capturePreferences.choose('b',selection.b,selection.profileA);sourceSelect.value='multiview';updateSource();discoverFusion();},{autoConnect:!panelManaged});
  const spatialCalibration = new SpatialCalibrationPanel(life,rgbd);
  const bench=new BenchPanel(index=>{if(sourceSelect.value==='multiview')fusion.seek(index);else recording.seek(index);},(blob,name)=>recording.downloadBlob(blob,name));
  life.own(()=>bench.dispose());
  const recording = new RecordingPanel(scene,life,live,rgbd,() => { sourceSelect.value = 'recording'; updateSource(); workspaceUi?.replay(); },viewTools,bench);
  const fusion=new FusionPanel(scene,life,live,bench,()=>recording.hasMedia(),()=>{if(sourceSelect.value!=='multiview'){sourceSelect.value='multiview';updateSource();}workspaceUi?.replay();},()=>spatialCalibration.calibration(),viewTools,(blob,name)=>recording.downloadBlob(blob,name),{apply:(value,dirty)=>spatialCalibration.adopt(value,dirty),exported:hash=>spatialCalibration.exported(hash)},{autoConnect:!panelManaged});
  discoverFusion=()=>fusion.discover();
  recording.guardMedia(()=>fusion.retained());
  const activeCaptureButton=()=>{const id=sourceSelect.value==='camera'?'camera-toggle':sourceSelect.value==='rgbd'?'rgbd-toggle':sourceSelect.value==='multiview'?'mv-toggle':null;return id?element<HTMLButtonElement>(id):null;};let csvReturnSource=sourceSelect.value==='recording'?'rgbd':sourceSelect.value;const csvRecording=new CsvRecordingPanel(scene,life,live,rgbd,fusion,()=>sourceSelect.value,()=>sourceSelect.value==='camera'?live.snapshot().state==='running':sourceSelect.value==='rgbd'?rgbd.snapshot().state==='running':sourceSelect.value==='multiview'&&fusion.snapshot().capturing,()=>{const button=activeCaptureButton();return !!button&&!button.disabled&&button.textContent?.trim()==='Start capture';},()=>activeCaptureButton()?.click(),()=>{if(sourceSelect.value==='recording')return;csvReturnSource=sourceSelect.value;sourceSelect.value='recording';updateSource();workspaceUi?.replay();},()=>{sourceSelect.value=csvReturnSource;updateSource();});
  const captureEvents=new AbortController();life.own(()=>captureEvents.abort());
  element('fit-view').addEventListener('click',()=>{if(sourceSelect.value==='camera')viewTools.reset();},{signal:captureEvents.signal});
  element('capture-header-stop').addEventListener('click',()=>activeCaptureButton()?.click(),{signal:captureEvents.signal});
  const captureCamera=element<HTMLSelectElement>('capture-camera'),captureMode=element<HTMLSelectElement>('capture-backend');
  let lastNativeDevices=rgbd.cameraDevices();
  const captureItems=()=>{
    const browser=live.cameraDevices(),currentNative=rgbd.cameraDevices();if(currentNative.length||!rgbd.cameraLoading())lastNativeDevices=currentNative;const native=currentNative.length?currentNative:rgbd.cameraLoading()?lastNativeDevices:currentNative;
    return captureCameraItems(browser,native,rgbd.cameraLoading());
  };
  const syncCaptureControls=()=>{
    const liveSource=sourceSelect.value==='camera'||sourceSelect.value==='rgbd';element('capture-camera-field').hidden=!liveSource;if(!liveSource){element('capture-mode-field').hidden=true;return;}
    const current=captureCamera.value,items=captureItems(),browserPreference=capturePreferences.browserCamera(),loading=rgbd.cameraLoading();captureCamera.setAttribute('aria-busy',String(loading));
    const selected=sourceSelect.value==='rgbd'?`rgbd:${capturePreferences.choice('single')?.serial??''}`:`camera:${browserPreference??''}`,key=JSON.stringify(items);
    if(captureCamera.dataset.items!==key){captureCamera.dataset.items=key;captureCamera.replaceChildren(new Option('Select camera',''),...items.map(item=>new Option(item.label,item.value)));captureCamera.value=items.some(item=>item.value===current)?current:items.some(item=>item.value===selected)?selected:'';}else if(!captureCamera.value&&items.some(item=>item.value===selected))captureCamera.value=selected;
    const item=items.find(value=>value.value===captureCamera.value);if(!item){element('camera-profile-field').hidden=true;element('rgbd-profile-field').hidden=true;element('rgbd-add-camera').hidden=true;const secondGroup=element('rgbd-second-camera');secondGroup.classList.remove('is-open');secondGroup.setAttribute('aria-hidden','true');}const rgbOption=[...captureMode.options].find(option=>option.value==='camera')!,rgbdOption=[...captureMode.options].find(option=>option.value==='rgbd')!;rgbOption.disabled=!item?.rgb;rgbdOption.disabled=!item?.depth;if(item&&!item[sourceSelect.value==='camera'?'rgb':'depth'])sourceSelect.value=item.depth?'rgbd':'camera';captureMode.value=sourceSelect.value;const supported=[rgbOption,rgbdOption].filter(option=>!option.disabled).length;element('capture-mode-field').hidden=!item||supported<2;
  };
  captureCamera.addEventListener('change',()=>{const item=captureItems().find(value=>value.value===captureCamera.value);if(!item){if(sourceSelect.value==='camera')live.selectCamera('');else if(sourceSelect.value==='rgbd')rgbd.selectCamera('');syncCaptureControls();return;}if(item.browserId)live.selectCamera(item.browserId);if(item.serial)rgbd.selectCamera(item.serial);const next=item[sourceSelect.value==='camera'?'rgb':'depth']?sourceSelect.value:item.depth?'rgbd':'camera';if(next!==sourceSelect.value){sourceSelect.value=next;updateSource();}else syncCaptureControls();},{signal:captureEvents.signal});
  captureMode.addEventListener('change',()=>{const item=captureItems().find(value=>value.value===captureCamera.value);if(!item)return;if(captureMode.value==='camera'&&item.browserId)live.selectCamera(item.browserId);if(captureMode.value==='rgbd'&&item.serial)rgbd.selectCamera(item.serial);},{signal:captureEvents.signal});
  captureCamera.closest('.xrb-select')?.addEventListener('pointerdown',()=>{void live.refresh();void rgbd.discover();syncCaptureControls();},{signal:captureEvents.signal});
  element('capture-camera-refresh').addEventListener('click',()=>{void live.refresh();void rgbd.refreshCameras();},{signal:captureEvents.signal});
  element('capture-camera-authorize').addEventListener('click',()=>{void live.authorizeDiscovery().finally(syncCaptureControls);},{signal:captureEvents.signal});
  element('mv-remove-b').addEventListener('click',()=>{const a=element<HTMLSelectElement>('mv-device-a').value,profile=element<HTMLSelectElement>('mv-profile-a').value;if(a)capturePreferences.choose('single',a,profile);capturePreferences.clear('a');capturePreferences.clear('b');sourceSelect.value='rgbd';updateSource();},{signal:captureEvents.signal});
  const isRgbd = () => sourceSelect.value === 'rgbd';
  const deliverySelect = element<HTMLSelectElement>('delivery');
  if (!host) deliverySelect.options[0].disabled = true;
  delivery = host ? 'host' : 'local'; deliverySelect.value = delivery;
  const scenarioSelect = element<HTMLSelectElement>('scenario');
  function clearInput(): void { input = new HandInput(rawOptions); current = []; rejected = []; rejectedCount = 0; received = 0; trackingHz = 0; }
  function syncCaptureAction():void{for(const [id,source] of [['camera-toggle','camera'],['rgbd-toggle','rgbd'],['mv-toggle','multiview']] as const)element<HTMLButtonElement>(id).hidden=sourceSelect.value!==source;}
  function updateSource(): void {
    capturePreferences.setMode(sourceSelect.value);
    clearInput(); reset(); sequenceStart = performance.now(); latestTick = -1; lastReceived = 0;
    scenarioSelect.disabled = delivery === 'host';
    scenarioSelect.value = delivery === 'host' ? 'configured' : 'motion';
    element<HTMLButtonElement>('restart').disabled = delivery === 'host';
    fusion.setEnabled(false);
    rgbd.setEnabled(false);
    recording.setEnabled(false);
    live.setEnabled(isLive());
    recording.setEnabled(sourceSelect.value === 'recording');
    rgbd.setEnabled(isRgbd());
    fusion.setEnabled(sourceSelect.value==='multiview');
    syncCaptureAction();
    if (!isLive()) text('error', '');
    syncCaptureControls();
  }
  const asDiagnosticHand = (wire: WireHand): Hand => ({ id: wire.id, handedness: wire.handedness === 0 ? 'left' : 'right',
    keypoints: wire.keypoints, rawKeypoints: wire.keypoints, pinching: false, pinchStrength: 0, grabbing: false,
    tip: wire.keypoints[8], pinchPoint: wire.keypoints[8], coasting: false, lastSeen: 0 });
  function accept(message: HandsMessage, pageMs: number): void {
    const good = message.hands.filter(valid);
    const invalid = message.hands.filter(hand => !valid(hand));
    rejectedCount = invalid.length;
    // Only finite, complete geometry may reach the raw renderer, even when intentionally implausible.
    rejected = invalid.filter(renderable).map(asDiagnosticHand);
    input.push({ ...message, hands: good }, pageMs);
    // Raw diagnostics: retain the latest observation between renders, but an explicit empty frame
    // immediately ends it. Sampling at render time with grace=0 would flicker between capture ticks.
    current = input.sample(pageMs);
    lastReceived = performance.now(); received++; trackingHz = message.trackingHz;
  }
  if (channel) {
    life.own(channel.onHands(message => { if (isSynthetic() && delivery === 'host' && running) accept(message, channel.hostToPage(message.captureTimeMs)); }));
    life.own(channel.onStatus(message => { providerStatus = `${message.state}: ${message.text}`; }));
    life.own(channel.onView(view => { if (view.stereo) text('error', 'This orbit diagnostic is desktop-only. Select the desktop display provider.'); }));
  }
  workspaceUi = new WorkspaceUi(life, source => { sourceSelect.value = source; updateSource(); });
  const events = new AbortController(); life.own(() => events.abort());
  const on = (id: string, type: string, action: EventListener) => element(id).addEventListener(type, action, { signal: events.signal });
  on('input', 'change', updateSource);
  on('delivery', 'change', () => { delivery = deliverySelect.value as 'host' | 'local'; updateSource(); });
  on('scenario', 'change', () => { clearInput(); reset(); sequenceStart = performance.now(); latestTick = -1; });
  on('restart', 'click', () => { clearInput(); reset(); sequenceStart = performance.now(); latestTick = -1; });
  on('reset', 'click', reset);
  on('running', 'click', () => {
    running = !running;
    text('running', running ? 'Pause viewer' : 'Resume viewer');
    clearInput(); sequenceStart = performance.now(); latestTick = -1;
  });
  function resize(): void {
    const width = Math.max(1, canvas.parentElement!.clientWidth), height = Math.max(1, canvas.parentElement!.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const viewportResize = new ResizeObserver(resize); viewportResize.observe(canvas.parentElement!);
  life.own(() => viewportResize.disconnect());
  addEventListener('resize', resize, { signal: events.signal }); resize();
  const checked = (id: string) => element<HTMLInputElement>(id).checked;
  function styleVisual(visual: { traverse(callback: (object: THREE.Object3D) => void): void }): void {
    visual.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.geometry) return;
      if (mesh.geometry.type === 'SphereGeometry' && (object as THREE.InstancedMesh).isInstancedMesh) object.visible = checked('joints');
      if (mesh.geometry.type === 'CylinderGeometry') object.visible = checked('bones');
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) if (material && 'wireframe' in material) material.wireframe = checked('wireframe');
    });
  }
  for (const id of ['joints', 'bones', 'wireframe']) on(id, 'change', () => { styleVisual(skeleton); styleVisual(rejectedSkeleton); styleVisual(live.visual); styleVisual(recording.visual); styleVisual(rgbd.visual); styleVisual(fusion.visual); });
  const viewOptions:{[key:string]:string}={mirror:'camera-mirror',joints:'joints',bones:'bones',axes:'axes',wireframe:'wireframe'};
  on('viewport-view-options','change',event=>{let selected=new Set<string>();try{selected=new Set(JSON.parse((event.currentTarget as HTMLInputElement).value));}catch{/* Invalid UI state selects no optional view layers. */}for(const [option,id] of Object.entries(viewOptions)){const input=element<HTMLInputElement>(id),next=selected.has(option);if(input.checked===next)continue;input.checked=next;input.dispatchEvent(new Event('change',{bubbles:true}));}});
  styleVisual(skeleton); styleVisual(rejectedSkeleton); styleVisual(live.visual); styleVisual(recording.visual); styleVisual(rgbd.visual); styleVisual(fusion.visual); updateSource();
  const snapshot = () => ({ source: sourceSelect.value, delivery, running, received, hands: isLive() ? live.snapshot().hands : isSynthetic() ? current.length : isRgbd() ? rgbd.snapshot().hands : sourceSelect.value==='multiview'?fusion.snapshot().hands:csvRecording.snapshot().selected?csvRecording.snapshot().hands:recording.snapshot().hands, rejected: rejectedCount, presses, drags,
    cube: cube.position.toArray(), fps, trackingHz, connected: channel?.connected ?? false, live: live.snapshot(), recording: {...recording.snapshot(),csv:csvRecording.snapshot()}, rgbd: rgbd.snapshot(), spatialCalibration:spatialCalibration.snapshot(),multiview:fusion.snapshot() });
  const debug = window as unknown as { handTracking?: { snapshot: typeof snapshot; dispose(): void } };
  debug.handTracking = { snapshot, dispose: () => life.dispose() };
  life.own(() => { delete debug.handTracking; });
  renderer.setAnimationLoop(now => {
    if (isSynthetic() && running && delivery === 'local') {
      const tick = Math.floor((now - sequenceStart) * 0.06);
      if (tick >= 0 && tick !== latestTick) {
        latestTick = tick;
        accept({ type: MSG_HANDS, version: PROTOCOL_VERSION, seq: tick, hostTimeMs: now, captureTimeMs: now,
          trackingHz: 60, capabilities: { pinch: false, grab: false, palm: false },
          hands: generate(scenarioSelect.value as Scenario, tick / 60) }, now);
      }
    }
    if (delivery === 'host' && lastReceived && performance.now() - lastReceived > 1000) { current = []; rejected = []; rejectedCount = 0; }
    controls.update();
    for (const target of [pressTarget, dragTarget]) target.enabled = running && isSynthetic();
    button.visible = cube.visible = isSynthetic();
    scene.updateMatrixWorld(true);
    interactor.update(current.map(hand => toSceneHand(hand, panel)), 1);
    button.material.color.set(pressTarget.state.held ? '#fff1a2' : '#d8ab48');
    cube.material.color.set(dragTarget.state.held ? '#c7fff2' : '#65c0c8');
    skeleton.update(current, panel); rejectedSkeleton.update(rejected, panel);
    live.render(checked('axes'));
    recording.render(now,checked('axes'));
    csvRecording.render(now);
    rgbd.render(checked('axes'));
    fusion.render(now,checked('axes'));
    rejectedSkeleton.visible = rejected.length > 0 && checked('rejected');
    axes.visible = checked('axes');
    wristAxes.forEach((axis, i) => { axis.visible = !!current[i]; if (current[i]) axis.position.fromArray(current[i].keypoints[0]); });
    if(!recording.comparisonVisible())renderer.render(scene, camera);
    live.presented(performance.now());rgbd.presented(performance.now());
    intervals.push(now - previousFrame); if (intervals.length > 120) intervals.shift(); previousFrame = now;
    frames++;
    if (now - frameStart >= 1000) { fps = frames * 1000 / (now - frameStart); frames = 0; frameStart = now; }
    if (now - lastUi >= 250) {
      lastUi = now;
      text('fps', `${fps.toFixed(1)} FPS`);
      text('presses', String(presses)); text('drags', String(drags));
      recording.updateUi();csvRecording.updateUi();spatialCalibration.updateUi();fusion.updateUi();
      if (isLive()) live.updateUi();
      else if (isRgbd()) rgbd.updateUi();
      else if (isSynthetic()) {
        text('mode', delivery === 'host' ? 'Host plugin' : 'Local preview');
        text('rate', `${trackingHz.toFixed(1)} Hz${delivery === 'local' ? ' requested' : ''}`);
        text('counts', `${current.length} / ${rejectedCount}`);
        text('status', !running ? 'Viewer paused. The native provider, if selected, continues publishing to host clients.' : delivery === 'host' ? providerStatus : rejectedCount ? 'Invalid raw fixture rejected before SDK interactions; finite raw geometry is shown red.' : 'SYNTHETIC local preview. No host input, camera or model used.');
      }
      syncCaptureControls();
      workspaceUi?.update(snapshot());
      const sorted = [...intervals].sort((a,b) => a-b);
      channel?.sendHeartbeat({ fps, frameMs: sorted[Math.floor(sorted.length / 2)] ?? 0, latencyMs: null, eyeWidth: canvas.width, eyeHeight: canvas.height });
    }
  });
  life.own(() => renderer.setAnimationLoop(null));
  workspaceUi?.update(snapshot());
  void revealWorkspace(bootEvents.signal).catch(failWorkspace);
}
void Promise.all([applyGlobalPreferences(),workspaceStorage.prepare().then(initializeCapturePreferences)]).then(boot).catch((error) => {
  try { life.dispose(); } catch (cleanupError) { console.error(cleanupError); }
  text('error', error instanceof Error ? error.message : String(error));
  failWorkspace(error);
});
const onPageHide = () => life.dispose();
addEventListener('pagehide', onPageHide, { once: true });
life.own(() => removeEventListener('pagehide', onPageHide));
if (import.meta.hot) import.meta.hot.dispose(() => life.dispose());

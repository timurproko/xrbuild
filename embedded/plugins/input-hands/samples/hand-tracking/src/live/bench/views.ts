import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RelativeSkeleton } from '../visual.ts';
import { MeasuredSkeleton } from '../rgbd/measured-visual.ts';
import { metricViewPoint } from '../rgbd/geometry.ts';
import type { LiveFrame } from '../contracts.ts';
import type { ReconstructionFrame } from '../rgbd/reconstruction.ts';
import { disposeScene } from '../../lifecycle.ts';
/** One lazy renderer, two scissored scenes/cameras. Different origins never share a scene. */
export class ComparisonViews {
  private renderer:THREE.WebGLRenderer|null=null;private controls:OrbitControls[]=[];private scenes=[new THREE.Scene(),new THREE.Scene()];
  private cameras=[new THREE.PerspectiveCamera(40,1,0.005,20),new THREE.PerspectiveCamera(40,1,0.005,20)];
  private raw=[new RelativeSkeleton(),new RelativeSkeleton()];private metric=[new MeasuredSkeleton(),new MeasuredSkeleton('#b99aff')];
  private framed=[false,false];private active=false;private mode='';private rawFrames:(LiveFrame|null)[]=[null,null];private measured:(ReconstructionFrame|null)[]=[null,null];
  private canvas=document.getElementById('bench-view') as HTMLCanvasElement;
  constructor(){this.scenes.forEach((s,i)=>{s.add(new THREE.HemisphereLight('#ffffff','#334455',3),this.raw[i],this.metric[i]);this.cameras[i].position.set(0,0,0.7);});}
  setActive(active:boolean,mode:string):void {
    this.active=active;document.getElementById('bench-viewport')!.hidden=!active;document.getElementById('bench-previews')!.hidden=!active;
    document.getElementById('view')!.style.visibility=active?'hidden':'';document.getElementById('preview-stage')!.hidden=active;
    if(this.mode!==mode){this.mode=mode;this.framed=[false,false];}
    if(!active){this.controls.forEach(c=>c.dispose());this.controls=[];this.renderer?.renderLists.dispose();this.renderer?.dispose();this.renderer=null;this.framed=[false,false];return;}
    if(!this.renderer){this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      this.controls=this.cameras.map(camera=>{const c=new OrbitControls(camera,this.canvas);c.enableDamping=true;c.minDistance=0.05;c.maxDistance=10;c.mouseButtons={LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};return c;});}
  }
  get visible(){return this.active;}
  setFrames(rawA:LiveFrame|null,rawB:LiveFrame|null,a:ReconstructionFrame|null,b:ReconstructionFrame|null):void {this.rawFrames=[rawA,rawB];this.measured=[a,b];}
  reset():void {this.framed=[false,false];}
  clear():void {this.rawFrames=[null,null];this.measured=[null,null];this.framed=[false,false];}
  render(axes:boolean):void {
    if(!this.active||!this.renderer)return;const width=Math.max(2,this.canvas.parentElement!.clientWidth),height=Math.max(1,this.canvas.parentElement!.clientHeight);
    const size=this.renderer.getSize(new THREE.Vector2());if(size.x!==width||size.y!==height)this.renderer.setSize(width,height,false);
    const mirror=(document.getElementById('camera-mirror') as HTMLInputElement).checked?'scaleX(-1)':'';for(const id of ['bench-rgb-a','bench-rgb-b'])document.getElementById(id)!.style.transform=mirror;
    this.renderer.setScissorTest(true);
    this.scenes.forEach((scene,i)=>{
      const metric=!!this.measured[i]&&(this.mode==='ab'||i===1);this.raw[i].update(metric?[]:this.rawFrames[i]?.hands??[],axes);this.metric[i].update(metric?this.measured[i]:null,axes);
      const camera=this.cameras[i];camera.aspect=width/2/height;camera.updateProjectionMatrix();
      if(!this.framed[i]){
        if(metric){const points=this.measured[i]!.hands.flatMap(h=>h.joints.flatMap(j=>j.point?[metricViewPoint(j.point)]:[]));
          if(points.length){const box=new THREE.Box3();points.forEach(p=>box.expandByPoint(new THREE.Vector3(p.x,p.y,p.z)));const center=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3());
            this.controls[i].target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,0,Math.max(0.35,Math.max(span.x/camera.aspect,span.y,span.z)/0.65)));this.framed[i]=true;}}
        else{this.controls[i].target.set(0,0,0.04);camera.position.set(0,0,Math.max(0.7,0.5/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)));this.framed[i]=true;}
      }
      for(const visual of [this.raw[i],this.metric[i]])visual.traverse(object=>{const mesh=object as THREE.Mesh;if(!mesh.geometry)return;
        if(mesh.geometry.type==='SphereGeometry')object.visible=(document.getElementById('joints') as HTMLInputElement).checked;
        if(mesh.geometry.type==='CylinderGeometry')object.visible=(document.getElementById('bones') as HTMLInputElement).checked;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of materials)if(m&&'wireframe'in m)m.wireframe=(document.getElementById('wireframe') as HTMLInputElement).checked;});
      this.controls[i].update();scene.background=new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--log-bg').trim());
      const x=i*Math.floor(width/2),w=i===0?Math.floor(width/2):width-x;this.renderer!.setViewport(x,0,w,height);this.renderer!.setScissor(x,0,w,height);this.renderer!.render(scene,camera);
    });
  }
  snapshot(){return {active:this.active,renderer:!!this.renderer,mode:this.mode,raw:this.raw.map(v=>v.joints.count),measured:this.metric.map(v=>v.joints.count)};}
  dispose():void {this.setActive(false,'');this.scenes.forEach(scene=>disposeScene(scene));}
}

import * as THREE from 'three';
import { BONES,type Point } from '../contracts.ts';
import { metricViewPoint } from './geometry.ts';
import type { ReconstructionFrame } from './reconstruction.ts';
export interface RenderedMeasurements {hands:readonly {joints:readonly {valid:boolean;point:Point|null;color?:string}[]}[];probe?:{valid:boolean;point:Point|null}|null}
export class MeasuredSkeleton extends THREE.Group {
  readonly joints:THREE.InstancedMesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>;
  readonly bones:THREE.InstancedMesh<THREE.CylinderGeometry,THREE.MeshStandardMaterial>;
  private axes:THREE.AxesHelper[];
  private matrixScratch=new THREE.Matrix4();private quaternionScratch=new THREE.Quaternion();private upAxis=new THREE.Vector3(0,1,0);
  private readonly color:string;
  constructor(color='#ffc45b',maxHands=2){super();if(!Number.isInteger(maxHands)||maxHands<1||maxHands>4)throw new Error('Bounded measured skeleton supports 1–4 hands');this.color=color;this.joints=new THREE.InstancedMesh(new THREE.SphereGeometry(0.003,12,8),new THREE.MeshStandardMaterial({color:'#ffffff'}),21*maxHands+1);this.bones=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.002,0.002,1,8),new THREE.MeshStandardMaterial({color}),BONES.length*maxHands);this.axes=Array.from({length:maxHands},()=>new THREE.AxesHelper(0.04));this.add(this.joints,this.bones,...this.axes);this.joints.frustumCulled=this.bones.frustumCulled=false;this.update(null);}
  update(frame:RenderedMeasurements|null,showAxes=true):void {
    let joints=0,bones=0;this.axes.forEach(a=>a.visible=false);
    const point=(p:Point)=>{const v=metricViewPoint(p);return new THREE.Vector3(v.x,v.y,v.z);};
    const sphere=(p:Point,color:string)=>{this.joints.setMatrixAt(joints,this.matrixScratch.compose(point(p),this.quaternionScratch.identity(),new THREE.Vector3(1,1,1)));this.joints.setColorAt(joints++,new THREE.Color(color));};
    frame?.hands.slice(0,this.axes.length).forEach((hand,index)=>{
      hand.joints.forEach(j=>{if(j.valid&&j.point)sphere(j.point,j.color??this.color);});
      for(const[a,b]of BONES){const from=hand.joints[a],to=hand.joints[b];if(!from.valid||!to.valid||!from.point||!to.point)continue;
        const start=point(from.point),end=point(to.point),direction=end.clone().sub(start),length=direction.length();if(length<1e-7)continue;
        this.quaternionScratch.setFromUnitVectors(this.upAxis,direction.divideScalar(length));this.bones.setMatrixAt(bones++,this.matrixScratch.compose(start.add(end).multiplyScalar(0.5),this.quaternionScratch,new THREE.Vector3(1,length,1)));
      }
      const wrist=hand.joints[0];if(wrist.valid&&wrist.point){this.axes[index].position.copy(point(wrist.point));this.axes[index].visible=showAxes;}
    });
    if(frame?.probe?.valid&&frame.probe.point)sphere(frame.probe.point,'#bca2ff');
    this.joints.count=joints;this.bones.count=bones;this.joints.instanceMatrix.needsUpdate=this.bones.instanceMatrix.needsUpdate=true;if(this.joints.instanceColor)this.joints.instanceColor.needsUpdate=true;this.visible=joints>0;
  }
}
/** Raw 2D locations stay visible; invalid measurements have NO invented 3D marker. */
export function measurementOverlay(canvas:HTMLCanvasElement,frame:ReconstructionFrame,color='#ffc45b'):void {
  const context=canvas.getContext('2d');if(!context)return;context.lineWidth=2;
  for(const hand of frame.hands)for(const joint of hand.joints){if(!joint.pixel)continue;const{x,y}=joint.pixel;
    if(joint.valid){context.strokeStyle=color;context.beginPath();context.arc(x,y,4,0,Math.PI*2);context.stroke();}
    else{context.strokeStyle='#ff655e';context.beginPath();context.moveTo(x-4,y-4);context.lineTo(x+4,y+4);context.moveTo(x-4,y+4);context.lineTo(x+4,y-4);context.stroke();}
  }
  if(frame.probe?.pixel){const{x,y}=frame.probe.pixel;context.strokeStyle=frame.probe.valid?'#c4a8ff':'#ff655e';context.strokeRect(x-6,y-6,12,12);}
}

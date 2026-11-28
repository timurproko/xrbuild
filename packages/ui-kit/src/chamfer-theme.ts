import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { referenceGeometry, type GeometryInput, type UiKitTheme, type VisualRole, type VisualRecipe } from './visual-theme.ts';

/** A clipped slab with a single crisp bevel, spanning z=0..depth. */
function slab(w: number, h: number, depth: number, clip: number): THREE.BufferGeometry {
  const b = Math.min(0.0007, depth * 0.12, w * 0.04, h * 0.04);
  const x = w / 2 - b, y = h / 2 - b, c = Math.min(clip, x * 0.6, y * 0.6);
  const points = [[-x+c,-y],[x-c,-y],[x,-y+c],[x,y-c],[x-c,y],[-x+c,y],[-x,y-c],[-x,-y+c]].map(([px,py]) => new THREE.Vector2(px,py));
  return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: Math.max(0.00001,depth-2*b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 }).translate(0,0,b);
}
function polygon(radius: number, depth: number, sides = 12): THREE.BufferGeometry {
  const b = Math.min(depth * 0.12, 0.0007);
  const points = Array.from({length:sides},(_,i) => { const a=i/sides*Math.PI*2; return new THREE.Vector2(Math.cos(a)*(radius-b),Math.sin(a)*(radius-b)); });
  return new THREE.ExtrudeGeometry(new THREE.Shape(points), {depth:Math.max(0.00001,depth-2*b),bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,curveSegments:1}).translate(0,0,b);
}
function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!result) throw new Error('Incompatible Chamfer geometry');
  return result;
}
const insetRoles = new Set<VisualRole>(['board','buttonPill','segmentCap','sliderHandle','dialogPane']);
const facetedRoles = new Set<VisualRole>(['buttonRound','switchKnob','dialKnob']);
function geometry(role: VisualRole, input: GeometryInput): THREE.BufferGeometry {
  const a=input.args;
  let result: THREE.BufferGeometry;
  switch(input.shape) {
    case 'box': {
      const [w,h,d]=a, clip=Math.min(Math.min(w,h)*0.18,a[3]??Infinity);
      result=insetRoles.has(role) ? joined([
        slab(w,h,d*0.72,clip),
        slab(w-0.0012,h-0.0012,d*0.28,clip*0.8).translate(0,0,d*0.72),
      ]) : slab(w,h,d,Math.min(clip,a[3]??clip));
      break;
    }
    case 'roundedDisc': {
      const [r,d]=a;
      result=facetedRoles.has(role)?joined([polygon(r,d*0.72),polygon(r-0.0008,d*0.28).translate(0,0,d*0.72)]):polygon(r,d,16);
      break;
    }
    case 'disc': result=slab(a[0]*(role==='dialTick'?0.65:1.4),a[0]*1.8,a[1],0.00015); break;
    case 'plainBox':
      // Three reference ridges become one horizontal recessed grip, never extra furniture.
      result=a[3]===0?slab(0.0112,0.0012,0.0004,0.0002):new THREE.BufferGeometry(); break;
    case 'ico': result=slab(a[0]*1.55,a[0]*1.55,a[0]*1.35,a[0]*0.3).translate(0,0,-a[0]*0.675); break;
    case 'sphere': result=new THREE.SphereGeometry(a[0],8,6); break;
    case 'cylinder': result=new THREE.CylinderGeometry(a[0],a[1],a[2],8); break;
    case 'cone': result=new THREE.ConeGeometry(a[0],a[1],4); break;
    case 'torus': result=new THREE.TorusGeometry(a[0],a[1],4,24); break;
    case 'circle': result=new THREE.CircleGeometry(a[0]*0.85,4); break;
    case 'ring': result=new THREE.RingGeometry(a[0],a[1],12); break;
    default: return referenceGeometry(input);
  }
  return input.finish?input.finish(result):result;
}
function material(role: VisualRole, authored: THREE.Material): THREE.Material {
  if (authored instanceof THREE.MeshPhysicalMaterial) {
    authored.roughness=0.74;authored.thickness=0.009;authored.specularIntensity=0.35;
  } else if (authored instanceof THREE.MeshStandardMaterial) {
    authored.roughness=role.startsWith('robot')?0.62:0.7;
    authored.metalness=0.1;
    if(role==='sliderGrip')authored.color.set('#30363f');
  } else if (role==='glassEdge' && authored instanceof THREE.ShaderMaterial) {
    authored.fragmentShader=authored.fragmentShader.replace(
      'length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius',
      'max(max(abs(vP.x)-halfSize.x,abs(vP.y)-halfSize.y),(abs(vP.x)+abs(vP.y)-halfSize.x-halfSize.y+radius)*0.70710678)',
    ).replace('vec2 L = normalize', 'if(abs(vP.x)+abs(vP.y)>halfSize.x+halfSize.y-radius) n=normalize(sign(vP));\n  vec2 L = normalize');
  }
  return authored;
}
export function createChamferTheme(reference: UiKitTheme, roles: readonly VisualRole[]): UiKitTheme {
  return Object.freeze({
    id:'chamfer', colors:Object.freeze({...reference.colors}),
    // Identical line metrics keep captions and consumer layouts stable.
    typography:Object.freeze({...reference.typography}),
    icon:Object.freeze({stroke:1.9,lineCap:'square',lineJoin:'miter'}),
    visuals:Object.freeze(Object.fromEntries(roles.map(role=>[role,Object.freeze({geometry:(input:GeometryInput)=>geometry(role,input),material:(authored:THREE.Material)=>material(role,authored)})])) as Record<VisualRole,VisualRecipe>),
  });
}

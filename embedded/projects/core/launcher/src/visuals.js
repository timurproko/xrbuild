// Launcher-authored decoration. Shared controls come only from the UI Kit app export.
import * as THREE from 'three';
import { COLORS, material, roundedBox, roundedDisc, setVisualComposition } from '@xr-build/ui-kit';
export function disposeObject(root) {
  const resources = new Set();
  root.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const entry of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      if (entry.map) resources.add(entry.map); resources.add(entry);
    }
  });
  for (const resource of resources) resource.dispose();
  root.removeFromParent();
}
export function transparent(root) {
  setVisualComposition(root, { transparent: true });
}
export function wrapLines(text, maxLength, maxLines = 2) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > maxLength && line) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).join('\n');
}
export function brandVisual() {
  const glyphs = { X:['10001','01010','00100','01010','10001'], R:['11110','10001','11110','10100','10010'], B:['11110','10001','11110','10001','11110'], U:['10001','10001','10001','10001','01110'], I:['11111','00100','00100','00100','11111'], L:['10000','10000','10000','10000','11111'], D:['11110','10001','10001','10001','11110'] };
  const group = new THREE.Group(), cell = 0.00148;
  const glyphMaterial = material(COLORS.accent, { roughness:0.38, metalness:0.12 });
  let x = 0;
  for (const character of 'XR BUILD') {
    if (character === ' ') { x += cell * 3; continue; }
    const rows = glyphs[character];
    for (let row=0;row<rows.length;row++) for (let column=0;column<rows[row].length;column++) {
      if (rows[row][column] !== '1') continue;
      const block = new THREE.Mesh(roundedBox(cell*1.06,cell*1.06,0.0028,cell*0.12,cell*0.1),glyphMaterial);
      block.position.set(x+column*cell,(4-row)*cell,0); group.add(block);
    }
    x += cell * 6;
  }
  group.scale.setScalar(1.5);group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.set(-(bounds.min.x+bounds.max.x)/2,0.128,0.005);
  return group;
}
export function iconWellVisual() { return new THREE.Mesh(roundedBox(0.058,0.058,0.006,0.012),material(COLORS.well)); }
export function dotsVisual(total, page) {
  const root = new THREE.Group();
  for (let index=0;index<total;index++) {
    const active=index===page;
    const dot=new THREE.Mesh(roundedDisc(active?0.0035:0.0028,active?0.003:0.0022,32),material(active?COLORS.accent:'#4b5668',{roughness:0.45,metalness:0.06}));
    dot.position.x=(index-(total-1)/2)*0.012;root.add(dot);
  }
  return root;
}
function roundedArc(radius,width,sweep,segments=48) {
  const shape=new THREE.Shape(),inner=radius-width/2,outer=radius+width/2;
  for(let index=0;index<=segments;index++) { const angle=sweep*index/segments,point=new THREE.Vector2(Math.cos(angle)*outer,Math.sin(angle)*outer);if(index===0)shape.moveTo(point.x,point.y);else shape.lineTo(point.x,point.y); }
  for(let index=segments;index>=0;index--){const angle=sweep*index/segments;shape.lineTo(Math.cos(angle)*inner,Math.sin(angle)*inner);}
  shape.closePath();return new THREE.ShapeGeometry(shape);
}
export function spinnerVisual() {
  const root=new THREE.Group(),radius=0.007,width=0.0018,sweep=Math.PI*1.45;
  const track=new THREE.Mesh(new THREE.RingGeometry(radius-width/2,radius+width/2,64),new THREE.MeshBasicMaterial({color:COLORS.muted,transparent:true,opacity:0.28,depthWrite:false}));
  const arcRoot=new THREE.Group(),arcMaterial=new THREE.MeshBasicMaterial({color:COLORS.accent,transparent:true,depthWrite:false});
  const arc=new THREE.Mesh(roundedArc(radius,width,sweep),arcMaterial),capGeometry=new THREE.CircleGeometry(width/2,20);
  const start=new THREE.Mesh(capGeometry,arcMaterial),end=new THREE.Mesh(capGeometry,arcMaterial);
  start.position.set(radius,0,0.0001);end.position.set(Math.cos(sweep)*radius,Math.sin(sweep)*radius,0.0001);
  arcRoot.add(arc,start,end);root.add(track,arcRoot);root.userData.arc=arcRoot;
  return root;
}

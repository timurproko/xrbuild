import * as THREE from 'three';

const AXES = [
  { label: 'X', color: '#e5534b', direction: new THREE.Vector3(1, 0, 0) },
  { label: 'Y', color: '#57ab5a', direction: new THREE.Vector3(0, 1, 0) },
  { label: 'Z', color: '#539bf5', direction: new THREE.Vector3(0, 0, 1) },
];

function labelSprite(label, color) {
  const size = 64, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = color; context.beginPath(); context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ffffff'; context.font = `600 ${size * .5}px system-ui, sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, size / 2, size / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.setScalar(.42);
  return sprite;
}

/**
 * Orientation widget drawn in the view's bottom-left corner, like 3D tools: the X, Y and Z axes turn with the
 * camera so the viewer always sees which way the scene faces. It renders into its own small viewport.
 */
export function createAxisGizmo({ size = 88, margin = 12 } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, .1, 10);
  const up = new THREE.Vector3(0, 1, 0);
  for (const axis of AXES) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .78, 12), new THREE.MeshBasicMaterial({ color: axis.color }));
    shaft.quaternion.setFromUnitVectors(up, axis.direction); shaft.position.copy(axis.direction).multiplyScalar(.39);
    const label = labelSprite(axis.label, axis.color); label.position.copy(axis.direction).multiplyScalar(.98);
    scene.add(shaft, label);
  }
  const full = new THREE.Vector4(), offset = new THREE.Vector3();
  return {
    visible: true,
    render(renderer, viewCamera) {
      if (!this.visible) return;
      // Look at the widget from the same direction as the main camera.
      camera.quaternion.copy(viewCamera.quaternion);
      camera.position.copy(offset.set(0, 0, 3).applyQuaternion(viewCamera.quaternion));
      renderer.getViewport(full);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false; renderer.clearDepth();
      renderer.setScissorTest(true); renderer.setScissor(margin, margin, size, size); renderer.setViewport(margin, margin, size, size);
      renderer.render(scene, camera);
      renderer.setScissorTest(false); renderer.setViewport(full.x / renderer.getPixelRatio(), full.y / renderer.getPixelRatio(), full.z / renderer.getPixelRatio(), full.w / renderer.getPixelRatio());
      renderer.autoClear = autoClear;
    },
    dispose() {
      scene.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); });
    },
  };
}

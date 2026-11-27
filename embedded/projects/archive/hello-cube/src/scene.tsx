import React, { useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useXrb, useXrbFrame, useXrbPointer } from '@xr-build/react';

const COLORS = ['#f08a24', '#5bd18b', '#2f6fdf'] as const;

/** Public component props; importing components never starts an application. */
export interface RotatingCubeProps {
  index: number;
  selected?: boolean;
}

/** The original sample cube, usable inside any SDK-hosted component tree. */
export function RotatingCube({ index, selected = false }: RotatingCubeProps) {
  const mesh = useRef<THREE.Mesh>(null);
  useXrbFrame(({ timeMs }) => { mesh.current!.rotation.y = timeMs / 1000 * (0.3 + index * 0.1); });
  return <mesh ref={mesh} name={`cube-${index}`} position={[(index - 1) * 1.4, 0, [-1.2, 0, 1.2][index]]}>
    <boxGeometry args={[0.8, 0.8, 0.8]} />
    <meshStandardMaterial color={selected ? '#ffffff' : COLORS[index]} />
  </mesh>;
}

/** Original Hello Cube scene and behavior, without renderer or app bootstrap side effects. */
export function HelloCubeScene() {
  const app = useXrb();
  const cubes = useRef<THREE.Group>(null);
  const controls = useRef<OrbitControls | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const last = useRef(0);
  useLayoutEffect(() => {
    const background = app.scene.background;
    app.scene.background = new THREE.Color('#0b0f14');
    const orbit = new OrbitControls(app.camera, app.renderer.domElement);
    orbit.enableDamping = true;
    controls.current = orbit;
    return () => { controls.current = null; orbit.dispose(); app.scene.background = background; };
  }, [app]);
  useXrbPointer(cubes, {
    onClick(event) {
      const index = Number(event.object.name.slice('cube-'.length));
      setSelected(index);
      console.log(`CLICK cube ${index}`);
    },
    onPointerMissed() { setSelected(null); console.log('CLICK nothing'); },
  // Preserve the vanilla sample's whole-canvas camera picking, including stereo.
  // The SDK still owns raycasting and capture; new controls use its per-eye default.
  }, { camera: app.camera });
  useXrbFrame(({ timeMs, xrb }) => {
    controls.current?.update();
    if (timeMs - last.current > 2000) {
      last.current = timeMs;
      console.log(`STATS fps ${xrb.fps.toFixed(0)}, hands ${xrb.currentHands.length}, status ${xrb.handStatus?.state ?? 'no host'}`);
    }
  });
  return <>
    <hemisphereLight args={['#cfe3ff', '#202833', 2.0]} />
    <directionalLight color="#ffffff" intensity={2.0} position={[2, 4, 3]} />
    <group ref={cubes} name="hello-cubes">
      {[0, 1, 2].map((index) => <RotatingCube key={index} index={index} selected={selected === index} />)}
    </group>
    <gridHelper args={[8, 16, '#3a4a5a', '#26313d']} position-y={-0.8} />
  </>;
}

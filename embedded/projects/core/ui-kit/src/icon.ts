// The app's 3D icon: the trackball's robot head as a plain model (no control, no interaction, no sound),
// facing the viewer. The launcher shows it in 3D; the icon view renders it straight-on as the PNG icon.
import * as THREE from 'three';
import { robotHead } from '@xr-build/ui-kit';

export default function createIcon(): THREE.Object3D {
  const robot = robotHead(1);
  // A slow look around in launchers; the icon view holds the straight-on pose.
  robot.userData.update = (seconds: number) => { robot.rotation.y = Math.sin(seconds * 0.7) * 0.3; };
  return robot;
}

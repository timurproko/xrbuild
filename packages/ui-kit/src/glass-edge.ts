// The lit edge of a glass sheet (visionOS-style): a thin, soft line of light along a rounded
// rectangle's outline. Drawn from a signed distance in the fragment shader, so it is smooth at any
// size (no bevel facets). Brightest where the edge faces a light from the upper left; the light
// shifts with the eye looking at it, so the highlight slides along the edge as the viewer moves
// (each eye of a 3D display sees it slightly differently, like a real glass edge).
import * as THREE from 'three';

export interface GlassEdgeOptions {
  width: number;
  height: number;
  radius: number;
  /** overall brightness 0..1 */
  strength?: number;
  /** how far in from the outline the light fades, metres */
  falloff?: number;
}

const vertex = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
uniform vec2 halfSize;
uniform float radius;
uniform float falloff;
uniform float feather;
uniform float peak;
uniform float strength;
uniform float opacity;
uniform vec2 tilt;
varying vec2 vP;
void main() {
  vec2 inner = halfSize - radius;
  vec2 q = abs(vP) - inner;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;  // < 0 inside the outline
  // Feathered border: no MSAA on a 3D display, so the outer edge fades over a few pixels instead of cutting.
  float aa = max(fwidth(sd), 1e-5);
  float inside = 1.0 - smoothstep(-feather - aa, aa, sd);
  if (inside <= 0.0) discard;
  // Outward direction of the nearest edge point.
  vec2 g = max(q, 0.0);
  vec2 n = length(g) > 1e-6 ? normalize(g) * sign(vP) : (q.x > q.y ? vec2(sign(vP.x), 0.0) : vec2(0.0, sign(vP.y)));
  // Light from the upper left, moved by the viewing angle.
  vec2 L = normalize(vec2(-0.45, 0.9) - tilt * 1.2);
  float facing = pow(clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  // The light peaks just inside the outline and fades both ways: a soft line, never a hard rim.
  float d = sd + peak;
  float line = exp(-(d * d) / (falloff * falloff));
  float a = line * (0.12 + 0.88 * facing) * strength * opacity * inside;
  gl_FragColor = vec4(vec3(1.0), a);
}`;

export class GlassEdge extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  private readonly eye = new THREE.Vector3();
  /** eased tilt per eye camera: head tracking jitters, and a jittering highlight strobes */
  private readonly tilts = new Map<string, { v: THREE.Vector2; at: number }>();

  constructor(o: GlassEdgeOptions) {
    super(
      new THREE.PlaneGeometry(o.width, o.height),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          halfSize: { value: new THREE.Vector2(o.width / 2, o.height / 2) },
          radius: { value: o.radius },
          falloff: { value: o.falloff ?? 0.00075 },
          feather: { value: 0.0004 },
          peak: { value: 0.0006 },
          strength: { value: o.strength ?? 0.6 },
          opacity: { value: 1 },
          tilt: { value: new THREE.Vector2() },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.userData.keepLook = true;
    this.raycast = () => {};
    this.renderOrder = 2;
  }

  set opacity(v: number) {
    this.material.uniforms.opacity.value = v;
  }

  // Per eye: the tilt of the view onto the sheet, from the eye camera rendering it.
  onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera): void => {
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.worldToLocal(this.eye);
    const z = Math.max(0.05, this.eye.z);
    const now = performance.now();
    let t = this.tilts.get(camera.uuid);
    if (!t) { t = { v: new THREE.Vector2(this.eye.x / z, this.eye.y / z), at: now }; this.tilts.set(camera.uuid, t); }
    const k = 1 - Math.exp(-Math.min(0.1, (now - t.at) / 1000) * 4);  // ~250 ms ease
    t.v.x += (this.eye.x / z - t.v.x) * k;
    t.v.y += (this.eye.y / z - t.v.y) * k;
    t.at = now;
    (this.material.uniforms.tilt.value as THREE.Vector2).copy(t.v);
  };
}

/** Explicit synthetic/virtual-clock benchmark; never enrolled in the test glob or product UI. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { HandMeshClient } from '../src/hand-mesh-client.ts';
import { HandVisual } from '../src/hand-visual.ts';
import { PanelFrame } from '../src/stereo.ts';
import { encodeMeshResult, type MeshFrame, type MeshPose, type MeshSurface } from '../src/hand-mesh-protocol.ts';
import type { Hand } from '../src/hands.ts';
import type { Vec3 } from '../src/protocol.ts';
import { openHand } from './fixtures.ts';

export type Motion = 'still' | 'normal' | 'fast' | 'articulation-stress';
export function poseAt(ms: number, motion: Motion, id = 1): MeshPose {
  const t = ms / 1000, speed = motion === 'fast' ? 7 : motion === 'normal' ? 2 : motion === 'articulation-stress' ? 3 : 0;
  const angle = speed ? .7 * Math.sin(t * speed) : 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3 * Math.sin(t * speed), .4 * Math.sin(t * speed * .7), angle));
  const offset = new THREE.Vector3((id === 1 ? -.10 : .10) + .12 * Math.sin(t * speed), .03 * Math.cos(t * speed), .03 * Math.sin(t * speed * .6));
  const points = openHand([0, 0, 0]); if (id === 2) for (const p of points) p[0] *= -1;
  // Modest simultaneous finger articulation; separate deliberately severe articulation stress.
  const curl = motion === 'still' ? 0 : (motion === 'articulation-stress' ? 1.2 * Math.sin(t * 15) : .45 * Math.sin(t * 2.5));
  for (let f = 0; f < 5; f++) for (let j = 1; j < 4; j++) {
    const p = points[1 + f * 4 + j], base = points[1 + f * 4], length = .02 * j;
    p[1] = base[1] + length * Math.cos(curl); p[2] = base[2] + length * Math.sin(curl);
  }
  return { id, handedness: id === 1 ? 'right' : 'left', keypoints: points.map(p => new THREE.Vector3(...p).applyQuaternion(q).add(offset).toArray() as Vec3) };
}
/** Authored tube skin, not anatomical model/fitter output. ~2,800 vertices per hand. */
export function surfaceFor(pose: MeshPose): MeshSurface {
  const positions: number[] = [], indices: number[] = [];
  const addSegment = (a: Vec3, b: Vec3, radius: number) => {
    const start = positions.length / 3, direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    for (let ring = 0; ring <= 7; ring++) for (let c = 0; c <= 16; c++) {
      const theta = c / 16 * Math.PI * 2, p = new THREE.Vector3(radius * Math.cos(theta), direction.length() * ring / 7, radius * Math.sin(theta)).applyQuaternion(q).add(new THREE.Vector3(...a)); positions.push(...p.toArray());
      if (ring < 7 && c < 16) { const n = start + ring * 17 + c; indices.push(n, n + 17, n + 1, n + 1, n + 17, n + 18); }
    }
  };
  for (let f = 0; f < 5; f++) for (let j = 0; j < 4; j++) { const n = 1 + f * 4 + j; addSegment(pose.keypoints[j ? n - 1 : 0], pose.keypoints[n], j ? .005 : .009); }
  return { id: pose.id, topology: 'tube-skin-v1', positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
const percentiles = (samples: number[]) => { const s = [...samples].sort((a, b) => a - b); return [50, 95, 99].map(p => s[Math.min(s.length - 1, Math.floor(s.length * p / 100))] ?? null); };
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
async function measure(Client: typeof HandMeshClient, motion: Motion, hz: number, before: boolean) {
  let now = 0, closed = false;
  const scheduled: { at: number; callback: () => void }[] = [], rows: any[] = [], visual = new HandVisual(), panel = new PanelFrame();
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/connect')) return new Response(null, { status: 204 });
    const frame: MeshFrame = JSON.parse(init.body as string), sequence = frame.sequence;
    // Typical measured transport-scale latency, deterministic jitter plus 1% 80-ms tails.
    const delay = sequence % 100 === 0 ? 80 : [18, 20, 23, 26, 29, 33, 22][sequence % 7];
    return new Promise<Response>(resolve => scheduled.push({ at: now + delay, callback: () => {
      if (closed || before && delay > 33) resolve(new Response(null, { status: 204 }));
      else resolve(new Response(encodeMeshResult({ type: 'result', epoch: frame.epoch, sequence: frame.sequence, revision: frame.revision, meshes: frame.hands.map(surfaceFor) }) as BodyInit));
    } }));
  }) as typeof fetch;
  const client = new Client({ version: 1, url: 'http://127.0.0.1:1234', token: 'a'.repeat(64) }, fetcher, () => now);
  await flush(); client.observed([1, 2]);
  const advance = async (to: number) => { while (true) { scheduled.sort((a, b) => a.at - b.at); if (!scheduled[0] || scheduled[0].at > to) break; const e = scheduled.shift()!; now = e.at; e.callback(); await flush(); } now = to; };
  for (let i = 0; i < hz * 22; i++) {
    await advance(i * 1000 / hz);
    const poses = [poseAt(now, motion, 1), poseAt(now, motion, 2)];
    const hands = poses.map(p => ({ ...p, coasting: false, lastSeen: now, rawKeypoints: p.keypoints, tip: p.keypoints[8], pinchPoint: p.keypoints[8], pinching: false, pinchStrength: 0, grabbing: false } as Hand));
    const started = performance.now(), surfaces = client.update(hands, now); visual.updateMeshes(surfaces, panel); visual.updateMatrixWorld(true);
    const costMs = performance.now() - started, accepted = (client as any).accepted;
    if (i >= hz * 2) {
      for (const p of poses) {
        const s = surfaces.find(s => s.id === p.id), ageMs = s ? (s as any).sourceAgeMs ?? now - accepted.frame.sampleMs : null;
        let attachmentErrorM: number | null = null;
        if (s && accepted) {
          const source = accepted.frame.hands.find((h: any) => h.id === p.id), matrix = (s as any).transform ? new THREE.Matrix4().fromArray((s as any).transform) : new THREE.Matrix4();
          attachmentErrorM = new THREE.Vector3(...source.keypoints[0]).applyMatrix4(matrix).distanceTo(new THREE.Vector3(...p.keypoints[0]));
        }
        rows.push({ at: now, id: p.id, shown: !!s, ageMs, residualM: (s as any)?.residualM ?? null, attachmentErrorM, costMs });
      }
    }
  }
  closed = true; client.close(); for (const e of scheduled) e.callback(); await flush(); visual.disposeMeshes();
  return { motion, hz, before, renderFrames: rows.length / 2, samples: rows.length, warmupSeconds: 2, measuredSeconds: 20, virtualClock: true,
    fallbackFraction: 1 - rows.filter(r => r.shown).length / rows.length, visibleSourceAgeMs: percentiles(rows.flatMap(r => r.ageMs === null ? [] : [r.ageMs])),
    fractions: [33, 66, 100].map(capMs => { const shown = rows.filter(r => r.shown && r.ageMs <= capMs); return { capMs, fallbackFraction: 1 - shown.length / rows.length, visibleSourceAgeMs: percentiles(shown.map(r => r.ageMs)) }; }),
    maxWristAttachmentErrorM: Math.max(0, ...rows.map(r => r.attachmentErrorM ?? 0)), residualM: percentiles(rows.flatMap(r => r.residualM === null ? [] : [r.residualM])), cpuUpdateAndVisualMs: percentiles(rows.map(r => r.costMs)), rows };
}
async function main() {
  const arg = (name: string) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
  const output = arg('--out'); if (!output) throw new Error('Explicit --out=<owned task path> required');
  const baseline = arg('--baseline-client');
  const Before = baseline ? (await import(pathToFileURL(path.resolve(baseline)).href)).HandMeshClient : null;
  const results = [];
  for (const hz of [60, 30]) for (const motion of ['still', 'normal', 'fast', 'articulation-stress'] as Motion[]) {
    if (Before) results.push(await measure(Before, motion, hz, true));
    results.push(await measure(HandMeshClient, motion, hz, false));
  }
  await fs.writeFile(output, JSON.stringify({ method: 'actual SDK client/codec/visual, virtual-clock fake HTTP processor; not wall-clock GPU/scanout', verticesPerHand: surfaceFor(poseAt(0, 'still')).positions.length / 3, results }, null, 2));
  console.log(JSON.stringify(results.map(({ rows, ...summary }) => summary), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();

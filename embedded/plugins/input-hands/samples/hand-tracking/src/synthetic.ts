// Browser-only preview. Never publishes to the host; the native plugin remains the application input.
import fixture from '../fixtures/hand.json' with { type: 'json' };
import type { WireHand, Vec3 } from '@xr-build/sdk';
export const SCENARIOS = ['stationary', 'motion', 'teleport', 'dropout', 'invalid'] as const;
export type Scenario = typeof SCENARIOS[number];
export const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]] as const;
export function generate(scenario: Scenario, seconds: number, count = 2): WireHand[] {
  if (!SCENARIOS.includes(scenario) || !Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(count) || count < 1 || count > 2) throw new Error('Invalid synthetic sample configuration');
  const phase = seconds % 4;
  if (scenario === 'dropout' && phase >= 2 && phase < 3) return [];
  const dx = scenario === 'motion' ? 0.06 * Math.sin(seconds) : scenario === 'teleport' && phase >= 2 ? 0.16 : 0;
  const dy = scenario === 'motion' ? 0.025 * Math.sin(seconds * 0.7) : 0;
  const dz = scenario === 'motion' ? 0.02 * Math.sin(seconds * 0.5) : 0;
  return Array.from({ length: count }, (_, h): WireHand => {
    const keypoints = fixture.points.map((base, k) => {
      let p = base;
      if (scenario === 'motion' && k === 4 && seconds % 6 >= 3 && seconds % 6 < 5) p = [fixture.points[8][0] + 0.012, ...fixture.points[8].slice(1)];
      return [(h === 0 ? -0.11 : 0.11) + (h === 0 ? 1 : -1) * p[0] + dx,
        -0.08 + p[1] + dy, 0.07 + p[2] + dz] as Vec3;
    });
    if (scenario === 'invalid' && phase >= 2) keypoints[8][0] += 0.25;
    return { id: h + 1, handedness: h, grabbing: false, pinch: [false, false, false, false],
      keypoints, scores: Array(21).fill(1), pinchPositions: Array.from({ length: 4 }, () => [0,0,0] as Vec3),
      grabPosition: [0,0,0], palm: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]] };
  });
}
export function renderable(hand: WireHand): boolean {
  return hand.keypoints.length === 21 && hand.keypoints.every(p => p.length === 3 && p.every(Number.isFinite));
}
export function valid(hand: WireHand): boolean {
  if (hand.id < 0 || !renderable(hand) || hand.scores.length !== 21 || hand.scores.some(score => score !== 1)) return false;
  return BONES.every(([a,b]) => {
    const length = Math.hypot(...hand.keypoints[a].map((value, axis) => value - hand.keypoints[b][axis]));
    return length >= 0.005 && length <= 0.12;
  });
}

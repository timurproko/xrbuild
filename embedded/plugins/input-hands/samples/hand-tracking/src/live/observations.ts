import type { RawResult, Point, Observation, FrameTiming, LiveFrame } from './contracts.ts';
export function complete(points: readonly Point[] | undefined): points is readonly Point[] {
  return !!points && points.length === 21 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}
const copyPoints = (points: readonly Point[]) => Object.freeze(points.map(point => Object.freeze({ ...point })));
export function immutableRaw(result: RawResult): RawResult {
  return Object.freeze({
    landmarks: Object.freeze(result.landmarks.map(copyPoints)),
    worldLandmarks: Object.freeze(result.worldLandmarks.map(copyPoints)),
    handedness: Object.freeze(result.handedness.map(categories => Object.freeze(categories.map(category => Object.freeze({ ...category }))))),
  });
}
export interface TrackEvent { type: 'found' | 'lost'; id: number; pageMs: number }
/** Greedy spatial association for at most two hands; crossings/large jumps can change IDs. */
export class ObservationTracker {
  private nextId = 1;
  private previous: readonly Observation[] = [];
  private readonly event: (value: TrackEvent) => void;
  constructor(event: (value: TrackEvent) => void = () => {}) { this.event = event; }
  reset(pageMs: number): void {
    for (const hand of this.previous) this.event({ type: 'lost', id: hand.id, pageMs });
    this.previous = []; this.nextId = 1;
  }
  frame(result: RawResult, timing: FrameTiming, sourceId = 'unbound'): LiveFrame {
    const raw = immutableRaw(result);
    const candidates = raw.landmarks.flatMap((image, index) => complete(image) ? [{ image, index }] : []);
    const pairs = candidates.flatMap((candidate, index) => this.previous.flatMap(previous => {
      const distance = Math.hypot(candidate.image[0].x - previous.image[0].x, candidate.image[0].y - previous.image[0].y);
      const category = raw.handedness[candidate.index]?.[0]?.categoryName;
      const penalty = category && previous.handedness && category !== previous.handedness.categoryName ? 0.03 : 0;
      return distance <= 0.3 ? [{ index, id: previous.id, cost: distance + penalty }] : [];
    })).sort((a,b) => a.cost - b.cost);
    const assigned = new Map<number, number>(), used = new Set<number>();
    for (const pair of pairs) if (!assigned.has(pair.index) && !used.has(pair.id)) { assigned.set(pair.index, pair.id); used.add(pair.id); }
    const hands = candidates.map((candidate, index): Observation => {
      let id = assigned.get(index);
      if (id === undefined) { id = this.nextId++; this.event({ type: 'found', id, pageMs: timing.receivedPageMs }); }
      const relative = raw.worldLandmarks[candidate.index];
      return Object.freeze({ id, imageFrame: 'image-normalized', relativeFrame: 'hand-relative', image: candidate.image,
        relative: complete(relative) ? relative : null, handedness: raw.handedness[candidate.index]?.[0] ?? null });
    });
    for (const old of this.previous) if (!hands.some(hand => hand.id === old.id)) this.event({ type: 'lost', id: old.id, pageMs: timing.receivedPageMs });
    this.previous = hands;
    return Object.freeze({ sourceId, providerId: 'mediapipe-hand-landmarker', raw, hands: Object.freeze(hands), timing: Object.freeze({ ...timing }) });
  }
}

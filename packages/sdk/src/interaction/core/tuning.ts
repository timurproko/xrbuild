// One tuning table for every hand interaction, in metres of the physical panel. Apps override it
// as a whole (Interactor options) or per target (target.tuning); controls never carry their own
// thresholds. Every engage threshold has a looser release threshold (hysteresis).
export interface InteractionTuning {
  /** a fingertip this far in front of a poke surface starts hover feedback (proximity 0 here, 1 at the surface) */
  hoverDistance: number;
  /** hover ends again only beyond this distance */
  hoverRelease: number;
  /** a poke still counts this far outside the target's outline */
  pokeMargin: number;
  /** a fingertip arms a poke target when it is in front of the surface (gap > -pokeArmDepth) inside the outline */
  pokeArmDepth: number;
  /** press registers at this fraction of the travel, releases below the second */
  pressAt: number;
  releaseAt: number;
  /** a pinch starting within this distance of a pinch target takes it */
  pinchRadius: number;
  /** a pinch or fist within this distance of a grab target takes it */
  grabRadius: number;
  /** hand keypoints inside a volume needed to engage / to stay engaged */
  volumeEngage: number;
  volumeRelease: number;
}

export const DEFAULT_TUNING: InteractionTuning = {
  hoverDistance: 0.05,
  hoverRelease: 0.065,
  pokeMargin: 0.01,
  pokeArmDepth: 0.004,
  pressAt: 0.6,
  releaseAt: 0.3,
  pinchRadius: 0.05,
  grabRadius: 0.05,
  volumeEngage: 6,
  volumeRelease: 4,
};

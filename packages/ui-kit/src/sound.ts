// One feedback engine for library controls and SDK-owned navigation controls.
// Keep the UI library's public sound API stable.
export {
  playUiSound as play,
  setUiSoundMuted as setMuted,
  setUiSoundVolume as setVolume,
  UiSoundGlide as Glide,
  uiSoundPitch as pitchOf,
} from '@xr-build/sdk';

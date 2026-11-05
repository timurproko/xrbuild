// @xr-build/ui-kit: basic 3D controls for three.js apps on 3D displays.
// Every control is a THREE.Group with a title and status line. Hands drive it through the SDK's
// interaction core (control.attach(xrb.interaction)), the mouse through xrb.bindMouse(); the app
// calls control.update(dt) each frame.
export { Button, type ButtonOptions } from './button.ts';
export { Control, sourceOf, touchCursor, placeCursor, type Listener } from './control.ts';
export { Dial } from './dial.ts';
export { Dialog, type DialogOptions } from './dialog.ts';
export { GlassEdge, type GlassEdgeOptions } from './glass-edge.ts';
export { Icon, type IconNode, type IconOptions } from './icon.ts';
export { Label, type LabelOptions } from './label.ts';
export { Segmented } from './segmented.ts';
export { Slider, type SliderOptions, type SliderMode } from './slider.ts';
export { Switch } from './switch.ts';
export { robotHead, Trackball } from './trackball.ts';
export { COLORS, TUNING, material, glass, roundedBox, roundedDisc, disc, approach } from './theme.ts';
export { play, setMuted, setVolume, Glide, pitchOf } from './sound.ts';

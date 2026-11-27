/** Opt-in React component layer. The vanilla SDK never imports this entry. */
export { mountXrbApp, type MountXrbAppOptions, type XrbAppMount } from './runtime.tsx';
export { useXrb, useXrbFrame, useXrbHands, useXrbPointer, useXrbTarget } from './hooks.ts';
export type { ComponentPointerEvent, ComponentPointerHandlers, ComponentPointerType, ComponentPointerOptions } from '../../sdk/src/index.ts';

import React, { useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useXrb } from '@xr-build/react';
import { Button, Dialog, Switch, Slider, Trackball, Segmented, Dial } from '@xr-build/ui-kit/react';
import { COLORS, type Control, type Dialog as DialogObject, type Trackball as TrackballObject } from '@xr-build/ui-kit';
import { ArrowRight } from 'lucide';

/** Scene content only: importing this module never starts an app or changes the page. */
export function UiKitScene() {
  const app = useXrb();
  const controls = useRef(new Map<string, Control>());
  const dialog = useRef<DialogObject>(null), trackball = useRef<TrackballObject>(null);
  const [enabled, setEnabled] = useState(true);
  const remember = (name: string) => (control: Control | null) => {
    if (control) controls.current.set(name, control); else controls.current.delete(name);
  };
  useLayoutEffect(() => {
    const previous = app.scene.background;
    app.scene.background = new THREE.Color(COLORS.background);
    return () => { app.scene.background = previous; };
  }, [app]);
  return <>
    <hemisphereLight args={['#dfe8ff', '#1a1e26', 1.6]} />
    <directionalLight color="#ffffff" intensity={2.2} position={[-0.3, 0.5, 0.8]} />
    <Button ref={remember('pill')} title="Button (pill)" shape="pill" text="Press" position={[-0.215, 0.105, 0]} enabled={enabled} />
    <Button ref={remember('round')} title="Button (round)" shape="round" text="" icon={ArrowRight} position={[-0.215, -0.01, 0]} enabled={enabled} />
    <Switch ref={remember('toggle')} title="Switch" position={[0.075, 0.105, 0]} enabled={enabled} />
    <Switch ref={remember('interactable')} title="Interactable" initialOn position={[0.215, 0.105, 0]}
      configure={control => control.status.set('On')}
      onChange={event => {
        const on = event.on as boolean;
        // Retain immediate SDK disable semantics, not only React's scheduled commit.
        for (const [name, control] of controls.current) if (name !== 'interactable') control.setEnabled(on);
        controls.current.get('interactable')?.status.set(on ? 'On' : 'Off: other controls ignore input');
        setEnabled(on);
      }} />
    <Slider ref={remember('stepped')} title="Stepped slider" steps={5} value={0.25} length={0.13} position={[-0.19, -0.105, 0]} enabled={enabled} />
    <Slider ref={remember('slider')} title="Slider" value={0.5} length={0.13} position={[0.19, -0.105, 0]} enabled={enabled} />
    <Trackball ref={value => { trackball.current = value; remember('trackball')(value); }} title="Trackball" radius={0.056} position={[0, -0.01, 0.02]} enabled={enabled} />
    <Segmented ref={remember('mode')} title="" options={['Full', 'X', 'Y', 'Z']} initialIndex={0} latchSelected={false} compact position={[0, -0.128, 0]} enabled={enabled}
      onChange={event => { if (trackball.current) trackball.current.axis = (['free', 'x', 'y', 'z'] as const)[event.index as number]; }} />
    <Dial ref={remember('dial')} title="Dial" position={[0.215, -0.01, 0]} enabled={enabled} />
    <Button ref={remember('dialogButton')} title="Dialog" shape="pill" text="Open" position={[-0.075, 0.105, 0]} enabled={enabled}
      onClick={event => dialog.current?.open(event.source as 'hand' | 'mouse')} />
    <Dialog ref={dialog} title="Glass dialog" text={'A sheet 7 cm in front of the board.\nThe board shows through, blurred.'} />
  </>;
}
